import { useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import Icon from './Icon';

const TV_URL = 'https://it.tradingview.com/chart/';

// Il tuo TradingView in diretta: apre il grafico (con il tuo account e i tuoi disegni) in un'altra scheda
// e poi lo mostra a tutti i presenti condividendo quella scheda. Il browser chiede sempre quale scheda condividere:
// è una protezione che nessun sito può saltare.
export default function ShareTradingView() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [step, setStep] = useState<'idle' | 'opened'>('idle');
  const [error, setError] = useState('');
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const open = () => {
    setError('');
    // Stesso nome di finestra: se TradingView è già aperto, riusa quella scheda.
    window.open(TV_URL, 'love-tradingview');
    setStep('opened');
  };

  const share = async () => {
    setError('');
    try {
      await localParticipant.setScreenShareEnabled(true, {
        audio: false, contentHint: 'detail', selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
        resolution: { width: 1920, height: 1080, frameRate: 15 },
      });
      setStep('idle');
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') setError('Non sono riuscito a condividere la scheda. Riprova, oppure usa Chrome o Edge dal computer.');
    }
  };

  const stop = () => localParticipant.setScreenShareEnabled(false).catch(() => {});

  if (!canShare) {
    return <p className="muted small tv-share-note">Per mostrare TradingView nella Live entra dal computer, con Chrome o Edge.</p>;
  }
  if (isScreenShareEnabled) {
    return (
      <div className="tv-share on">
        <span><b>● Tutti vedono il tuo TradingView</b><small>Quello che disegni lo vedono in diretta.</small></span>
        <button className="btn small danger" onClick={stop}>Smetti di condividere</button>
      </div>
    );
  }
  return (
    <div className="tv-share">
      {step === 'idle' ? (
        <>
          <button className="btn" onClick={open}><Icon name="trend" size={18} /> Condividi TradingView</button>
          <button className="linkish small" onClick={share}>TradingView è già aperto: mostralo</button>
        </>
      ) : (
        <>
          <p className="small">TradingView si è aperto in un'altra scheda. Torna qui, tocca <b>Mostra a tutti</b> e nella finestra che compare scegli <b>Scheda</b>, poi la scheda di TradingView e <b>Condividi</b>.</p>
          <div className="row">
            <button className="btn" onClick={share}>Mostra a tutti</button>
            <button className="btn ghost small" onClick={() => setStep('idle')}>Annulla</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
