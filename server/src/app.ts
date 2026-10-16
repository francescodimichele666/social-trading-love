import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { one } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import postRoutes from './routes/posts.js';
import roomRoutes from './routes/rooms.js';
import moderationRoutes from './routes/moderation.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';

export type AuthUser = { id: number; role: 'member' | 'moderator' | 'admin'; username: string; isOwner: boolean };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number };
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireModerator: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export async function buildApp(opts: { logger?: boolean; rateLimit?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024 });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(jwt, { secret: config.jwtSecret, sign: { expiresIn: '30d' } });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });
  if (opts.rateLimit !== false) await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  const uploadRoot = path.resolve(config.uploadDir);
  await mkdir(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, { root: uploadRoot, prefix: '/uploads/', decorateReply: false });

  // Verifica il token e ricarica l'utente: così un utente bloccato perde subito l'accesso.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: { id: number };
    try {
      payload = await req.jwtVerify<{ id: number }>();
    } catch {
      throw new HttpError(401, 'Accesso richiesto');
    }
    const user = await one('SELECT id, role, username, is_owner, banned_at FROM users WHERE id = $1', [payload.id]);
    if (!user) throw new HttpError(401, 'Accesso richiesto');
    if (user.banned_at) throw new HttpError(403, 'Account sospeso');
    req.user = { id: user.id, role: user.role, username: user.username, isOwner: user.is_owner };
  });

  app.decorate('requireModerator', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user.role === 'member') throw new HttpError(403, 'Solo per moderatori');
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(req, reply);
    if (req.user.role !== 'admin') throw new HttpError(403, 'Solo per amministratori');
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Dati non validi', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'Errore interno' : err.message });
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api' });
  await app.register(postRoutes, { prefix: '/api' });
  await app.register(roomRoutes, { prefix: '/api' });
  await app.register(moderationRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });

  return app;
}
