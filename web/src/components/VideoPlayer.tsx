import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Il video parte da solo, senza audio, quando è ben visibile sullo schermo e si ferma quando esce.
// Un tocco attiva l'audio, un altro mette in pausa. Il feed resta onesto: nessun passaggio automatico al video dopo.
export default function VideoPlayer({ src, poster, duration }: { src: string; poster?: string | null; duration?: number | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);
  const [left, setLeft] = useState<number | null>(duration ?? null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.6) video.play().catch(() => {});
      else video.pause();
    }, { threshold: [0, 0.6, 1] });
    io.observe(video);
    return () => io.disconnect();
  }, []);

  const tap = () => {
    const video = ref.current;
    if (!video) return;
    if (muted) { video.muted = false; setMuted(false); video.play().catch(() => {}); return; }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <div className="video" onClick={tap}>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) {
            setProgress(v.currentTime / v.duration);
            setLeft(v.duration - v.currentTime);
          }
        }}
      />
      {paused && !muted && <span className="video-play"><Icon name="play" size={34} filled /></span>}
      <span className="video-badge">{left != null && formatDuration(left)}</span>
      <button
        className="video-sound"
        aria-label={muted ? 'Attiva audio' : 'Togli audio'}
        onClick={(e) => { e.stopPropagation(); const v = ref.current; if (v) { v.muted = !muted; setMuted(!muted); } }}
      >
        <Icon name={muted ? 'muted' : 'sound'} size={18} />
      </button>
      <span className="video-progress" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
