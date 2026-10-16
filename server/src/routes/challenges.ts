import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError } from '../app.js';
import { notify } from '../notify.js';

// Sfida della settimana: da lunedì a domenica (ora italiana). Ogni giorno chi partecipa dice se ha
// rispettato la regola; chi ci riesce per abbastanza giorni riceve il badge sul profilo.
// Se nessuno ha scelto la sfida, ne parte una da sola dalla lista qui sotto, a rotazione.

export const PRESETS = [
  { key: 'stop', emoji: '🛑', title: 'Lo stop non si tocca', description: 'Per tutta la settimana lo stop loss si decide prima di entrare e non si sposta mai, nemmeno quando fa male.', rule: 'Oggi non ho spostato nessuno stop loss (o non ho fatto operazioni).' },
  { key: 'rischio1', emoji: '🎯', title: 'Massimo 1%', description: "Ogni operazione rischia al massimo l'1% del capitale. Calcola la size prima di entrare.", rule: "Oggi nessuna operazione ha rischiato più dell'1% del capitale." },
  { key: 'diario', emoji: '📓', title: 'Diario ogni giorno', description: 'Scrivi nel diario ogni giorno: un\'operazione, un\'osservazione o un errore. Anche due righe bastano.', rule: 'Oggi ho scritto nel mio diario di trading.' },
  { key: 'vendetta', emoji: '🧘', title: 'Niente vendetta', description: 'Dopo una perdita si chiude per la giornata. Niente operazioni per "rifarsi".', rule: 'Oggi, dopo una perdita, non ho fatto operazioni per rifarmi.' },
  { key: 'piano', emoji: '🗺️', title: 'Prima il piano', description: 'Prima di ogni operazione scrivi ingresso, stop loss e obiettivo. Se non c\'è il piano, non si entra.', rule: 'Oggi ogni operazione aveva il piano scritto prima di entrare.' },
  { key: 'studio', emoji: '📚', title: '15 minuti di studio', description: 'Ogni giorno 15 minuti per imparare: un capitolo di un libro, una lezione, l\'analisi di un tuo errore.', rule: 'Oggi ho studiato almeno 15 minuti.' },
] as const;

const TODAY = `(now() AT TIME ZONE 'Europe/Rome')::date`;
const THIS_MONDAY = `date_trunc('week', now() AT TIME ZONE 'Europe/Rome')::date`;

// La sfida della settimana (corrente o prossima); se manca, la crea dalla rotazione.
async function weekChallenge(which: 'current' | 'next') {
  const monday = which === 'current' ? THIS_MONDAY : `(${THIS_MONDAY} + 7)`;
  let c = await one(`SELECT * FROM challenges WHERE starts_on = ${monday}`);
  if (!c) {
    const { week } = (await one<{ week: number }>(`SELECT (extract(epoch FROM ${monday}::timestamp) / 604800)::int AS week`))!;
    const p = PRESETS[week % PRESETS.length];
    c = await one(
      `INSERT INTO challenges (preset_key, title, description, rule, emoji, starts_on, ends_on)
       VALUES ($1, $2, $3, $4, $5, ${monday}, ${monday} + 6) ON CONFLICT (starts_on) DO NOTHING RETURNING *`,
      [p.key, p.title, p.description, p.rule, p.emoji],
    ) ?? await one(`SELECT * FROM challenges WHERE starts_on = ${monday}`);
  }
  return c!;
}

