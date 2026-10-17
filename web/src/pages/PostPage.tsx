import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, timeAgo, type Post } from '../api';
import PostCard from '../components/PostCard';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import MentorBadge from '../components/MentorBadge';
import Icon from '../components/Icon';
import ReportButton from '../components/ReportButton';
import RemoveButton from '../components/RemoveButton';
import { useAuth } from '../auth';

type Comment = { id: number; body: string; inReview: boolean; createdAt: string; author: { id: number; username: string; displayName: string; avatarUrl: string | null; isOwner?: boolean; isMentor?: boolean } };

export default function PostPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const published = (useLocation().state ?? {}) as { published?: boolean; inReview?: boolean };
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = () => api(`/posts/${id}`).then((d) => { setPost(d.post); setComments(d.comments); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/posts/${id}/comments`, { body: { body: text } });
      setText('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const remove = async (cid: number) => {
    await api(`/comments/${cid}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="page">
      <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
      {error && <p className="error">{error}</p>}
      {published.published && (
        <div className={`notice ${published.inReview ? '' : 'friendly'} published`}>
          <span>{published.inReview
            ? 'Post creato, ma il testo contiene frasi che le regole considerano a rischio: lo vedi solo tu finché un moderatore non lo controlla.'
            : <>✓ <b>Pubblicato nel feed.</b> Ecco come lo vedono gli altri.</>}</span>
          <Link className="btn small" to="/">Vai al feed</Link>
        </div>
      )}
      {post && <PostCard post={post} onDeleted={() => navigate('/')} />}
      <div className="comments">
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <Link to={`/u/${c.author.username}`}><Avatar user={c.author} size={30} /></Link>
            <div>
              <small><strong>{c.author.displayName}</strong>{c.author.isMentor && <MentorBadge />} · {timeAgo(c.createdAt)} {c.inReview && <span className="pill warn">In revisione</span>}</small>
              <RichText text={c.body} />
              {me?.id === c.author.id
                ? <button className="link-btn muted" onClick={() => remove(c.id)}>Elimina</button>
                : <span className="comment-tools">
                    <ReportButton targetType="comment" targetId={c.id} />
                    <RemoveButton targetType="comment" targetId={c.id} authorIsOwner={c.author.isOwner} onRemoved={load} />
                  </span>}
            </div>
          </div>
        ))}
      </div>
      {post && (
        <form className="comment-form" onSubmit={send}>
          <input placeholder="Scrivi un commento…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <button className="btn" disabled={!text.trim()}>Invia</button>
        </form>
      )}
    </div>
  );
}
