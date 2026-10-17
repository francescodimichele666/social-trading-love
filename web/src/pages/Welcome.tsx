import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Avatar from '../components/Avatar';
import HeartChart from '../components/HeartChart';
import Icon from '../components/Icon';

const TICKER = ['Stop loss rispettato', 'Rischio 1% a operazione', 'Diario di trading', 'Live alle 21', 'Nessun segnale da copiare', 'Anche le perdite si raccontano', 'Pazienza > fretta'];

type Overview = {
  members: number; lives: number; trades: number;
  upcoming: { id: number; title: string; topic: string; live: boolean; scheduledAt: string; host: { displayName: string; avatarUrl: string | null } }[];
};

const FEATURES = [
  { icon: 'live', color: 'coral', title: 'Live con il palco', text: 'Fino a 6 persone parlano in video, gli altri ascoltano e alzano la mano per intervenire. Chi conduce gestisce il palco.' },
  { icon: 'trend', color: 'teal', title: 'Diario di trading', text: 'Annoti ogni operazione con piano, stop loss e lezione imparata. Vedi i tuoi numeri veri, in multipli di rischio.' },
  { icon: 'calendar', color: 'gold', title: 'Sfida della settimana', text: 'Un piccolo impegno ogni settimana, come "lo stop non si tocca". Cinque giorni su sette e vinci il badge.' },
  { icon: 'mentor', color: 'violet', title: 'Mentori', text: 'I membri esperti hanno il badge Mentore: sai subito a chi chiedere un consiglio.' },
  { icon: 'check', color: 'teal', title: 'Feed onesto', text: 'Prima chi segui, poi la comunità. Poi finisce: niente scroll infinito, niente algoritmi che ti tengono incollato.' },
  { icon: 'shield', color: 'coral', title: 'Zero promesse', text: 'Vietati segnali a pagamento, "rendimenti garantiti" e guru. I post sospetti vengono controllati prima di essere visibili.' },
];

const STEPS = [
  { title: 'Ti iscrivi gratis', text: 'Bastano email e password. Niente carta di credito, niente abbonamenti.' },
  { title: 'Racconti come fai trading', text: 'Pubblichi operazioni, dubbi ed errori. Anche le perdite: sono quelle che insegnano di più.' },
  { title: 'Impari dal vivo', text: 'Entri nelle Live, fai domande, sali sul palco quando vuoi intervenire.' },
  { title: 'Cresci con metodo', text: 'Diario, sfide settimanali e Mentori ti aiutano a costruire disciplina, un giorno alla volta.' },
];

const FAQ = [
  { q: 'È davvero gratis?', a: "Sì, del tutto. Love Trading Club è un progetto senza scopo di lucro: niente abbonamenti, niente corsi da comprare, niente pubblicità." },
  { q: 'Date segnali o consigli su cosa comprare?', a: 'No, e non è permesso a nessuno. Qui si condividono metodo, gestione del rischio ed esperienze. Ogni decisione resta tua: nulla di quello che leggi è consulenza finanziaria.' },
  { q: 'Sono alle prime armi: è il posto giusto?', a: 'Sì. Molti iniziano proprio da qui: chiedi nelle Live, segui i Mentori e usa il diario per capire i tuoi errori senza rischiare di più.' },
  { q: 'Come proteggete i miei dati?', a: "I dati restano sul nostro server, non li vendiamo e non li diamo a nessuno. Puoi scaricarli o cancellare l'account quando vuoi, e attivare la verifica in due passaggi." },
  { q: 'Cosa succede se qualcuno promette guadagni facili?', a: 'Le frasi tipiche delle truffe vengono bloccate in automatico e controllate dai moderatori. Chi insiste viene sospeso. Ogni decisione viene motivata.' },
];

const when = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${day} alle ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
};

