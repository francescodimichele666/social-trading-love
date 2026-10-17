import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Room } from '../api';
import Avatar from './Avatar';
import Icon from './Icon';

// In cima al feed: le Live in diretta, come cerchi da toccare.
export default function LiveStrip() {
  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    const load = () => api('/rooms').then((d) => setRooms(d.rooms)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);
  const live = rooms.filter((r) => r.status === 'live');
  return (
    <div className="live-strip">
      <Link to="/live?nuova=1" className="live-bubble">
        <span className="ring add"><Icon name="plus" size={26} /></span>
        <small>La tua Live</small>
      </Link>
      {live.map((r) => (
        <Link key={r.id} to={`/live/${r.id}`} className="live-bubble">
          <span className="ring on"><Avatar user={r.host} size={58} /></span>
          <b className="live-tag">LIVE</b>
          <small>{r.host.displayName.split(' ')[0]}</small>
        </Link>
      ))}
      {live.length === 0 && <div className="live-empty">Nessuna diretta ora.<br />Aprine una tu!</div>}
    </div>
  );
}
