import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type User } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import MentorBadge from '../components/MentorBadge';

type Tipo = 'amici' | 'seguiti' | 'follower';
type Person = User & { isFollowing: boolean; followsMe: boolean; isMe: boolean };
type Res = { tipo: Tipo; counts: Record<Tipo, number>; users: Person[] };

const TABS: { id: Tipo; label: string }[] = [
  { id: 'amici', label: 'Amici' },
  { id: 'seguiti', label: 'Seguiti' },
  { id: 'follower', label: 'Follower' },
];

const EMPTY: Record<Tipo, string> = {
  amici: 'Gli amici sono le persone che segui e che ti seguono a loro volta.',
  seguiti: 'Ancora nessuna persona seguita.',
  follower: 'Ancora nessun follower.',
};

// Amici (vi seguite a vicenda), persone seguite e follower di un profilo.
export default function Friends() {
  const { username = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tipo = (TABS.some((t) => t.id === params.get('tipo')) ? params.get('tipo') : 'amici') as Tipo;
  const [res, setRes] = useState<Res | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => api<Res>(`/users/${username}/connections?tipo=${tipo}`).then(setRes).catch((e) => setError(e.message));
  useEffect(() => { setRes(null); load(); }, [username, tipo]);

  const toggle = async (p: Person) => {
    await api(`/users/${p.username}/follow`, { method: p.isFollowing ? 'DELETE' : 'POST' });
    load();
  };

  const term = q.trim().toLowerCase();
  const list = (res?.users ?? []).filter((u) => !term || u.username.includes(term) || u.displayName.toLowerCase().includes(term));
  return (
    <div className="page">
      <header className="top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
        <h1 className="title">@{username}</h1>
        <span />
      </header>
      <div className="segmented three" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tipo === t.id} className={tipo === t.id ? 'on' : ''} onClick={() => setParams({ tipo: t.id }, { replace: true })}>
            {t.label}{res && <span className="muted"> {res.counts[t.id]}</span>}
          </button>
        ))}
      </div>
      {(res?.users.length ?? 0) > 6 && (
        <label className="search-box">
          <Icon name="search" size={20} />
          <input type="search" placeholder="Cerca per nome" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {!res && !error && <div className="spinner" />}
      {res && list.length === 0 && <p className="muted center">{term ? 'Nessuno con questo nome.' : EMPTY[tipo]}</p>}
      <div className="friends-list">
        {list.map((u) => (
          <div key={u.id} className="list-row">
            <Link to={`/u/${u.username}`} className="friend-main">
              <Avatar user={u} size={44} />
              <span>
                <strong>{u.displayName}{u.isMentor && <MentorBadge />}</strong>
                <small>@{u.username}{u.isFollowing && u.followsMe ? ' · amici' : u.followsMe ? ' · ti segue' : ''}</small>
              </span>
            </Link>
            {!u.isMe && (
              <>
                <Link className="icon-btn small" to={`/messaggi/${u.username}`} aria-label={`Scrivi a ${u.displayName}`}><Icon name="send" size={18} /></Link>
                <button className={`btn small ${u.isFollowing ? 'ghost' : ''}`} onClick={() => toggle(u)}>
                  {u.isFollowing ? 'Segui già' : u.followsMe ? 'Ricambia' : 'Segui'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
