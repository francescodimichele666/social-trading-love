import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { notify } from '../notify.js';
import { closeLiveRoom } from '../livekit.js';

export const REPORT_REASONS = {
  consigli_personalizzati: 'Consigli di investimento personalizzati o segnali',
  promesse_guadagno: 'Promesse di guadagni sicuri',
  truffa: 'Possibile truffa o richiesta di soldi',
  molestie: 'Insulti o molestie',
  spam: 'Spam o pubblicità',
  contenuto_illegale: 'Contenuto illegale',
  minore: 'Possibile minorenne',
  altro: 'Altro',
} as const;

const TARGET = z.enum(['post', 'comment', 'user', 'room']);
const TABLE = { post: 'posts', comment: 'comments', room: 'rooms' } as const;

// Chi è il responsabile del contenuto segnalato e un'anteprima per il moderatore.
async function describeTarget(type: z.infer<typeof TARGET>, id: number) {
  if (type === 'user') {
    const u = await one('SELECT id, username, display_name, bio FROM users WHERE id = $1', [id]);
    return u && { ownerId: u.id, preview: `@${u.username} (${u.display_name}) ${u.bio}`.trim() };
  }
  if (type === 'post') {
    const p = await one('SELECT author_id, body, media_url, removed_at FROM posts WHERE id = $1', [id]);
    return p && { ownerId: p.author_id, preview: p.body, mediaUrl: p.media_url, removed: Boolean(p.removed_at) };
  }
  if (type === 'comment') {
    const c = await one('SELECT author_id, body, removed_at, post_id FROM comments WHERE id = $1', [id]);
    return c && { ownerId: c.author_id, preview: c.body, removed: Boolean(c.removed_at), postId: c.post_id };
  }
  const r = await one('SELECT host_id, title, description, removed_at FROM rooms WHERE id = $1', [id]);
  return r && { ownerId: r.host_id, preview: `${r.title}. ${r.description}`, removed: Boolean(r.removed_at) };
}

