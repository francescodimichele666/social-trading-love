import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Avatar from './Avatar';
import Icon from './Icon';

type Brief = { id: number; username: string; displayName: string; avatarUrl: string | null };
type Person = Brief & { role: 'host' | 'speaker' | 'audience'; handRaised: boolean; joinedAt: string };
export type Panel = {
  stats: { listeners: number; peak: number; visitors: number; onStage: number; hands: number; seconds: number };
  people: Person[];
  kicked: (Brief & { at: string })[];
  blocked: (Brief & { at: string })[];
};

const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};

// Il pannello di chi conduce la Live: quante persone ci sono, chi sono, e i tasti per gestirle.
export default function LivePanel({ roomId, maxOnStage, onChange }: { roomId: number; maxOnStage: number; onChange: () => void }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'hands'>('all');

  const load = useCallback(() => api<Panel>(`/rooms/${roomId}/panel`).then(setPanel).catch((e) => setError(e.message)), [roomId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path: string, method = 'POST', body?: unknown) => {
    setError('');
    try {
      const res = await api<Panel | object>(path, { method, body });
      if ('stats' in res) setPanel(res as Panel); else await load();
      setOpen(null);
      onChange();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const kick = (p: Brief, block: boolean) => {
    const msg = block
      ? `Bloccare ${p.displayName}? Esce subito e non potrà entrare in nessuna delle tue Live, finché non lo sblocchi.`
      : `Far uscire ${p.displayName} da questa Live? Non potrà rientrare in questa diretta.`;
    if (confirm(msg)) act(`/rooms/${roomId}/kick/${p.id}`, 'POST', { block });
  };

  if (!panel) return error ? <p className="error">{error}</p> : null;
  const { stats } = panel;
  const people = filter === 'hands' ? panel.people.filter((p) => p.handRaised) : panel.people;
  const stageFull = stats.onStage >= maxOnStage;

  return (
    <section className="live-panel">
      <header>
        <h3><Icon name="panel" size={18} /> Pannello della Live</h3>
        <small className="muted">Lo vedi solo tu che conduci. Tocca una persona per gestirla.</small>
      </header>
      <div className="live-stats">
        <span className="big"><small>Collegati ora</small><b>{stats.listeners}</b></span>
        <span><small>Picco</small><b>{stats.peak}</b></span>
        <span><small>Entrati in tutto</small><b>{stats.visitors}</b></span>
        <span><small>Sul palco</small><b>{stats.onStage}/{maxOnStage}</b></span>
        <span><small>Mani alzate</small><b>{stats.hands}</b></span>
        <span><small>In diretta da</small><b>{clock(stats.seconds)}</b></span>
      </div>
      {error && <p className="error" onClick={() => setError('')}>{error}</p>}

      <div className="segmented">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}><Icon name="users" size={16} /> Tutti {panel.people.length}</button>
        <button className={filter === 'hands' ? 'on' : ''} onClick={() => setFilter('hands')}><Icon name="hand" size={16} /> Mani {stats.hands}</button>
      </div>

      <div className="live-people">
        {people.length === 0 && <p className="muted small">{filter === 'hands' ? 'Nessuna mano alzata per ora.' : 'Ancora nessuno collegato.'}</p>}
        {people.map((p) => (
          <div key={p.id} className="live-person">
            <button className="live-person-row" onClick={() => setOpen(open === p.id ? null : p.id)} disabled={p.role === 'host'}>
              <Avatar user={p} size={36} />
              <span>
                <strong>{p.displayName}</strong>
                <small>@{p.username}</small>
              </span>
              {p.role === 'host' && <span className="pill soft">Tu, conduci</span>}
              {p.role === 'speaker' && <span className="pill">Sul palco</span>}
              {p.handRaised && <span className="pill warn">✋ Mano alzata</span>}
            </button>
            {open === p.id && (
              <div className="live-person-actions">
                {p.role === 'audience' && (
                  <button className="btn small" disabled={stageFull} onClick={() => act(`/rooms/${roomId}/speakers/${p.id}`)}>
                    {stageFull ? 'Palco pieno' : 'Fai salire sul palco'}
                  </button>
                )}
                {p.role === 'speaker' && <button className="btn ghost small" onClick={() => act(`/rooms/${roomId}/speakers/${p.id}`, 'DELETE')}>Fai scendere</button>}
                <button className="btn ghost small" onClick={() => kick(p, false)}><Icon name="logout" size={16} /> Fai uscire</button>
                <button className="btn danger small" onClick={() => kick(p, true)}><Icon name="shield" size={16} /> Blocca</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {(panel.kicked.length > 0 || panel.blocked.length > 0) && (
        <div className="live-out">
          {panel.kicked.length > 0 && <h4>Fatti uscire da questa Live</h4>}
          {panel.kicked.map((p) => (
            <div key={p.id} className="person">
              <Avatar user={p} size={28} /> <span>{p.displayName}</span>
              <button className="link-btn" onClick={() => act(`/rooms/${roomId}/kick/${p.id}`, 'DELETE')}>Fai rientrare</button>
            </div>
          ))}
          {panel.blocked.length > 0 && <h4>Bloccati in tutte le tue Live</h4>}
          {panel.blocked.map((p) => (
            <div key={p.id} className="person">
              <Avatar user={p} size={28} /> <span>{p.displayName}</span>
              <button className="link-btn" onClick={() => act(`/rooms/${roomId}/kick/${p.id}`, 'DELETE')}>Sblocca</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