async function describe(c: any, userId: number) {
  const joined = await one('SELECT joined_at FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2', [c.id, userId]);
  const { rows: checkins } = await query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, kept FROM challenge_checkins WHERE challenge_id = $1 AND user_id = $2 ORDER BY day`, [c.id, userId]);
  const counts = await one(
    `SELECT (SELECT count(*)::int FROM challenge_participants WHERE challenge_id = $1) AS participants,
            (SELECT count(*)::int FROM user_badges WHERE challenge_id = $1) AS completed,
            to_char(${TODAY}, 'YYYY-MM-DD') AS today`, [c.id]);
  const badge = await one('SELECT id FROM user_badges WHERE challenge_id = $1 AND user_id = $2', [c.id, userId]);
  return {
    id: c.id, presetKey: c.preset_key, title: c.title, description: c.description, rule: c.rule, emoji: c.emoji,
    requiredDays: c.required_days, startsOn: toDay(c.starts_on), endsOn: toDay(c.ends_on), today: counts.today,
    participants: counts.participants, completed: counts.completed,
    me: { joined: Boolean(joined), checkins, keptDays: checkins.filter((x) => x.kept).length, badge: Boolean(badge) },
  };
}

const toDay = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

export default async function challengeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/challenges/current', async (req) => ({ challenge: await describe(await weekChallenge('current'), req.user.id) }));

  app.post('/challenges/current/join', async (req) => {
    const c = await weekChallenge('current');
    await query('INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [c.id, req.user.id]);
    return { challenge: await describe(c, req.user.id) };
  });

  // Il "check-in" di oggi: ho rispettato la regola sì o no. Si può correggere fino a fine giornata.
  app.post('/challenges/current/checkin', async (req) => {
    const { kept } = z.object({ kept: z.boolean() }).parse(req.body);
    const c = await weekChallenge('current');
    const joined = await one('SELECT 1 FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2', [c.id, req.user.id]);
    if (!joined) throw new HttpError(400, 'Prima partecipa alla sfida');
    let earned = false;
    await tx(async (cl) => {
      await cl.query(
        `INSERT INTO challenge_checkins (challenge_id, user_id, day, kept) VALUES ($1, $2, ${TODAY}, $3)
         ON CONFLICT (challenge_id, user_id, day) DO UPDATE SET kept = EXCLUDED.kept, created_at = now()`,
        [c.id, req.user.id, kept],
      );
      const { rows: [{ n }] } = await cl.query('SELECT count(*)::int AS n FROM challenge_checkins WHERE challenge_id = $1 AND user_id = $2 AND kept', [c.id, req.user.id]);
      if (n >= c.required_days) {
        const res = await cl.query(
          `INSERT INTO user_badges (user_id, kind, title, emoji, challenge_id) VALUES ($1, 'challenge', $2, $3, $4) ON CONFLICT DO NOTHING`,
          [req.user.id, c.title, c.emoji, c.id],
        );
        if (res.rowCount) {
          earned = true;
          await notify(req.user.id, 'badge', `Sfida completata: "${c.title}" ${c.emoji}. Il badge è sul tuo profilo!`, `/u/${req.user.username}`, cl);
        }
      }
    });
    return { challenge: await describe(c, req.user.id), earned };
  });

  // Amministratori: scelgono la sfida (questa settimana se nessuno partecipa ancora, oppure la prossima).
  app.get('/challenges/plan', { preHandler: app.requireAdmin }, async (req) => ({
    presets: PRESETS,
    current: await describe(await weekChallenge('current'), req.user.id),
    next: await describe(await weekChallenge('next'), req.user.id),
  }));

  app.put<{ Params: { week: string } }>('/challenges/:week', { preHandler: app.requireAdmin }, async (req) => {
    const week = z.enum(['current', 'next']).parse(req.params.week);
    const body = z.union([
      z.object({ presetKey: z.enum(PRESETS.map((p) => p.key) as [string, ...string[]]) }),
      z.object({
        title: z.string().trim().min(3).max(60), description: z.string().trim().min(10).max(300), rule: z.string().trim().min(5).max(160),
        emoji: z.string().trim().min(1).max(8), requiredDays: z.number().int().min(1).max(7).default(5),
      }),
    ]).parse(req.body);
    const c = await weekChallenge(week);
    const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM challenge_participants WHERE challenge_id = $1', [c.id]);
    if (n!.n > 0) throw new HttpError(400, `La sfida è già iniziata con ${n!.n} ${n!.n === 1 ? 'partecipante' : 'partecipanti'}: puoi cambiare quella della prossima settimana`);
    const v = 'presetKey' in body
      ? { ...PRESETS.find((p) => p.key === body.presetKey)!, requiredDays: 5 }
      : { key: null, ...body };
    await query(
      'UPDATE challenges SET preset_key = $2, title = $3, description = $4, rule = $5, emoji = $6, required_days = $7, created_by = $8 WHERE id = $1',
      [c.id, v.key, v.title, v.description, v.rule, v.emoji, v.requiredDays, req.user.id],
    );
    return { challenge: await describe(await weekChallenge(week), req.user.id) };
  });
}
