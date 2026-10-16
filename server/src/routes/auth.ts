import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, tx } from '../db.js';
import { HttpError } from '../app.js';
import { RULES, RULES_VERSION } from '../rules.js';
import { config } from '../config.js';
import { TERMS_VERSION } from '../legal.js';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'almeno 8 caratteri').max(200),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, 'da 3 a 20 caratteri: lettere, numeri, _'),
  displayName: z.string().trim().min(1).max(50),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inviteCode: z.string().trim().toUpperCase().optional(),
  acceptRules: z.literal(true, { message: 'Devi accettare le regole' }),
  acceptTerms: z.literal(true, { message: "Devi accettare l'informativa privacy e le condizioni d'uso" }),
});

export function isAdult(birthDate: string, now = new Date()): boolean {
  const [y, m, d] = birthDate.split('-').map(Number);
  const eighteenth = new Date(Date.UTC(y + 18, m - 1, d));
  return !Number.isNaN(eighteenth.getTime()) && eighteenth.getTime() <= now.getTime();
}

export function publicUser(u: any) {
  return {
    id: u.id, username: u.username, displayName: u.display_name, bio: u.bio, interests: u.interests,
    avatarUrl: u.avatar_url, role: u.role, isOwner: u.is_owner, createdAt: u.created_at,
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.get('/rules', async () => {
    const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM users');
    return { version: RULES_VERSION, rules: RULES, firstUser: (count?.n ?? 0) === 0 };
  });

  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const data = registerSchema.parse(req.body);
    if (!isAdult(data.birthDate)) throw new HttpError(400, 'La comunità è riservata ai maggiorenni');
    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await tx(async (c) => {
      // Lock per evitare che due persone diventino "primo utente" insieme.
      await c.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
      const { rows: [{ n }] } = await c.query('SELECT count(*)::int AS n FROM users');
      const first = n === 0;
      let invitedBy: number | null = null;

      if (first && config.ownerEmail && data.email !== config.ownerEmail) {
        throw new HttpError(403, "Il primo account è riservato al proprietario della comunità");
      }
      // Iscrizione libera. Il codice di un amico è facoltativo: serve solo a sapere chi ti ha portato.
      if (!first && data.inviteCode) {
        const friend = await c.query('SELECT id FROM users WHERE friend_code = $1 AND banned_at IS NULL', [data.inviteCode]);
        invitedBy = friend.rows[0]?.id ?? null;
      }
      const taken = await c.query('SELECT 1 FROM users WHERE email = $1 OR username = $2', [data.email, data.username]);
      if (taken.rows[0]) throw new HttpError(409, 'Email o nome utente già in uso');

      const { rows: [u] } = await c.query(
        `INSERT INTO users (email, username, password_hash, display_name, birth_date, role, is_owner, invited_by, rules_version, terms_version, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING *`,
        [data.email, data.username, passwordHash, data.displayName, data.birthDate, first ? 'admin' : 'member', first, invitedBy, RULES_VERSION, TERMS_VERSION],
      );
      return u;
    });

    reply.status(201);
    return { token: app.jwt.sign({ id: user.id }), user: publicUser(user) };
  });

  app.post('/login', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req) => {
    const { login, password } = z.object({ login: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
    const user = await one('SELECT * FROM users WHERE (email = $1 OR username = $1) AND deleted_at IS NULL', [login]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Credenziali non corrette');
    if (user.banned_at) throw new HttpError(403, `Account sospeso: ${user.ban_reason ?? ''}`.trim());
    return { token: app.jwt.sign({ id: user.id }), user: publicUser(user) };
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const unread = await one<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    return { user: { ...publicUser(user), email: user.email, termsVersion: user.terms_version }, currentTermsVersion: TERMS_VERSION, unreadNotifications: unread?.n ?? 0 };
  });
}
