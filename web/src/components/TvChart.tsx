import { useEffect, useRef, useState } from 'react';
import { giveTvConsent, tvConsent, tvSymbol } from '../tradingview';
import Icon from './Icon';

// Grafico TradingView di uno strumento. Si carica solo quando la persona tocca il pulsante
// (oppure subito se "auto" e ha già detto sì una volta): prima nessun dato va a TradingView.
export default function TvChart({ symbol, market, auto = false, height = 360 }: { symbol: string; market?: string; auto?: boolean; height?: number }) {
  const tv = tvSymbol(symbol, market);
  const [open, setOpen] = useState(auto && tvConsent());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (auto && tvConsent()) setOpen(true); }, [auto, tv]);

  useEffect(() => {
    const el = box.current;
    if (!open || !el || !tv) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      autosize: true, symbol: tv, interval: 'D', timezone: 'Europe/Rome', theme: 'dark', style: '1', locale: 'it',
      backgroundColor: '#0f1527', gridColor: 'rgba(160, 180, 255, 0.06)', allow_symbol_change: true,
      hide_side_toolbar: true, save_image: false, calendar: false, support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);
    return () => { el.innerHTML = ''; };
  }, [open, tv]);

  if (!tv) return null;
  if (!open) {
    return (
      <button type="button" className="tv-open" onClick={(e) => { e.stopPropagation(); giveTvConsent(); setOpen(true); }}>
        <Icon name="trend" size={18} /> Vedi il grafico di {symbol.replace(/^\$/, '').toUpperCase()}
        <small>Il grafico arriva da TradingView</small>
      </button>
    );
  }
  return (
    <div className="tv-chart">
      <div ref={box} className="tradingview-widget-container" style={{ height }} />
      <a className="tv-credit" href={`https://it.tradingview.com/symbols/${encodeURIComponent(tv.replace(':', '-'))}/`} target="_blank" rel="noopener nofollow noreferrer">
        Grafico di {tv} su TradingView
      </a>
    </div>
  );
}
