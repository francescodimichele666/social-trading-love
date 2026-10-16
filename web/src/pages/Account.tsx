import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DEMO, setToken } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import PushCard from '../components/PushCard';

function ChangePassword() {
  const { login } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', password: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ token: string }>('/me/password', { body: form });
      await login(res.token);
      setForm({ current: '', password: '' });
      setOpen(false);
      setMsg('Password cambiata. Sugli altri dispositivi dovrai entrare di nuovo.');
    } catch (err: any) {
      setError(err.message);
    }
  };
  return (
    <div className="card account-item">
      <div className="row"><span><strong>Password</strong>{msg && <small className="ok">{msg}</small>}</span>
        {!open && <button className="btn ghost small" onClick={() => { setOpen(true); setMsg(''); }}>Cambia</button>}</div>
      {open && (
        <form className="stack" onSubmit={submit}>
          <input type="password" placeholder="Password attuale" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          <input type="password" placeholder="Nuova password (almeno 8 caratteri)" autoComplete="new-password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {error && <p className="error">{error}</p>}
          <div className="row"><button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Annulla</button><button className="btn small">Salva</button></div>
        </form>
      )}
    </div>
  );
}

function DeleteAccount() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  if (me?.isOwner) {
    return <div className="card account-item"><strong>Elimina il mio account</strong><small className="muted">Sei il proprietario: il tuo account serve per gestire la comunità e non si può eliminare.</small></div>;
  }
  const remove = async () => {
    setError('');
    try {
      await api('/me/delete', { body: { password } });
      setToken(null);
      logout();
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="card account-item danger-zone">
      <div className="row"><strong>Elimina il mio account</strong>{!open && <button className="btn danger small" onClick={() => setOpen(true)}>Elimina</button>}</div>
      {open && (
        <div className="stack">
          <small className="muted">Cancelliamo subito profilo, post, video, commenti e Piazze. Non si può tornare indietro.</small>
          <input type="password" placeholder="Scrivi la tua password per confermare" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <div className="row"><button className="btn ghost small" onClick={() => setOpen(false)}>Annulla</button><button className="btn danger small" disabled={!password} onClick={remove}>Elimina per sempre</button></div>
        </div>
      )}
    </div>
  );
}

export default function Account() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [exportMsg, setExportMsg] = useState('');

  const download = async () => {
    const data = await api('/me/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `love-trading-club-${me?.username}.json`;
    a.click();
    setExportMsg(DEMO ? 'Nell\'anteprima il file contiene dati di esempio.' : 'File scaricato: contiene tutto quello che ti riguarda.');
  };

  return (
    <div className="page account">
      <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
      <h1>Account e privacy</h1>
      <p className="muted">{me?.email}</p>

      {me?.isOwner && (
        <Link to="/impostazioni" className="card account-item link-card">
          <span className="create-ico gold"><Icon name="settings" size={20} /></span>
          <span><strong>Impostazioni del proprietario</strong><small>Email di invio e dati per la privacy</small></span>
          <Icon name="back" className="chev" size={18} />
        </Link>
      )}

      <h2 className="section-title">Notifiche</h2>
      <PushCard />

      <h2 className="section-title">Sicurezza</h2>
      <ChangePassword />

      <h2 className="section-title">I tuoi dati</h2>
      <div className="card account-item">
        <div className="row"><span><strong>Scarica i miei dati</strong><small className="muted">Un file con profilo, post, commenti, chi segui e altro.</small></span><button className="btn ghost small" onClick={download}>Scarica</button></div>
        {exportMsg && <small className="ok">{exportMsg}</small>}
      </div>
      <DeleteAccount />

      <p className="legal-links"><Link to="/privacy">Informativa privacy</Link> · <Link to="/condizioni">Condizioni d'uso</Link> · <Link to="/regole">Regole</Link></p>
    </div>
  );
}
