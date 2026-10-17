import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { one, query } from './db.js';
import { HttpError } from './app.js';
import { mailConfigured, sendMail } from './mail.js';
import { decrypt } from './settings.js';

// Sicurezza degli accessi:
// - codice di 6 cifre via email per confermare l'indirizzo all'iscrizione;
// - accesso a due fattori con un'app di autenticazione (Google Authenticator, Microsoft Authenticator, Authy...),
//   con 10 codici di riserva da usare se si perde il telefono.

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---------- Codici a tempo (TOTP, RFC 6238) ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpCode(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 30_000);

// Accetta il codice di adesso e quelli di 30 secondi prima e dopo (orologi un po' sfasati).
// Restituisce lo "step" usato, così lo stesso codice non vale una seconda volta.
export function verifyTotp(secretB32: string, code: string, lastStep: number | null, now = Date.now()) {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const expected = totpCode(secretB32, s);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return s;
  }
  return null;
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function otpauthUrl(secret: string, account: string) {
  const issuer = 'Love Trading Club';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Codici di riserva: 10 codici tipo "k7pq-2mxa", ognuno vale una volta sola.
export async function newRecoveryCodes(userId: number) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const codes = Array.from({ length: 10 }, () => {
    const s = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  await query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  for (const c of codes) await query('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [userId, sha256(c)]);
  return codes;
}

// Verifica il secondo fattore: codice dell'app (6 cifre) oppure un codice di riserva.
export async function checkSecondFactor(userId: number, code: string) {
  const u = await one('SELECT totp_secret, totp_last_step FROM users WHERE id = $1', [userId]);
  if (!u?.totp_secret) return true;
  const c = code.trim().toLowerCase();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const step = verifyTotp(decrypt(u.totp_secret), c, u.totp_last_step == null ? null : Number(u.totp_last_step));
    if (step == null) return false;
    await query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [userId, step]);
    return true;
  }
  const used = await one(
    'UPDATE recovery_codes SET used_at = now() WHERE id = (SELECT id FROM recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL LIMIT 1) RETURNING id',
    [userId, sha256(c.replace(/\s/g, ''))],
  );
  return Boolean(used);
}

// ---------- Codice via email per confermare l'indirizzo ----------

export const emailVerificationActive = async () => process.env.MAIL_TEST === '1' || (await mailConfigured());

export async function sendVerificationCode(user: { id: number; email: string; display_name: string }) {
  const recent = await one(`SELECT 1 FROM email_codes WHERE user_id = $1 AND purpose = 'verify' AND created_at > now() - interval '45 seconds'`, [user.id]);
  if (recent) throw new HttpError(429, 'Ti abbiamo appena mandato un codice: aspetta un minuto prima di chiederne un altro');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await query(`UPDATE email_codes SET used_at = now() WHERE user_id = $1 AND purpose = 'verify' AND used_at IS NULL`, [user.id]);
  await query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify', $2, now() + interval '15 minutes')`, [user.id, sha256(code)]);
  await sendMail({
    to: user.email,
    subject: `${code} è il tuo codice per Love Trading Club`,
    text: `Ciao ${user.display_name},\n\nil tuo codice per confermare l'email è:\n\n${code}\n\nVale 15 minuti. Se non ti sei iscritto tu a Love Trading Club, ignora questa email.\n\nLove Trading Club`,
  });
}

export async function checkVerificationCode(userId: number, code: string) {
  const row = await one(
    `SELECT id, code_hash, attempts FROM email_codes WHERE user_id = $1 AND purpose = 'verify' AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`, [userId]);
  if (!row) throw new HttpError(400, 'Il codice è scaduto: chiedine uno nuovo');
  if (row.attempts >= 5) throw new HttpError(429, 'Troppi tentativi sbagliati: chiedi un codice nuovo');
  if (row.code_hash !== sha256(code.replace(/\s/g, ''))) {
    await query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw new HttpError(400, `Codice non corretto (${4 - row.attempts} tentativi rimasti)`);
  }
  await query('UPDATE email_codes SET used_at = now() WHERE id = $1', [row.id]);
  await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [userId]);
}

// ---------- "Biglietti" per i passaggi dell'accesso ----------
// Dopo la password non si entra subito: si riceve un biglietto valido 15 minuti per il passo dopo
// (codice email o codice a due fattori). Il biglietto NON vale come accesso: authenticate lo rifiuta.

export type Ticket = { id: number; purpose: 'verify' | '2fa'; cid?: string };

export async function signTicket(app: FastifyInstance, userId: number, purpose: Ticket['purpose']) {
  let cid: string | undefined;
  if (purpose === '2fa') {
    cid = randomBytes(16).toString('hex');
    await query(`INSERT INTO login_challenges (id, user_id, expires_at) VALUES ($1, $2, now() + interval '15 minutes')`, [cid, userId]);
  }
  return app.jwt.sign({ id: userId, purpose, cid } as any, { expiresIn: '15m' });
}

export function readTicket(app: FastifyInstance, ticket: string, purpose: Ticket['purpose']): Ticket {
  try {
    const t = app.jwt.verify<Ticket>(ticket);
    if (t.purpose === purpose) return t;
  } catch { /* scaduto o falso */ }
  throw new HttpError(401, 'Il passaggio è scaduto: rientra con email e password');
}

// Dà l'accesso vero e proprio e segna l'ultimo accesso.
export async function issueSession(app: FastifyInstance, userId: number) {
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  return app.jwt.sign({ id: userId });
}
