import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Challenge } from '../api';

const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

// Le date arrivano come "2026-10-12": le sommiamo a mano per non farci confondere dai fusi orari.
export function weekDays(startsOn: string) {
  const [y, m, d] = startsOn.split('-').map(Number);
  return DAYS.map((label, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return { label, day: dt.toISOString().slice(0, 10), num: dt.getUTCDate() };
  });
}

export function formatRange(c: Pick<Challenge, 'startsOn' | 'endsOn'>) {
  const f = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${f(c.startsOn)} – ${f(c.endsOn)}`;
}

export function ChallengeView({ c, onChange, full = false }: { c: Challenge; onChange: (c: Challenge) => void; full?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [earned, setEarned] = useState(false);
  const today = c.me.checkins.find((x) => x.day === c.today);

  const call = async (path: string, body?: unknown) => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ challenge: Challenge; earned?: boolean }>(path, { body: body ?? {} });
      if (res.earned) setEarned(true);
      onChange(res.challenge);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pct = Math.min(100, Math.round((c.me.keptDays / c.requiredDays) * 100));
  return (
    <section className={`challenge ${c.me.badge ? 'done' : ''}`}>
      <div className="challenge-head">
        <span className="challenge-emoji" aria-hidden="true">{c.emoji}</span>
        <div>
          <small>Sfida della settimana</small>
          <h2>{c.title}</h2>
          <span className="challenge-range">{formatRange(c)}</span>
        </div>
      </div>
      {full && <p className="challenge-desc">{c.description}</p>}
      {c.me.joined ? (
        <>
          <div className="week-dots">
            {weekDays(c.startsOn).map((d) => {
              const ci = c.me.checkins.find((x) => x.day === d.day);
              const state = ci ? (ci.kept ? 'kept' : 'missed') : d.day === c.today ? 'today' : d.day < c.today ? 'skipped' : 'future';
              return (
                <span key={d.day} className={`wd ${state}`} title={d.day}>
                  <i>{ci ? (ci.kept ? '✓' : '✗') : d.num}</i>
                  <small>{d.label}</small>
                </span>
              );
            })}
          </div>
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
          <p className="challenge-count">
            {c.me.badge
              ? <>🏅 <b>Sfida completata!</b> Il badge è sul tuo profilo.</>
              : <><b>{c.me.keptDays}</b> giorni su <b>{c.requiredDays}</b> per il badge</>}
          </p>
          <div className="challenge-rule">
            <small>Oggi: "{c.rule}"</small>
            <div className="row">
              <button className={`btn small ${today?.kept === true ? '' : 'ghost'}`} disabled={busy} onClick={() => call('/challenges/current/checkin', { kept: true })}>✓ Sì, rispettata</button>
              <button className={`btn small ${today?.kept === false ? 'danger' : 'ghost'}`} disabled={busy} onClick={() => call('/challenges/current/checkin', { kept: false })}>Oggi no</button>
            </div>
            {today && <small className="muted">Puoi cambiare la risposta fino a mezzanotte. Essere onesti è la sfida vera.</small>}
          </div>
        </>
      ) : (
        <div className="challenge-join">
          {!full && <p>{c.description}</p>}
          <button className="btn" disabled={busy} onClick={() => call('/challenges/current/join')}>Partecipo</button>
        </div>
      )}
      {earned && <p className="notice friendly">🎉 Ce l'hai fatta: {c.requiredDays} giorni su 7. Il badge "{c.title}" ora è sul tuo profilo.</p>}
      {error && <p className="error">{error}</p>}
      <div className="challenge-foot">
        <span>{c.participants} {c.participants === 1 ? 'partecipa' : 'partecipano'} · {c.completed} già con il badge</span>
        {!full && <Link to="/sfida">Dettagli</Link>}
      </div>
    </section>
  );
}

// Il riquadro in cima al feed.
export default function ChallengeCard() {
  const [c, setC] = useState<Challenge | null>(null);
  useEffect(() => { api('/challenges/current').then((d) => setC(d.challenge)).catch(() => {}); }, []);
  if (!c) return null;
  return <ChallengeView c={c} onChange={setC} />;
}
