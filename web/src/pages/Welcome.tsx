import { Link } from 'react-router-dom';
import HeartChart from '../components/HeartChart';
import Icon from '../components/Icon';

const TICKER = ['Stop loss rispettato', 'Rischio 1% a operazione', 'Diario di trading', 'Piazza live alle 21', 'Nessun segnale da copiare', 'Anche le perdite si raccontano', 'Pazienza > fretta'];

export default function Welcome() {
  return (
    <div className="welcome">
      <div className="aurora" aria-hidden="true" />
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">{[...TICKER, ...TICKER].map((t, i) => <span key={i}><b>▲</b> {t}</span>)}</div>
      </div>
      <section className="hero">
        <HeartChart size={210} />
        <h1 className="brand xl"><em>Love</em> Trading Club</h1>
        <p className="lead">La comunità dove il trading si impara insieme, dal vivo, senza promesse facili.</p>
        <Link className="btn big" to="/iscriviti">Iscriviti gratis</Link>
        <Link className="btn ghost big" to="/entra">Ho già un account</Link>
      </section>
      <section className="feature-row">
        <article className="feature">
          <span className="create-ico coral"><Icon name="live" /></span>
          <h3>Piazze live</h3>
          <p>Fino a 6 persone sul palco. Chi ascolta alza la mano e sale a parlare.</p>
        </article>
        <article className="feature">
          <span className="create-ico teal"><Icon name="trend" /></span>
          <h3>Trading responsabile</h3>
          <p>Niente segnali da copiare né guadagni promessi. Si condividono metodo ed errori.</p>
        </article>
        <article className="feature">
          <span className="create-ico violet"><Icon name="check" /></span>
          <h3>Feed onesto</h3>
          <p>Prima chi segui, poi la comunità. Poi finisce: hai visto tutto per oggi.</p>
        </article>
      </section>
      <Link className="small-link" to="/regole">Leggi le regole della comunità</Link>
    </div>
  );
}
