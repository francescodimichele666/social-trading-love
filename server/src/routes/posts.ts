import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { hasRedFlags } from '../rules.js';
import { saveUpload } from '../uploads.js';
import { rewardInviterOnce } from '../invites.js';
import { notify } from '../notify.js';

const PAGE = 20;

// Campi comuni per mostrare un post. $1 è sempre l'id di chi guarda.
const POST_SELECT = `
  SELECT p.id, p.body, p.media_url, p.media_type, p.media_poster, p.media_duration, p.flagged, p.created_at,
         u.id AS author_id, u.username, u.display_name, u.avatar_url,
         (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) AS likes,
         (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id AND c.removed_at IS NULL AND (NOT c.flagged OR c.author_id = $1)) AS comments,
         EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked
  FROM posts p JOIN users u ON u.id = p.author_id`;

// Visibile se non rimosso, autore non bloccato, e (se in revisione) solo al suo autore.
const VISIBLE = `p.removed_at IS NULL AND u.banned_at IS NULL AND (NOT p.flagged OR p.author_id = $1)`;

function serialize(r: any) {
  return {
    id: r.id, body: r.body, mediaUrl: r.media_url, mediaType: r.media_type, mediaPoster: r.media_poster, mediaDuration: r.media_duration, inReview: r.flagged, createdAt: r.created_at,
    author: { id: r.author_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    likes: r.likes, comments: r.comments, liked: r.liked,
  };
}

async function flagForReview(targetType: 'post' | 'comment', targetId: number) {
  await query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (NULL, $1, $2, 'frasi_a_rischio', 'Segnalato in automatico: contiene frasi tipiche di promesse di guadagno o truffe')`,
    [targetType, targetId],
  );
}

export default async function postRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/posts', async (req, reply) => {
    let body = '';
    let media: Awaited<ReturnType<typeof saveUpload>> | null = null;
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') media = await saveUpload(part, ['image', 'video']);
        else if (part.fieldname === 'body') body = String(part.value ?? '');
      }
    } else {
      body = z.object({ body: z.string() }).parse(req.body).body;
    }
    body = body.trim();
    if (body.length > 2000) throw new HttpError(400, 'Il testo può avere al massimo 2000 caratteri');
    if (!body && !media) throw new HttpError(400, 'Scrivi qualcosa o aggiungi una foto o un video');

    const flagged = hasRedFlags(body);
    const post = await one(
      'INSERT INTO posts (author_id, body, media_url, media_type, media_poster, media_duration, flagged) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [req.user.id, body, media?.url ?? null, media?.kind ?? null, media?.posterUrl ?? null, media?.duration ?? null, flagged],
    );
    if (flagged) await flagForReview('post', post.id);
    await rewardInviterOnce(req.user.id);

    const full = await one(`${POST_SELECT} WHERE p.id = $2`, [req.user.id, post.id]);
    reply.status(201);
    return {
      post: serialize(full),
      notice: flagged ? 'Il post contiene frasi che le regole considerano a rischio: lo vedi solo tu finché un moderatore non lo controlla.' : null,
    };
  });

  // Feed onesto: prima chi segui (ultimi 7 giorni), poi la comunità (ultimi 3 giorni), poi finisce.
  app.get<{ Querystring: { page?: string } }>('/feed', async (req) => {
    const page = Math.max(0, Number(req.query.page ?? 0) || 0);
    const { rows } = await query(
      `WITH f AS (SELECT followed_id FROM follows WHERE follower_id = $1)
       ${POST_SELECT.replace('SELECT p.id', `SELECT CASE WHEN p.author_id = $1 OR p.author_id IN (SELECT followed_id FROM f) THEN 0 ELSE 1 END AS section, p.id`)}
       WHERE ${VISIBLE}
         AND ((p.author_id = $1 OR p.author_id IN (SELECT followed_id FROM f)) AND p.created_at > now() - interval '7 days'
              OR p.created_at > now() - interval '3 days')
       ORDER BY section, p.created_at DESC, p.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, PAGE + 1, page * PAGE],
    );
    const end = rows.length <= PAGE;
    return {
      posts: rows.slice(0, PAGE).map((r) => ({ ...serialize(r), fromFollowing: r.section === 0 })),
      end,
      nextPage: end ? null : page + 1,
    };
  });

  app.get<{ Params: { username: string }; Querystring: { page?: string } }>('/users/:username/posts', async (req) => {
    const page = Math.max(0, Number(req.query.page ?? 0) || 0);
    const { rows } = await query(
      `${POST_SELECT} WHERE u.username = $2 AND ${VISIBLE} ORDER BY p.created_at DESC, p.id DESC LIMIT $3 OFFSET $4`,
      [req.user.id, req.params.username.toLowerCase(), PAGE + 1, page * PAGE],
    );
    return { posts: rows.slice(0, PAGE).map(serialize), nextPage: rows.length > PAGE ? page + 1 : null };
  });

  app.get<{ Params: { id: string } }>('/posts/:id', async (req) => {
    const post = await one(`${POST_SELECT} WHERE p.id = $2 AND ${VISIBLE}`, [req.user.id, Number(req.params.id)]);
    if (!post) throw new HttpError(404, 'Post non trovato');
    const { rows } = await query(
      `SELECT c.id, c.body, c.flagged, c.created_at, u.id AS author_id, u.username, u.display_name, u.avatar_url
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $2 AND c.removed_at IS NULL AND u.banned_at IS NULL AND (NOT c.flagged OR c.author_id = $1)
       ORDER BY c.created_at`,
      [req.user.id, post.id],
    );
    return {
      post: serialize(post),
      comments: rows.map((c) => ({ id: c.id, body: c.body, inReview: c.flagged, createdAt: c.created_at, author: { id: c.author_id, username: c.username, displayName: c.display_name, avatarUrl: c.avatar_url } })),
    };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/like', async (req) => {
    const post = await one(`SELECT p.id, p.author_id FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = $2 AND ${VISIBLE}`, [req.user.id, Number(req.params.id)]);
    if (!post) throw new HttpError(404, 'Post non trovato');
    await query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, post.id]);
    return { liked: true };
  });

  app.delete<{ Params: { id: string } }>('/posts/:id/like', async (req) => {
    await query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [req.user.id, Number(req.params.id)]);
    return { liked: false };
  });

  app.post<{ Params: { id: string } }>('/posts/:id/comments', async (req, reply) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
    const post = await one(`SELECT p.id, p.author_id FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = $2 AND ${VISIBLE}`, [req.user.id, Number(req.params.id)]);
    if (!post) throw new HttpError(404, 'Post non trovato');
    const flagged = hasRedFlags(body);
    const c = await one('INSERT INTO comments (post_id, author_id, body, flagged) VALUES ($1, $2, $3, $4) RETURNING id, created_at', [post.id, req.user.id, body, flagged]);
    if (flagged) await flagForReview('comment', c.id);
    else if (post.author_id !== req.user.id) await notify(post.author_id, 'comment', `@${req.user.username} ha commentato il tuo post`, `/post/${post.id}`);
    reply.status(201);
    return { comment: { id: c.id, body, inReview: flagged, createdAt: c.created_at } };
  });

  app.delete<{ Params: { id: string } }>('/posts/:id', async (req) => {
    const res = await query('UPDATE posts SET removed_at = now() WHERE id = $1 AND author_id = $2 AND removed_at IS NULL', [Number(req.params.id), req.user.id]);
    if (!res.rowCount) throw new HttpError(404, 'Post non trovato');
    return { deleted: true };
  });

  app.delete<{ Params: { id: string } }>('/comments/:id', async (req) => {
    const res = await query('UPDATE comments SET removed_at = now() WHERE id = $1 AND author_id = $2 AND removed_at IS NULL', [Number(req.params.id), req.user.id]);
    if (!res.rowCount) throw new HttpError(404, 'Commento non trovato');
    return { deleted: true };
  });
}
