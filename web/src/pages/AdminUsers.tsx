import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

type AdminUser = {
  id: number; username: string; displayName: string; email: string; avatarUrl: string | null;
  role: 'member' | 'moderator' | 'admin'; isOwner: boolean; createdAt: string; lastLoginAt: string | null;
  emailVerified: boolean; twoFactor: boolean; suspended: boolean; suspendedAt: string | null; suspendReason: string | null;
  posts: number; invitedBy: string | null; mentor: boolean;
};
type Detail = {
  user: AdminUser & { birthDate: string; comments: number; followers: number; invited: number; trades: number; rooms: number; reports: number };
  history: { action: string; statement: string; createdAt: string; by: string | null }[];
  canManage: boolean;
};
type Counts = Record<'all' | 'staff' | 'suspended' | 'unverified' | 'twofactor' | 'new' | 'mentor', number>;

const FILTERS: { key: keyof Counts; label: string }[] = [
  { key: 'all', label: 'Tutti' }, { key: 'new', label: 'Nuovi 7 giorni' }, { key: 'staff', label: 'Staff' }, { key: 'mentor', label: 'Mentori' },
  { key: 'suspended', label: 'Sospesi' }, { key: 'unverified', label: 'Email da confermare' }, { key: 'twofactor', label: 'Con due passaggi' },
];
const ROLE_LABEL = { member: 'Membro', moderator: 'Moderatore', admin: 'Amministratore' } as const;
const ACTION_LABEL: Record<string, string> = {
  ban: 'Sospeso', reinstate: 'Riattivato', remove: 'Contenuto rimosso', dismiss: 'Segnalazione archiviata',
  reset_2fa: 'Due passaggi disattivati', logout: 'Accessi chiusi', verify_email: 'Email confermata a mano', mentor: 'Badge Mentore assegnato', unmentor: 'Badge Mentore tolto',
};

const date = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

function Badges({ u }: { u: AdminUser }) {
  return (
    <span className="user-badges">
      {u.isOwner ? <span className="pill">Proprietario</span> : u.role !== 'member' && <span className="pill">{ROLE_LABEL[u.role]}</span>}
      {u.suspended && <span className="pill danger">Sospeso</span>}
      {!u.emailVerified && <span className="pill warn">Email da confermare</span>}
      {u.mentor && <span className="pill">🎓 Mentore</span>}
      {u.twoFactor && <span className="pill soft">🔐 2 passaggi</span>}
    </span>
  );
}

