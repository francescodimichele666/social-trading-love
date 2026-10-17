import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { RULES, RULES_VERSION } from '../rules.js';
import { config } from '../config.js';
import { TERMS_VERSION } from '../legal.js';
import { checkSecondFactor, checkVerificationCode, emailVerificationActive, issueSession, testCodeMode, readTicket, sendVerificationCode, signTicket } from '../security.js';

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
    avatarUrl: u.avatar_url, role: u.role, isOwner: u.is_owner, createdAt: u.created_at, isMentor: Boolean(u.mentor_since),
  };
}

export default async function authRoutes(app: FastifyInstance) {
  // Dati pubblici per la pagina di presentazione (chi non è iscritto): nessun dato personale oltre al nome di chi conduce.
  app.get('/public/overview', async () => {
    const n = await one(
      `SELECT (SELECT count(*)::int FROM users WHERE deleted_at IS NULL AND banned_at IS NULL) AS members,
              (SELECT count(*)::int FROM rooms WHERE started_at IS NOT NULL AND removed_at IS NULL) AS lives,
              (SELECT count(*)::int FROM trades) AS trades`,
    );
    const { rows } = await query(
      `SELECT r.id, r.title, r.topic, r.status, r.scheduled_at, u.display_name, u.avatar_url
       FROM rooms r JOIN users u ON u.id = r.host_id
       WHERE r.removed_at IS NULL AND u.banned_at IS NULL
         AND (r.status = 'live' OR (r.status = 'scheduled' AND r.scheduled_at > now() - interval '1 hour'))
       ORDER BY (r.status = 'live') DESC, r.scheduled_at LIMIT 4`,
    );
    return {
      members: n.members, lives: n.lives, trades: n.trades,
      upcoming: rows.map((r) => ({ id: r.id, title: r.title, topic: r.topic, live: r.status === 'live', scheduledAt: r.scheduled_at, host: { displayName: r.display_name, avatarUrl: r.avatar_url } })),
    };
  });

  app.get('/rules', async () => {
    const count = await one<{ n: number }>('SELECT count(*)::int AS n FROM users');
    return { version: RULES_VERSION, rules: RULES, firstUser: (count?.n ?? 0) === 0 };
  });

  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const data = registerSchema.parse(req.body);
    if (!isAdult(data.birthDate)) throw new HttpError(400, 'La comunità è riservata ai maggiorenni');
    const passwordHash = await bcrypt.hash(data.password, 10);
    // Se la casella email del titolare non è ancora impostata (per esempio il primo iscritto, il proprietario),
    // l'email non si può confermare con un codice: in quel caso l'account è subito attivo.
    const mustVerify = await emailVerificationActive();

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
        `INSERT INTO users (email, username, password_hash, display_name, birth_date, role, is_owner, invited_by, rules_version, terms_version, terms_accepted_at, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11) RETURNING *`,
        [data.email, data.username, passwordHash, data.displayName, data.birthDate, first ? 'admin' : 'member', first, invitedBy, RULES_VERSION, TERMS_VERSION, mustVerify ? null : new Date()],
      );
      return u;
    });

    reply.status(201);
    if (!user.email_verified_at) {
      await sendVerificationCode(user);
      return { verify: true, ticket: await signTicket(app, user.id, 'verify'), email: user.email, testCode: await testCodeMode() };
    }
    return { token: await issueSession(app, user.id), user: publicUser(user) };
  });

  // Passo 2 dell'iscrizione (o di un accesso con email non ancora confermata): il codice arrivato via email.
  app.post('/verify-email', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req) => {
    const { ticket, code } = z.object({ ticket: z.string(), code: z.string().trim().min(6).max(10) }).parse(req.body);
    const t = readTicket(app, ticket, 'verify');
    await checkVerificationCode(t.id, code);
    const user = await one('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [t.id]);
    if (!user) throw new HttpError(401, 'Account non trovato');
    if (user.banned_at) throw new HttpError(403, `Account sospeso: ${user.ban_reason ?? ''}`.trim());
    if (user.totp_secret) return { twoFactor: true, ticket: await signTicket(app, user.id, '2fa') };
    return { token: await issueSession(app, user.id), user: publicUser(user) };
  });

  app.post('/verify-email/resend', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const { ticket } = z.object({ ticket: z.string() }).parse(req.body);
    const t = readTicket(app, ticket, 'verify');
    const user = await one('SELECT id, email, display_name, email_verified_at FROM users WHERE id = $1 AND deleted_at IS NULL', [t.id]);
    if (!user || user.email_verified_at) throw new HttpError(400, "L'email è già confermata: entra con email e password");
    await sendVerificationCode(user);
    if (await testCodeMode()) return { message: 'La casella email non è ancora impostata: usa il codice di prova.' };
    return { message: `Codice nuovo inviato a ${user.email}` };
  });

  // Passo 2 dell'accesso con i due fattori: codice dell'app o codice di riserva. Massimo 5 tentativi per accesso.
  app.post('/login/2fa', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req) => {
    const { ticket, code } = z.object({ ticket: z.string(), code: z.string().trim().min(6).max(20) }).parse(req.body);
    const t = readTicket(app, ticket, '2fa');
    const ch = await one('SELECT attempts, used_at, expires_at FROM login_challenges WHERE id = $1 AND user_id = $2', [t.cid, t.id]);
    if (!ch || ch.used_at || ch.expires_at < new Date()) throw new HttpError(401, 'Il passaggio è scaduto: rientra con email e password');
    if (ch.attempts >= 5) throw new HttpError(429, 'Troppi codici sbagliati: rientra con email e password');
    if (!(await checkSecondFactor(t.id, code))) {
      await query('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1', [t.cid]);
      throw new HttpError(400, `Codice non corretto (${4 - ch.attempts} tentativi rimasti)`);
    }
    await query('UPDATE login_challenges SET used_at = now() WHERE id = $1', [t.cid]);
    const user = await one('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [t.id]);
    if (!user || user.banned_at) throw new HttpError(403, 'Account non attivo');
    return { token: await issueSession(app, user.id), user: publicUser(user) };
  });

  app.post('/login', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req) => {
    const { login, password } = z.object({ login: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
    const user = await one('SELECT * FROM users WHERE (email = $1 OR username = $1) AND deleted_at IS NULL', [login]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Credenziali non corrette');
    if (user.banned_at) throw new HttpError(403, `Account sospeso: ${user.ban_reason ?? ''}`.trim());
    if (!user.email_verified_at) {
      await sendVerificationCode(user).catch((e) => { if (e.statusCode !== 429) throw e; });
      return { verify: true, ticket: await signTicket(app, user.id, 'verify'), email: user.email, testCode: await testCodeMode() };
    }
    if (user.totp_secret) return { twoFactor: true, ticket: await signTicket(app, user.id, '2fa') };
    return { token: await issueSession(app, user.id), user: publicUser(user) };
  });

  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const unread = await one<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    return { user: { ...publicUser(user), email: user.email, termsVersion: user.terms_version, twoFactor: Boolean(user.totp_secret) }, currentTermsVersion: TERMS_VERSION, unreadNotifications: unread?.n ?? 0 };
  });
}
