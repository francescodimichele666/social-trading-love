import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { notify } from '../notify.js';
import { closeLiveRoom } from '../livekit.js';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sendResetLink } from './account.js';

// Data dell'ultimo backup del database fatto dal servizio "backup" (null se non configurato o mai fatto).
async function lastBackup(): Promise<string | null> {
  if (!config.backupDir) return null;
  try {
    const files = (await readdir(config.backupDir)).filter((f) => /^db-.*\.dump$/.test(f));
    const times = await Promise.all(files.map(async (f) => (await stat(path.join(config.backupDir, f))).mtime.getTime()));
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  } catch {
    return null;
  }
}

// Strumenti riservati agli amministratori (e quindi anche al proprietario).
const statement = z.string().trim().min(10, 'Scrivi una motivazione chiara (almeno 10 caratteri)').max(1000);

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAdmin);

  // I numeri della comunità, con le iscrizioni degli ultimi 14 giorni.
  app.get('/admin/stats', async () => {
    const n = await one(`
      SELECT
        (SELECT count(*)::int FROM users WHERE banned_at IS NULL) AS members,
        (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days' AND deleted_at IS NULL) AS new_members_7d,
        (SELECT count(DISTINCT author_id)::int FROM (
           SELECT author_id FROM posts WHERE created_at > now() - interval '7 days'
           UNION ALL SELECT author_id FROM comments WHERE created_at > now() - interval '7 days'
           UNION ALL SELECT user_id FROM likes WHERE created_at > now() - interval '7 days') a) AS active_7d,
        (SELECT count(*)::int FROM users WHERE banned_at IS NOT NULL AND deleted_at IS NULL) AS suspended,
        (SELECT count(*)::int FROM users WHERE role <> 'member' AND banned_at IS NULL) AS staff,
        (SELECT count(*)::int FROM posts WHERE removed_at IS NULL) AS posts,
        (SELECT count(*)::int FROM posts WHERE removed_at IS NULL AND created_at > now() - interval '7 days') AS posts_7d,
        (SELECT count(*)::int FROM posts WHERE removed_at IS NULL AND media_type = 'video') AS videos,
        (SELECT count(*)::int FROM comments WHERE removed_at IS NULL) AS comments,
        (SELECT count(*)::int FROM rooms WHERE status = 'live') AS live_rooms,
        (SELECT count(*)::int FROM rooms WHERE created_at > now() - interval '7 days') AS rooms_7d,
        (SELECT count(DISTINCT (target_type, target_id))::int FROM reports WHERE status = 'open') AS open_reports`);
    const { rows } = await query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day, (SELECT count(*)::int FROM users u WHERE u.created_at >= d AND u.created_at < d + interval '1 day') AS count
       FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d ORDER BY d`,
    );
    return {
      members: n.members, newMembers7d: n.new_members_7d, active7d: n.active_7d, suspended: n.suspended, staff: n.staff,
      posts: n.posts, posts7d: n.posts_7d, videos: n.videos, comments: n.comments,
      liveRooms: n.live_rooms, rooms7d: n.rooms_7d, openReports: n.open_reports,
      signups: rows,
      lastBackup: await lastBackup(),
    };
  });

  // Account sospesi, con il motivo.
  app.get('/admin/suspended', async () => {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.role, u.banned_at, u.ban_reason
       FROM users u WHERE u.banned_at IS NOT NULL AND u.deleted_at IS NULL ORDER BY u.banned_at DESC`,
    );
    return {
      users: rows.map((u) => ({
        id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url, role: u.role,
        suspendedAt: u.banned_at, reason: u.ban_reason,
      })),
    };
  });

  // Riattiva un account sospeso. Moderatori e amministratori li riattiva solo il proprietario.
  app.post<{ Params: { id: string } }>('/admin/users/:id/reinstate', async (req) => {
    const body = z.object({ statement }).parse(req.body);
    const target = await one('SELECT id, role, banned_at FROM users WHERE id = $1 AND deleted_at IS NULL', [Number(req.params.id)]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    if (!target.banned_at) throw new HttpError(400, 'Questo account non è sospeso');
    if (target.role !== 'member' && !req.user.isOwner) throw new HttpError(403, 'Solo il proprietario può riattivare moderatori e amministratori');
    await tx(async (c) => {
      await c.query('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = $1', [target.id]);
      await c.query(
        `INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, statement) VALUES ($1, 'user', $2, 'reinstate', $3)`,
        [req.user.id, target.id, body.statement],
      );
      await notify(target.id, 'moderation', `Il tuo account è stato riattivato. ${body.statement}`, null, c);
    });
    return { reinstated: true };
  });

  // Rimuove subito un post, un commento o una Live, senza aspettare una segnalazione.
  app.post('/admin/remove', async (req) => {
    const body = z.object({ targetType: z.enum(['post', 'comment', 'room']), targetId: z.number().int().positive(), statement }).parse(req.body);
    const table = { post: 'posts', comment: 'comments', room: 'rooms' }[body.targetType];
    const ownerCol = body.targetType === 'room' ? 'host_id' : 'author_id';
    const target = await one(
      `SELECT t.id, t.${ownerCol} AS owner_id, t.removed_at, u.is_owner FROM ${table} t JOIN users u ON u.id = t.${ownerCol} WHERE t.id = $1`,
      [body.targetId],
    );
    if (!target || target.removed_at) throw new HttpError(404, 'Contenuto non trovato o già rimosso');
    if (target.is_owner && !req.user.isOwner) throw new HttpError(403, 'I contenuti del proprietario li può rimuovere solo lui');
    await tx(async (c) => {
      await c.query(`UPDATE ${table} SET removed_at = now() ${body.targetType === 'room' ? ", status = 'ended', ended_at = COALESCE(ended_at, now())" : ''} WHERE id = $1`, [target.id]);
      await c.query(`UPDATE reports SET status = 'actioned' WHERE target_type = $1 AND target_id = $2 AND status = 'open'`, [body.targetType, target.id]);
      await c.query(
        'INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, statement) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, body.targetType, target.id, 'remove', body.statement],
      );
      if (target.owner_id !== req.user.id) {
        const what = { post: 'un tuo post', comment: 'un tuo commento', room: 'una tua Live' }[body.targetType];
        await notify(target.owner_id, 'moderation', `Abbiamo rimosso ${what}. Motivo: ${body.statement}`, null, c);
      }
    });
    if (body.targetType === 'room') await closeLiveRoom(target.id);
    return { removed: true };
  });

  // ---------- Pannello utenti: tutti gli iscritti, con ricerca e filtri ----------

  const USER_FILTERS = {
    all: 'TRUE',
    staff: "u.role <> 'member'",
    suspended: 'u.banned_at IS NOT NULL',
    unverified: 'u.email_verified_at IS NULL',
    twofactor: 'u.totp_secret IS NOT NULL',
    new: "u.created_at > now() - interval '7 days'",
    mentor: 'u.mentor_since IS NOT NULL',
  } as const;

  const serializeAdminUser = (u: any) => ({
    id: Number(u.id), username: u.username, displayName: u.display_name, email: u.email, avatarUrl: u.avatar_url,
    role: u.role, isOwner: u.is_owner, createdAt: u.created_at, lastLoginAt: u.last_login_at,
    emailVerified: Boolean(u.email_verified_at), twoFactor: Boolean(u.totp_secret),
    suspended: Boolean(u.banned_at), suspendedAt: u.banned_at, suspendReason: u.ban_reason,
    posts: u.posts ?? 0, invitedBy: u.invited_by_username ?? null, mentor: Boolean(u.mentor_since),
  });

  app.get('/admin/users', async (req) => {
    const q = z.object({
      q: z.string().trim().max(100).default(''),
      filter: z.enum(Object.keys(USER_FILTERS) as [keyof typeof USER_FILTERS]).default('all'),
      page: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);
    const where = `u.deleted_at IS NULL AND ${USER_FILTERS[q.filter]} AND ($1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')`;
    const PAGE = 50;
    const { rows } = await query(
      `SELECT u.*, i.username AS invited_by_username,
              (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id AND p.removed_at IS NULL) AS posts
       FROM users u LEFT JOIN users i ON i.id = u.invited_by
       WHERE ${where} ORDER BY u.is_owner DESC, u.created_at DESC LIMIT ${PAGE + 1} OFFSET $2`,
      [q.q, q.page * PAGE],
    );
    const counts = await one(
      `SELECT ${Object.entries(USER_FILTERS).map(([k, v]) => `count(*) FILTER (WHERE ${v})::int AS ${k}`).join(', ')} FROM users u WHERE u.deleted_at IS NULL`,
    );
    return { users: rows.slice(0, PAGE).map(serializeAdminUser), nextPage: rows.length > PAGE ? q.page + 1 : null, counts };
  });

  app.get<{ Params: { id: string } }>('/admin/users/:id', async (req) => {
    const u = await one(
      `SELECT u.*, i.username AS invited_by_username,
              (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id AND p.removed_at IS NULL) AS posts
       FROM users u LEFT JOIN users i ON i.id = u.invited_by WHERE u.id = $1 AND u.deleted_at IS NULL`, [Number(req.params.id)]);
    if (!u) throw new HttpError(404, 'Utente non trovato');
    const extra = await one(
      `SELECT (SELECT count(*)::int FROM comments WHERE author_id = $1 AND removed_at IS NULL) AS comments,
              (SELECT count(*)::int FROM follows WHERE followed_id = $1) AS followers,
              (SELECT count(*)::int FROM users WHERE invited_by = $1 AND deleted_at IS NULL) AS invited,
              (SELECT count(*)::int FROM trades WHERE user_id = $1) AS trades,
              (SELECT count(*)::int FROM rooms WHERE host_id = $1) AS rooms,
              (SELECT count(*)::int FROM reports WHERE target_type = 'user' AND target_id = $1) AS reports`, [u.id]);
    const { rows: history } = await query(
      `SELECT a.action, a.statement, a.created_at, m.username AS by
       FROM moderation_actions a LEFT JOIN users m ON m.id = a.moderator_id
       WHERE a.target_type = 'user' AND a.target_id = $1 ORDER BY a.created_at DESC LIMIT 20`, [u.id]);
    return {
      user: { ...serializeAdminUser(u), birthDate: u.birth_date, ...extra },
      history: history.map((h) => ({ action: h.action, statement: h.statement, createdAt: h.created_at, by: h.by })),
      canManage: canManage(req.user, u),
    };
  });

  // Il proprietario non si tocca; moderatori e amministratori li gestisce solo il proprietario.
  function canManage(me: { id: number; isOwner: boolean }, target: any) {
    if (target.is_owner || Number(target.id) === me.id) return false;
    return target.role === 'member' || me.isOwner;
  }

  async function manageable(req: any) {
    const target = await one('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [Number(req.params.id)]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    if (target.is_owner) throw new HttpError(403, 'Il proprietario non si può modificare da qui');
    if (Number(target.id) === req.user.id) throw new HttpError(400, 'Per il tuo account usa la pagina Account');
    if (target.role !== 'member' && !req.user.isOwner) throw new HttpError(403, 'Moderatori e amministratori li gestisce solo il proprietario');
    return target;
  }

  const log = (c: any, by: number, target: number, action: string, text: string) =>
    c.query(`INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, statement) VALUES ($1, 'user', $2, $3, $4)`, [by, target, action, text]);

  app.post<{ Params: { id: string } }>('/admin/users/:id/suspend', async (req) => {
    const body = z.object({ statement }).parse(req.body);
    const target = await manageable(req);
    if (target.banned_at) throw new HttpError(400, 'Questo account è già sospeso');
    await tx(async (c) => {
      await c.query('UPDATE users SET banned_at = now(), ban_reason = $2 WHERE id = $1', [target.id, body.statement]);
      await log(c, req.user.id, target.id, 'ban', body.statement);
    });
    // Chiude le sue Live in corso.
    const { rows } = await query(`SELECT id FROM rooms WHERE host_id = $1 AND status = 'live'`, [target.id]);
    for (const r of rows) {
      await query(`UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1`, [r.id]);
      await closeLiveRoom(r.id);
    }
    return { suspended: true };
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/logout', async (req) => {
    const target = await manageable(req);
    await tx(async (c) => {
      await c.query('UPDATE users SET sessions_revoked_at = now() WHERE id = $1', [target.id]);
      await log(c, req.user.id, target.id, 'logout', 'Chiusi tutti gli accessi aperti');
    });
    return { done: true, message: `${target.display_name} dovrà rientrare con email e password su tutti i dispositivi.` };
  });

  // Per chi ha perso il telefono con l'app dei codici e anche i codici di riserva.
  app.post<{ Params: { id: string } }>('/admin/users/:id/reset-2fa', async (req) => {
    const body = z.object({ statement }).parse(req.body);
    const target = await manageable(req);
    if (!target.totp_secret) throw new HttpError(400, 'Questo account non ha i due fattori attivi');
    await tx(async (c) => {
      await c.query('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [target.id]);
      await c.query('DELETE FROM recovery_codes WHERE user_id = $1', [target.id]);
      await log(c, req.user.id, target.id, 'reset_2fa', body.statement);
      await notify(target.id, 'moderation', "Un amministratore ha disattivato l'accesso a due fattori del tuo account. Se vuoi, riattivalo da Account.", '/account', c);
    });
    return { done: true };
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/verify-email', async (req) => {
    const target = await manageable(req);
    if (target.email_verified_at) throw new HttpError(400, "L'email è già confermata");
    await tx(async (c) => {
      await c.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [target.id]);
      await log(c, req.user.id, target.id, 'verify_email', 'Email confermata a mano da un amministratore');
    });
    return { done: true };
  });

  // Badge Mentore: un membro esperto a cui i nuovi possono fare riferimento. Lo danno il proprietario e gli amministratori.
  app.post<{ Params: { id: string } }>('/admin/users/:id/mentor', async (req) => {
    const { mentor } = z.object({ mentor: z.boolean() }).parse(req.body);
    const target = await one('SELECT id, mentor_since, banned_at FROM users WHERE id = $1 AND deleted_at IS NULL', [Number(req.params.id)]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    if (Number(target.id) === req.user.id && !req.user.isOwner) throw new HttpError(400, 'Il badge Mentore te lo può dare un altro amministratore');
    if (mentor && target.banned_at) throw new HttpError(400, 'Un account sospeso non può essere Mentore');
    if (mentor === Boolean(target.mentor_since)) return { mentor };
    await tx(async (c) => {
      await c.query('UPDATE users SET mentor_since = $2, mentor_by = $3 WHERE id = $1', [target.id, mentor ? new Date() : null, mentor ? req.user.id : null]);
      await log(c, req.user.id, target.id, mentor ? 'mentor' : 'unmentor', mentor ? 'Badge Mentore assegnato' : 'Badge Mentore tolto');
      if (mentor) await notify(target.id, 'moderation', 'Sei diventato Mentore della comunità: il badge compare sul tuo profilo e nei tuoi post. Grazie per aiutare chi inizia!', null, c);
    });
    return { mentor };
  });

  app.post<{ Params: { id: string } }>('/admin/users/:id/password-reset', async (req) => {
    const target = await manageable(req);
    await sendResetLink(req, target);
    return { done: true, message: `Link per una nuova password inviato a ${target.email}` };
  });
}
