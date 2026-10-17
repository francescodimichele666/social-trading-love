import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import HeartChart from '../components/HeartChart';
import { AuthStepForm, nextStep, type Step } from '../components/AuthSteps';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const friendCode = params.get('invito') ?? '';
  const [firstUser, setFirstUser] = useState(false);
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '', birthDate: '', acceptRules: false, acceptTerms: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => { api('/rules').then((r) => setFirstUser(Boolean(r.firstUser))).catch(() => {}); }, []);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/register', { body: { ...form, inviteCode: friendCode || undefined } });
      const next = nextStep(res);
      if (next) { setStep(next); return; }
      await login(res.token);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (step) {
    return <AuthStepForm step={step} onStep={setStep} onCancel={() => setStep(null)}
      onToken={async (token) => { await login(token); navigate('/', { replace: true }); }} />;
  }

  return (
    <form className="auth" onSubmit={submit}>
      <div className="aurora" aria-hidden="true" />
      <HeartChart size={96} />
      <h1 className="brand">Entra nella comunità</h1>
      <p className="muted center">È gratis e ci vuole un minuto.</p>
      {firstUser && <p className="notice">Sei il primo iscritto: diventerai il proprietario della comunità.</p>}
      {friendCode && !firstUser && <p className="notice friendly">Ti ha invitato un amico: vi ritroverete subito nella comunità.</p>}
      <label>Il tuo nome<input id="displayName" value={form.displayName} onChange={set('displayName')} required maxLength={50} autoComplete="name" /></label>
      <label>Nome utente<input id="username" value={form.username} onChange={set('username')} required pattern="[a-zA-Z0-9_]{3,20}" title="Da 3 a 20 caratteri: lettere, numeri, _" autoCapitalize="none" placeholder="es. mario_trader" /></label>
      <label>Email<input id="email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
      <label>Password<input id="newPassword" type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" placeholder="Almeno 8 caratteri" /></label>
      <label>Data di nascita<input id="birthDate" type="date" value={form.birthDate} onChange={set('birthDate')} required /></label>
      <label className="check">
        <input id="acceptRules" type="checkbox" checked={form.acceptRules} onChange={set('acceptRules')} required />
        <span>Ho almeno 18 anni e accetto le <Link to="/regole" target="_blank">regole della comunità</Link></span>
      </label>
      <label className="check">
        <input id="acceptTerms" type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} required />
        <span>Ho letto l'<Link to="/privacy" target="_blank">informativa privacy</Link> e accetto le <Link to="/condizioni" target="_blank">condizioni d'uso</Link></span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy}>Crea il mio account</button>
      <Link className="small-link" to="/entra">Hai già un account? Entra</Link>
    </form>
  );
}
