import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import HeartChart from '../components/HeartChart';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/login', { body: form });
      await login(res.token);
      navigate(params.get('dopo') ?? '/', { replace: true });
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
      <h1 className="brand">Bentornato</h1>
      <label>Email o nome utente<input id="login" autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required /></label>
      <label>Password<input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy}>Entra</button>
      <Link className="small-link" to="/password-dimenticata">Ho dimenticato la password</Link>
      <Link className="small-link" to="/iscriviti">Non hai un account? Iscriviti gratis</Link>
    </form>
  );
}
