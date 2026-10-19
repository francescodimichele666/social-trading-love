import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import HeartChart from '../components/HeartChart';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ message: string }>('/password/forgot', { body: { email } });
      setMsg(res.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <div className="aurora" aria-hidden="true" />
      <HeartChart size={96} />
      <h1 className="brand">Password dimenticata</h1>
      {msg ? (
        <p className="notice friendly">{msg}</p>
      ) : (
        <>
          <p className="muted center">Scrivi l'email con cui ti sei iscritto: ti mandiamo un link per sceglierne una nuova.</p>
          <label>Email<input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn big" disabled={busy}>{busy ? 'Invio…' : 'Mandami il link'}</button>
        </>
      )}
      <Link className="small-link" to="/entra">Torna all'accesso</Link>
    </form>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  // Toglie eventuali caratteri aggiunti dal programma di posta (punto finale, spazi, parentesi).
  const token = (params.get('token') ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== again) { setError('Le due password non sono uguali'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await api<{ message: string }>('/password/reset', { body: { token, password } });
      setMsg(res.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <div className="aurora" aria-hidden="true" />
      <HeartChart size={96} />
      <h1 className="brand">Nuova password</h1>
      {msg ? (
        <>
          <p className="notice friendly">{msg}</p>
          <Link className="btn big" to="/entra">Entra</Link>
        </>
      ) : (
        <>
          <label>Nuova password<input id="newPassword" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Almeno 8 caratteri" /></label>
          <label>Ripeti la password<input id="againPassword" type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn big" disabled={busy || !token}>{busy ? 'Salvo…' : 'Salva la nuova password'}</button>
          {!token && <p className="error">Il link è incompleto: aprilo direttamente dall'email.</p>}
        </>
      )}
    </form>
  );
}
