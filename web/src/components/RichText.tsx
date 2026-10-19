import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { giveTvConsent, snapshotImage, SNAPSHOT_RE, tvConsent } from '../tradingview';
import TvChart from './TvChart';
import Icon from './Icon';

// Testo dei post e dei commenti: #hashtag e @persone diventano link, $AAPL apre il grafico,
// i link ai grafici salvati su TradingView mostrano l'immagine.
const TOKEN = /(^|[^\p{L}\p{N}_$])(?:([#@])([\p{L}\p{N}_]{2,30})|\$([A-Za-z][A-Za-z0-9.!:_/-]{0,24}[A-Za-z0-9]|[A-Za-z]))/gu;

export default function RichText({ text, className }: { text: string; className?: string }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index! + m[1].length;
    parts.push(text.slice(last, start));
    if (m[4]) {
      const sym = m[4];
      parts.push(<button key={start} type="button" className="hashtag cashtag" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSymbol(sym); }}>${sym.toUpperCase()}</button>);
      last = start + 1 + sym.length;
      continue;
    }
    const word = m[3];
    parts.push(m[2] === '#'
      ? <Link key={start} className="hashtag" to={`/tag/${encodeURIComponent(word.toLowerCase())}`}>#{word}</Link>
      : <Link key={start} className="hashtag" to={`/u/${encodeURIComponent(word.toLowerCase())}`}>@{word}</Link>);
    last = start + 1 + word.length;
  }
  parts.push(text.slice(last));
  const snapshots = [...new Set([...text.matchAll(SNAPSHOT_RE)].map((m) => m[1]))].slice(0, 4);

  return (
    <>
      <p className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</p>
      {snapshots.map((id) => <Snapshot key={id} id={id} />)}
      {symbol && createPortal(
        <div className="sheet-backdrop" onClick={() => setSymbol(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <span />
              <h3 className="sheet-title">${symbol.toUpperCase()}</h3>
              <button className="icon-btn" onClick={() => setSymbol(null)} aria-label="Chiudi"><Icon name="close" /></button>
            </div>
            <TvChart symbol={symbol} auto height={420} />
            <p className="muted small">Solo a scopo informativo: non è un consiglio di investimento.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Un grafico salvato su TradingView: l'immagine si carica solo dopo il sì della persona.
function Snapshot({ id }: { id: string }) {
  const [show, setShow] = useState(tvConsent());
  const link = `https://www.tradingview.com/x/${id}/`;
  if (!show) {
    return (
      <button type="button" className="tv-open" onClick={(e) => { e.stopPropagation(); giveTvConsent(); setShow(true); }}>
        <Icon name="trend" size={18} /> Mostra il grafico condiviso
        <small>L'immagine arriva da TradingView</small>
      </button>
    );
  }
  return (
    <a className="tv-snapshot" href={link} target="_blank" rel="noopener nofollow noreferrer">
      <img src={snapshotImage(id)} alt="Grafico condiviso da TradingView" loading="lazy" />
      <small>Grafico su TradingView</small>
    </a>
  );
}
