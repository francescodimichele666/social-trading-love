import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [inviteRequired, setInviteRequired] = useState(true);
  const [form, setForm] = useState({
    inviteCode: params.get('invito') ?? '', displayName: '', username: '', email: '', password: '', birthDate: '', acceptRules: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/rules').then((r) => setInviteRequired(r.inviteRequired)).catch(() => {}); }, []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/register', { body: { ...form, inviteCode: form.inviteCode || undefined } });
      await login(res.token);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <h1 className="brand">Entra nella comunità</h1>
      {!inviteRequired && <p className="notice">Sei il primo iscritto: diventerai l'amministratore.</p>}
      {inviteRequired && <label>Codice invito<input value={form.inviteCode} onChange={set('inviteCode')} placeholder="es. K7PQ2MXA" required autoCapitalize="characters" /></label>}
      <label>Il tuo nome<input value={form.displayName} onChange={set('displayName')} required maxLength={50} /></label>
      <label>Nome utente<input value={form.username} onChange={set('username')} required pattern="[a-zA-Z0-9_]{3,20}" title="Da 3 a 20 caratteri: lettere, numeri, _" autoCapitalize="none" /></label>
      <label>Email<input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
      <label>Password<input type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></label>
      <label>Data di nascita<input type="date" value={form.birthDate} onChange={set('birthDate')} required /></label>
      <label className="check">
        <input type="checkbox" checked={form.acceptRules} onChange={set('acceptRules')} required />
        <span>Ho almeno 18 anni e accetto le <Link to="/regole" target="_blank">regole della comunità</Link></span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy}>Crea il mio account</button>
      <Link className="small-link" to="/entra">Hai già un account? Entra</Link>
    </form>
  );
}
