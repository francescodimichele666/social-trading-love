import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo, type User } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

type Stats = {
  members: number; newMembers7d: number; active7d: number; suspended: number; staff: number;
  posts: number; posts7d: number; videos: number; comments: number; liveRooms: number; rooms7d: number; openReports: number;
  signups: Array<{ day: string; count: number }>;
  lastBackup: string | null;
};
type Suspended = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'role'> & { suspendedAt: string; reason: string | null };

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'teal' | 'coral' | 'violet' | 'gold' }) {
  return (
    <div className={`tile ${tone ?? ''}`}>
      <span className="tile-label">{label}</span>
      <b>{value.toLocaleString('it-IT')}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Signups({ days }: { days: Stats['signups'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <div className="card signups">
      <div className="row"><strong>Nuovi iscritti, ultimi 14 giorni</strong><span className="pill">{total}</span></div>
      <div className="bars" role="img" aria-label={`${total} nuovi iscritti negli ultimi 14 giorni`}>
        {days.map((d) => (
          <div key={d.day} className="bar-col" title={`${new Date(d.day).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: ${d.count}`}>
            <span className="bar-value">{d.count || ''}</span>
            <span className="bar" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
            <span className="bar-day">{new Date(d.day).getDate()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Il backup gira ogni notte: se l'ultimo ha più di due giorni qualcosa non va.
function BackupStatus({ at }: { at: string | null }) {
  const old = !at || Date.now() - new Date(at).getTime() > 2 * 86400000;
  return (
    <div className={`card backup-card ${old ? 'warn' : ''}`}>
      <Icon name={old ? 'flag' : 'check'} size={20} />
      <span>
        <strong>{at ? `Ultimo backup ${timeAgo(at)}` : 'Nessun backup trovato'}</strong>
        <small>{old ? 'Controlla che il PC del server sia acceso e che il servizio backup sia attivo (vedi la guida).' : 'Database e foto/video sono salvati nella cartella backups ogni notte.'}</small>
      </span>
    </div>
  );
}

function SuspendedItem({ u, onDone }: { u: Suspended; onDone: () => void }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState('');
  const [error, setError] = useState('');
  const canReinstate = u.role === 'member' || me?.canAppoint;
  const reinstate = async () => {
    try {
      await api(`/admin/users/${u.id}/reinstate`, { body: { statement } });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="card suspended">
      <div className="who">
        <Avatar user={u} size={42} />
        <span><strong>{u.displayName}</strong><small>@{u.username} · sospeso {timeAgo(u.suspendedAt)}</small></span>
      </div>
      {u.reason && <blockquote>{u.reason}</blockquote>}
      {!canReinstate && <p className="muted small">È {u.role === 'admin' ? 'un amministratore' : 'un moderatore'}: lo può riattivare solo il proprietario.</p>}
      {canReinstate && !open && <button className="btn ghost small" onClick={() => setOpen(true)}><Icon name="check" size={16} /> Riattiva account</button>}
      {open && (
        <>
          <textarea autoFocus placeholder="Perché lo riattivi? La persona riceverà questo messaggio." value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={1000} />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn ghost small" onClick={() => setOpen(false)}>Annulla</button>
            <button className="btn small" disabled={statement.trim().length < 10} onClick={reinstate}>Riattiva</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [suspended, setSuspended] = useState<Suspended[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(e.message));
    api<{ users: Suspended[] }>('/admin/suspended').then((d) => setSuspended(d.users)).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  return (
    <div className="page admin">
      <h1>Pannello amministratore</h1>
      <p className="muted">Lo vedono solo gli amministratori.</p>
      {error && <p className="error">{error}</p>}
      {!stats && !error && <div className="spinner" />}
      {stats && (
        <>
          {stats.openReports > 0 && (
            <Link to="/moderazione" className="card alert-card">
              <Icon name="flag" /> <span><strong>{stats.openReports} {stats.openReports === 1 ? 'segnalazione aperta' : 'segnalazioni aperte'}</strong><small>Tocca per decidere</small></span>
            </Link>
          )}
          <div className="admin-links">
            <Link to="/admin/utenti" className="card account-item link-card">
              <span className="create-ico teal"><Icon name="users" size={20} /></span>
              <span><strong>Tutti gli utenti</strong><small>Cerca, guarda i dettagli, cambia ruolo, sospendi, chiudi gli accessi</small></span>
              <Icon name="back" className="chev" size={18} />
            </Link>
          </div>
          <BackupStatus at={stats.lastBackup} />
          <h2 className="section-title">Persone</h2>
          <div className="tiles">
            <Tile label="Iscritti" value={stats.members} hint={`+${stats.newMembers7d} in 7 giorni`} tone="teal" />
            <Tile label="Attivi" value={stats.active7d} hint="ultimi 7 giorni" tone="violet" />
            <Tile label="Staff" value={stats.staff} hint="moderatori e admin" />
            <Tile label="Sospesi" value={stats.suspended} tone="coral" />
          </div>
          <Signups days={stats.signups} />
          <h2 className="section-title">Contenuti</h2>
          <div className="tiles">
            <Tile label="Post" value={stats.posts} hint={`+${stats.posts7d} in 7 giorni`} tone="teal" />
            <Tile label="Video" value={stats.videos} tone="violet" />
            <Tile label="Commenti" value={stats.comments} />
            <Tile label="Live in corso" value={stats.liveRooms} hint={`${stats.rooms7d} create in 7 giorni`} tone="coral" />
          </div>
        </>
      )}
      <h2 className="section-title">Account sospesi</h2>
      {suspended?.length === 0 && <p className="muted">Nessun account sospeso.</p>}
      {suspended?.map((u) => <SuspendedItem key={u.id} u={u} onDone={load} />)}
    </div>
  );
}
