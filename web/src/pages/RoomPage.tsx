import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chat, ControlBar, GridLayout, LiveKitRoom, ParticipantTile, RoomAudioRenderer, useTracks } from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { api, type Recording, type Room } from '../api';
import RecordingItem from '../components/RecordingItem';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import ReportButton from '../components/ReportButton';
import LivePanel from '../components/LivePanel';
import ShareTradingView from '../components/ShareTradingView';
import { useAuth } from '../auth';

type Person = { id: number; username: string; displayName: string; avatarUrl: string | null; role: string };
type Info = { room: Room; stage: Person[]; raisedHands: Person[]; me: { role: string | null; handRaised: boolean; isHost: boolean; removed?: 'kicked' | 'blocked' | null }; maxOnStage: number; recordings?: Recording[] };
type Conn = { token: string; livekitUrl: string; role: string };

// Mostra solo chi è sul palco (chi può trasmettere), non tutto il pubblico.
// Se qualcuno condivide lo schermo (per esempio TradingView), quello va in grande e le videocamere sotto.
function Stage() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const onStage = tracks.filter((t) => t.participant.permissions?.canPublish);
  if (onStage.length === 0) return <div className="stage-empty">In attesa che qualcuno salga sul palco…</div>;
  const screen = onStage.find((t) => t.source === Track.Source.ScreenShare && t.publication) as TrackReference | undefined;
  if (!screen) {
    return (
      <GridLayout tracks={onStage} className="stage-grid">
        <ParticipantTile />
      </GridLayout>
    );
  }
  const cameras = onStage.filter((t) => t.source === Track.Source.Camera);
  return (
    <div className="stage-with-screen">
      <ScreenView track={screen} />
      <GridLayout tracks={cameras} className="stage-grid small">
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}

// Lo schermo condiviso, grande, con il pulsante per vederlo a tutto schermo.
function ScreenView({ track }: { track: TrackReference }) {
  const box = useRef<HTMLDivElement>(null);
  const full = () => {
    const el = box.current as any;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
  };
  return (
    <div ref={box} className="screen-view">
      <ParticipantTile trackRef={track} />
      <button className="btn small ghost screen-full" onClick={full}><Icon name="expand" size={16} /> Ingrandisci</button>
    </div>
  );
}

// Nell'anteprima non c'è il server video: mostriamo chi è sul palco con le iniziali.
function DemoStage({ stage }: { stage: Person[] }) {
  return (
    <div className="demo-stage">
      {stage.map((p) => (
        <div key={p.id} className="demo-tile">
          <Avatar user={p} size={64} />
          <span>{p.displayName}{p.role === 'host' ? ' · conduce' : ''}</span>
        </div>
      ))}
      <p className="muted small">Nell'anteprima il video è spento: sul server vero qui vedi e senti chi parla.</p>
    </div>
  );
}

