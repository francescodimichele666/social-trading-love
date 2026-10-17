import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Recording, type Room } from '../api';
import { useAuth } from '../auth';
import RecordingItem from '../components/RecordingItem';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

const COVERS = ['cover-teal', 'cover-coral', 'cover-violet', 'cover-gold'];
const coverFor = (r: Room) => COVERS[[...(r.topic || r.title)].reduce((a, c) => a + c.charCodeAt(0), 0) % COVERS.length];

function when(room: Room) {
  return new Date(room.scheduledAt).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Rooms() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { me } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recordingsEnabled, setRecordingsEnabled] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const creating = params.get('nuova') === '1';
  const [form, setForm] = useState({ title: '', description: '', topic: '', scheduledAt: '', startNow: true, record: false });
  const [error, setError] = useState('');

  const load = () => api('/rooms').then((d) => {
    setRooms(d.rooms);
    setRecordingsEnabled(Boolean(d.recordingsEnabled));
    if (d.recordingsEnabled) api('/recordings').then((r) => setRecordings(r.recordings)).catch(() => {});
  });
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const setCreating = (on: boolean) => setParams(on ? { nuova: '1' } : {}, { replace: true });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const body: any = { title: form.title, description: form.description, topic: form.topic, startNow: form.startNow, record: form.record };
      if (!form.startNow && form.scheduledAt) body.scheduledAt = new Date(form.scheduledAt).toISOString();
      const res = await api('/rooms', { body });
      navigate(`/live/${res.room.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const live = rooms.filter((r) => r.status === 'live');
  const upcoming = rooms.filter((r) => r.status === 'scheduled');

  const card = (r: Room) => (
    <Link key={r.id} to={`/live/${r.id}`} className={`room-card ${r.status === 'live' ? 'live' : ''}`}>
      <div className={`room-cover ${coverFor(r)}`}>
        <span className="cover-pills">
          <span className={`pill ${r.status === 'live' ? 'live' : 'soft'}`}>{r.status === 'live' ? '● IN DIRETTA' : when(r)}</span>
          {r.record && <span className="pill rec">REC</span>}
        </span>
        {r.topic && <span className="topic">#{r.topic}</span>}
        <h3>{r.title}</h3>
      </div>
      <div className="room-body">
        {r.description && <p className="muted">{r.description}</p>}
        <div className="room-host">
          <Avatar user={r.host} size={30} />
          <span><strong>{r.host.displayName}</strong><small>conduce</small></span>
          {r.status === 'live' && <span className="listeners"><Icon name="users" size={16} /> {r.listeners}</span>}
          <span className="btn small">{r.status === 'live' ? 'Entra' : 'Dettagli'}</span>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="page">
      <header className="top">
        <h1 className="title">Live</h1>
        <button className={`btn ${creating ? 'ghost' : ''}`} onClick={() => setCreating(!creating)}>{creating ? 'Chiudi' : <><Icon name="plus" size={18} /> Nuova</>}</button>
      </header>
      <p className="muted">Stanze dal vivo: fino a 6 persone sul palco, chi ascolta alza la mano per intervenire.</p>
      {creating && (
        <form className="card form" onSubmit={create}>
          <label>Titolo<input id="roomTitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={80} placeholder="Es. I miei errori sul Bitcoin, parliamone" /></label>
          <label>Di cosa si parla<textarea id="roomDescription" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
          <label>Argomento<input id="roomTopic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={30} placeholder="azioni, crypto, rischio, psicologia…" /></label>
          <div className="segmented">
            <button type="button" className={form.startNow ? 'on' : ''} onClick={() => setForm({ ...form, startNow: true })}><Icon name="live" size={18} /> Subito</button>
            <button type="button" className={!form.startNow ? 'on' : ''} onClick={() => setForm({ ...form, startNow: false })}><Icon name="calendar" size={18} /> Programma</button>
          </div>
          {!form.startNow && <label>Quando<input id="roomWhen" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} required /></label>}
          {recordingsEnabled && (
            <label className="check">
              <input type="checkbox" checked={form.record} onChange={(e) => setForm({ ...form, record: e.target.checked })} />
              <span>Registra la Live<small className="muted"> Chi entra viene avvisato. Dopo la fine il video resta nella sezione Registrazioni e puoi cancellarlo quando vuoi.</small></span>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn big">{form.startNow ? 'Vai in diretta' : 'Programma la Live'}</button>
        </form>
      )}
      {live.length > 0 && <h2 className="section-title"><span className="dot" /> In diretta ora</h2>}
      {live.map(card)}
      {upcoming.length > 0 && <h2 className="section-title">In programma</h2>}
      {upcoming.map(card)}
      {recordings.length > 0 && <h2 className="section-title"><Icon name="video" size={18} /> Registrazioni</h2>}
      {recordings.map((r) => (
        <RecordingItem key={r.id} rec={r} canDelete={me?.role === 'admin' || me?.username === r.host?.username}
          onDeleted={(id) => setRecordings((l) => l.filter((x) => x.id !== id))} />
      ))}
      {rooms.length === 0 && (
        <div className="the-end">
          <div className="big-ico"><Icon name="live" size={28} /></div>
          <strong>Nessuna Live in programma</strong>
          <p>Aprine una tu: anche una chiacchierata di 20 minuti aiuta la comunità.</p>
        </div>
      )}
    </div>
  );
}
