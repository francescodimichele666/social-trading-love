import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';

type Mail = { host: string; port: number; secure: boolean; user: string; fromName: string; fromEmail: string; hasPassword?: boolean };
type Legal = { controllerName: string; contactEmail: string; city: string };

// Caselle più usate in Italia: si sceglie e i dati tecnici si compilano da soli.
const PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean; help: string }> = {
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true, help: 'Serve una "password per le app": su myaccount.google.com attiva la verifica in due passaggi, poi cerca "Password per le app", creane una e incollala qui (16 lettere).' },
  libero: { label: 'Libero', host: 'smtp.libero.it', port: 465, secure: true, help: 'Usa email e password di Libero Mail. Se non funziona, nelle impostazioni di Libero controlla che l\'accesso da programmi di posta sia attivo.' },
  aruba: { label: 'Aruba', host: 'smtps.aruba.it', port: 465, secure: true, help: 'Usa l\'indirizzo completo e la password della casella Aruba.' },
  altro: { label: 'Altro', host: '', port: 465, secure: true, help: 'Trovi questi dati nella guida del tuo fornitore di posta, alla voce "SMTP" o "posta in uscita".' },
};

function MailForm() {
  const [mail, setMail] = useState<Mail>({ host: '', port: 465, secure: true, user: '', fromName: 'Love Trading Club', fromEmail: '' });
  const [password, setPassword] = useState('');
  const [preset, setPreset] = useState('gmail');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ mail: Mail | null }>('/owner/settings').then(({ mail: m }) => {
      if (!m) { setMail((x) => ({ ...x, ...PRESETS.gmail })); return; }
      setMail(m);
      setPreset(Object.entries(PRESETS).find(([, p]) => p.host === m.host)?.[0] ?? 'altro');
    });
  }, []);

  const choose = (key: string) => {
    setPreset(key);
    const p = PRESETS[key];
    setMail({ ...mail, host: p.host || mail.host, port: p.port, secure: p.secure });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(''); setError('');
    try {
      await api('/owner/settings/mail', { method: 'PUT', body: { ...mail, password } });
      setPassword('');
      setMail({ ...mail, hasPassword: true });
      const res = await api<{ message: string }>('/owner/settings/mail/test', { method: 'POST' });
      setMsg(`Salvato. ${res.message}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={save}>
      <p className="muted small">Le email della comunità (per esempio il link per cambiare password) partono da questa casella. Puoi cambiarla quando vuoi.</p>
      <div className="chips">
        {Object.entries(PRESETS).map(([k, p]) => (
          <button type="button" key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => choose(k)}>{p.label}</button>
        ))}
      </div>
      <p className="hint">{PRESETS[preset].help}</p>
      <label>Indirizzo email della casella<input type="email" value={mail.user} onChange={(e) => setMail({ ...mail, user: e.target.value })} required placeholder="es. lovetradingclub@gmail.com" /></label>
      <label>Password {preset === 'gmail' && 'per le app'}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mail.hasPassword ? 'Già salvata: lascia vuoto per non cambiarla' : ''} required={!mail.hasPassword} autoComplete="new-password" />
      </label>
      <label>Nome del mittente<input value={mail.fromName} onChange={(e) => setMail({ ...mail, fromName: e.target.value })} /></label>
      {preset === 'altro' && (
        <div className="grid2">
          <label>Server SMTP<input value={mail.host} onChange={(e) => setMail({ ...mail, host: e.target.value })} required placeholder="smtp.esempio.it" /></label>
          <label>Porta<input type="number" value={mail.port} onChange={(e) => { const port = Number(e.target.value); setMail({ ...mail, port, secure: port === 465 }); }} required /></label>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {msg && <p className="notice friendly">{msg}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Salvo e provo…' : 'Salva e manda una email di prova'}</button>
      <p className="muted small">La password viene salvata cifrata sul tuo server e non viene mai mostrata.</p>
    </form>
  );
}

function LegalForm() {
  const [legal, setLegal] = useState<Legal>({ controllerName: '', contactEmail: '', city: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<{ legal: Legal }>('/owner/settings').then((d) => setLegal(d.legal)); }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await api('/owner/settings/legal', { method: 'PUT', body: legal });
      setMsg('Salvato: compare nell\'informativa privacy e nelle condizioni d\'uso.');
    } catch (err: any) {
      setError(err.message);
    }
  };
  return (
    <form className="card stack" onSubmit={save}>
      <p className="muted small">Per legge l'informativa privacy deve dire chi gestisce i dati e come contattarlo.</p>
      <label>Nome e cognome (o nome dell'associazione)<input value={legal.controllerName} onChange={(e) => setLegal({ ...legal, controllerName: e.target.value })} required /></label>
      <label>Email per la privacy<input type="email" value={legal.contactEmail} onChange={(e) => setLegal({ ...legal, contactEmail: e.target.value })} required /></label>
      <label>Città<input value={legal.city} onChange={(e) => setLegal({ ...legal, city: e.target.value })} /></label>
      {error && <p className="error">{error}</p>}
      {msg && <p className="notice friendly">{msg}</p>}
      <button className="btn">Salva</button>
      <Link className="small-link" to="/privacy">Vedi l'informativa privacy</Link>
    </form>
  );
}

export default function OwnerSettings() {
  const navigate = useNavigate();
  return (
    <div className="page account">
      <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro"><Icon name="back" /></button>
      <h1>Impostazioni del proprietario</h1>
      <p className="muted">Le vedi solo tu.</p>
      <h2 className="section-title">Email di invio</h2>
      <MailForm />
      <h2 className="section-title">Titolare per la privacy</h2>
      <LegalForm />
    </div>
  );
}
