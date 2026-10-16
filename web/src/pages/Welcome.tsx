import { Link } from 'react-router-dom';

export default function Welcome() {
  return (
    <div className="welcome">
      <div className="glow" />
      <h1 className="brand">Social Trading <span>Love</span></h1>
      <p className="lead">La comunità dove il trading si impara insieme, dal vivo, senza promesse facili.</p>
      <ul className="features">
        <li><b>Piazze live</b> Fino a 6 persone sul palco, il pubblico alza la mano e sale a parlare.</li>
        <li><b>Solo a invito</b> Entri grazie a qualcuno che ti conosce. Niente bot, niente truffatori.</li>
        <li><b>Feed onesto</b> Prima chi segui, poi la comunità. Poi finisce: hai visto tutto.</li>
      </ul>
      <Link className="btn big" to="/iscriviti">Ho un invito</Link>
      <Link className="btn ghost big" to="/entra">Ho già un account</Link>
      <Link className="small-link" to="/regole">Leggi le regole della comunità</Link>
    </div>
  );
}
