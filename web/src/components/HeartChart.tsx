// Il simbolo della comunità: un grafico a candele che disegna un cuore.
// Ogni candela va dal bordo basso al bordo alto del cuore in quella colonna.
const COLS = 17;

function heartColumns() {
  const cols: Array<{ top: number; bottom: number }> = Array.from({ length: COLS }, () => ({ top: Infinity, bottom: -Infinity }));
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const c = Math.min(COLS - 1, Math.max(0, Math.round(((x + 16) / 32) * (COLS - 1))));
    cols[c].top = Math.min(cols[c].top, y);
    cols[c].bottom = Math.max(cols[c].bottom, y);
  }
  return cols;
}

const COLUMNS = heartColumns();

export default function HeartChart({ size = 220 }: { size?: number }) {
  // Coordinate del cuore: x da -16 a 16, y da circa -12 a 17.
  const scale = 5.6;
  const w = COLS * 11;
  return (
    <svg className="heart-chart" width={size} height={size * 0.9} viewBox={`-6 -80 ${w + 12} 190`} role="img" aria-label="Grafico a candele a forma di cuore">
      {COLUMNS.map((c, i) => {
        const x = i * 11 + 4;
        const top = c.top * scale;
        const bottom = c.bottom * scale;
        const up = i % 3 !== 1;
        const bodyTop = top + (bottom - top) * 0.12;
        const bodyBottom = bottom - (bottom - top) * 0.12;
        return (
          <g key={i} className={`candle ${up ? 'up' : 'down'}`} style={{ animationDelay: `${i * 60}ms` }}>
            <line x1={x} x2={x} y1={top} y2={bottom} strokeWidth={1.6} />
            <rect x={x - 3.6} y={bodyTop} width={7.2} height={Math.max(2, bodyBottom - bodyTop)} rx={1.8} />
          </g>
        );
      })}
    </svg>
  );
}
