import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Post } from '../api';
import Icon from '../components/Icon';
import PostCard from '../components/PostCard';

// Tutti i post con un hashtag, dal più recente.
export default function Tag() {
  const { tag = '' } = useParams();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPosts(null);
    api<{ posts: Post[]; nextPage: number | null }>(`/hashtags/${encodeURIComponent(tag)}/posts`)
      .then((r) => { setPosts(r.posts); setNext(r.nextPage); })
      .catch((e) => setError(e.message));
  }, [tag]);

  const more = async () => {
    const r = await api<{ posts: Post[]; nextPage: number | null }>(`/hashtags/${encodeURIComponent(tag)}/posts?page=${next}`);
    setPosts((list) => [...(list ?? []), ...r.posts]);
    setNext(r.nextPage);
  };

  return (
    <div className="page">
      <header className="top">
        <Link className="icon-btn" to="/cerca" aria-label="Indietro"><Icon name="back" /></Link>
        <h1 className="title">#{tag}</h1>
        <span />
      </header>
      {error && <p className="error">{error}</p>}
      {!posts && !error && <div className="spinner" />}
      {posts && <p className="muted center small">{posts.length === 0 ? 'Ancora nessun post con questo hashtag. Scrivine uno tu!' : `${posts.length}${next != null ? '+' : ''} post`}</p>}
      {posts?.map((p) => <PostCard key={p.id} post={p} onDeleted={(id) => setPosts((l) => l!.filter((x) => x.id !== id))} />)}
      {next != null && <button className="btn ghost" onClick={more}>Carica altri</button>}
    </div>
  );
}
