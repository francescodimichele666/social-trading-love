import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api';

type Report = {
  id: number; targetType: 'post' | 'comment' | 'user' | 'room'; targetId: number; reasonLabel: string; details: string; createdAt: string; reporter: string;
  target: { ownerId: number; preview: string; mediaUrl?: string; removed?: boolean; postId?: number } | null;
};
const TYPE = { post: 'Post', comment: 'Commento', user: 'Profilo', room: 'Piazza' };

function ReportItem({ r, onDone }: { r: Report; onDone: () => void }) {
  const [statement, setStatement] = useState('');
  const [error, setError] = useState('');
  const decide = async (action: 'remove' | 'ban' | 'dismiss') => {
    if (action === 'ban' && !confirm("Sospendere l'account di questa persona?")) return;
    try {
      await api(`/moderation/reports/${r.id}/decide`, { body: { action, statement: statement || (action === 'dismiss' ? 'Il contenuto rispetta le regole della comunità.' : '') } });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const link = r.targetType === 'post' ? `/post/${r.targetId}` : r.targetType === 'comment' && r.target?.postId ? `/post/${r.target.postId}` : r.targetType === 'room' ? `/piazze/${r.targetId}` : null;
  return (
    <div className="card report">
      <div className="room-top"><span className="pill warn">{TYPE[r.targetType]}</span><small className="muted">{r.reporter} · {timeAgo(r.createdAt)}</small></div>
      <strong>{r.reasonLabel}</strong>
      {r.details && <p className="muted">"{r.details}"</p>}
      <blockquote>{r.target?.preview || '(contenuto non più disponibile)'}</blockquote>
      {r.target?.mediaUrl && <img className="media small" src={r.target.mediaUrl} alt="" />}
      {link && <Link className="small-link" to={link}>Apri</Link>}
      <textarea placeholder="Motivazione che riceverà la persona (obbligatoria per rimuovere o sospendere)" value={statement} onChange={(e) => setStatement(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn ghost" onClick={() => decide('dismiss')}>Va bene così</button>
        {r.targetType !== 'user' && <button className="btn" onClick={() => decide('remove')}>Rimuovi</button>}
        <button className="btn danger" onClick={() => decide('ban')}>Sospendi account</button>
      </div>
    </div>
  );
}

export default function Moderation() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const load = () => api('/moderation/reports').then((d) => setReports(d.reports));
  useEffect(() => { load(); }, []);
  return (
    <div className="page">
      <h1>Moderazione</h1>
      <p className="muted">Ogni decisione arriva alla persona con la motivazione, come chiede la legge europea sui servizi digitali.</p>
      {reports?.length === 0 && <p className="muted center">Nessuna segnalazione aperta. 🎉</p>}
      {reports?.map((r) => <ReportItem key={r.id} r={r} onDone={load} />)}
    </div>
  );
}
