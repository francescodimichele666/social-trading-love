import { useState, type FormEvent } from 'react';
import { api } from '../api';
import HeartChart from './HeartChart';

// Dopo email e password può servire un secondo passaggio:
// - "verify": il codice di 6 cifre arrivato via email (iscrizione o email non ancora confermata);
// - "2fa": il codice dell'app di autenticazione, oppure un codice di riserva.
export type AuthResult = { token?: string; verify?: boolean; twoFactor?: boolean; ticket?: string; email?: string };
export type Step = { kind: 'verify'; ticket: string; email: string } | { kind: '2fa'; ticket: string };

export function nextStep(res: AuthResult): Step | null {
  if (res.verify && res.ticket) return { kind: 'verify', ticket: res.ticket, email: res.email ?? '' };
  if (res.twoFactor && res.ticket) return { kind: '2fa', ticket: res.ticket };
  return null;
}

export function AuthStepForm({ step, onToken, onStep, onCancel }: { step: Step; onToken: (token: string) => Promise<void>; onStep: (s: Step) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<AuthResult>(step.kind === 'verify' ? '/verify-email' : '/login/2fa', { body: { ticket: step.ticket, code } });
      const next = nextStep(res);
      if (next) { setCode(''); onStep(next); } else if (res.token) await onToken(res.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      const res = await api('/verify-email/resend', { body: { ticket: step.ticket } });
      setInfo(res.message);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const isEmail = step.kind === 'verify';
  return (
    <form className="auth" onSubmit={submit}>
      <div className="aurora" aria-hidden="true" />
      <HeartChart size={80} />
      <h1 className="brand">{isEmail ? 'Controlla la tua email' : 'Verifica in due passaggi'}</h1>
      <p className="muted center">
        {isEmail
          ? <>Ti abbiamo mandato un codice di 6 cifre a <b>{step.email}</b>. Se non lo vedi, guarda nello spam.</>
          : useRecovery
            ? 'Scrivi uno dei codici di riserva che hai salvato quando hai attivato la verifica in due passaggi.'
            : "Apri l'app di autenticazione sul telefono e scrivi il codice di 6 cifre di Love Trading Club."}
      </p>
      <label>{isEmail ? 'Codice dalla email' : useRecovery ? 'Codice di riserva' : "Codice dell'app"}
        <input id="code" className="code-input" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
          inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={useRecovery ? 12 : 7}
          placeholder={useRecovery ? 'abcd-efgh' : '123456'} />
      </label>
      {info && <p className="notice friendly">{info}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy}>{busy ? 'Controllo…' : 'Conferma'}</button>
      {isEmail
        ? <button type="button" className="link-btn" onClick={resend}>Non è arrivato? Mandami un altro codice</button>
        : <button type="button" className="link-btn" onClick={() => { setUseRecovery(!useRecovery); setCode(''); }}>
            {useRecovery ? "Usa il codice dell'app" : 'Non ho il telefono: uso un codice di riserva'}
          </button>}
      <button type="button" className="link-btn muted" onClick={onCancel}>Torna indietro</button>
    </form>
  );
}
