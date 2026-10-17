import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { decrypt, encrypt } from '../settings.js';
import { checkSecondFactor, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from '../security.js';

// Accesso a due fattori, gestito da ogni persona dalla pagina Account.
export default async function securityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const checkPassword = async (userId: number, password: string) => {
    const u = await one('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!(await bcrypt.compare(password, u.password_hash))) throw new HttpError(400, 'Password non corretta');
  };

  app.get('/me/security', async (req) => {
    const u = await one('SELECT email, email_verified_at, totp_secret, totp_enabled_at, last_login_at FROM users WHERE id = $1', [req.user.id]);
    const left = await one<{ n: number }>('SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL', [req.user.id]);
    return {
      email: u.email, emailVerified: Boolean(u.email_verified_at),
      twoFactor: Boolean(u.totp_secret), twoFactorSince: u.totp_enabled_at, recoveryCodesLeft: left?.n ?? 0,
    };
  });

  // Passo 1: nuova chiave segreta, da inquadrare con l'app (QR) o da scrivere a mano.
  app.post('/me/2fa/setup', async (req) => {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    await checkPassword(req.user.id, password);
    const u = await one('SELECT email, totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (u.totp_secret) throw new HttpError(400, 'I due fattori sono già attivi');
    const secret = newTotpSecret();
    await query('UPDATE users SET totp_pending = $2 WHERE id = $1', [req.user.id, encrypt(secret)]);
    return { secret, otpauthUrl: otpauthUrl(secret, u.email) };
  });

  // Passo 2: il primo codice dell'app conferma che è tutto a posto. Restituisce i codici di riserva (si vedono una volta sola).
  app.post('/me/2fa/enable', async (req) => {
    const { code } = z.object({ code: z.string().trim() }).parse(req.body);
    const u = await one('SELECT totp_pending, totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (u.totp_secret) throw new HttpError(400, 'I due fattori sono già attivi');
    if (!u.totp_pending) throw new HttpError(400, 'Ricomincia la configurazione');
    const step = verifyTotp(decrypt(u.totp_pending), code, null);
    if (step == null) throw new HttpError(400, "Codice non corretto: controlla che l'ora del telefono sia giusta e riprova");
    await query(
      'UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled_at = now(), totp_last_step = $2 WHERE id = $1',
      [req.user.id, step],
    );
    return { recoveryCodes: await newRecoveryCodes(req.user.id) };
  });

  app.post('/me/2fa/disable', async (req) => {
    const { password, code } = z.object({ password: z.string(), code: z.string().trim().min(6) }).parse(req.body);
    await checkPassword(req.user.id, password);
    if (!(await checkSecondFactor(req.user.id, code))) throw new HttpError(400, 'Codice non corretto');
    await query('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [req.user.id]);
    await query('DELETE FROM recovery_codes WHERE user_id = $1', [req.user.id]);
    return { disabled: true };
  });

  app.post('/me/2fa/recovery-codes', async (req) => {
    const { password } = z.object({ password: z.string() }).parse(req.body);
    await checkPassword(req.user.id, password);
    const u = await one('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (!u.totp_secret) throw new HttpError(400, 'Prima attiva i due fattori');
    return { recoveryCodes: await newRecoveryCodes(req.user.id) };
  });
}
