import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Post } from '../api';
import Icon from './Icon';

// I post nuovi arrivano al feed con un evento, così il feed si aggiorna da qualunque pagina.
export const POST_CREATED = 'stl:post-created';

function Composer({ onDone }: { onDone: () => void }) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const pick = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    setBusy(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('body', body);
      if (file) form.append('file', file);
      const res = await api<{ post: Post; notice: string | null }>('/posts', { form });
      window.dispatchEvent(new CustomEvent(POST_CREATED, { detail: res.post }));
      if (res.notice) { setMsg(res.notice); setBody(''); pick(null); return; }
      onDone();
      navigate('/');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer">
      <textarea autoFocus placeholder="Cosa hai imparato oggi? Un'operazione, un errore, una domanda…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
      {preview && (
        <div className="composer-media">
          {file?.type.startsWith('video') ? <video src={preview} muted playsInline /> : <img src={preview} alt="" />}
          <button className="icon-btn floating" onClick={() => pick(null)} aria-label="Togli allegato"><Icon name="close" size={18} /></button>
        </div>
      )}
      {msg && <p className="notice">{msg}</p>}
      <div className="composer-bar">
        <button className="chip-btn" onClick={() => fileInput.current?.click()}><Icon name="camera" size={18} /> Foto o video</button>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <span className="counter">{body.length}/2000</span>
        <button className="btn" disabled={busy || (!body.trim() && !file)} onClick={submit}>{busy ? 'Pubblico…' : 'Pubblica'}</button>
      </div>
    </div>
  );
}

export default function CreateSheet({ open, onClose, startWith = 'menu' }: { open: boolean; onClose: () => void; startWith?: 'menu' | 'post' }) {
  const [mode, setMode] = useState<'menu' | 'post'>(startWith);
  const navigate = useNavigate();
  if (!open) return null;
  const close = () => { setMode('menu'); onClose(); };
  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {mode === 'menu' ? (
          <>
            <h3 className="sheet-title">Crea</h3>
            <button className="create-option" onClick={() => setMode('post')}>
              <span className="create-ico teal"><Icon name="edit" /></span>
              <span><strong>Nuovo post</strong><small>Racconta un'operazione, un errore, una lezione</small></span>
            </button>
            <button className="create-option" onClick={() => { close(); navigate('/piazze?nuova=1'); }}>
              <span className="create-ico coral"><Icon name="live" /></span>
              <span><strong>Apri una Piazza</strong><small>Vai in diretta e fai salire chi vuole parlare</small></span>
            </button>
          </>
        ) : (
          <>
            <div className="sheet-head">
              <button className="icon-btn" onClick={() => setMode('menu')} aria-label="Indietro"><Icon name="back" /></button>
              <h3 className="sheet-title">Nuovo post</h3>
              <span />
            </div>
            <Composer onDone={close} />
          </>
        )}
      </div>
    </div>
  );
}
