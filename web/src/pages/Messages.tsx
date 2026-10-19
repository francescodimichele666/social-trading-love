import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

type Conversation = { with: { id: number; username: string; displayName: string; avatarUrl: string | null }; unread: number; last: { body: string; createdAt: string; mine: boolean } };

// Le conversazioni private, dalla più recente.
export default function Messages() {
  const [list, setList] = useState<Conversation[] | null>(null);
  useEffect(() => {
    const load = () => api('/messages').then((r) => setList(r.conversations)).catch(() => setList([]));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page">
      <header className="top">
        <h1 className="title">Messaggi</h1>
        <Link className="icon-btn" to="/cerca" aria-label="Cerca una persona"><Icon name="search" /></Link>
      </header>
      <p className="notice small">Nessuno dello staff ti chiederà mai soldi o password. Diffida di chi in privato promette guadagni o vende "segnali": segnalalo.</p>
      {list === null && <div className="spinner" />}
      {list?.length === 0 && (
        <div className="empty">
          <div className="big-ico"><Icon name="send" size={28} /></div>
          <p>Ancora nessun messaggio. Apri il profilo di qualcuno e tocca <b>Messaggio</b> per scrivergli.</p>
        </div>
      )}
      <ul className="convo-list">
        {list?.map((c) => (
          <li key={c.with.id}>
            <Link to={`/messaggi/${c.with.username}`} className={`convo ${c.unread ? 'unread' : ''}`}>
              <Avatar user={c.with} size={50} />
              <span className="convo-text">
                <strong>{c.with.displayName}</strong>
                <small>{c.last.mine ? 'Tu: ' : ''}{c.last.body}</small>
              </span>
              <span className="convo-meta">
                <small>{timeAgo(c.last.createdAt)}</small>
                {c.unread > 0 && <b className="badge static">{c.unread}</b>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
