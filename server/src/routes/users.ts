import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { publicUser } from './auth.js';
import { newInviteCode } from '../invites.js';
import { saveUpload } from '../uploads.js';
import { notify } from '../notify.js';

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get<{ Params: { username: string } }>('/users/:username', async (req) => {
    const u = await one('SELECT * FROM users WHERE username = $1 AND banned_at IS NULL', [req.params.username.toLowerCase()]);
    if (!u) throw new HttpError(404, 'Utente non trovato');
    const stats = await one(
      `SELECT (SELECT count(*)::int FROM follows WHERE followed_id = $1) AS followers,
              (SELECT count(*)::int FROM follows WHERE follower_id = $1) AS following,
              (SELECT count(*)::int FROM posts WHERE author_id = $1 AND removed_at IS NULL) AS posts,
              EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followed_id = $1) AS is_following`,
      [u.id, req.user.id],
    );
    return { user: publicUser(u), followers: stats.followers, following: stats.following, posts: stats.posts, isFollowing: stats.is_following, isMe: u.id === req.user.id };
  });

  app.patch('/me', async (req) => {
    const data = z.object({
      displayName: z.string().trim().min(1).max(50).optional(),
      bio: z.string().trim().max(300).optional(),
      interests: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    }).parse(req.body);
    const u = await one(
      `UPDATE users SET display_name = COALESCE($2, display_name), bio = COALESCE($3, bio), interests = COALESCE($4, interests)
       WHERE id = $1 RETURNING *`,
      [req.user.id, data.displayName ?? null, data.bio ?? null, data.interests ?? null],
    );
    return { user: publicUser(u) };
  });

  app.post('/me/avatar', async (req) => {
    const file = await req.file();
    if (!file) throw new HttpError(400, 'Nessun file');
    const saved = await saveUpload(file, ['image']);
    const u = await one('UPDATE users SET avatar_url = $2 WHERE id = $1 RETURNING *', [req.user.id, saved.url]);
    return { user: publicUser(u) };
  });

  app.post<{ Params: { username: string } }>('/users/:username/follow', async (req) => {
    const target = await one('SELECT id FROM users WHERE username = $1 AND banned_at IS NULL', [req.params.username.toLowerCase()]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    if (target.id === req.user.id) throw new HttpError(400, 'Non puoi seguire te stesso');
    const res = await query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, target.id]);
    if (res.rowCount) await notify(target.id, 'follow', `@${req.user.username} ha iniziato a seguirti`, `/u/${req.user.username}`);
    return { following: true };
  });

  app.delete<{ Params: { username: string } }>('/users/:username/follow', async (req) => {
    await query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = (SELECT id FROM users WHERE username = $2)', [req.user.id, req.params.username.toLowerCase()]);
    return { following: false };
  });

  app.get<{ Querystring: { q?: string } }>('/search/users', async (req) => {
    const q = (req.query.q ?? '').trim().toLowerCase();
    if (q.length < 2) return { users: [] };
    const { rows } = await query(
      `SELECT * FROM users WHERE banned_at IS NULL AND (username LIKE $1 OR lower(display_name) LIKE $1) ORDER BY username LIMIT 20`,
      [`%${q.replace(/[%_\\]/g, '\\$&')}%`],
    );
    return { users: rows.map(publicUser) };
  });

  // Inviti: ognuno ne ha pochi, e ne guadagna altri quando chi ha invitato partecipa davvero.
  app.get('/invites', async (req) => {
    const me = await one('SELECT invites_left FROM users WHERE id = $1', [req.user.id]);
    const { rows } = await query(
      `SELECT i.code, i.created_at, i.used_at, u.username AS used_by_username, u.display_name AS used_by_name, u.invite_rewarded AS active
       FROM invites i LEFT JOIN users u ON u.id = i.used_by WHERE i.created_by = $1 ORDER BY i.created_at DESC`,
      [req.user.id],
    );
    return {
      invitesLeft: me.invites_left,
      activeInvitees: rows.filter((r) => r.active).length,
      invites: rows.map((r) => ({ code: r.code, createdAt: r.created_at, usedAt: r.used_at, usedBy: r.used_by_username ? { username: r.used_by_username, displayName: r.used_by_name } : null })),
    };
  });

  app.post('/invites', async (req, reply) => {
    const res = await query('UPDATE users SET invites_left = invites_left - 1 WHERE id = $1 AND invites_left > 0 RETURNING invites_left', [req.user.id]);
    if (!res.rows[0]) throw new HttpError(400, 'Hai finito gli inviti: ne ricevi altri quando chi hai invitato partecipa');
    const code = newInviteCode();
    await query('INSERT INTO invites (code, created_by) VALUES ($1, $2)', [code, req.user.id]);
    reply.status(201);
    return { code, invitesLeft: res.rows[0].invites_left };
  });
}
