import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Trade } from '../api';
import Icon from '../components/Icon';
import TradeCard, { EMOTION_LABELS, MARKET_LABELS, num, signed } from '../components/TradeCard';

type Stats = {
  closed: number; open: number; winRate: number | null; avgR: number | null; totalR: number; avgRisk: number | null;
  overRisk: number; followedPlanPct: number | null; movedStopPct: number | null; stopStreak: number;
};

// Sul telefono molti scrivono la virgola: 1,25 diventa 1.25.
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')));

const emptyClose = { exitPrice: '', lesson: '', emotion: '', followedPlan: null as boolean | null, movedStop: null as boolean | null };
type CloseForm = typeof emptyClose;

function YesNo({ label, value, onChange, good }: { label: string; value: boolean | null; onChange: (v: boolean) => void; good: boolean }) {
  return (
    <div className="yesno">
      <span>{label}</span>
      <div className="segmented small">
        <button type="button" className={value === true ? (good ? 'on good' : 'on bad') : ''} onClick={() => onChange(true)}>Sì</button>
        <button type="button" className={value === false ? (good ? 'on bad' : 'on good') : ''} onClick={() => onChange(false)}>No</button>
      </div>
    </div>
  );
}

function ClosingFields({ f, set }: { f: CloseForm; set: (f: CloseForm) => void }) {
  return (
    <>
      <label>Prezzo di uscita<input inputMode="decimal" value={f.exitPrice} onChange={(e) => set({ ...f, exitPrice: e.target.value })} required placeholder="Es. 101,40" /></label>
      <YesNo label="Hai rispettato il piano?" value={f.followedPlan} onChange={(v) => set({ ...f, followedPlan: v })} good />
      <YesNo label="Hai spostato lo stop loss?" value={f.movedStop} onChange={(v) => set({ ...f, movedStop: v })} good={false} />
      <label>Come ti sentivi?
        <select value={f.emotion} onChange={(e) => set({ ...f, emotion: e.target.value })}>
          <option value="">Non lo dico</option>
          {Object.entries(EMOTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>Cosa hai imparato<textarea value={f.lesson} onChange={(e) => set({ ...f, lesson: e.target.value })} maxLength={1000} placeholder="Anche una riga: è la parte più utile del diario." /></label>
    </>
  );
}

const closingBody = (f: CloseForm) => ({
  exitPrice: toNum(f.exitPrice), lesson: f.lesson, emotion: f.emotion || null, followedPlan: f.followedPlan, movedStop: f.movedStop,
});

function NewTrade({ onSaved, onCancel }: { onSaved: (warning: string | null) => void; onCancel: () => void }) {
  const [f, setF] = useState({ symbol: '', market: 'azioni', direction: 'long' as 'long' | 'short', entryPrice: '', stopLoss: '', takeProfit: '', riskPercent: '1', plan: '' });
  const [alreadyClosed, setAlreadyClosed] = useState(false);
  const [close, setClose] = useState(emptyClose);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const entry = toNum(f.entryPrice), stop = toNum(f.stopLoss), tp = toNum(f.takeProfit), risk = toNum(f.riskPercent);
  const riskPts = entry != null && stop != null ? Math.abs(entry - stop) : null;
  const rr = riskPts && tp != null && entry != null ? Math.abs(tp - entry) / riskPts : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body: any = { symbol: f.symbol, market: f.market, direction: f.direction, entryPrice: entry, stopLoss: stop, takeProfit: tp, riskPercent: risk, plan: f.plan };
      if (alreadyClosed) Object.assign(body, closingBody(close));
      const res = await api<{ trade: Trade; warning: string | null }>('/journal', { body });
      onSaved(res.warning);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3 className="card-title">Nuova operazione</h3>
      <div className="segmented">
        <button type="button" className={f.direction === 'long' ? 'on good' : ''} onClick={() => setF({ ...f, direction: 'long' })}>▲ Acquisto</button>
        <button type="button" className={f.direction === 'short' ? 'on bad' : ''} onClick={() => setF({ ...f, direction: 'short' })}>▼ Vendita</button>
      </div>
      <div className="grid-2">
        <label>Strumento<input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} required maxLength={30} placeholder="Es. ENI, EURUSD" /></label>
        <label>Mercato
          <select value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })}>
            {Object.entries(MARKET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Ingresso<input inputMode="decimal" value={f.entryPrice} onChange={(e) => setF({ ...f, entryPrice: e.target.value })} required placeholder="100" /></label>
        <label>Stop loss<input inputMode="decimal" value={f.stopLoss} onChange={(e) => setF({ ...f, stopLoss: e.target.value })} required placeholder={f.direction === 'long' ? 'sotto: 98' : 'sopra: 102'} /></label>
        <label>Obiettivo<input inputMode="decimal" value={f.takeProfit} onChange={(e) => setF({ ...f, takeProfit: e.target.value })} placeholder={f.direction === 'long' ? 'facoltativo, es. 104' : 'facoltativo, es. 96'} /></label>
        <label>Rischio sul capitale %<input inputMode="decimal" value={f.riskPercent} onChange={(e) => setF({ ...f, riskPercent: e.target.value })} required /></label>
      </div>
      {riskPts != null && riskPts > 0 && (
        <p className={`notice ${risk != null && risk > 2 ? '' : 'friendly'}`}>
          Rischi {num(riskPts)} punti{rr != null && <> per cercarne {num(riskPts * rr)}: rapporto <b>1:{num(rr, 2)}</b></>}.
          {risk != null && risk > 2 && ' Attenzione: più del 2% del capitale è tanto, la comunità consiglia tra 1% e 2%.'}
        </p>
      )}
      <label>Il piano: perché entri e quando esci<textarea value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} maxLength={1000} placeholder="Es. Rimbalzo sul supporto di 98, esco se chiude sotto." /></label>
      <label className="check"><input type="checkbox" checked={alreadyClosed} onChange={(e) => setAlreadyClosed(e.target.checked)} /> L'operazione è già chiusa</label>
      {alreadyClosed && <ClosingFields f={close} set={setClose} />}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="btn ghost" onClick={onCancel}>Annulla</button>
        <button className="btn" disabled={busy}>{busy ? 'Salvo…' : 'Salva nel diario'}</button>
      </div>
    </form>
  );
}

