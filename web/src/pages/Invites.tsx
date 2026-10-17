import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { api, DEMO } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import MentorBadge from '../components/MentorBadge';

type Leader = { rank: number; username: string; displayName: string; avatarUrl: string | null; isMentor: boolean; active: number; isMe: boolean };
type Friend = { username: string; displayName: string; avatarUrl: string | null; active: boolean; joinedAt: string };

export default function Invites() {
  const [data, setData] = useState<{ code: string; joined: number; active: number; friends: Friend[]; leaderboard?: Leader[] } | null>(null);
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api('/invites').then(setData); }, []);
  if (!data) return <div className="page"><div className="spinner" /></div>;

  const link = DEMO ? `${location.origin}${location.pathname}#/iscriviti?invito=${data.code}` : `${location.origin}/iscriviti?invito=${data.code}`;
  const text = 'Ti aspetto nella comunità del trading responsabile: impariamo insieme, dal vivo, senza promesse facili.';
  const message = `${text}\n${link}`;
  const openQr = async () => {
    if (!qr) setQr(await QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#070b16', light: '#ffffff' } }));
    setShowQr(!showQr);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* niente appunti */ }
  };
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Love Trading Club', text, url: link }); return; }
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* annullato */ }
  };

  return (
    <div className="page">
      <header className="top">
        <Link className="icon-btn" to="/" aria-label="Indietro"><Icon name="back" /></Link>
        <h1 className="title">Porta un amico</h1>
        <span />
      </header>
      <section className="invite-hero">
        <div className="create-ico violet big"><Icon name="gift" size={30} /></div>
        <p>Chi si iscrive con il tuo link arriva già collegato a te. La comunità cresce con persone che fanno trading con la testa.</p>
        <div className="code-box"><small>Il tuo codice</small><code>{data.code}</code></div>
        <div className="share-grid">
          <a className="share-btn whatsapp" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="share-btn telegram" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Telegram</a>
          <button className="share-btn" onClick={copy}>{copied ? 'Copiato!' : 'Copia link'}</button>
          <button className="share-btn" onClick={openQr}>{showQr ? 'Chiudi QR' : 'Codice QR'}</button>
        </div>
        {showQr && qr && (
          <div className="invite-qr">
            <img className="qr" src={qr} alt="Codice QR con il tuo link di invito" width={200} height={200} />
            <small className="muted">Fallo inquadrare con la fotocamera del telefono: si apre l'iscrizione già collegata a te.</small>
          </div>
        )}
        {'share' in navigator && <button className="link-btn" onClick={share}><Icon name="share" size={16} /> Altre app</button>}
      </section>
      <div className="stat-pair">
        <div><b>{data.joined}</b><span>iscritti grazie a te</span></div>
        <div><b>{data.active}</b><span>già attivi</span></div>
      </div>
      {data.leaderboard && (
        <section className="leaderboard">
          <h2 className="section-title">Classifica del mese</h2>
          <p className="muted small">Conta gli amici iscritti questo mese che hanno già partecipato (un post o una Live).</p>
          {data.leaderboard.length === 0 && <p className="muted small">Ancora nessuno in classifica: il primo posto è libero!</p>}
          {data.leaderboard.map((l) => (
            <Link key={l.username} to={`/u/${l.username}`} className={`list-row leader ${l.isMe ? 'me' : ''}`}>
              <b className={`rank r${l.rank}`}>{l.rank <= 3 ? ['🥇', '🥈', '🥉'][l.rank - 1] : l.rank}</b>
              <Avatar user={l} size={36} />
              <span><strong>{l.displayName}{l.isMentor && <MentorBadge />}{l.isMe && ' (tu)'}</strong><small>@{l.username}</small></span>
              <span className="pill">{l.active} {l.active === 1 ? 'amico' : 'amici'}</span>
            </Link>
          ))}
        </section>
      )}
      {data.friends.length > 0 && <h2 className="section-title">I tuoi amici</h2>}
      {data.friends.map((f) => (
        <Link key={f.username} to={`/u/${f.username}`} className="list-row">
          <Avatar user={f} size={40} />
          <span><strong>{f.displayName}</strong><small>@{f.username}</small></span>
          <span className={`pill ${f.active ? '' : 'soft'}`}>{f.active ? 'Attivo' : 'Appena iscritto'}</span>
        </Link>
      ))}
    </div>
  );
}
