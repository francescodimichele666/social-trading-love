import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Post } from '../api';
import { useAuth } from '../auth';
import PostCard from '../components/PostCard';
import LiveStrip from '../components/LiveStrip';
import ChallengeCard from '../components/ChallengeCard';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { POST_CREATED } from '../components/CreateSheet';

export default function Feed({ onCompose }: { onCompose: () => void }) {
  const { me } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page: number, replace = false) => {
    setLoading(true);
    try {
      const res = await api(`/feed?page=${page}`);
      setPosts((p) => (replace ? res.posts : [...p, ...res.posts]));
      setNextPage(res.nextPage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0, true); }, [load]);
  useEffect(() => {
    const onNew = (e: Event) => setPosts((list) => [{ ...(e as CustomEvent<Post>).detail, fromFollowing: true }, ...list]);
    window.addEventListener(POST_CREATED, onNew);
    return () => window.removeEventListener(POST_CREATED, onNew);
  }, []);

  const firstCommunity = posts.findIndex((p) => !p.fromFollowing);
  return (
    <div className="page">
      <header className="top">
        <h1 className="brand small"><em>Love</em> Trading Club</h1>
        <div className="top-actions">
          {me?.role === 'admin' && <Link className="icon-btn" to="/admin" aria-label="Pannello amministratore"><Icon name="panel" /></Link>}
          {me?.role !== 'member' && <Link className="icon-btn" to="/moderazione" aria-label="Moderazione"><Icon name="shield" /></Link>}
          <Link className="icon-btn" to="/inviti" aria-label="Porta un amico"><Icon name="gift" /></Link>
        </div>
      </header>
      <LiveStrip />
      <ChallengeCard />
      {me && (
        <button className="prompt-card" onClick={onCompose}>
          <Avatar user={me} size={40} />
          <span>Cosa hai imparato oggi, {me.displayName.split(' ')[0]}?</span>
          <Icon name="camera" />
        </button>
      )}
      {posts.map((p, i) => (
        <div key={p.id} className="feed-item">
          {i === firstCommunity && <div className="divider"><span>Dalla comunità</span></div>}
          <PostCard post={p} onDeleted={(id) => setPosts((list) => list.filter((x) => x.id !== id))} />
        </div>
      ))}
      {nextPage !== null && !loading && posts.length > 0 && <button className="btn ghost wide" onClick={() => load(nextPage)}>Mostra altri</button>}
      {loading && <div className="spinner" />}
      {nextPage === null && !loading && (
        <div className="the-end">
          <div className="big-ico"><Icon name="check" size={28} /></div>
          <strong>Hai visto tutto per oggi</strong>
          <p>Nessuno scorrimento infinito. Vuoi fare due chiacchiere dal vivo?</p>
          <Link className="btn" to="/piazze">Vai alle Piazze</Link>
        </div>
      )}
    </div>
  );
}
