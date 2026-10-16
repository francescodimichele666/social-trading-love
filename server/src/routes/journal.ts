import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { hasRedFlags } from '../rules.js';

// Diario di trading: ogni operazione con ingresso, stop, rischio e risultato, per imparare dai propri numeri.

export const MARKETS = ['azioni', 'etf', 'forex', 'materie_prime', 'indici', 'crypto', 'altro'] as const;
export const EMOTIONS = ['calmo', 'concentrato', 'ansioso', 'euforico', 'impulsivo', 'frustrato'] as const;

const price = z.number().positive().max(1e9);

// Risultato in "R": quante volte il rischio iniziale si è guadagnato (positivo) o perso (negativo).
export function resultR(t: { direction: string; entry: number; stop: number; exit: number | null }) {
  if (t.exit == null) return null;
  const risk = Math.abs(t.entry - t.stop);
  if (!risk) return null;
  const r = t.direction === 'long' ? (t.exit - t.entry) / risk : (t.entry - t.exit) / risk;
  return Math.round(r * 100) / 100;
}

export function serializeTrade(t: any) {
  if (!t) return null;
  const n = (v: any) => (v == null ? null : Number(v));
  const entry = n(t.entry_price)!, stop = n(t.stop_loss)!, exit = n(t.exit_price), tp = n(t.take_profit), risk = n(t.risk_percent)!;
  const r = resultR({ direction: t.direction, entry, stop, exit });
  return {
    id: Number(t.id), symbol: t.symbol, market: t.market, direction: t.direction,
    entryPrice: entry, stopLoss: stop, takeProfit: tp, exitPrice: exit, riskPercent: risk,
    rewardRisk: tp != null ? Math.round((Math.abs(tp - entry) / Math.abs(entry - stop)) * 100) / 100 : null,
    resultR: r, resultPercent: r == null ? null : Math.round(r * risk * 100) / 100,
    plan: t.plan, lesson: t.lesson, emotion: t.emotion, followedPlan: t.followed_plan, movedStop: t.moved_stop,
    status: t.status, openedAt: t.opened_at, closedAt: t.closed_at,
    ...(t.post_id !== undefined ? { postId: t.post_id == null ? null : Number(t.post_id) } : {}),
  };
}

function checkLevels(direction: 'long' | 'short', entry: number, stop: number, tp?: number | null) {
  if (direction === 'long' && stop >= entry) throw new HttpError(400, 'In un acquisto (long) lo stop loss va sotto il prezzo di ingresso');
  if (direction === 'short' && stop <= entry) throw new HttpError(400, 'In una vendita (short) lo stop loss va sopra il prezzo di ingresso');
  if (tp != null && direction === 'long' && tp <= entry) throw new HttpError(400, "In un acquisto (long) l'obiettivo va sopra il prezzo di ingresso");
  if (tp != null && direction === 'short' && tp >= entry) throw new HttpError(400, "In una vendita (short) l'obiettivo va sotto il prezzo di ingresso");
}

const closing = {
  exitPrice: price,
  lesson: z.string().trim().max(1000).default(''),
  emotion: z.enum(EMOTIONS).nullable().default(null),
  followedPlan: z.boolean().nullable().default(null),
  movedStop: z.boolean().nullable().default(null),
};

export async function journalStats(userId: number) {
  const { rows } = await query("SELECT * FROM trades WHERE user_id = $1 AND status = 'closed'", [userId]);
  const trades = rows.map(serializeTrade);
  const rs = trades.map((t) => t!.resultR).filter((r): r is number => r != null);
  const pct = (k: 'followedPlan' | 'movedStop') => {
    const known = trades.filter((t) => t![k] != null);
    return known.length ? Math.round((known.filter((t) => t![k]).length / known.length) * 100) : null;
  };
  // Operazioni chiuse di fila (dalla più recente) senza spostare lo stop.
  const sorted = [...trades].sort((a, b) => +new Date(b!.closedAt) - +new Date(a!.closedAt));
  let stopStreak = 0;
  for (const t of sorted) { if (t!.movedStop) break; stopStreak++; }
  const open = await one<{ n: number }>("SELECT count(*)::int AS n FROM trades WHERE user_id = $1 AND status = 'open'", [userId]);
  return {
    closed: trades.length,
    open: open?.n ?? 0,
    winRate: rs.length ? Math.round((rs.filter((r) => r > 0).length / rs.length) * 100) : null,
    avgR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 100) / 100 : null,
    totalR: Math.round(rs.reduce((a, b) => a + b, 0) * 100) / 100,
    avgRisk: trades.length ? Math.round((trades.reduce((a, t) => a + t!.riskPercent, 0) / trades.length) * 100) / 100 : null,
    overRisk: trades.filter((t) => t!.riskPercent > 2).length,
    followedPlanPct: pct('followedPlan'),
    movedStopPct: pct('movedStop'),
    stopStreak,
  };
}