// Pagina di presentazione per chi non è ancora iscritto: è anche quella che vede chi apre un link condiviso.
export default function Welcome() {
  const [params] = useSearchParams();
  const invite = params.get('invito');
  const signup = invite ? `/iscriviti?invito=${encodeURIComponent(invite)}` : '/iscriviti';
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => { api<Overview>('/public/overview').then(setData).catch(() => {}); }, []);

  const Cta = ({ label = 'Iscriviti gratis' }: { label?: string }) => <Link className="btn big" to={signup}>{label}</Link>;

  return (
    <div className="landing">
      <div className="aurora" aria-hidden="true" />
      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">{[...TICKER, ...TICKER].map((t, i) => <span key={i}><b>▲</b> {t}</span>)}</div>
      </div>

      <nav className="landing-nav">
        <span className="brand small"><em>Love</em> Trading Club</span>
        <Link className="btn ghost small" to="/entra">Entra</Link>
      </nav>

      <section className="hero landing-hero">
        <HeartChart size={190} />
        <p className="eyebrow">Gratis · Senza scopo di lucro · Niente segnali</p>
        <h1 className="brand xl">Il trading si impara <em>insieme</em>, non da soli</h1>
        <p className="lead">La comunità italiana del trading responsabile: Live con chi ne sa di più, un diario per capire i tuoi errori e zero promesse di guadagno facile.</p>
        <div className="hero-ctas">
          <Cta />
          <Link className="btn ghost big" to="/entra">Ho già un account</Link>
        </div>
        {invite && <p className="notice friendly small">Ti ha invitato un amico: iscrivendoti da qui sarete già collegati.</p>}
        {data && data.members >= 20 && (
          <div className="proof">
            <span><b>{data.members}</b> iscritti</span>
            <span><b>{data.lives}</b> Live fatte</span>
            <span><b>{data.trades}</b> operazioni nei diari</span>
          </div>
        )}
      </section>

      {data && data.upcoming.length > 0 && (
        <section className="landing-section">
          <h2>Prossime Live</h2>
          <p className="muted">Entra, ascolta e alza la mano quando vuoi fare una domanda.</p>
          <div className="upcoming">
            {data.upcoming.map((r) => (
              <Link key={r.id} to={signup} className="upcoming-item">
                <Avatar user={r.host} size={44} />
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.host.displayName}{r.topic ? ` · #${r.topic}` : ''}</small>
                </span>
                {r.live ? <span className="pill live">IN DIRETTA</span> : <small className="when">{when(r.scheduledAt)}</small>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="landing-section">
        <h2>Cosa trovi dentro</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <span className={`create-ico ${f.color}`}><Icon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2>Come funziona</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title}><b>{i + 1}</b><span><strong>{s.title}</strong><small>{s.text}</small></span></li>
          ))}
        </ol>
        <Cta label="Inizia adesso, è gratis" />
      </section>

      <section className="landing-section manifesto">
        <h2>Le nostre regole, in breve</h2>
        <ul>
          <li><Icon name="check" size={18} /> Si parla di metodo e di rischio, non di quanto si guadagna.</li>
          <li><Icon name="check" size={18} /> Le perdite si raccontano: nessuno viene giudicato.</li>
          <li><Icon name="close" size={18} /> Vietati segnali, gruppi a pagamento, link sospetti e "rendimenti garantiti".</li>
          <li><Icon name="close" size={18} /> Niente consulenza finanziaria: ognuno decide con la propria testa.</li>
        </ul>
        <Link className="link-btn" to="/regole">Leggi tutte le regole</Link>
      </section>

      <section className="landing-section">
        <h2>Domande frequenti</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <HeartChart size={90} />
        <h2>Pronto a fare trading con la testa?</h2>
        <p className="muted">Iscriversi richiede un minuto. Puoi cancellarti quando vuoi.</p>
        <Cta />
      </section>

      <footer className="landing-footer">
        <p>Love Trading Club è un progetto senza scopo di lucro. I contenuti pubblicati dai membri non sono consulenza finanziaria: il trading comporta il rischio di perdere il capitale.</p>
        <p className="legal-links"><Link to="/regole">Regole</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/condizioni">Condizioni d'uso</Link></p>
      </footer>
    </div>
  );
}
