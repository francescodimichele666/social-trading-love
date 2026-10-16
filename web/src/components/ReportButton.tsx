import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';

type Target = 'post' | 'comment' | 'user' | 'room';

export default function ReportButton({ targetType, targetId, label = 'Segnala' }: { targetType: Target; targetId: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (open && !Object.keys(reasons).length) api('/report-reasons').then((d) => setReasons(d.reasons));
  }, [open, reasons]);

  const send = async () => {
    try {
      const res = await api('/reports', { body: { targetType, targetId, reason, details } });
      setMsg(res.message);
      setTimeout(() => { setOpen(false); setMsg(''); setReason(''); setDetails(''); }, 1800);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <>
      {label === 'Segnala'
        ? <button className="act subtle" onClick={() => setOpen(true)} aria-label="Segnala"><Icon name="flag" size={19} /></button>
        : <button className="link-btn muted" onClick={() => setOpen(true)}>{label}</button>}
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 className="sheet-title">Cosa non va?</h3>
            {Object.entries(reasons).map(([key, text]) => (
              <label key={key} className={`choice ${reason === key ? 'on' : ''}`}>
                <input type="radio" name="reason" value={key} checked={reason === key} onChange={() => setReason(key)} />
                {text}
              </label>
            ))}
            <textarea placeholder="Dettagli (facoltativo)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
            {msg && <p className="notice">{msg}</p>}
            <div className="row">
              <button className="btn ghost" onClick={() => setOpen(false)}>Annulla</button>
              <button className="btn" disabled={!reason} onClick={send}>Invia segnalazione</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
