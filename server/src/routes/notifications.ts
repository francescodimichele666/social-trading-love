import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/notifications', async (req) => {
    const { rows } = await query(
      'SELECT id, kind, message, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id],
    );
    return { notifications: rows.map((n) => ({ id: n.id, kind: n.kind, message: n.message, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at })) };
  });

  app.post('/notifications/read', async (req) => {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    return { ok: true };
  });
}