export default function RoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me: authMe } = useAuth();
  const myId = authMe?.id;
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

  // Entra appena la Live è in diretta; se il ruolo cambia (sali o scendi dal palco) prende un nuovo biglietto.
  useEffect(() => {
    if (!info || info.room.status !== 'live') return;
    if (info.me.removed) { if (conn) setConn(null); return; }
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
    navigate('/live');
  };

  const end = async () => {
    if (!confirm('Chiudere la Live per tutti?')) return;
    await act(`/rooms/${id}/end`);
    navigate('/live');
  };

  if (error && !info) return <div className="page"><p className="error">{error}</p><button className="btn" onClick={() => navigate('/live')}>Torna alle Live</button></div>;
  if (!info) return <div className="center-screen"><div className="spinner" /></div>;

  const { room, me } = info;
  const canPublish = conn ? conn.role !== 'audience' : false;

  return (
    <div className="room">
      <header className="room-bar">
        <button className="icon-btn" onClick={leave} aria-label="Esci"><Icon name="back" /></button>
        <div className="room-title">
          <strong>{room.title}</strong>
          <small>{room.status === 'live' ? `● In diretta · ${room.listeners} presenti` : room.status === 'ended' ? 'Finita' : 'Non ancora iniziata'}</small>
        </div>
        {room.record && room.status === 'live' && <span className="pill rec" title="Questa Live viene registrata">● REC</span>}
        {!me.isHost && <ReportButton targetType="room" targetId={room.id} />}
      </header>

      {error && <p className="error" onClick={() => setError('')}>{error}</p>}
      {room.record && room.status !== 'ended' && (
        <p className="notice rec-notice">Questa Live {room.status === 'live' ? 'viene registrata' : 'sarà registrata'}: se sali sul palco, la tua voce e la tua immagine finiscono nel video. Chi ascolta soltanto non compare.</p>
      )}

      {me.removed && room.status === 'live' && (
        <div className="the-end">
          <strong>{me.removed === 'blocked' ? 'Chi conduce ti ha bloccato' : 'Chi conduce ti ha fatto uscire'}</strong>
          <p>{me.removed === 'blocked' ? 'Non puoi entrare nelle sue Live.' : 'Non puoi rientrare in questa diretta.'} Se pensi sia un errore, scrivi a un amministratore.</p>
          <button className="btn" onClick={() => navigate('/live')}>Torna alle Live</button>
        </div>
      )}

      {room.status === 'scheduled' && (
        <div className="the-end">
          <strong>{me.isHost ? 'Quando sei pronto, vai in diretta' : 'La Live inizierà presto'}</strong>
          <p>{new Date(room.scheduledAt).toLocaleString('it-IT')}</p>
          {me.isHost && <button className="btn big" onClick={() => act(`/rooms/${id}/start`)}>Vai in diretta</button>}
        </div>
      )}
      {room.status === 'ended' && (
        <div className="the-end">
          <strong>Questa Live è finita</strong>
          {(info.recordings?.length ?? 0) > 0 && <p>Puoi rivederla qui sotto.</p>}
        </div>
      )}
      {room.status === 'ended' && (info.recordings?.length ?? 0) > 0 && (
        <section className="room-recordings">
          {info.recordings!.map((r) => (
            <RecordingItem key={r.id} rec={r} showTitle={false} canDelete={me.isHost || authMe?.role === 'admin'}
              onDeleted={(rid) => setInfo({ ...info, recordings: info.recordings!.filter((x) => x.id !== rid) })} />
          ))}
        </section>
      )}

      {room.status === 'live' && conn?.token === 'demo' && <DemoStage stage={info.stage} />}
      {room.status === 'live' && conn && conn.token !== 'demo' && (
        <LiveKitRoom key={conn.token} serverUrl={conn.livekitUrl} token={conn.token} connect video={canPublish} audio={canPublish} className="lk-room" data-lk-theme="default"
          onError={(e) => setError(`Il video non si collega (${e.message}). Prova con i dati del telefono invece del Wi-Fi di casa: se così funziona, il problema è solo il router di casa.`)}
          onMediaDeviceFailure={() => setError('Il telefono non ha dato il permesso per fotocamera o microfono. Consentili nelle impostazioni del browser per questo sito e rientra.')}>
          <div className="room-main">
            <Stage />
            {showChat && <div className="room-chat"><Chat /></div>}
          </div>
          <RoomAudioRenderer />
          {canPublish && <ShareTradingView />}
          {canPublish && <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: false }} />}
        </LiveKitRoom>
      )}

      {room.status === 'live' && !me.removed && (
        <footer className="room-actions">
          {conn?.token !== 'demo' && <button className="btn ghost" onClick={() => setShowChat(!showChat)}>{showChat ? 'Nascondi chat' : <><Icon name="chat" size={18} /> Chat</>}</button>}
          {me.role === 'audience' && (me.handRaised
            ? <button className="btn ghost" onClick={() => act(`/rooms/${id}/hand`, 'DELETE')}>Abbassa la mano</button>
            : <button className="btn" onClick={() => act(`/rooms/${id}/hand`)}><Icon name="hand" size={18} /> Alza la mano</button>)}
          {me.role === 'speaker' && <button className="btn ghost" onClick={() => act(`/rooms/${id}/speakers/${myId}`, 'DELETE')}>Scendi dal palco</button>}
          {me.isHost && <button className="btn danger" onClick={end}>Chiudi Live</button>}
        </footer>
      )}

      {me.isHost && room.status === 'live' && <LivePanel roomId={room.id} maxOnStage={info.maxOnStage} onChange={load} />}
    </div>
  );
}

