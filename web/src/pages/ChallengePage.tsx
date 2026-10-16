import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Challenge } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { ChallengeView, formatRange } from '../components/ChallengeCard';

type Preset = { key: string; emoji: string; title: string; description: string; rule: string };
type Plan = { presets: Preset[]; current: Challenge; next: Challenge };

// Amministratori: scelgono la sfida di questa settimana (finché nessuno partecipa) o della prossima.
function Planner() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [week, setWeek] = useState<'current' | 'next'>('next');
  const [custom, setCustom] = useState(false);
  const [f, setF] = useState({ emoji: '💪', title: '', description: '', rule: '', requiredDays: 5 });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api<Plan>('/challenges/plan').then(setPlan);
  useEffect(() => { load(); }, []);
  if (!plan) return null;
  const c = plan[week];

  const save = async (body: unknown) => {
    setError('');
    setMsg('');
    try {
      await api(`/challenges/${week}`, { method: 'PUT', body });
      setMsg(week === 'current' ? 'Sfida di questa settimana cambiata.' : 'Sfida della prossima settimana scelta.');
      setCustom(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const submitCustom = (e: FormEvent) => { e.preventDefault(); save(f); };

  return (
    <section className="card form planner">
      <h3 className="card-title"><Icon name="calendar" size={18} /> Scegli la sfida (amministratori)</h3>
      <div className="segmented">
        <button type="button" className={week === 'current' ? 'on' : ''} onClick={() => setWeek('current')}>Questa settimana</button>
        <button type="button" className={week === 'next' ? 'on' : ''} onClick={() => setWeek('next')}>Prossima</button>
      </div>
      <p className="muted small">{formatRange(c)}: ora c'è <b>{c.emoji} {c.title}</b>{c.participants > 0 && ` con ${c.participants} partecipanti (non si può più cambiare)`}.</p>
      {c.participants === 0 && (
        <>
          <div className="preset-grid">
            {plan.presets.map((p) => (
              <button key={p.key} type="button" className={`preset ${c.presetKey === p.key ? 'on' : ''}`} onClick={() => save({ presetKey: p.key })}>
                <span>{p.emoji}</span><b>{p.title}</b>
              </button>
            ))}
            <button type="button" className={`preset ${custom ? 'on' : ''}`} onClick={() => setCustom(!custom)}><span>✏️</span><b>Scrivila tu</b></button>
          </div>
          {custom && (
            <form className="form" onSubmit={submitCustom}>
              <div className="grid-2 emoji-row">
                <label>Emoji<input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} maxLength={8} required /></label>
                <label>Titolo<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} minLength={3} maxLength={60} required /></label>
              </div>
              <label>Spiegazione<textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} minLength={10} maxLength={300} required /></label>
              <label>La domanda di ogni giorno<input value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value })} minLength={5} maxLength={160} required placeholder="Oggi ho…" /></label>
              <label>Giorni per il badge<input type="number" min={1} max={7} value={f.requiredDays} onChange={(e) => setF({ ...f, requiredDays: Number(e.target.value) })} /></label>
              <button className="btn">Usa questa sfida</button>
            </form>
          )}
        </>
      )}
      {msg && <p className="notice friendly">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default function ChallengePage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [c, setC] = useState<Challenge | null>(null);
  useEffect(() => { api('/challenges/current').then((d) => setC(d.challenge)); }, []);

  return (
    <div className="page">
      <header className="top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
        <h1 className="title">Sfida della settimana</h1>
        <span />
      </header>
      {!c ? <div className="spinner" /> : <ChallengeView c={c} onChange={setC} full />}
      <div className="card how">
        <strong>Come funziona</strong>
        <p>Ogni lunedì parte una sfida nuova su un'abitudine da trader responsabile. Ogni sera rispondi onestamente: oggi l'ho rispettata? Se ci riesci almeno {c?.requiredDays ?? 5} giorni su 7, il badge resta per sempre sul tuo profilo.</p>
        <p className="muted small">Non si vince denaro e non conta quanto guadagni: conta la disciplina.</p>
      </div>
      {me?.role === 'admin' && <Planner />}
    </div>
  );
}
