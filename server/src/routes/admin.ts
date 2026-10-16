import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { notify } from '../notify.js';
import { closeLiveRoom } from '../livekit.js';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

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

  // Rimuove subito un post, un commento o una Piazza, senza aspettare una segnalazione.
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
        const what = { post: 'un tuo post', comment: 'un tuo commento', room: 'una tua Piazza' }[body.targetType];
        await notify(target.owner_id, 'moderation', `Abbiamo rimosso ${what}. Motivo: ${body.statement}`, null, c);
      }
    });
    if (body.targetType === 'room') await closeLiveRoom(target.id);
    return { removed: true };
  });
}
