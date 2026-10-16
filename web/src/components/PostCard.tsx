import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo, type Post } from '../api';
import { useAuth } from '../auth';
import Avatar from './Avatar';
import ReportButton from './ReportButton';

export default function PostCard({ post, onDeleted }: { post: Post; onDeleted?: (id: number) => void }) {
  const { me } = useAuth();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
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

  return (
    <article className="card post">
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="who">
          <Avatar user={post.author} size={38} />
          <span><strong>{post.author.displayName}</strong><small>@{post.author.username} · {timeAgo(post.createdAt)}</small></span>
        </Link>
        {post.inReview && <span className="pill warn">In revisione</span>}
      </header>
      {post.body && <p className="post-body">{post.body}</p>}
      {post.mediaUrl && post.mediaType === 'image' && <img className="media" src={post.mediaUrl} alt="" loading="lazy" />}
      {post.mediaUrl && post.mediaType === 'video' && <video className="media" src={post.mediaUrl} controls playsInline preload="metadata" />}
      <footer className="post-actions">
        <button className={`act ${liked ? 'on' : ''}`} onClick={toggleLike} aria-pressed={liked}>{liked ? '♥' : '♡'} {likes}</button>
        <Link className="act" to={`/post/${post.id}`}>💬 {post.comments}</Link>
        <span className="spacer" />
        {me?.id === post.author.id
          ? <button className="link-btn muted" onClick={remove}>Elimina</button>
          : <ReportButton targetType="post" targetId={post.id} />}
      </footer>
    </article>
  );
}
