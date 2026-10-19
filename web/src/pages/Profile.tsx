import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Post, type User } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import MentorBadge from '../components/MentorBadge';
import PostCard from '../components/PostCard';
import ReportButton from '../components/ReportButton';
import Icon from '../components/Icon';

type ProfileData = { user: User; followers: number; following: number; posts: number; isFollowing: boolean; isMe: boolean; badges?: { id: number; title: string; emoji: string; awardedAt: string }[] };

export default function Profile() {
  const { username } = useParams();
  const { me, logout, refresh } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', interests: '' });
  const [error, setError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const d = await api<ProfileData>(`/users/${username}`);
      setData(d);
      setForm({ displayName: d.user.displayName, bio: d.user.bio, interests: d.user.interests.join(', ') });
      setPosts((await api(`/users/${username}/posts`)).posts);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, [username]);

  const toggleFollow = async () => {
    if (!data) return;
    await api(`/users/${username}/follow`, { method: data.isFollowing ? 'DELETE' : 'POST' });
    load();
  };

  const save = async () => {
    try {
      await api('/me', { method: 'PATCH', body: { displayName: form.displayName, bio: form.bio, interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean) } });
      setEditing(false);
      await refresh();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const uploadAvatar = async (file: File) => {
    const f = new FormData();
    f.append('file', file);
    try { await api('/me/avatar', { form: f }); await refresh(); load(); } catch (e: any) { setError(e.message); }
  };

  const setRole = async (role: 'member' | 'moderator' | 'admin') => {
    if (!data) return;
    try { await api(`/moderation/users/${data.user.id}/role`, { body: { role } }); setError(''); load(); } catch (e: any) { setError(e.message); }
  };

  if (error && !data) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><div className="spinner" /></div>;
  const u = data.user;

  return (
    <div className="page">
      <section className="profile-head">
        <div className="profile-cover" aria-hidden="true" />
        {data.isMe && (
          <div className="profile-tools">
            <Link className="icon-btn" to="/account" aria-label="Account e privacy"><Icon name="settings" /></Link>
            <button className="icon-btn" onClick={logout} aria-label="Esci"><Icon name="logout" /></button>
          </div>
        )}
        <button className="avatar-btn" disabled={!data.isMe} onClick={() => avatarInput.current?.click()} aria-label="Cambia foto">
          <Avatar user={u} size={88} />
        </button>
        <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        <h1>{u.displayName}</h1>
        <p className="muted">@{u.username}{u.role !== 'member' && <span className="pill">{u.isOwner ? 'Proprietario' : u.role === 'admin' ? 'Amministratore' : 'Moderatore'}</span>}</p>
        {u.isMentor && <MentorBadge big />}
        {u.bio && <p>{u.bio}</p>}
        {u.interests.length > 0 && <div className="tags">{u.interests.map((t) => <Link key={t} className="tag" to={`/tag/${encodeURIComponent(t.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, ''))}`}>#{t}</Link>)}</div>}
        {data.badges && data.badges.length > 0 && (
          <div className="badges" aria-label="Badge delle sfide">
            {data.badges.map((b) => (
              <span key={b.id} className="badge-chip" title={`Sfida completata il ${new Date(b.awardedAt).toLocaleDateString('it-IT')}`}>
                <i>{b.emoji}</i>{b.title}
              </span>
            ))}
          </div>
        )}
        <div className="stats">
          <span><b>{data.posts}</b>post</span><span><b>{data.followers}</b>follower</span><span><b>{data.following}</b>seguiti</span>
        </div>
        {data.isMe ? (
          <div className="row center-row">
            <button className="btn ghost" onClick={() => setEditing(!editing)}><Icon name="edit" size={18} /> Modifica</button>
            <Link className="btn ghost" to="/diario"><Icon name="trend" size={18} /> Il mio diario</Link>
            <Link className="btn" to="/inviti"><Icon name="gift" size={18} /> Porta un amico</Link>
          </div>
        ) : (
          <div className="row center-row">
            <button className={`btn ${data.isFollowing ? 'ghost' : ''}`} onClick={toggleFollow}>{data.isFollowing ? <><Icon name="check" size={18} /> Segui già</> : 'Segui'}</button>
            <ReportButton targetType="user" targetId={u.id} label="Segnala profilo" />
          </div>
        )}
        {!data.isMe && me?.role === 'admin' && !u.isOwner && (u.role !== 'admin' || me.canAppoint) && (
          <div className="card role-box">
            <small className="muted">Ruolo nella comunità</small>
            <div className="row">
              <button className={`btn small ${u.role === 'member' ? '' : 'ghost'}`} onClick={() => setRole('member')}>Membro</button>
              <button className={`btn small ${u.role === 'moderator' ? '' : 'ghost'}`} onClick={() => setRole('moderator')}>Moderatore</button>
              {me.canAppoint && <button className={`btn small ${u.role === 'admin' ? '' : 'ghost'}`} onClick={() => setRole('admin')}>Amministratore</button>}
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        )}
      </section>
      {editing && (
        <div className="card form">
          <label>Nome<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={50} /></label>
          <label>Chi sei e come fai trading<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={300} /></label>
          <label>Interessi (separati da virgola)<input value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="azioni, ETF, gestione del rischio" /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn" onClick={save}>Salva</button>
        </div>
      )}
      {posts.map((p) => <PostCard key={p.id} post={p} onDeleted={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />)}
      {posts.length === 0 && <p className="muted center">Ancora nessun post.</p>}
    </div>
  );
}
