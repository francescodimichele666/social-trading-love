import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// Testo dei post e dei commenti: #hashtag e @persone diventano link.
const TOKEN = /(^|[^\p{L}\p{N}_])([#@])([\p{L}\p{N}_]{2,30})/gu;

export default function RichText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index! + m[1].length;
    parts.push(text.slice(last, start));
    const word = m[3];
    parts.push(m[2] === '#'
      ? <Link key={start} className="hashtag" to={`/tag/${encodeURIComponent(word.toLowerCase())}`}>#{word}</Link>
      : <Link key={start} className="hashtag" to={`/u/${encodeURIComponent(word.toLowerCase())}`}>@{word}</Link>);
    last = start + 1 + word.length;
  }
  parts.push(text.slice(last));
  return <p className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</p>;
}