export default async function moderationRoutes(app: FastifyInstance) {
  app.get('/report-reasons', async () => ({ reasons: REPORT_REASONS }));

  app.post('/reports', { preHandler: app.authenticate }, async (req, reply) => {
    const data = z.object({
      targetType: TARGET,
      targetId: z.number().int().positive(),
      reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS]),
      details: z.string().trim().max(1000).default(''),
    }).parse(req.body);
    if (!(await describeTarget(data.targetType, data.targetId))) throw new HttpError(404, 'Contenuto non trovato');
    await query(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, data.targetType, data.targetId, data.reason, data.details],
    );
    reply.status(201);
    return { message: 'Grazie, la segnalazione è arrivata ai moderatori.' };
  });

  app.get<{ Querystring: { status?: string } }>('/moderation/reports', { preHandler: app.requireModerator }, async (req) => {
    const status = z.enum(['open', 'actioned', 'dismissed']).default('open').parse(req.query.status);
    const { rows } = await query(
      `SELECT r.*, u.username AS reporter_username FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.status = $1 ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 100`,
      [status],
    );
    const reports = await Promise.all(rows.map(async (r) => ({
      id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason,
      reasonLabel: REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? 'Frasi a rischio (automatico)',
      details: r.details, status: r.status, createdAt: r.created_at,
      reporter: r.reporter_username ?? 'sistema automatico',
      target: await describeTarget(r.target_type, r.target_id),
    })));
    return { reports };
  });

  // Decisione del moderatore, sempre con una motivazione che arriva alla persona interessata.
  app.post<{ Params: { id: string } }>('/moderation/reports/:id/decide', { preHandler: app.requireModerator }, async (req) => {
    const { action, statement } = z.object({
      action: z.enum(['remove', 'ban', 'dismiss']),
      statement: z.string().trim().min(10, 'Scrivi una motivazione chiara (almeno 10 caratteri)').max(1000),
    }).parse(req.body);
    const report = await one('SELECT * FROM reports WHERE id = $1', [Number(req.params.id)]);
    if (!report) throw new HttpError(404, 'Segnalazione non trovata');
    const target = await describeTarget(report.target_type, report.target_id);
    if (!target) throw new HttpError(404, 'Contenuto non più esistente');
    if (action === 'ban' && target.ownerId === req.user.id) throw new HttpError(400, 'Non puoi sospendere te stesso');
    if (action === 'ban' || report.target_type === 'user') {
      const owner = await one('SELECT role, is_owner FROM users WHERE id = $1', [target.ownerId]);
      if (action !== 'dismiss' && owner?.is_owner) throw new HttpError(403, 'Il proprietario non può essere sospeso');
      if (action !== 'dismiss' && owner?.role !== 'member' && !req.user.isOwner) {
        throw new HttpError(403, 'Solo il proprietario può sospendere moderatori e amministratori');
      }
    }

    await tx(async (c) => {
      if (action === 'remove' && report.target_type !== 'user') {
        await c.query(`UPDATE ${TABLE[report.target_type as keyof typeof TABLE]} SET removed_at = now() WHERE id = $1`, [report.target_id]);
      }
      if (action === 'ban' || (action === 'remove' && report.target_type === 'user')) {
        await c.query('UPDATE users SET banned_at = now(), ban_reason = $2 WHERE id = $1', [target.ownerId, statement]);
      }
      if (action === 'dismiss' && (report.target_type === 'post' || report.target_type === 'comment')) {
        await c.query(`UPDATE ${TABLE[report.target_type as 'post' | 'comment']} SET flagged = FALSE WHERE id = $1`, [report.target_id]);
      }
      await c.query(
        `UPDATE reports SET status = $3 WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
        [report.target_type, report.target_id, action === 'dismiss' ? 'dismissed' : 'actioned'],
      );
      await c.query(
        'INSERT INTO moderation_actions (moderator_id, report_id, target_type, target_id, action, statement) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.id, report.id, report.target_type, report.target_id, action, statement],
      );
      if (action !== 'dismiss') {
        const what = { post: 'un tuo post', comment: 'un tuo commento', room: 'una tua Live', user: 'il tuo profilo' }[report.target_type as 'post'];
        const msg = action === 'ban'
          ? `Il tuo account è stato sospeso. Motivo: ${statement}`
          : `Abbiamo rimosso ${what}. Motivo: ${statement}`;
        await notify(target.ownerId, 'moderation', msg, null, c);
      }
    });
    if (action !== 'dismiss' && report.target_type === 'room') {
      await query(`UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1 AND status <> 'ended'`, [report.target_id]);
      await closeLiveRoom(report.target_id);
    }
    return { done: true };
  });

  app.post<{ Params: { id: string } }>('/moderation/users/:id/role', { preHandler: app.requireModerator }, async (req) => {
    // Amministratori: nominano moderatori. Solo il proprietario nomina o toglie amministratori.
    if (req.user.role !== 'admin') throw new HttpError(403, 'Solo gli amministratori possono cambiare i ruoli');
    const { role } = z.object({ role: z.enum(['member', 'moderator', 'admin']) }).parse(req.body);
    const target = await one('SELECT id, role, is_owner FROM users WHERE id = $1', [Number(req.params.id)]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    if (target.is_owner) throw new HttpError(403, 'Il ruolo del proprietario non si può cambiare');
    if ((role === 'admin' || target.role === 'admin') && !req.user.isOwner) {
      throw new HttpError(403, 'Solo il proprietario può nominare o togliere amministratori');
    }
    await query('UPDATE users SET role = $2 WHERE id = $1', [target.id, role]);
    if (role !== target.role) {
      const label = { member: 'membro', moderator: 'moderatore', admin: 'amministratore' }[role];
      await notify(target.id, 'role', `Ora sei ${label} della comunità.`, null);
    }
    return { role };
  });
}