export default async function journalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/journal', async (req) => {
    const { rows } = await query(
      `SELECT t.*, (SELECT p.id FROM posts p WHERE p.trade_id = t.id AND p.removed_at IS NULL ORDER BY p.id LIMIT 1) AS post_id
       FROM trades t WHERE t.user_id = $1 ORDER BY (t.status = 'open') DESC, COALESCE(t.closed_at, t.opened_at) DESC LIMIT 200`, [req.user.id]);
    return { trades: rows.map(serializeTrade), stats: await journalStats(req.user.id), markets: MARKETS, emotions: EMOTIONS };
  });

  app.post('/journal', async (req, reply) => {
    const d = z.object({
      symbol: z.string().trim().min(1).max(30),
      market: z.enum(MARKETS),
      direction: z.enum(['long', 'short']),
      entryPrice: price,
      stopLoss: price,
      takeProfit: price.nullable().optional(),
      riskPercent: z.number().gt(0).max(100),
      plan: z.string().trim().max(1000).default(''),
      openedAt: z.string().datetime({ offset: true }).optional(),
      exitPrice: price.optional(),
      lesson: closing.lesson, emotion: closing.emotion, followedPlan: closing.followedPlan, movedStop: closing.movedStop,
    }).parse(req.body);
    checkLevels(d.direction, d.entryPrice, d.stopLoss, d.takeProfit);
    if (hasRedFlags(`${d.plan} ${d.lesson}`)) throw new HttpError(400, 'Il testo contiene frasi non ammesse dalle regole della comunità');
    const closed = d.exitPrice != null;
    const t = await one(
      `INSERT INTO trades (user_id, symbol, market, direction, entry_price, stop_loss, take_profit, exit_price, risk_percent, plan, lesson, emotion,
                           followed_plan, moved_stop, status, opened_at, closed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16::timestamptz, now()), $17) RETURNING *`,
      [req.user.id, d.symbol.toUpperCase(), d.market, d.direction, d.entryPrice, d.stopLoss, d.takeProfit ?? null, d.exitPrice ?? null, d.riskPercent,
        d.plan, d.lesson, d.emotion, d.followedPlan, d.movedStop, closed ? 'closed' : 'open', d.openedAt ?? null, closed ? new Date() : null],
    );
    // Ogni operazione salvata va subito nel feed per tutti (decisione di Francesco, 16 ottobre).
    // La scheda nel post legge l'operazione dal vivo: quando la chiudi, il post mostra il risultato.
    const post = await one('INSERT INTO posts (author_id, body, trade_id) VALUES ($1, \'\', $2) RETURNING id', [req.user.id, t.id]);
    reply.status(201);
    return { trade: serializeTrade({ ...t, post_id: post.id }), postId: post.id, warning: d.riskPercent > 2 ? 'Stai rischiando più del 2% del capitale: la regola della comunità consiglia di restare tra l\'1% e il 2%.' : null };
  });

  // Chiude un'operazione aperta (o corregge quella chiusa) con prezzo di uscita e lezione imparata.
  app.post<{ Params: { id: string } }>('/journal/:id/close', async (req) => {
    const d = z.object(closing).parse(req.body);
    if (hasRedFlags(d.lesson)) throw new HttpError(400, 'Il testo contiene frasi non ammesse dalle regole della comunità');
    const t = await one(
      `UPDATE trades SET exit_price = $3, lesson = $4, emotion = $5, followed_plan = $6, moved_stop = $7, status = 'closed', closed_at = COALESCE(closed_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [Number(req.params.id), req.user.id, d.exitPrice, d.lesson, d.emotion, d.followedPlan, d.movedStop],
    );
    if (!t) throw new HttpError(404, 'Operazione non trovata');
    return { trade: serializeTrade(t) };
  });

  app.delete<{ Params: { id: string } }>('/journal/:id', async (req) => {
    // Con l'operazione sparisce anche il post che la mostrava.
    await query('DELETE FROM posts WHERE trade_id = $1 AND author_id = $2', [Number(req.params.id), req.user.id]);
    const res = await query('DELETE FROM trades WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
    if (!res.rowCount) throw new HttpError(404, 'Operazione non trovata');
    return { deleted: true };
  });

  // Condivide l'operazione come post: gli altri vedono la scheda con livelli, rischio e lezione.
  app.post<{ Params: { id: string } }>('/journal/:id/share', async (req, reply) => {
    const { text } = z.object({ text: z.string().trim().max(2000).default('') }).parse(req.body ?? {});
    const t = await one('SELECT id FROM trades WHERE id = $1 AND user_id = $2', [Number(req.params.id), req.user.id]);
    if (!t) throw new HttpError(404, 'Operazione non trovata');
    const flagged = hasRedFlags(text);
    // Se il post c'è già (pubblicato in automatico), aggiungiamo solo il testo.
    const existing = await one('SELECT id, body FROM posts WHERE trade_id = $1 AND author_id = $2 AND removed_at IS NULL ORDER BY id LIMIT 1', [t.id, req.user.id]);
    if (existing) {
      if (text) await query('UPDATE posts SET body = $2, flagged = flagged OR $3 WHERE id = $1', [existing.id, text, flagged]);
      if (text && flagged) {
        await query(`INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (NULL, 'post', $1, 'frasi_a_rischio', 'Segnalato in automatico: contiene frasi tipiche di promesse di guadagno o truffe')`, [existing.id]);
      }
      return { postId: existing.id, inReview: flagged };
    }
    const post = await one('INSERT INTO posts (author_id, body, trade_id, flagged) VALUES ($1, $2, $3, $4) RETURNING id', [req.user.id, text, t.id, flagged]);
    if (flagged) {
      await query(`INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES (NULL, 'post', $1, 'frasi_a_rischio', 'Segnalato in automatico: contiene frasi tipiche di promesse di guadagno o truffe')`, [post.id]);
    }
    reply.status(201);
    return { postId: post.id, inReview: flagged };
  });
}
