import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DEMO, timeAgo, type Post } from '../api';
import { useAuth } from '../auth';
import Avatar from './Avatar';
import Icon from './Icon';
import ReportButton from './ReportButton';
import VideoPlayer from './VideoPlayer';
import RemoveButton from './RemoveButton';

export default function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (id: number) => void }) {
  const { me } = useAuth();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [pop, setPop] = useState(false);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    if (next) { setPop(true); setTimeout(() => setPop(false), 450); }
    try {
      await api(`/posts/${post.id}/like`, { method: next ? 'POST' : 'DELETE' });
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };

  const remove = async () => {
    if (!confirm('Eliminare questo post?')) return;
    await api(`/posts/${post.id}`, { method: 'DELETE' });
    onDeleted?.(post.id);
  };

  const share = async () => {
    const url = DEMO ? `${location.origin}${location.pathname}#/post/${post.id}` : `${location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.author.displayName, text: post.body.slice(0, 120), url });
      else await navigator.clipboard.writeText(url);
    } catch { /* annullato */ }
  };

  return (
    <article className="post">
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="who">
          <Avatar user={post.author} size={42} />
          <span><strong>{post.author.displayName}</strong><small>@{post.author.username} · {timeAgo(post.createdAt)}</small></span>
        </Link>
        {post.inReview && <span className="pill warn">In revisione</span>}
      </header>
      {post.body && <p className="post-body">{post.body}</p>}
      {post.mediaUrl && post.mediaType === 'image' && <img className="media" src={post.mediaUrl} alt="" loading="lazy" onDoubleClick={() => !liked && toggleLike()} />}
      {post.mediaUrl && post.mediaType === 'video' && <VideoPlayer src={post.mediaUrl} poster={post.mediaPoster} duration={post.mediaDuration} />}
      <footer className="post-actions">
        <button className={`act ${liked ? 'on' : ''} ${pop ? 'pop' : ''}`} onClick={toggleLike} aria-pressed={liked} aria-label="Mi piace">
          <Icon name="heart" filled={liked} /> <span>{likes}</span>
        </button>
        <Link className="act" to={`/post/${post.id}`} aria-label="Commenti"><Icon name="comment" /> <span>{post.comments}</span></Link>
        <button className="act" onClick={share} aria-label="Condividi"><Icon name="share" /></button>
        <span className="spacer" />
        {me?.id === post.author.id
          ? <button className="act subtle" onClick={remove} aria-label="Elimina"><Icon name="trash" size={19} /></button>
          : <>
              <RemoveButton targetType="post" targetId={post.id} authorIsOwner={post.author.isOwner} onRemoved={() => onDeleted?.(post.id)} />
              <ReportButton targetType="post" targetId={post.id} />
            </>}
      </footer>
    </article>
  );
}
