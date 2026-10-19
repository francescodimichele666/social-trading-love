import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { hasRedFlags } from '../rules.js';

// Messaggi privati. Chiunque può scrivere a chiunque, ma chi riceve può bloccare,
// e i messaggi con frasi tipiche delle truffe ("guadagno garantito", "ti gestisco il conto"…) non partono.

const person = (u: any) => ({ id: Number(u.id), username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url, isMentor: Boolean(u.mentor_since) });

async function otherUser(username: string) {
  const u = await one('SELECT id, username, display_name, avatar_url, mentor_since, banned_at FROM users WHERE username = $1 AND deleted_at IS NULL', [username.toLowerCase()]);
  if (!u) throw new HttpError(404, 'Utente non trovato');
  return u;
}

async function blockState(me: number, other: number) {
  return (await one(
    `SELECT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
            EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me`,
    [me, other],
  ))!;
}

export default async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Le conversazioni, dalla più recente: con chi, l'ultimo messaggio e quanti non letti.
  app.get('/messages', async (req) => {
    const { rows } = await query(
      `WITH mine AS (
         SELECT DISTINCT ON (other) other, id, body, created_at, sender_id
         FROM (SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other, id, body, created_at, sender_id
               FROM messages WHERE sender_id = $1 OR recipient_id = $1) m
         ORDER BY other, id DESC)
       SELECT mine.*, u.username, u.display_name, u.avatar_url, u.mentor_since,
              (SELECT count(*)::int FROM messages x WHERE x.sender_id = mine.other AND x.recipient_id = $1 AND x.read_at IS NULL) AS unread
       FROM mine JOIN users u ON u.id = mine.other
       WHERE u.deleted_at IS NULL
       ORDER BY mine.id DESC LIMIT 100`,
      [req.user.id],
    );
    return {
      conversations: rows.map((r) => ({
        with: person({ ...r, id: r.other }), unread: r.unread,
        last: { body: r.body.slice(0, 120), createdAt: r.created_at, mine: Number(r.sender_id) === req.user.id },
      })),
    };
  });

  app.get('/messages/unread', async (req) => {
    const r = await one<{ n: number }>('SELECT count(*)::int AS n FROM messages WHERE recipient_id = $1 AND read_at IS NULL', [req.user.id]);
    return { unread: r?.n ?? 0 };
  });

  // Una conversazione: gli ultimi 200 messaggi. Aprendola, quelli ricevuti diventano letti.
  app.get<{ Params: { username: string }; Querystring: { after?: string } }>('/messages/:username', async (req) => {
    const other = await otherUser(req.params.username);
    const after = Number(req.query.after ?? 0) || 0;
    const { rows } = await query(
      `SELECT * FROM (SELECT id, sender_id, body, created_at, read_at FROM messages
         WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)) AND id > $3
         ORDER BY id DESC LIMIT 200) t ORDER BY id`,
      [req.user.id, other.id, after],
    );
    await query('UPDATE messages SET read_at = now() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [other.id, req.user.id]);
    const b = await blockState(req.user.id, Number(other.id));
    return {
      with: person(other),
      messages: rows.map((m) => ({ id: Number(m.id), body: m.body, createdAt: m.created_at, mine: Number(m.sender_id) === req.user.id, read: Boolean(m.read_at) })),
      blockedByMe: b.blocked_by_me,
      canWrite: !b.blocked_by_me && !b.blocked_me && !other.banned_at && Number(other.id) !== req.user.id,
    };
  });

  app.post<{ Params: { username: string } }>('/messages/:username', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { body } = z.object({ body: z.string().trim().min(1, 'Scrivi qualcosa').max(2000) }).parse(req.body);
    const other = await otherUser(req.params.username);
    if (Number(other.id) === req.user.id) throw new HttpError(400, 'Non puoi scrivere a te stesso');
    if (other.banned_at) throw new HttpError(403, 'Questo account è sospeso');
    const b = await blockState(req.user.id, Number(other.id));
    if (b.blocked_by_me) throw new HttpError(403, 'Hai bloccato questa persona: sbloccala per scriverle');
    if (b.blocked_me) throw new HttpError(403, 'Questa persona non riceve i tuoi messaggi');
    if (hasRedFlags(body)) {
      throw new HttpError(400, 'Il messaggio contiene frasi tipiche delle truffe (guadagni garantiti, gestione di conti, gruppi a pagamento). Qui non sono ammesse, nemmeno in privato.');
    }
    const m = await one('INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3) RETURNING id, created_at', [req.user.id, other.id, body]);
    reply.status(201);
    return { message: { id: Number(m!.id), body, createdAt: m!.created_at, mine: true, read: false } };
  });

  // Blocco personale: la persona non può più scriverti (e tu non scrivi a lei).
  app.post<{ Params: { username: string } }>('/users/:username/block', async (req) => {
    const other = await otherUser(req.params.username);
    if (Number(other.id) === req.user.id) throw new HttpError(400, 'Non puoi bloccare te stesso');
    await query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, other.id]);
    return { blocked: true };
  });

  app.delete<{ Params: { username: string } }>('/users/:username/block', async (req) => {
    const other = await otherUser(req.params.username);
    await query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.user.id, other.id]);
    return { blocked: false };
  });
}
