// Grafici di TradingView: i widget gratuiti si caricano dai server di TradingView solo dopo un tocco della persona.
// Dopo il primo "sì" il browser se lo ricorda e i grafici si aprono subito.

const CONSENT_KEY = 'tv-consent';

export function tvConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}
export function giveTvConsent() {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* navigazione privata: chiederemo di nuovo */ }
}

// Nomi comuni (anche in italiano) che TradingView da solo non trova o confonde.
const ALIASES: Record<string, string> = {
  ORO: 'OANDA:XAUUSD', GOLD: 'OANDA:XAUUSD', XAUUSD: 'OANDA:XAUUSD',
  ARGENTO: 'OANDA:XAGUSD', SILVER: 'OANDA:XAGUSD', XAGUSD: 'OANDA:XAGUSD',
  PETROLIO: 'TVC:USOIL', WTI: 'TVC:USOIL', OIL: 'TVC:USOIL', USOIL: 'TVC:USOIL', BRENT: 'TVC:UKOIL', UKOIL: 'TVC:UKOIL',
  SP500: 'FOREXCOM:SPXUSD', 'S&P500': 'FOREXCOM:SPXUSD', SPX: 'FOREXCOM:SPXUSD', US500: 'FOREXCOM:SPXUSD',
  NASDAQ: 'FOREXCOM:NSXUSD', NDX: 'FOREXCOM:NSXUSD', NAS100: 'FOREXCOM:NSXUSD', US100: 'FOREXCOM:NSXUSD',
  DOW: 'FOREXCOM:DJI', DJI: 'FOREXCOM:DJI', US30: 'FOREXCOM:DJI',
  DAX: 'XETR:DAX', BTC: 'COINBASE:BTCUSD', BITCOIN: 'COINBASE:BTCUSD', ETH: 'COINBASE:ETHUSD', ETHEREUM: 'COINBASE:ETHUSD',
};

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'ZAR', 'MXN', 'CNH', 'HKD', 'SGD']);

// Dal simbolo scritto dalla persona (EUR/USD, oro, AAPL, MIL:ENI…) a quello che capisce TradingView.
export function tvSymbol(raw: string, market?: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '').replace(/^\$/, '');
  if (!s) return '';
  if (s.includes(':')) return s;
  const flat = s.replace(/\//g, '');
  if (ALIASES[flat]) return ALIASES[flat];
  if (/^[A-Z]{6}$/.test(flat) && CURRENCIES.has(flat.slice(0, 3)) && CURRENCIES.has(flat.slice(3))) return `FX:${flat}`;
  if (flat.endsWith('USDT')) return `BINANCE:${flat}`;
  if (market === 'crypto' && /^[A-Z0-9]{2,10}USD$/.test(flat)) return `COINBASE:${flat}`;
  if (market === 'crypto' && /^[A-Z0-9]{2,10}$/.test(flat)) return `COINBASE:${flat}USD`;
  return flat;
}

// Link a un grafico salvato su TradingView (tradingview.com/x/AbCd1234/) e la sua immagine.
export const SNAPSHOT_RE = /https?:\/\/(?:[a-z]{2,3}\.)?tradingview\.com\/x\/([A-Za-z0-9]{6,12})\/?/g;
export const snapshotImage = (id: string) => `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
