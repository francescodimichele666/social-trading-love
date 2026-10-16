import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, DEMO } from '../api';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';

type Friend = { username: string; displayName: string; avatarUrl: string | null; active: boolean; joinedAt: string };

export default function Invites() {
  const [data, setData] = useState<{ code: string; joined: number; active: number; friends: Friend[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api('/invites').then(setData); }, []);
  if (!data) return <div className="page"><div className="spinner" /></div>;

  const link = DEMO ? `${location.origin}${location.pathname}#/iscriviti?invito=${data.code}` : `${location.origin}/iscriviti?invito=${data.code}`;
  const share = async () => {
    const text = 'Ti aspetto nella comunità del trading responsabile: impariamo insieme, dal vivo, senza promesse facili.';
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
        <button className="btn big" onClick={share}><Icon name="share" size={18} /> {copied ? 'Link copiato!' : 'Condividi il link'}</button>
      </section>
      <div className="stat-pair">
        <div><b>{data.joined}</b><span>iscritti grazie a te</span></div>
        <div><b>{data.active}</b><span>già attivi</span></div>
      </div>
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
