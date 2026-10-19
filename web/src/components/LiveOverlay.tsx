import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat, useDataChannel } from '@livekit/components-react';
import Icon from './Icon';

type Heart = { id: number; x: number; hue: number };
// Il tuo cuore compare subito sul tuo schermo, senza aspettare il giro dal server.
const MY_HEART = 'live-my-heart';

// Cuori che volano sul video e commenti che scorrono sopra, come nelle dirette di TikTok.
// Passano dal canale dati della Live: niente viene salvato sul server.
export function LiveOverlay({ showComments }: { showComments: boolean }) {
  const { chatMessages } = useChat();
  const [hearts, setHearts] = useState<Heart[]>([]);
  const seq = useRef(0);

  const spawn = useCallback(() => {
    const id = ++seq.current;
    setHearts((h) => [...h.slice(-30), { id, x: Math.random() * 40 - 20, hue: [345, 170, 255, 40][id % 4] }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 2600);
  }, []);
  useDataChannel('cuori', spawn);
  useEffect(() => {
    window.addEventListener(MY_HEART, spawn);
    return () => window.removeEventListener(MY_HEART, spawn);
  }, [spawn]);

  const recent = chatMessages.slice(-6);
  return (
    <div className="live-overlay" aria-live="polite">
      {showComments && (
        <ul className="live-comments">
          {recent.map((m) => (
            <li key={m.id ?? m.timestamp}><b>{m.from?.name || m.from?.identity || 'Ospite'}</b> {m.message}</li>
          ))}
        </ul>
      )}
      <div className="live-hearts" aria-hidden="true">
        {hearts.map((h) => (
          <span key={h.id} style={{ ['--dx' as any]: `${h.x}px`, color: `hsl(${h.hue} 95% 68%)` }}><Icon name="heart" size={28} filled /></span>
        ))}
      </div>
    </div>
  );
}

// La barra sotto il video: scrivi un commento o manda un cuore.
export function LiveComposer() {
  const { send, isSending } = useChat();
  const { send: sendData } = useDataChannel('cuori');
  const [text, setText] = useState('');
  const last = useRef(0);

  const heart = () => {
    const now = Date.now();
    if (now - last.current < 150) return;
    last.current = now;
    window.dispatchEvent(new Event(MY_HEART));
    sendData(new Uint8Array([1]), { reliable: false, topic: 'cuori' }).catch(() => {});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    await send(t.slice(0, 300)).catch(() => setText(t));
  };

  return (
    <form className="live-composer" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi un commento…" maxLength={300} aria-label="Commento" />
      <button type="submit" className="icon-btn" disabled={!text.trim() || isSending} aria-label="Invia commento"><Icon name="send" size={18} /></button>
      <button type="button" className="heart-btn" onClick={heart} aria-label="Manda un cuore"><Icon name="heart" size={24} filled /></button>
    </form>
  );
}
