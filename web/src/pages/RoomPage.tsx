import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chat, ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { api, type Room } from '../api';
import Avatar from '../components/Avatar';
import ReportButton from '../components/ReportButton';
import { useAuth } from '../auth';

type Person = { id: number; username: string; displayName: string; avatarUrl: string | null; role: string };
type Info = { room: Room; stage: Person[]; raisedHands: Person[]; me: { role: string | null; handRaised: boolean; isHost: boolean }; maxOnStage: number };
type Conn = { token: string; livekitUrl: string; role: string };

// Mostra solo chi è sul palco (chi può trasmettere), non tutto il pubblico.
function Stage() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const onStage = tracks.filter((t) => t.participant.permissions?.canPublish);
  if (onStage.length === 0) return <div className="stage-empty">In attesa che qualcuno salga sul palco…</div>;
  return (
    <GridLayout tracks={onStage} className="stage-grid">
      <ParticipantTile />
    </GridLayout>
  );
}

export default function RoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const myId = useAuth().me?.id;
  const [info, setInfo] = useState<Info | null>(null);
  const [conn, setConn] = useState<Conn | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setInfo(await api<Info>(`/rooms/${id}`));
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  const join = useCallback(async () => {
    try {
      setConn(await api<Conn>(`/rooms/${id}/join`, { method: 'POST' }));
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }, [id, load]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Entra appena la Piazza è in diretta; se il ruolo cambia (sali o scendi dal palco) prende un nuovo biglietto.
  useEffect(() => {
    if (!info || info.room.status !== 'live') return;
    if (!conn || (info.me.role && info.me.role !== conn.role)) join();
  }, [info, conn, join]);

  const act = async (path: string, method = 'POST') => {
    try {
      await api(path, { method });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const leave = async () => {
    if (!info?.me.isHost) await api(`/rooms/${id}/leave`, { method: 'POST' }).catch(() => {});
    navigate('/piazze');
  };

  const end = async () => {
    if (!confirm('Chiudere la Piazza per tutti?')) return;
    await act(`/rooms/${id}/end`);
    navigate('/piazze');
  };

  if (error && !info) return <div className="page"><p className="error">{error}</p><button className="btn" onClick={() => navigate('/piazze')}>Torna alle Piazze</button></div>;
  if (!info) return <div className="center-screen"><div className="spinner" /></div>;

  const { room, me } = info;
  const canPublish = conn ? conn.role !== 'audience' : false;

  return (
    <div className="room">
      <header className="room-bar">
        <button className="link-btn" onClick={leave}>← Esci</button>
        <div className="room-title">
          <strong>{room.title}</strong>
          <small>{room.status === 'live' ? `● In diretta · ${room.listeners} presenti` : room.status === 'ended' ? 'Finita' : 'Non ancora iniziata'}</small>
        </div>
        {!me.isHost && <ReportButton targetType="room" targetId={room.id} />}
      </header>

      {error && <p className="error" onClick={() => setError('')}>{error}</p>}

      {room.status === 'scheduled' && (
        <div className="the-end">
          <strong>{me.isHost ? 'Quando sei pronto, vai in diretta' : 'La Piazza inizierà presto'}</strong>
          <p>{new Date(room.scheduledAt).toLocaleString('it-IT')}</p>
          {me.isHost && <button className="btn big" onClick={() => act(`/rooms/${id}/start`)}>Vai in diretta</button>}
        </div>
      )}
      {room.status === 'ended' && <div className="the-end"><strong>Questa Piazza è finita</strong></div>}

      {room.status === 'live' && conn && (
        <LiveKitRoom key={conn.token} serverUrl={conn.livekitUrl} token={conn.token} connect video={canPublish} audio={canPublish} className="lk-room" data-lk-theme="default">
          <div className="room-main">
            <Stage />
            {showChat && <div className="room-chat"><Chat /></div>}
          </div>
          <RoomAudioRenderer />
          {canPublish && <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} />}
        </LiveKitRoom>
      )}

      {room.status === 'live' && (
        <footer className="room-actions">
          <button className="btn ghost" onClick={() => setShowChat(!showChat)}>{showChat ? 'Nascondi chat' : '💬 Chat'}</button>
          {me.role === 'audience' && (me.handRaised
            ? <button className="btn ghost" onClick={() => act(`/rooms/${id}/hand`, 'DELETE')}>Abbassa la mano</button>
            : <button className="btn" onClick={() => act(`/rooms/${id}/hand`)}>✋ Alza la mano</button>)}
          {me.role === 'speaker' && <button className="btn ghost" onClick={() => act(`/rooms/${id}/speakers/${myId}`, 'DELETE')}>Scendi dal palco</button>}
          {me.isHost && <button className="btn danger" onClick={end}>Chiudi Piazza</button>}
        </footer>
      )}

      {me.isHost && room.status === 'live' && (
        <section className="host-panel">
          <h3>Sul palco ({info.stage.length}/{info.maxOnStage})</h3>
          {info.stage.map((p) => (
            <div key={p.id} className="person">
              <Avatar user={p} size={30} /> <span>{p.displayName}{p.role === 'host' && ' (tu)'}</span>
              {p.role === 'speaker' && <button className="link-btn" onClick={() => act(`/rooms/${id}/speakers/${p.id}`, 'DELETE')}>Fai scendere</button>}
            </div>
          ))}
          <h3>Mani alzate</h3>
          {info.raisedHands.length === 0 && <p className="muted small">Nessuna per ora.</p>}
          {info.raisedHands.map((p) => (
            <div key={p.id} className="person">
              <Avatar user={p} size={30} /> <span>{p.displayName}</span>
              <button className="btn small" disabled={info.stage.length >= info.maxOnStage} onClick={() => act(`/rooms/${id}/speakers/${p.id}`)}>Fai salire</button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
