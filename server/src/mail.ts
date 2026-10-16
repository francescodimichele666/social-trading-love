import nodemailer from 'nodemailer';
import { HttpError } from './app.js';
import { decrypt, getSetting, type MailSettings } from './settings.js';

// Le email partono dalla casella del proprietario (Gmail, Libero, Aruba…), impostata dall'app.
// Nessun servizio esterno: il server si collega direttamente al server di posta della casella.

export type Mail = { to: string; subject: string; text: string };

// Nei test le email non partono: finiscono qui.
export const sentMails: Mail[] = [];

export async function mailConfigured() {
  const s = await getSetting<MailSettings>('mail');
  return Boolean(s?.host && s.user && s.password);
}

export async function sendMail(mail: Mail, override?: MailSettings) {
  if (process.env.MAIL_TEST === '1') {
    sentMails.push(mail);
    return;
  }
  const s = override ?? (await getSetting<MailSettings>('mail'));
  if (!s?.host || !s.user || !s.password) throw new HttpError(503, "L'invio delle email non è ancora configurato");
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: override ? s.password : decrypt(s.password) },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: { name: s.fromName || 'Love Trading Club', address: s.fromEmail || s.user },
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  } catch (err: any) {
    const why = err?.responseCode === 535 || /auth/i.test(String(err?.message))
      ? 'nome utente o password della casella non corretti (per Gmail serve una "password per le app")'
      : `il server di posta non risponde (${err?.code ?? err?.message ?? 'errore sconosciuto'})`;
    throw new HttpError(502, `Email non inviata: ${why}`);
  }
}
