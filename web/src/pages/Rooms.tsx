import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Room } from '../api';
import Avatar from '../components/Avatar';

function when(room: Room) {
  if (room.status === 'live') return 'In diretta ora';
  return new Date(room.scheduledAt).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Rooms() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', topic: '', scheduledAt: '', startNow: true });
  const [error, setError] = useState('');

  const load = () => api('/rooms').then((d) => setRooms(d.rooms));
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const body: any = { title: form.title, description: form.description, topic: form.topic, startNow: form.startNow };
      if (!form.startNow && form.scheduledAt) body.scheduledAt = new Date(form.scheduledAt).toISOString();
      const res = await api('/rooms', { body });
      navigate(`/piazze/${res.room.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <h1>Piazze</h1>
        <button className="btn" onClick={() => setCreating(!creating)}>{creating ? 'Chiudi' : '+ Nuova Piazza'}</button>
      </header>
      <p className="muted">Stanze dal vivo: fino a 6 persone sul palco, chi ascolta alza la mano per intervenire.</p>
      {creating && (
        <form className="card form" onSubmit={create}>
          <label>Titolo<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={80} placeholder="Es. I miei errori sul Bitcoin, parliamone" /></label>
          <label>Di cosa si parla<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
          <label>Argomento<input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={30} placeholder="azioni, crypto, rischio, psicologia…" /></label>
          <label className="check"><input type="checkbox" checked={form.startNow} onChange={(e) => setForm({ ...form, startNow: e.target.checked })} /><span>Inizia subito</span></label>
          {!form.startNow && <label>Quando<input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} required /></label>}
          {error && <p className="error">{error}</p>}
          <button className="btn">{form.startNow ? 'Vai in diretta' : 'Programma'}</button>
        </form>
      )}
      {rooms.map((r) => (
        <Link key={r.id} to={`/piazze/${r.id}`} className={`card room-card ${r.status === 'live' ? 'live' : ''}`}>
          <div className="room-top">
            <span className={`pill ${r.status === 'live' ? 'live' : ''}`}>{r.status === 'live' ? '● LIVE' : when(r)}</span>
            {r.topic && <span className="tag">#{r.topic}</span>}
          </div>
          <h3>{r.title}</h3>
          {r.description && <p className="muted">{r.description}</p>}
          <div className="room-host"><Avatar user={r.host} size={26} /> {r.host.displayName}{r.status === 'live' && <span className="muted"> · {r.listeners} presenti</span>}</div>
        </Link>
      ))}
      {rooms.length === 0 && <div className="the-end"><strong>Nessuna Piazza in programma</strong><p>Aprine una tu: anche una chiacchierata di 20 minuti aiuta la comunità.</p></div>}
    </div>
  );
}
