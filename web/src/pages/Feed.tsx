import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Post } from '../api';
import { useAuth } from '../auth';
import PostCard from '../components/PostCard';

function Composer({ onPosted }: { onPosted: (p: Post) => void }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setBusy(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('body', body);
      if (file) form.append('file', file);
      const res = await api('/posts', { form });
      onPosted(res.post);
      setBody('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      if (res.notice) setMsg(res.notice);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card composer">
      <textarea placeholder="Cosa hai imparato oggi? Un'operazione, un errore, una domanda…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      {file && <p className="muted small">Allegato: {file.name} <button className="link-btn" onClick={() => setFile(null)}>rimuovi</button></p>}
      {msg && <p className="notice">{msg}</p>}
      <div className="row">
        <button className="btn ghost" onClick={() => fileInput.current?.click()}>📷 Foto o video</button>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn" disabled={busy || (!body.trim() && !file)} onClick={submit}>{busy ? 'Pubblico…' : 'Pubblica'}</button>
      </div>
    </div>
  );
}

export default function Feed() {
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

  const firstCommunity = posts.findIndex((p) => !p.fromFollowing);
  return (
    <div className="page">
      <header className="top">
        <h1 className="brand small">Trading <span>Love</span></h1>
        {me?.role !== 'member' && <Link className="pill" to="/moderazione">Moderazione</Link>}
      </header>
      <Composer onPosted={(p) => setPosts((list) => [{ ...p, fromFollowing: true }, ...list])} />
      {posts.map((p, i) => (
        <div key={p.id}>
          {i === firstCommunity && <div className="divider">Dalla comunità</div>}
          <PostCard post={p} onDeleted={(id) => setPosts((list) => list.filter((x) => x.id !== id))} />
        </div>
      ))}
      {nextPage !== null && !loading && posts.length > 0 && <button className="btn ghost wide" onClick={() => load(nextPage)}>Mostra altri</button>}
      {loading && <div className="spinner" />}
      {nextPage === null && !loading && (
        <div className="the-end">
          <div className="big-ico">✓</div>
          <strong>Hai visto tutto per oggi</strong>
          <p>Nessuno scorrimento infinito. Vuoi fare due chiacchiere dal vivo?</p>
          <Link className="btn" to="/piazze">Vai alle Piazze</Link>
        </div>
      )}
    </div>
  );
}
