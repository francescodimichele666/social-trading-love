import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { config } from '../config.js';
import { TERMS_VERSION } from '../legal.js';
import { mailConfigured, sendMail } from '../mail.js';
import { pushKeys } from '../push.js';
import { encrypt, getSetting, setSetting, type LegalSettings, type MailSettings } from '../settings.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const password = z.string().min(8, 'almeno 8 caratteri').max(200);

// Manda il link per scegliere una nuova password (usato anche dal pannello utenti degli amministratori).
export async function sendResetLink(req: FastifyRequest, user: { id: number; email: string; display_name: string }) {
  const token = randomBytes(32).toString('base64url');
  await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [user.id, sha256(token)]);
  const link = `${publicUrl(req)}/reimposta-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reimposta la tua password - Love Trading Club',
    text: `Ciao ${user.display_name},\n\nhai chiesto di cambiare la password di Love Trading Club. Apri questo link entro un'ora:\n\n${link}\n\nSe non sei stato tu, ignora questa email: la tua password resta quella di prima.\n\nLove Trading Club`,
  });
}

function publicUrl(req: FastifyRequest) {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
  const origin = req.headers.origin;
  return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin : `${req.protocol}://${req.hostname}`;
}

function requireOwner(req: FastifyRequest) {
  if (!req.user.isOwner) throw new HttpError(403, 'Solo il proprietario può cambiare queste impostazioni');
}

const mailSchema = z.object({
  host: z.string().trim().min(3).max(200),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().min(3).max(200),
  password: z.string().max(500).optional(), // vuota = lascia quella salvata
  fromName: z.string().trim().max(100).default('Love Trading Club'),
  fromEmail: z.string().trim().max(200).default(''),
});

