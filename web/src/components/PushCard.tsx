import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushEnabled, pushSupport } from '../push';
import Icon from './Icon';

// Attiva o disattiva le notifiche sul telefono per questo dispositivo.
export default function PushCard({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const support = pushSupport();

  useEffect(() => { pushEnabled().then(setOn).catch(() => setOn(false)); }, []);

  if (support === 'unsupported') {
    return compact ? null : <p className="muted small">Questo browser non supporta le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.</p>;
  }
  if (on === null) return null;
  if (compact && on) return null;

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (on) { await disablePush(); setOn(false); } else { await enablePush(); setOn(true); }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card push-card">
      <span className="create-ico coral"><Icon name="bell" size={20} /></span>
      <div>
        <strong>Notifiche sul telefono</strong>
        {support === 'ios-install'
          ? <small>Su iPhone funzionano dall'app installata: in Safari tocca Condividi e poi "Aggiungi alla schermata Home", poi apri l'app da lì.</small>
          : <small>{on ? 'Attive su questo dispositivo.' : 'Ti avvisiamo quando parte una Live o qualcuno ti risponde, anche ad app chiusa.'}</small>}
        {error && <small className="error">{error}</small>}
      </div>
      {support === 'ok' && (
        <button className={`btn small ${on ? 'ghost' : ''}`} disabled={busy} onClick={toggle}>{on ? 'Disattiva' : 'Attiva'}</button>
      )}
    </div>
  );
}
