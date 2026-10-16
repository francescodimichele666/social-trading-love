import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Rules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<string[]>([]);
  useEffect(() => { api('/rules').then((r) => setRules(r.rules)); }, []);
  return (
    <div className="page">
      <button className="link-btn" onClick={() => navigate(-1)}>← Indietro</button>
      <h1>Le regole della comunità</h1>
      <p className="muted">Siamo qui per imparare a fare trading in modo responsabile. Queste regole proteggono tutti.</p>
      <ol className="rules">{rules.map((r) => <li key={r}>{r}</li>)}</ol>
      <div className="card disclaimer">
        <strong>Avvertenza importante</strong>
        <p>I contenuti pubblicati sono opinioni personali e materiale di formazione, non consulenza finanziaria. Il trading comporta il rischio di perdere il capitale investito. Prima di investire valuta la tua situazione e, se serve, rivolgiti a un consulente abilitato.</p>
      </div>
    </div>
  );
}
