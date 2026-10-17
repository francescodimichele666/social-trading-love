import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Post, type User } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import MentorBadge from '../components/MentorBadge';
import PostCard from '../components/PostCard';

type Tag = { tag: string; posts: number };
type Results = { users: User[]; posts: Post[]; tags: Tag[] };

function PersonRow({ u }: { u: User }) {
  return (
    <Link to={`/u/${u.username}`} className="list-row">
      <Avatar user={u} size={42} />
      <span><strong>{u.displayName}{u.isMentor && <MentorBadge />}</strong><small>@{u.username}{u.bio ? ` · ${u.bio}` : ''}</small></span>
    </Link>
  );
}

const TagChips = ({ tags }: { tags: Tag[] }) => (
  <div className="tag-cloud">
    {tags.map((t) => <Link key={t.tag} className="tag-chip" to={`/tag/${encodeURIComponent(t.tag)}`}>#{t.tag}<small>{t.posts}</small></Link>)}
  </div>
);

// Cerca persone, post e hashtag. Senza parole mostra gli argomenti del momento e i Mentori.
export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [res, setRes] = useState<Results | null>(null);
  const [trending, setTrending] = useState<Tag[]>([]);
  const [mentors, setMentors] = useState<User[]>([]);
  const [tab, setTab] = useState<'all' | 'people' | 'posts'>('all');

  useEffect(() => {
    api<{ tags: Tag[] }>('/hashtags/trending').then((r) => setTrending(r.tags)).catch(() => {});
    api<{ users: User[] }>('/mentors').then((r) => setMentors(r.users)).catch(() => {});
  }, []);

  useEffect(() => {
    const term = q.trim();
    setParams(term ? { q: term } : {}, { replace: true });
    if (term.replace(/^[#@]/, '').length < 2) { setRes(null); return; }
    const t = setTimeout(() => api<Results>(`/search?q=${encodeURIComponent(term)}`).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, setParams]);

  const nothing = res && !res.users.length && !res.posts.length && !res.tags.length;
  return (
    <div className="page">
      <header className="top">
        <Link className="icon-btn" to="/" aria-label="Indietro"><Icon name="back" /></Link>
        <h1 className="title">Cerca</h1>
        <span />
      </header>
      <label className="search-box">
        <Icon name="search" size={20} />
        <input autoFocus type="search" placeholder="Persone, post o #argomento" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
        {q && <button className="icon-btn small" onClick={() => setQ('')} aria-label="Cancella"><Icon name="close" size={18} /></button>}
      </label>

      {!res && (
        <>
          {trending.length > 0 && (
            <section className="search-section">
              <h2 className="section-title">Argomenti della settimana</h2>
              <TagChips tags={trending} />
            </section>
          )}
          <section className="search-section">
            <h2 className="section-title">Mentori della comunità</h2>
            {mentors.length === 0
              ? <p className="muted small">Ancora nessun Mentore. Sono i membri esperti a cui chiedere un consiglio: li nominano gli amministratori.</p>
              : mentors.map((u) => <PersonRow key={u.id} u={u} />)}
          </section>
        </>
      )}

      {res && (
        <>
          {!q.trim().startsWith('#') && (
            <div className="segmented three search-tabs">
              <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>Tutto</button>
              <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>Persone {res.users.length}</button>
              <button className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Post {res.posts.length}</button>
            </div>
          )}
          {nothing && <p className="muted center">Nessun risultato per “{q.trim()}”.</p>}
          {tab !== 'posts' && res.tags.length > 0 && <section className="search-section"><TagChips tags={res.tags} /></section>}
          {tab !== 'posts' && res.users.length > 0 && (
            <section className="search-section">
              {tab === 'all' && <h2 className="section-title">Persone</h2>}
              {(tab === 'all' ? res.users.slice(0, 4) : res.users).map((u) => <PersonRow key={u.id} u={u} />)}
              {tab === 'all' && res.users.length > 4 && <button className="link-btn" onClick={() => setTab('people')}>Vedi tutte le {res.users.length} persone</button>}
            </section>
          )}
          {tab !== 'people' && res.posts.length > 0 && (
            <section className="search-section">
              {tab === 'all' && <h2 className="section-title">Post</h2>}
              {res.posts.map((p) => <PostCard key={p.id} post={p} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
