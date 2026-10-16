import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';

type Note = { id: number; kind: string; message: string; link: string | null; read: boolean; createdAt: string };
const ICONS: Record<string, [string, string]> = { room_live: ['live', 'coral'], comment: ['comment', 'teal'], follow: ['user', 'violet'], invite_reward: ['gift', 'violet'], moderation: ['shield', 'gold'], role: ['shield', 'teal'] };

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
      <h1 className="title">Avvisi</h1>
      {notes.length === 0 && <p className="muted center">Nessun avviso per ora.</p>}
      {notes.map((n) => {
        const [ico, tone] = ICONS[n.kind] ?? ['bell', 'teal'];
        const inner = <><span className={`create-ico ${tone}`}><Icon name={ico} size={20} /></span><span>{n.message}<small>{timeAgo(n.createdAt)}</small></span></>;
        return n.link
          ? <Link key={n.id} to={n.link} className={`list-row note ${n.read ? '' : 'unread'}`}>{inner}</Link>
          : <div key={n.id} className={`list-row note ${n.read ? '' : 'unread'}`}>{inner}</div>;
      })}
    </div>
  );
}
