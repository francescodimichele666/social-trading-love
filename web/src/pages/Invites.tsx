import { useEffect, useState } from 'react';
import { api } from '../api';

type Invite = { code: string; createdAt: string; usedAt: string | null; usedBy: { username: string; displayName: string } | null };

export default function Invites() {
  const [data, setData] = useState<{ invitesLeft: number; activeInvitees: number; invites: Invite[] } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = () => api('/invites').then(setData);
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api('/invites', { method: 'POST' }); load(); } catch (e: any) { setError(e.message); }
  };

  const share = async (code: string) => {
    const link = `${location.origin}/iscriviti?invito=${code}`;
    const text = `Ti invito nella comunità del trading responsabile. Il tuo codice: ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Social Trading Love', text, url: link });
      else { await navigator.clipboard.writeText(`${text}\n${link}`); setCopied(code); }
    } catch { /* condivisione annullata */ }
  };

  if (!data) return <div className="page"><div className="spinner" /></div>;
  return (
    <div className="page">
      <h1>I tuoi inviti</h1>
      <div className="card invite-hero">
        <div><b className="big-num">{data.invitesLeft}</b><span>inviti disponibili</span></div>
        <div><b className="big-num">{data.activeInvitees}</b><span>persone attive portate da te</span></div>
      </div>
      <p className="muted">Invita solo chi conosci e chi fa trading con la testa. Ogni volta che una persona che hai invitato partecipa davvero (pubblica o entra in una Piazza), ricevi un invito in più.</p>
      {error && <p className="error">{error}</p>}
      <button className="btn big wide" disabled={data.invitesLeft === 0} onClick={create}>Crea un codice invito</button>
      {data.invites.map((i) => (
        <div key={i.code} className="card invite">
          <code>{i.code}</code>
          {i.usedBy
            ? <span className="muted">Usato da {i.usedBy.displayName}</span>
            : <button className="btn small" onClick={() => share(i.code)}>{copied === i.code ? 'Copiato!' : 'Condividi'}</button>}
        </div>
      ))}
    </div>
  );
}
