import webpush from 'web-push';
import { one, query } from './db.js';
import { getSetting, setSetting, type LegalSettings } from './settings.js';

// Notifiche sul telefono (Web Push). Le chiavi si creano da sole al primo avvio e restano nel database.
// Il messaggio passa dal servizio di notifiche del telefono (Apple o Google): è l'unico modo per
// svegliare un telefono con l'app chiusa, e non richiede alcun account o registrazione.

type Keys = { publicKey: string; privateKey: string };
let keys: Keys | null = null;

export async function pushKeys(): Promise<Keys> {
  if (keys) return keys;
  keys = await getSetting<Keys>('vapid');
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await setSetting('vapid', keys);
  }
  return keys;
}

export async function sendPush(userId: number, message: string, link: string | null) {
  if (process.env.PUSH === 'false') return;
  const { rows } = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
  if (!rows.length) return;
  const k = await pushKeys();
  // Apple e Google vogliono un contatto reale: l'email per la privacy, altrimenti quella del proprietario.
  const legal = await getSetting<LegalSettings>('legal');
  const owner = await one<{ email: string }>('SELECT email FROM users WHERE is_owner');
  const subject = `mailto:${legal?.contactEmail || owner?.email || 'admin@example.com'}`;
  const payload = JSON.stringify({ title: 'Love Trading Club', body: message, link: link ?? '/notifiche' });
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey },
        TTL: 60 * 60 * 24,
      });
    } catch (err: any) {
      // Telefono disinstallato o permesso tolto: la sottoscrizione non vale più.
      if (err?.statusCode === 404 || err?.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
    }
  }));
}
