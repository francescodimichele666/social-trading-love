import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DEMO, type Post } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import RichText from '../components/RichText';
import MentorBadge from '../components/MentorBadge';

// Video a tutto schermo: si scorre in su per passare al successivo, come su TikTok.
// Solo gli ultimi 14 giorni, poi una schermata di fine: niente scorrimento infinito.
export default function Videos() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);

  const load = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await api(`/videos?page=${page}`);
      setPosts((p) => (page === 0 ? res.posts : [...p, ...res.posts]));
      setNextPage(res.nextPage);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(0); }, [load]);

  return (
    <div className="reels">
      <header className="reels-top">
        <button className="icon-btn floating-dark" onClick={() => navigate('/')} aria-label="Torna alla Home"><Icon name="back" /></button>
        <strong>Video</strong>
        <button className="icon-btn floating-dark" onClick={() => setMuted(!muted)} aria-label={muted ? 'Attiva audio' : 'Togli audio'}><Icon name={muted ? 'muted' : 'sound'} /></button>
      </header>
      {posts.map((p, i) => (
        <Reel key={p.id} post={p} muted={muted} onUnmute={() => setMuted(false)}
          onNear={() => { if (i >= posts.length - 3 && nextPage != null && !loading) load(nextPage); }} />
      ))}
      {!loading && nextPage == null && (
        <section className="reel reel-end">
          <div className="big-ico"><Icon name="check" size={28} /></div>
          <h2>{posts.length ? 'Hai visto tutti i video' : 'Ancora nessun video'}</h2>
          <p className="muted">{posts.length ? 'Qui trovi solo quelli delle ultime due settimane. Ora tocca a te: racconta un trade in meno di 2 minuti.' : 'Sii il primo: racconta un trade o una lezione in meno di 2 minuti.'}</p>
          <Link className="btn" to="/">Torna alla Home</Link>
        </section>
      )}
      {loading && posts.length === 0 && <div className="reel"><div className="spinner" /></div>}
    </div>
  );
}

function Reel({ post, muted, onUnmute, onNear }: { post: Post; muted: boolean; onUnmute: () => void; onNear: () => void }) {
  const box = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [burst, setBurst] = useState(0);
  const [more, setMore] = useState(false);

  // Parte quando è quasi tutto sullo schermo, si ferma e torna all'inizio quando esce.
  useEffect(() => {
    const el = box.current, v = video.current;
    if (!el || !v || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.7) { v.play().catch(() => {}); onNear(); }
      else { v.pause(); if (e.intersectionRatio === 0) v.currentTime = 0; }
    }, { threshold: [0, 0.7] });
    io.observe(el);
    return () => io.disconnect();
  }, [onNear]);

  const like = async (force?: boolean) => {
    const next = force ?? !liked;
    if (next === liked) return;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try { await api(`/posts/${post.id}/like`, { method: next ? 'POST' : 'DELETE' }); } catch { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); }
  };

  // Un tocco mette in pausa (o attiva l'audio la prima volta), due tocchi mettono il cuore.
  const lastTap = useRef(0);
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) { setBurst((b) => b + 1); like(true); lastTap.current = 0; return; }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current !== now) return;
      const v = video.current;
      if (!v) return;
      if (muted) { onUnmute(); v.play().catch(() => {}); return; }
      if (v.paused) v.play().catch(() => {}); else v.pause();
    }, 300);
  };

  const share = async () => {
    const url = DEMO ? `${location.origin}${location.pathname}#/post/${post.id}` : `${location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.author.displayName, text: post.body.slice(0, 120), url });
      else await navigator.clipboard.writeText(url);
    } catch { /* annullato */ }
  };

  return (
    <section ref={box} className="reel">
      <video ref={video} src={post.mediaUrl!} poster={post.mediaPoster ?? undefined} muted={muted} loop playsInline preload="metadata" onClick={tap}
        onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }} />
      {paused && !muted && <span className="video-play"><Icon name="play" size={40} filled /></span>}
      {burst > 0 && <span key={burst} className="reel-burst" aria-hidden="true"><Icon name="heart" size={96} filled /></span>}
      <aside className="reel-actions">
        <Link to={`/u/${post.author.username}`} className="reel-avatar" aria-label={`Profilo di ${post.author.displayName}`}><Avatar user={post.author} size={48} /></Link>
        <button className={`reel-act ${liked ? 'on' : ''}`} onClick={() => like()} aria-pressed={liked} aria-label="Mi piace"><Icon name="heart" size={30} filled={liked} /><span>{likes}</span></button>
        <Link className="reel-act" to={`/post/${post.id}`} aria-label="Commenti"><Icon name="comment" size={30} /><span>{post.comments}</span></Link>
        <Link className="reel-act" to={`/messaggi/${post.author.username}`} aria-label="Scrivi in privato"><Icon name="send" size={28} /><span>Scrivi</span></Link>
        <button className="reel-act" onClick={share} aria-label="Condividi"><Icon name="share" size={28} /><span>Invia</span></button>
      </aside>
      <div className="reel-info">
        <Link to={`/u/${post.author.username}`} className="reel-author">@{post.author.username}{post.author.isMentor && <MentorBadge />}</Link>
        {post.body && (
          <div className={`reel-text ${more ? 'open' : ''}`} onClick={() => setMore(!more)}>
            <RichText text={post.body} />
          </div>
        )}
      </div>
      <div className="reel-progress"><i style={{ width: `${progress * 100}%` }} /></div>
    </section>
  );
}