function TradeItem({ t, onChange }: { t: Trade; onChange: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'' | 'close' | 'share'>('');
  const [close, setClose] = useState(emptyClose);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const doClose = (e: FormEvent) => { e.preventDefault(); run(async () => { await api(`/journal/${t.id}/close`, { body: closingBody(close) }); setMode(''); onChange(); }); };
  const share = () => run(async () => {
    const res = await api<{ postId: number; inReview: boolean }>(`/journal/${t.id}/share`, { body: { text } });
    navigate(`/post/${res.postId}`);
  });
  const remove = () => {
    if (!confirm(`Eliminare ${t.symbol} dal diario? Se l'hai condivisa, la scheda sparisce anche dal post.`)) return;
    run(async () => { await api(`/journal/${t.id}`, { method: 'DELETE' }); onChange(); });
  };

  return (
    <div className="journal-item">
      <TradeCard trade={t} />
      <div className="journal-actions">
        <small className="muted">{new Date(t.closedAt ?? t.openedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</small>
        <span className="spacer" />
        {t.status === 'open' && <button className="btn small" onClick={() => setMode(mode === 'close' ? '' : 'close')}>Chiudi operazione</button>}
        {t.status === 'closed' && <button className="btn small ghost" onClick={() => setMode(mode === 'share' ? '' : 'share')}><Icon name="share" size={16} /> Condividi</button>}
        <button className="icon-btn" onClick={remove} aria-label="Elimina"><Icon name="trash" size={18} /></button>
      </div>
      {mode === 'close' && (
        <form className="card form inset" onSubmit={doClose}>
          <ClosingFields f={close} set={setClose} />
          <button className="btn" disabled={busy}>Chiudi e calcola il risultato</button>
        </form>
      )}
      {mode === 'share' && (
        <div className="card form inset">
          <p className="muted small">La scheda va nel feed con livelli, rischio e lezione. Non si vedono importi in euro, solo percentuali.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Due righe per raccontarla (facoltativo)" />
          <button className="btn" disabled={busy} onClick={share}>Pubblica nel feed</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Journal() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ trades: Trade[]; stats: Stats } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const adding = params.get('nuova') === '1';
  const setAdding = (on: boolean) => setParams(on ? { nuova: '1' } : {}, { replace: true });

  const load = () => api('/journal').then(setData);
  useEffect(() => { load(); }, []);

  if (!data) return <div className="page"><div className="spinner" /></div>;
  const { stats } = data;
  const open = data.trades.filter((t) => t.status === 'open');
  const closed = data.trades.filter((t) => t.status === 'closed');

  return (
    <div className="page">
      <header className="top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
        <h1 className="title">Il mio diario</h1>
        <button className={`btn ${adding ? 'ghost' : ''}`} onClick={() => setAdding(!adding)}>{adding ? 'Chiudi' : <><Icon name="plus" size={18} /> Nuova</>}</button>
      </header>
      <p className="muted">Lo vedi solo tu. Decidi tu se condividere una singola operazione nel feed.</p>

      {adding && <NewTrade onCancel={() => setAdding(false)} onSaved={(w) => { setWarning(w); setAdding(false); load(); }} />}
      {warning && <p className="notice" onClick={() => setWarning(null)}>{warning}</p>}

      <div className="tiles">
        <div className="tile teal"><span className="tile-label">Operazioni chiuse</span><b>{stats.closed}</b><small>{stats.open} ancora aperte</small></div>
        <div className="tile violet"><span className="tile-label">Vincenti</span><b>{stats.winRate == null ? '–' : `${stats.winRate}%`}</b><small>sulle chiuse</small></div>
        <div className={`tile ${stats.totalR >= 0 ? 'teal' : 'coral'}`}><span className="tile-label">Risultato totale</span><b>{signed(stats.totalR, ' R')}</b><small>media {signed(stats.avgR, ' R')} a operazione</small></div>
        <div className={`tile ${stats.avgRisk != null && stats.avgRisk > 2 ? 'coral' : 'gold'}`}><span className="tile-label">Rischio medio</span><b>{stats.avgRisk == null ? '–' : `${num(stats.avgRisk, 2)}%`}</b><small>{stats.overRisk ? `${stats.overRisk} sopra il 2%` : 'mai sopra il 2%'}</small></div>
      </div>
      {stats.closed > 0 && (
        <div className="card insights">
          <span>🛑 <b>{stats.stopStreak}</b> {stats.stopStreak === 1 ? 'operazione' : 'operazioni'} di fila senza spostare lo stop</span>
          {stats.followedPlanPct != null && <span>🗺️ Piano rispettato nel <b>{stats.followedPlanPct}%</b> dei casi</span>}
          {stats.movedStopPct != null && stats.movedStopPct > 0 && <span>⚠️ Stop spostato nel <b>{stats.movedStopPct}%</b> dei casi: è lì che si perde di più</span>}
        </div>
      )}
      <p className="muted small">"R" è quanto hai guadagnato o perso rispetto al rischio iniziale: +2 R vuol dire il doppio di quanto rischiavi, -1 R vuol dire che è scattato lo stop.</p>

      {open.length > 0 && <h2 className="section-title">Aperte</h2>}
      {open.map((t) => <TradeItem key={t.id} t={t} onChange={load} />)}
      {closed.length > 0 && <h2 className="section-title">Chiuse</h2>}
      {closed.map((t) => <TradeItem key={t.id} t={t} onChange={load} />)}
      {data.trades.length === 0 && !adding && (
        <div className="the-end">
          <div className="big-ico"><Icon name="edit" size={28} /></div>
          <strong>Il diario è vuoto</strong>
          <p>Segna la prossima operazione prima di entrare: ingresso, stop e rischio. È l'abitudine che separa chi impara da chi tira a indovinare.</p>
          <button className="btn" onClick={() => setAdding(true)}>Scrivi la prima operazione</button>
        </div>
      )}
    </div>
  );
}
