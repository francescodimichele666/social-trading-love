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
import accountRoutes from './routes/account.js';
import journalRoutes from './routes/journal.js';
import challengeRoutes from './routes/challenges.js';
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
  const recordingsRoot = path.resolve(config.recordingsDir);
  await mkdir(recordingsRoot, { recursive: true });
  await app.register(fastifyStatic, { root: recordingsRoot, prefix: '/recordings/', decorateReply: false });

  // Verifica il token e ricarica l'utente: così un utente bloccato perde subito l'accesso.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    let payload: { id: number; iat?: number };
    try {
      payload = await req.jwtVerify<{ id: number; iat?: number }>();
    } catch {
      throw new HttpError(401, 'Accesso richiesto');
    }
    const user = await one('SELECT id, role, username, is_owner, banned_at, deleted_at, password_changed_at FROM users WHERE id = $1', [payload.id]);
    if (!user || user.deleted_at) throw new HttpError(401, 'Accesso richiesto');
    // Dopo un cambio password valgono solo gli accessi fatti dopo.
    if (user.password_changed_at && payload.iat && payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
      throw new HttpError(401, 'La password è cambiata: entra di nuovo');
    }
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
    // I nostri errori hanno sempre un messaggio pensato per le persone, anche quelli 5xx (es. email non partita).
    if (err instanceof HttpError) return reply.status(status).send({ error: err.message });
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
  await app.register(accountRoutes, { prefix: '/api' });
  await app.register(journalRoutes, { prefix: '/api' });
  await app.register(challengeRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });

  return app;
}
