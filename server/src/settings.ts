import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { one, query } from './db.js';
import { config } from './config.js';

// Impostazioni salvate nel database e modificabili dal proprietario dall'app.

export type MailSettings = {
  host: string; port: number; secure: boolean; user: string; fromName: string; fromEmail: string;
  password?: string; // salvata cifrata, mai rimandata all'app
};
export type LegalSettings = { controllerName: string; contactEmail: string; city: string };

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await one<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

// La password della casella email è cifrata con una chiave ricavata da JWT_SECRET.
const key = () => createHash('sha256').update(`stl-settings:${config.jwtSecret}`).digest();

export function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
