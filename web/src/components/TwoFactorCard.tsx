import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';

type Security = { email: string; emailVerified: boolean; twoFactor: boolean; twoFactorSince: string | null; recoveryCodesLeft: number };

// Verifica in due passaggi: oltre alla password serve il codice che cambia ogni 30 secondi nell'app del telefono.
export default function TwoFactorCard() {
  const [sec, setSec] = useState<Security | null>(null);
  const [mode, setMode] = useState<'' | 'password' | 'scan' | 'codes' | 'disable' | 'newcodes'>('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api<Security>('/me/security').then(setSec);
  useEffect(() => { load(); }, []);

  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try { await fn(); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const reset = () => { setMode(''); setPassword(''); setCode(''); setSetup(null); setError(''); };

  const start = run(async () => {
    const res = await api<{ secret: string; otpauthUrl: string }>('/me/2fa/setup', { body: { password } });
    const qr = await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 220, color: { dark: '#070b16', light: '#ffffff' } });
    setSetup({ ...res, qr });
    setPassword('');
    setMode('scan');
  });
  const enable = run(async () => {
    const res = await api<{ recoveryCodes: string[] }>('/me/2fa/enable', { body: { code } });
    setCodes(res.recoveryCodes);
    setCode('');
    setMode('codes');
    load();
  });
  const disable = run(async () => {
    await api('/me/2fa/disable', { body: { password, code } });
    reset();
    load();
  });
  const newCodes = run(async () => {
    const res = await api<{ recoveryCodes: string[] }>('/me/2fa/recovery-codes', { body: { password } });
    setCodes(res.recoveryCodes);
    setPassword('');
    setMode('codes');
    load();
  });

  const copyCodes = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); } catch { /* niente appunti */ } };

  if (!sec) return null;
  return (
    <div className="card account-item twofa">
      <div className="row">
        <span>
          <strong>Verifica in due passaggi</strong>
          <small className={sec.twoFactor ? 'ok' : 'muted'}>
            {sec.twoFactor ? `Attiva · ${sec.recoveryCodesLeft} codici di riserva rimasti` : "Oltre alla password, serve il codice dell'app sul telefono."}
          </small>
        </span>
        {!mode && (sec.twoFactor
          ? <button className="btn ghost small" onClick={() => setMode('disable')}>Disattiva</button>
          : <button className="btn small" onClick={() => setMode('password')}>Attiva</button>)}
      </div>

      {mode === 'password' && (
        <form className="stack" onSubmit={start}>
          <p className="muted small">Ti serve un'app di autenticazione gratuita sul telefono, per esempio <b>Google Authenticator</b> o <b>Microsoft Authenticator</b>. Scaricala, poi scrivi qui la tua password per continuare.</p>
          <input type="password" placeholder="La tua password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div className="row"><button type="button" className="btn ghost small" onClick={reset}>Annulla</button><button className="btn small" disabled={busy}>Continua</button></div>
        </form>
      )}

      {mode === 'scan' && setup && (
        <form className="stack" onSubmit={enable}>
          <p className="muted small"><b>1.</b> Nell'app tocca <b>+</b> e inquadra questo codice.</p>
          <img className="qr" src={setup.qr} alt="Codice QR da inquadrare con l'app di autenticazione" width={220} height={220} />
          <details className="muted small">
            <summary>Non riesci a inquadrarlo? Scrivi la chiave a mano</summary>
            <code className="secret">{setup.secret.match(/.{1,4}/g)!.join(' ')}</code>
          </details>
          <p className="muted small"><b>2.</b> Scrivi il codice di 6 cifre che compare nell'app.</p>
          <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div className="row"><button type="button" className="btn ghost small" onClick={reset}>Annulla</button><button className="btn small" disabled={busy}>Attiva</button></div>
        </form>
      )}

      {mode === 'codes' && (
        <div className="stack">
          <p className="notice friendly">Fatto! Ecco i tuoi <b>codici di riserva</b>. Servono se perdi o cambi telefono: ognuno vale una volta. Salvali ora (foto, carta o gestore password): non li vedrai più.</p>
          <div className="recovery-codes">{codes.map((c) => <code key={c}>{c}</code>)}</div>
          <div className="row"><button className="btn ghost small" onClick={copyCodes}>Copia</button><button className="btn small" onClick={reset}>Li ho salvati</button></div>
        </div>
      )}

      {mode === 'disable' && (
        <form className="stack" onSubmit={disable}>
          <p className="muted small">Per disattivarla servono la password e un codice dell'app (o un codice di riserva).</p>
          <input type="password" placeholder="La tua password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <input placeholder="Codice dell'app o di riserva" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="button" className="btn ghost small" onClick={reset}>Annulla</button>
            <button type="button" className="link-btn" onClick={() => { setMode('newcodes'); setCode(''); }}>Nuovi codici di riserva</button>
            <button className="btn danger small" disabled={busy}>Disattiva</button>
          </div>
        </form>
      )}

      {mode === 'newcodes' && (
        <form className="stack" onSubmit={newCodes}>
          <p className="muted small">I codici di riserva vecchi smetteranno di funzionare.</p>
          <input type="password" placeholder="La tua password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <div className="row"><button type="button" className="btn ghost small" onClick={reset}>Annulla</button><button className="btn small" disabled={busy}>Crea nuovi codici</button></div>
        </form>
      )}
    </div>
  );
}
