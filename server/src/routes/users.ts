import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { publicUser } from './auth.js';
import { friendCodeFor } from '../invites.js';
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
    const { rows: badges } = await query('SELECT id, title, emoji, awarded_at FROM user_badges WHERE user_id = $1 ORDER BY awarded_at DESC', [u.id]);
    return {
      user: publicUser(u), followers: stats.followers, following: stats.following, posts: stats.posts, isFollowing: stats.is_following, isMe: u.id === req.user.id,
      badges: badges.map((b) => ({ id: b.id, title: b.title, emoji: b.emoji, awardedAt: b.awarded_at })),
    };
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

  // I Mentori della comunità, per chi cerca qualcuno da cui imparare.
  app.get('/mentors', async () => {
    const { rows } = await query('SELECT * FROM users WHERE mentor_since IS NOT NULL AND banned_at IS NULL AND deleted_at IS NULL ORDER BY mentor_since LIMIT 50');
    return { users: rows.map(publicUser) };
  });

  // Porta un amico: codice personale riutilizzabile, chi si è iscritto grazie a te e la classifica del mese.
  app.get('/invites', async (req) => {
    const code = await friendCodeFor(req.user.id);
    // Contano solo gli amici "attivi" (hanno pubblicato o sono entrati in una Live), così la classifica premia chi porta persone vere.
    const { rows: board } = await query(
      `SELECT i.id, i.username, i.display_name, i.avatar_url, i.mentor_since, i.is_owner, count(*)::int AS active
       FROM users u JOIN users i ON i.id = u.invited_by
       WHERE u.invite_rewarded AND u.banned_at IS NULL AND i.banned_at IS NULL AND u.created_at > date_trunc('month', now())
       GROUP BY i.id ORDER BY active DESC, min(u.created_at) LIMIT 10`,
    );
    const { rows } = await query(
      `SELECT username, display_name, avatar_url, invite_rewarded AS active, created_at FROM users
       WHERE invited_by = $1 AND banned_at IS NULL ORDER BY created_at DESC`,
      [req.user.id],
    );
    return {
      code,
      joined: rows.length,
      active: rows.filter((r) => r.active).length,
      friends: rows.map((r) => ({ username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, active: r.active, joinedAt: r.created_at })),
      leaderboard: board.map((b, i) => ({
        rank: i + 1, username: b.username, displayName: b.display_name, avatarUrl: b.avatar_url,
        isMentor: Boolean(b.mentor_since), isOwner: b.is_owner, active: b.active, isMe: Number(b.id) === req.user.id,
      })),
    };
  });
}