// Scheda di una persona, con tutte le azioni che un amministratore può fare.
function UserSheet({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { me } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [ask, setAsk] = useState<'' | 'suspend' | 'reinstate' | 'reset_2fa'>('');
  const [statement, setStatement] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api<Detail>(`/admin/users/${id}`).then(setD).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const act = async (path: string, body?: unknown, done?: string) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await api(path, { body: body ?? {} });
      setMsg(res.message ?? done ?? 'Fatto.');
      setAsk('');
      setStatement('');
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const u = d?.user;
  const roleEditable = u && me && !u.isOwner && u.id !== me.id && (me.canAppoint || u.role !== 'admin');
  const askText = {
    suspend: { title: 'Perché sospendi questo account?', hint: 'Resta nello storico. La persona non potrà più entrare.', path: 'suspend', cta: 'Sospendi' },
    reinstate: { title: 'Perché lo riattivi?', hint: 'La persona riceverà questo messaggio.', path: 'reinstate', cta: 'Riattiva' },
    reset_2fa: { title: 'Perché disattivi i due passaggi?', hint: 'Di solito: ha perso il telefono e i codici di riserva. Verifica prima che sia davvero lei.', path: 'reset-2fa', cta: 'Disattiva' },
  } as const;

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet user-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {!u ? (error ? <p className="error">{error}</p> : <div className="spinner" />) : (
          <>
            <div className="user-sheet-head">
              <Avatar user={u} size={64} />
              <div>
                <h3>{u.displayName}</h3>
                <small className="muted">@{u.username} · {u.email}</small>
                <Badges u={u} />
              </div>
            </div>
            <div className="user-facts">
              <span><small>Iscritto</small>{date(u.createdAt)}</span>
              <span><small>Ultimo accesso</small>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'mai'}</span>
              <span><small>Post</small>{u.posts}</span>
              <span><small>Commenti</small>{u.comments}</span>
              <span><small>Follower</small>{u.followers}</span>
              <span><small>Operazioni</small>{u.trades}</span>
              <span><small>Live</small>{u.rooms}</span>
              <span><small>Segnalato</small>{u.reports} {u.reports === 1 ? 'volta' : 'volte'}</span>
              {u.invitedBy && <span><small>Portato da</small>@{u.invitedBy}</span>}
              {u.invited > 0 && <span><small>Ha portato</small>{u.invited} {u.invited === 1 ? 'persona' : 'persone'}</span>}
            </div>
            {u.suspended && <blockquote>Sospeso {u.suspendedAt && timeAgo(u.suspendedAt)}: {u.suspendReason}</blockquote>}

            {roleEditable && (
              <div className="sheet-block">
                <small className="muted">Ruolo nella comunità</small>
                <div className="segmented three">
                  {(['member', 'moderator', 'admin'] as const).filter((r) => r !== 'admin' || me!.canAppoint).map((r) => (
                    <button key={r} type="button" className={u.role === r ? 'on' : ''} disabled={busy || u.role === r}
                      onClick={() => act(`/moderation/users/${u.id}/role`, { role: r }, `Ora è ${ROLE_LABEL[r].toLowerCase()}.`)}>{ROLE_LABEL[r]}</button>
                  ))}
                </div>
              </div>
            )}

            {!u.suspended && (u.id !== me?.id || me?.isOwner) && (
              <div className="sheet-block">
                <button className={`action-row ${u.mentor ? '' : 'good'}`} disabled={busy}
                  onClick={() => act(`/admin/users/${u.id}/mentor`, { mentor: !u.mentor }, u.mentor ? 'Badge Mentore tolto.' : 'Ora è Mentore: il badge compare sul profilo e nei post.')}>
                  <Icon name="mentor" size={18} /> {u.mentor ? 'Togli il badge Mentore' : 'Nomina Mentore'}
                </button>
              </div>
            )}

            {d.canManage ? (
              <div className="sheet-block actions-list">
                {ask ? (
                  <div className="stack">
                    <strong>{askText[ask].title}</strong>
                    <small className="muted">{askText[ask].hint}</small>
                    <textarea autoFocus value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={1000} placeholder="Almeno 10 caratteri" />
                    <div className="row">
                      <button className="btn ghost small" onClick={() => setAsk('')}>Annulla</button>
                      <button className={`btn small ${ask === 'suspend' ? 'danger' : ''}`} disabled={busy || statement.trim().length < 10}
                        onClick={() => act(`/admin/users/${u.id}/${askText[ask].path}`, { statement })}>{askText[ask].cta}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!u.emailVerified && <button className="action-row" disabled={busy} onClick={() => act(`/admin/users/${u.id}/verify-email`, {}, 'Email confermata.')}><Icon name="check" size={18} /> Conferma l'email a mano</button>}
                    <button className="action-row" disabled={busy} onClick={() => act(`/admin/users/${u.id}/password-reset`)}><Icon name="settings" size={18} /> Manda il link per una nuova password</button>
                    <button className="action-row" disabled={busy} onClick={() => act(`/admin/users/${u.id}/logout`)}><Icon name="logout" size={18} /> Chiudi tutti i suoi accessi</button>
                    {u.twoFactor && <button className="action-row" disabled={busy} onClick={() => setAsk('reset_2fa')}><Icon name="shield" size={18} /> Disattiva la verifica in due passaggi</button>}
                    {u.suspended
                      ? <button className="action-row good" disabled={busy} onClick={() => setAsk('reinstate')}><Icon name="check" size={18} /> Riattiva l'account</button>
                      : <button className="action-row danger" disabled={busy} onClick={() => setAsk('suspend')}><Icon name="flag" size={18} /> Sospendi l'account</button>}
                  </>
                )}
              </div>
            ) : (
              <p className="muted small">{u.isOwner ? 'Il proprietario non si può modificare da qui.' : u.id === me?.id ? 'Per il tuo account usa la pagina Account.' : 'Moderatori e amministratori li gestiscono solo il proprietario e gli amministratori fondatori.'}</p>
            )}
            {msg && <p className="notice friendly">{msg}</p>}
            {error && <p className="error">{error}</p>}

            {d.history.length > 0 && (
              <div className="sheet-block">
                <small className="muted">Storico</small>
                {d.history.map((h, i) => (
                  <div key={i} className="history-row">
                    <b>{ACTION_LABEL[h.action] ?? h.action}</b>
                    <small className="muted">{timeAgo(h.createdAt)}{h.by && ` · @${h.by}`}</small>
                    {h.statement && <span>{h.statement}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="row">
              <Link className="btn ghost small" to={`/u/${u.username}`} onClick={onClose}>Vedi profilo</Link>
              <button className="btn small" onClick={onClose}>Chiudi</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<keyof Counts>('all');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<number>(0);

  const load = async (page = 0) => {
    try {
      const res = await api(`/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&page=${page}`);
      setUsers((l) => (page === 0 ? res.users : [...(l ?? []), ...res.users]));
      setCounts(res.counts);
      setNextPage(res.nextPage);
    } catch (e: any) {
      setError(e.message);
    }
  };
  // La ricerca parte mentre scrivi, con un attimo di pausa.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => load(0), q ? 250 : 0);
    return () => clearTimeout(timer.current);
  }, [q, filter]);

  return (
    <div className="page admin-users">
      <header className="top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
        <h1 className="title">Utenti</h1>
        <span className="pill">{counts?.all ?? '…'}</span>
      </header>
      <input className="search" type="search" placeholder="Cerca per nome, @utente o email" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}{counts && <b>{counts[f.key]}</b>}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {!users && !error && <div className="spinner" />}
      {users?.length === 0 && <p className="muted center">Nessuno trovato.</p>}
      <div className="user-list">
        {users?.map((u) => (
          <button key={u.id} className={`user-row ${u.suspended ? 'is-suspended' : ''}`} onClick={() => setOpen(u.id)}>
            <Avatar user={u} size={44} />
            <span className="user-main">
              <strong>{u.displayName} <small className="muted">@{u.username}</small></strong>
              <small className="muted">{u.email}</small>
              <Badges u={u} />
            </span>
            <span className="user-side">
              <small>{u.lastLoginAt ? `entrato ${timeAgo(u.lastLoginAt)}` : 'mai entrato'}</small>
              <small className="muted">dal {new Date(u.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</small>
            </span>
          </button>
        ))}
      </div>
      {nextPage !== null && <button className="btn ghost wide" onClick={() => load(nextPage)}>Mostra altri</button>}
      {open !== null && <UserSheet id={open} onClose={() => setOpen(null)} onChanged={() => load(0)} />}
    </div>
  );
}
