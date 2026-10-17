import { useState } from 'react';
import { api, timeAgo, type Recording } from '../api';
import Icon from './Icon';
import { formatDuration } from './VideoPlayer';

// Una registrazione di Live: si guarda qui, senza scaricare nulla. Chi conduceva o un amministratore la può cancellare.
export default function RecordingItem({ rec, canDelete, onDeleted, showTitle = true }: { rec: Recording; canDelete: boolean; onDeleted: (id: number) => void; showTitle?: boolean }) {
  const [open, setOpen] = useState(false);
  const remove = async () => {
    if (!confirm('Cancellare la registrazione? Il video viene eliminato dal server.')) return;
    await api(`/recordings/${rec.id}`, { method: 'DELETE' });
    onDeleted(rec.id);
  };
  return (
    <div className="recording">
      <div className="recording-row">
        <button className="rec-play" disabled={!rec.url} onClick={() => setOpen(!open)} aria-label={open ? 'Chiudi' : 'Guarda'}>
          <Icon name={open ? 'close' : 'play'} size={20} filled={!open} />
        </button>
        <span className="rec-info">
          {showTitle && <strong>{rec.title}</strong>}
          <small>
            {rec.host && `${rec.host.displayName} · `}
            {timeAgo(rec.startedAt)}
            {rec.duration != null && ` · ${formatDuration(rec.duration)}`}
          </small>
        </span>
        {rec.status !== 'ready' && <span className="pill warn">In preparazione</span>}
        {canDelete && <button className="icon-btn" onClick={remove} aria-label="Cancella registrazione"><Icon name="trash" size={18} /></button>}
      </div>
      {open && rec.url && <video className="rec-video" src={rec.url} controls autoPlay playsInline preload="metadata" />}
    </div>
  );
}
