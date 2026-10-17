import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from './Icon';

const WHAT = { post: 'questo post', comment: 'questo commento', room: 'questa Live' };

// Solo per amministratori: toglie subito un contenuto, con la motivazione che arriva all'autore.
export default function RemoveButton({ targetType, targetId, authorIsOwner, onRemoved }: {
  targetType: 'post' | 'comment' | 'room'; targetId: number; authorIsOwner?: boolean; onRemoved: () => void;
}) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (me?.role !== 'admin' || (authorIsOwner && !me.isOwner)) return null;

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/admin/remove', { body: { targetType, targetId, statement } });
      setOpen(false);
      onRemoved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="act subtle admin-remove" onClick={() => setOpen(true)} aria-label="Rimuovi subito"><Icon name="shield" size={19} /></button>
      {open && createPortal(
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 className="sheet-title">Rimuovi subito {WHAT[targetType]}</h3>
            <p className="muted">L'autore riceverà questa motivazione negli avvisi, come chiede la legge europea sui servizi digitali.</p>
            <textarea autoFocus placeholder="Es. Promessa di guadagno sicuro, vietata dalla regola 2." value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={1000} />
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn ghost" onClick={() => setOpen(false)}>Annulla</button>
              <button className="btn danger" disabled={busy || statement.trim().length < 10} onClick={remove}>{busy ? 'Rimuovo…' : 'Rimuovi'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
