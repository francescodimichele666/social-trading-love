import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';

type Note = { id: number; kind: string; message: string; link: string | null; read: boolean; createdAt: string };
const ICONS: Record<string, string> = { room_live: '◉', comment: '💬', follow: '☺', invite_reward: '✦', moderation: '⚑' };

export default function Notifications() {
  const { refresh } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    api('/notifications').then((d) => {
      setNotes(d.notifications);
      api('/notifications/read', { method: 'POST' }).then(refresh);
    });
  }, [refresh]);

  if (!notes) return <div className="page"><div className="spinner" /></div>;
  return (
    <div className="page">
      <h1>Avvisi</h1>
      {notes.length === 0 && <p className="muted center">Nessun avviso per ora.</p>}
      {notes.map((n) => {
        const inner = <><span className="note-ico">{ICONS[n.kind] ?? '•'}</span><span>{n.message}<small>{timeAgo(n.createdAt)}</small></span></>;
        return n.link
          ? <Link key={n.id} to={n.link} className={`card note ${n.read ? '' : 'unread'}`}>{inner}</Link>
          : <div key={n.id} className={`card note ${n.read ? '' : 'unread'}`}>{inner}</div>;
      })}
    </div>
  );
}
