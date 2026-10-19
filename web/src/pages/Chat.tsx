import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import ReportButton from '../components/ReportButton';

type Msg = { id: number; body: string; createdAt: string; mine: boolean; read: boolean };
type Thread = { with: { id: number; username: string; displayName: string; avatarUrl: string | null }; messages: Msg[]; blockedByMe: boolean; canWrite: boolean };

const time = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Una conversazione privata. Si aggiorna da sola ogni pochi secondi.
export default function Chat() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const t = await api<Thread>(`/messages/${encodeURIComponent(username)}`);
      setThread(t);
      if (t.messages.length !== count.current) {
        count.current = t.messages.length;
        requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));
      }
    } catch (e: any) {
      setError(e.message);
    }
  }, [username]);

  useEffect(() => {
    load().then(() => refresh());
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load, refresh]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/messages/${encodeURIComponent(username)}`, { body: { body: text } });
      setText('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (!thread) return;
    if (!thread.blockedByMe && !confirm(`Bloccare ${thread.with.displayName}? Non potrà più scriverti.`)) return;
    await api(`/users/${encodeURIComponent(username)}/block`, { method: thread.blockedByMe ? 'DELETE' : 'POST' });
    setMenu(false);
    load();
  };

  if (!thread) return <div className="page">{error ? <p className="error">{error}</p> : <div className="spinner" />}</div>;
  const other = thread.with;
  return (
    <div className="chat-page">
      <header className="chat-head">
        <button className="icon-btn" onClick={() => navigate('/messaggi')} aria-label="Indietro"><Icon name="back" /></button>
        <Link to={`/u/${other.username}`} className="chat-who">
          <Avatar user={other} size={38} />
          <span><strong>{other.displayName}</strong><small>@{other.username}</small></span>
        </Link>
        <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Altre azioni"><Icon name="more" /></button>
      </header>
      {menu && (
        <div className="chat-menu">
          <button className="btn small ghost" onClick={toggleBlock}>{thread.blockedByMe ? 'Sblocca' : 'Blocca'} {other.displayName}</button>
          <ReportButton targetType="user" targetId={other.id} label="Segnala profilo" />
        </div>
      )}
      <div className="chat-scroll">
        <p className="notice small">I messaggi li vedete solo voi due. Niente promesse di guadagno, "segnali" a pagamento o richieste di soldi: in quel caso segnala e blocca.</p>
        {thread.messages.length === 0 && <p className="muted small center">Scrivi il primo messaggio a {other.displayName}.</p>}
        {thread.messages.map((m, i) => {
          const prev = thread.messages[i - 1];
          const gap = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 15 * 60000;
          return (
            <div key={m.id} className="bubble-row">
              {gap && <small className="chat-time">{time(m.createdAt)}</small>}
              <p className={`bubble ${m.mine ? 'mine' : ''}`}>{m.body}</p>
            </div>
          );
        })}
        {thread.messages.at(-1)?.mine && thread.messages.at(-1)?.read && <small className="seen">Visto</small>}
        <div ref={bottom} />
      </div>
      {error && <p className="error chat-error">{error}</p>}
      {thread.canWrite ? (
        <form className="chat-input" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi un messaggio…" maxLength={2000} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }} />
          <button className="send-btn" disabled={!text.trim() || busy} aria-label="Invia"><Icon name="send" size={20} /></button>
        </form>
      ) : (
        <p className="muted small center chat-closed">{thread.blockedByMe ? `Hai bloccato ${other.displayName}. Sbloccalo dal menu in alto per scrivergli.` : 'Non puoi scrivere a questa persona.'}</p>
      )}
    </div>
  );
}