export default async function accountRoutes(app: FastifyInstance) {
  // ---------- Recupero password ----------

  app.post('/password/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    if (!(await mailConfigured()) && process.env.MAIL_TEST !== '1') {
      throw new HttpError(503, "Il recupero della password non è ancora attivo. Scrivi all'amministratore della comunità.");
    }
    const user = await one('SELECT id, email, display_name FROM users WHERE email = $1 AND banned_at IS NULL AND deleted_at IS NULL', [email]);
    if (user) await sendResetLink(req, user);
    // Stessa risposta in ogni caso, così nessuno può scoprire quali email sono iscritte.
    return { message: "Se l'email è iscritta, ti abbiamo mandato un link per scegliere una nuova password. Controlla anche lo spam." };
  });

  app.post('/password/reset', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const body = z.object({ token: z.string().min(20).max(200), password }).parse(req.body);
    const reset = await one(
      `SELECT r.id, r.user_id FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.deleted_at IS NULL`,
      [sha256(body.token)],
    );
    if (!reset) throw new HttpError(400, 'Il link non è valido o è scaduto. Chiedine uno nuovo.');
    const hash = await bcrypt.hash(body.password, 10);
    await tx(async (c) => {
      await c.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [reset.user_id, hash]);
      await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);
    });
    return { message: 'Password cambiata. Ora puoi entrare con la nuova password.' };
  });

  app.post('/me/password', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ current: z.string(), password }).parse(req.body);
    const user = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(body.current, user.password_hash))) throw new HttpError(400, 'La password attuale non è corretta');
    await query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [req.user.id, await bcrypt.hash(body.password, 10)]);
    // Nuovo accesso per questo telefono; gli altri dispositivi dovranno rientrare.
    return { token: app.jwt.sign({ id: req.user.id }) };
  });

  // ---------- Privacy: dati del titolare, scarica i tuoi dati, elimina l'account ----------

  app.get('/legal', async () => {
    const legal = await getSetting<LegalSettings>('legal');
    return { termsVersion: TERMS_VERSION, controllerName: legal?.controllerName ?? '', contactEmail: legal?.contactEmail ?? '', city: legal?.city ?? '' };
  });

  app.get('/me/export', { preHandler: app.authenticate }, async (req, reply) => {
    const id = req.user.id;
    const user = await one(
      `SELECT id, email, username, display_name, bio, interests, birth_date, role, created_at, rules_version, terms_version, terms_accepted_at, avatar_url
       FROM users WHERE id = $1`, [id]);
    const data = {
      exportedAt: new Date().toISOString(),
      account: user,
      posts: (await query('SELECT id, body, media_url, media_type, created_at, removed_at FROM posts WHERE author_id = $1 ORDER BY id', [id])).rows,
      comments: (await query('SELECT id, post_id, body, created_at, removed_at FROM comments WHERE author_id = $1 ORDER BY id', [id])).rows,
      likes: (await query('SELECT post_id, created_at FROM likes WHERE user_id = $1 ORDER BY created_at', [id])).rows,
      following: (await query('SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.followed_id WHERE f.follower_id = $1', [id])).rows,
      followers: (await query('SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followed_id = $1', [id])).rows,
      rooms: (await query('SELECT id, title, description, status, scheduled_at, created_at FROM rooms WHERE host_id = $1 ORDER BY id', [id])).rows,
      reportsMade: (await query('SELECT target_type, target_id, reason, details, created_at FROM reports WHERE reporter_id = $1', [id])).rows,
      notifications: (await query('SELECT kind, message, created_at FROM notifications WHERE user_id = $1 ORDER BY id', [id])).rows,
      journal: (await query('SELECT * FROM trades WHERE user_id = $1 ORDER BY id', [id])).rows,
      challenges: (await query(
        `SELECT c.title, c.starts_on, p.joined_at,
                (SELECT json_agg(json_build_object('day', k.day, 'kept', k.kept) ORDER BY k.day) FROM challenge_checkins k WHERE k.challenge_id = c.id AND k.user_id = $1) AS checkins
         FROM challenge_participants p JOIN challenges c ON c.id = p.challenge_id WHERE p.user_id = $1 ORDER BY c.starts_on`, [id])).rows,
      badges: (await query('SELECT title, emoji, awarded_at FROM user_badges WHERE user_id = $1 ORDER BY awarded_at', [id])).rows,
    };
    reply.header('content-disposition', `attachment; filename="love-trading-club-${user.username}.json"`);
    return data;
  });

  app.post('/me/delete', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ password: z.string() }).parse(req.body);
    if (req.user.isOwner) throw new HttpError(400, "Il proprietario non può eliminare il proprio account: è necessario per gestire la comunità");
    const user = await one('SELECT password_hash, avatar_url FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(body.password, user.password_hash))) throw new HttpError(400, 'Password non corretta');

    const files = (await query(
      `SELECT media_url AS f FROM posts WHERE author_id = $1 AND media_url IS NOT NULL
       UNION ALL SELECT media_poster FROM posts WHERE author_id = $1 AND media_poster IS NOT NULL`, [req.user.id],
    )).rows.map((r) => r.f as string);
    if (user.avatar_url) files.push(user.avatar_url);
    const recordings = (await query('SELECT rec.file_name FROM recordings rec JOIN rooms r ON r.id = rec.room_id WHERE r.host_id = $1', [req.user.id])).rows.map((r) => r.file_name as string);

    await tx(async (c) => {
      const id = req.user.id;
      for (const sql of [
        'DELETE FROM posts WHERE author_id = $1', 'DELETE FROM comments WHERE author_id = $1', 'DELETE FROM likes WHERE user_id = $1',
        'DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1', 'DELETE FROM notifications WHERE user_id = $1',
        'DELETE FROM room_members WHERE user_id = $1', 'DELETE FROM rooms WHERE host_id = $1', 'DELETE FROM push_subscriptions WHERE user_id = $1',
        'DELETE FROM password_resets WHERE user_id = $1', 'DELETE FROM trades WHERE user_id = $1',
        'DELETE FROM challenge_checkins WHERE user_id = $1', 'DELETE FROM challenge_participants WHERE user_id = $1', 'DELETE FROM user_badges WHERE user_id = $1',
      ]) await c.query(sql, [id]);
      // Resta solo una riga anonima, perché le decisioni di moderazione già prese devono restare registrate.
      await c.query(
        `UPDATE users SET email = 'eliminato-' || id || '@invalid', username = 'eliminato_' || id, display_name = 'Account eliminato',
           bio = '', interests = '{}', avatar_url = NULL, password_hash = '!', friend_code = NULL, role = 'member',
           banned_at = COALESCE(banned_at, now()), ban_reason = 'Account eliminato dalla persona', deleted_at = now()
         WHERE id = $1`, [id]);
    });
    const dir = path.resolve(config.uploadDir);
    await Promise.all(files.map((f) => unlink(path.join(dir, path.basename(f))).catch(() => {})));
    const recDir = path.resolve(config.recordingsDir);
    await Promise.all(recordings.map((f) => unlink(path.join(recDir, path.basename(f))).catch(() => {})));
    return { deleted: true };
  });

  // ---------- Notifiche sul telefono ----------

  app.get('/push/key', async () => ({ publicKey: (await pushKeys()).publicKey }));

  app.post('/push/subscribe', { preHandler: app.authenticate }, async (req) => {
    const sub = z.object({
      endpoint: z.string().url().max(1000),
      keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    }).parse(req.body);
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
    );
    return { subscribed: true };
  });

  app.post('/push/unsubscribe', { preHandler: app.authenticate }, async (req) => {
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    return { subscribed: false };
  });

  // ---------- Impostazioni del proprietario ----------

  app.get('/owner/settings', { preHandler: app.authenticate }, async (req) => {
    requireOwner(req);
    const mail = await getSetting<MailSettings>('mail');
    const legal = await getSetting<LegalSettings>('legal');
    return {
      mail: mail ? { host: mail.host, port: mail.port, secure: mail.secure, user: mail.user, fromName: mail.fromName, fromEmail: mail.fromEmail, hasPassword: Boolean(mail.password) } : null,
      legal: legal ?? { controllerName: '', contactEmail: '', city: '' },
    };
  });

  app.put('/owner/settings/mail', { preHandler: app.authenticate }, async (req) => {
    requireOwner(req);
    const body = mailSchema.parse(req.body);
    const old = await getSetting<MailSettings>('mail');
    const stored: MailSettings = { ...body, password: body.password ? encrypt(body.password) : old?.password };
    if (!stored.password) throw new HttpError(400, 'Inserisci la password della casella');
    await setSetting('mail', stored);
    return { saved: true };
  });

  app.post('/owner/settings/mail/test', { preHandler: app.authenticate }, async (req) => {
    requireOwner(req);
    const me = await one('SELECT email FROM users WHERE id = $1', [req.user.id]);
    await sendMail({
      to: me.email,
      subject: 'Prova di invio - Love Trading Club',
      text: "Funziona! Questa email è partita dalla casella che hai impostato in Love Trading Club.\nDa ora i membri possono recuperare la password da soli.",
    });
    return { message: `Email di prova inviata a ${me.email}. Controlla anche lo spam.` };
  });

  app.put('/owner/settings/legal', { preHandler: app.authenticate }, async (req) => {
    requireOwner(req);
    const body = z.object({
      controllerName: z.string().trim().min(2).max(120),
      contactEmail: z.string().trim().email(),
      city: z.string().trim().max(80).default(''),
    }).parse(req.body);
    await setSetting('legal', body);
    return { saved: true };
  });
}
