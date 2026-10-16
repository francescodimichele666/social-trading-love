import type { Trade } from '../api';

export const MARKET_LABELS: Record<string, string> = {
  azioni: 'Azioni', etf: 'ETF', forex: 'Forex', materie_prime: 'Materie prime', indici: 'Indici', crypto: 'Crypto', altro: 'Altro',
};
export const EMOTION_LABELS: Record<string, string> = {
  calmo: '😌 Calmo', concentrato: '🎯 Concentrato', ansioso: '😰 Ansioso', euforico: '🤩 Euforico', impulsivo: '⚡ Impulsivo', frustrato: '😤 Frustrato',
};

export const num = (v: number | null | undefined, digits = 4) =>
  v == null ? '–' : v.toLocaleString('it-IT', { maximumFractionDigits: digits });
export const signed = (v: number | null | undefined, suffix = '') =>
  v == null ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 2 })}${suffix}`;

// I livelli dell'operazione su una riga: stop, ingresso, obiettivo e uscita, in proporzione.
function Levels({ t }: { t: Trade }) {
  const marks = [
    { k: 'stop', label: 'Stop', v: t.stopLoss },
    { k: 'entry', label: 'Ingresso', v: t.entryPrice },
    ...(t.takeProfit != null ? [{ k: 'tp', label: 'Obiettivo', v: t.takeProfit }] : []),
    ...(t.exitPrice != null ? [{ k: 'exit', label: 'Uscita', v: t.exitPrice }] : []),
  ];
  const vals = marks.map((m) => m.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  // Per uno short il "su" è verso lo stop: giriamo la riga così il guadagno è sempre a destra.
  const pos = (v: number) => {
    const p = ((v - lo) / span) * 100;
    return 6 + (t.direction === 'long' ? p : 100 - p) * 0.88;
  };
  return (
    <div className={`levels ${t.exitPrice != null ? 'has-exit' : ''}`} aria-hidden="true">
      <div className="levels-track">
        <span className="levels-risk" style={{ left: `${Math.min(pos(t.stopLoss), pos(t.entryPrice))}%`, width: `${Math.abs(pos(t.entryPrice) - pos(t.stopLoss))}%` }} />
        {t.takeProfit != null && <span className="levels-reward" style={{ left: `${Math.min(pos(t.entryPrice), pos(t.takeProfit))}%`, width: `${Math.abs(pos(t.takeProfit) - pos(t.entryPrice))}%` }} />}
        {marks.map((m) => <i key={m.k} className={`lv ${m.k}`} style={{ left: `${pos(m.v)}%` }} />)}
      </div>
      <div className="levels-labels">
        {marks.map((m) => (
          <span key={m.k} className={`lv-label ${m.k}`} style={{ left: `${pos(m.v)}%` }}>{m.label}<b>{num(m.v)}</b></span>
        ))}
      </div>
    </div>
  );
}

export default function TradeCard({ trade: t, compact = false }: { trade: Trade; compact?: boolean }) {
  const closed = t.status === 'closed';
  const tone = !closed || t.resultR == null ? 'open' : t.resultR > 0 ? 'win' : t.resultR < 0 ? 'loss' : 'flat';
  return (
    <div className={`trade-card ${tone}`}>
      <div className="trade-top">
        <div className="trade-symbol">
          <strong>{t.symbol}</strong>
          <span className={`dir ${t.direction}`}>{t.direction === 'long' ? '▲ Acquisto' : '▼ Vendita'}</span>
          <small>{MARKET_LABELS[t.market] ?? t.market}</small>
        </div>
        <div className="trade-result">
          {closed
            ? <><b>{signed(t.resultR, ' R')}</b><small>{signed(t.resultPercent, '% del capitale')}</small></>
            : <><b className="open-label">Aperta</b><small>in corso</small></>}
        </div>
      </div>
      <Levels t={t} />
      <div className="trade-facts">
        <span className={t.riskPercent > 2 ? 'bad' : 'good'}>Rischio {num(t.riskPercent, 2)}%</span>
        {t.rewardRisk != null && <span>Rapporto 1:{num(t.rewardRisk, 2)}</span>}
        {t.followedPlan != null && <span className={t.followedPlan ? 'good' : 'bad'}>{t.followedPlan ? '✓ Piano rispettato' : '✗ Piano non rispettato'}</span>}
        {t.movedStop != null && <span className={t.movedStop ? 'bad' : 'good'}>{t.movedStop ? '✗ Stop spostato' : '✓ Stop non toccato'}</span>}
        {t.emotion && <span>{EMOTION_LABELS[t.emotion] ?? t.emotion}</span>}
      </div>
      {!compact && t.plan && <p className="trade-text"><small>Il piano</small>{t.plan}</p>}
      {!compact && t.lesson && <p className="trade-text lesson"><small>Cosa ho imparato</small>{t.lesson}</p>}
    </div>
  );
}
