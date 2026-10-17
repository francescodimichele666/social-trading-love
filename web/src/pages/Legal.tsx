import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';

type LegalInfo = { termsVersion: string; controllerName: string; contactEmail: string; city: string };

function useLegal() {
  const [info, setInfo] = useState<LegalInfo | null>(null);
  useEffect(() => { api<LegalInfo>('/legal').then(setInfo).catch(() => setInfo(null)); }, []);
  return info;
}

function Page({ title, version, children }: { title: string; version?: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="page legal">
      <button className="icon-btn" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Indietro"><Icon name="back" /></button>
      <h1>{title}</h1>
      {version && <p className="muted small">Versione del {new Date(version).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
      {children}
    </div>
  );
}

function Controller({ info }: { info: LegalInfo | null }) {
  if (!info?.controllerName) return <>il proprietario della comunità (i suoi dati di contatto verranno pubblicati qui a breve)</>;
  return <><strong>{info.controllerName}</strong>{info.city && `, ${info.city}`}, che puoi contattare all'indirizzo <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a></>;
}

export function Privacy() {
  const info = useLegal();
  return (
    <Page title="Informativa privacy" version={info?.termsVersion}>
      <p>Love Trading Club è una comunità gratuita e senza scopo di lucro. Raccogliamo solo i dati che servono a farla funzionare. Non facciamo pubblicità, non profiliamo nessuno e non vendiamo dati.</p>

      <h2>Chi tratta i tuoi dati</h2>
      <p>Il titolare del trattamento è <Controller info={info} />.</p>

      <h2>Quali dati raccogliamo</h2>
      <ul>
        <li><strong>Account:</strong> email, nome utente, nome che mostri, data di nascita (per verificare che tu sia maggiorenne), password (salvata solo in forma cifrata, nessuno può leggerla).</li>
        <li><strong>Quello che pubblichi:</strong> post, foto, video, commenti, profilo, Live che crei, chi segui.</li>
        <li><strong>Live:</strong> audio e video passano in diretta tra i partecipanti. Di norma <strong>non vengono registrati</strong>. Solo se chi apre la Live sceglie "Registra", il server salva un video di chi è sul palco: lo vedi scritto prima di entrare e con la scritta REC durante la diretta. Chi ascolta soltanto non compare nel video. Chi ha condotto la Live o un amministratore può cancellare la registrazione in qualsiasi momento, e puoi chiedere tu di toglierla se ci sei dentro.</li>
        <li><strong>Diario di trading:</strong> le operazioni che segni (strumento, prezzi, rischio in percentuale, note). Ogni operazione che salvi viene pubblicata nel feed e la vedono tutti i membri (livelli, rischio in percentuale, piano e lezione). Le statistiche del diario le vedi solo tu. Se cancelli un'operazione sparisce anche il suo post. Non chiediamo importi in euro né dati del tuo conto.</li>
        <li><strong>Sfida della settimana:</strong> se partecipi, le tue risposte giornaliere e i badge che ottieni (i badge si vedono sul profilo).</li>
        <li><strong>Notifiche sul telefono:</strong> se le attivi, un codice del tuo dispositivo che serve solo a mandarti gli avvisi.</li>
        <li><strong>Sicurezza:</strong> segnalazioni, decisioni di moderazione e dati tecnici come l'indirizzo IP, usati per proteggere il servizio da abusi.</li>
      </ul>

      <h2>Perché li usiamo e su quale base</h2>
      <ul>
        <li>Per darti il servizio che hai chiesto iscrivendoti: account, feed, Live, avvisi (esecuzione del contratto, art. 6.1.b GDPR).</li>
        <li>Per la sicurezza, la moderazione e per rispettare la legge europea sui servizi digitali (obbligo di legge e legittimo interesse, art. 6.1.c e 6.1.f).</li>
        <li>Per le notifiche sul telefono: solo con il tuo consenso, che puoi togliere quando vuoi dal profilo (art. 6.1.a).</li>
        <li>Per mandarti le email del servizio, per esempio il link per cambiare password. Niente newsletter né pubblicità.</li>
      </ul>

      <h2>Dove sono i dati e chi li vede</h2>
      <p>I dati sono salvati sul server del titolare, in Italia. Quello che pubblichi lo vedono gli altri membri della comunità. Moderatori e amministratori vedono le segnalazioni per poter decidere.</p>
      <p>Per funzionare usiamo solo due passaggi esterni. Le email partono dalla casella di posta del titolare, attraverso il suo fornitore di posta. Le notifiche sul telefono passano dal servizio di notifiche del tuo telefono o browser (Apple, Google o Mozilla), che riceve un messaggio cifrato.</p>

      <h2>Per quanto tempo</h2>
      <p>Finché il tuo account è attivo. Se lo elimini, i tuoi contenuti e i tuoi dati personali vengono cancellati subito. Le copie di sicurezza si cancellano da sole entro 14 giorni. Resta solo un registro anonimo delle decisioni di moderazione già prese, per gestire eventuali contestazioni.</p>

      <h2>I tuoi diritti</h2>
      <p>Puoi chiedere in qualsiasi momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso, opporti al trattamento e ricevere una copia. Due cose le fai da solo dal tuo profilo:</p>
      <ul>
        <li><strong>Scarica i miei dati:</strong> ricevi un file con tutto quello che ti riguarda.</li>
        <li><strong>Elimina il mio account:</strong> la cancellazione è immediata.</li>
      </ul>
      <p>Per tutto il resto scrivi al titolare. Se pensi che i tuoi dati siano trattati male, puoi presentare reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">garanteprivacy.it</a>).</p>

      <h2>Maggiorenni</h2>
      <p>La comunità è riservata a chi ha almeno 18 anni. Se scopriamo un account di un minorenne, lo chiudiamo.</p>

      <h2>Cookie</h2>
      <p>Non usiamo cookie di profilazione o di terze parti. Il sito salva nel tuo browser solo il codice che ti tiene collegato, che è indispensabile al funzionamento: per questo non ti chiediamo il consenso ai cookie.</p>

      <p className="muted small">Vedi anche le <Link to="/condizioni">condizioni d'uso</Link> e le <Link to="/regole">regole della comunità</Link>.</p>
    </Page>
  );
}

export function Terms() {
  const info = useLegal();
  return (
    <Page title="Condizioni d'uso" version={info?.termsVersion}>
      <h2>1. Il servizio</h2>
      <p>Love Trading Club è una comunità online gratuita e senza scopo di lucro, gestita da <Controller info={info} />. Serve a imparare il trading insieme, in modo responsabile, con post, video e Live dal vivo.</p>

      <h2>2. Chi può iscriversi</h2>
      <p>Chi ha almeno 18 anni. Usa dati veri, un solo account a persona, e tieni segreta la tua password: sei responsabile di ciò che succede con il tuo account.</p>

      <h2>3. Niente consulenza finanziaria</h2>
      <p>Tutto quello che si trova nella comunità ha solo scopo di confronto ed educazione. <strong>Non è consulenza finanziaria</strong> né una raccomandazione a comprare o vendere strumenti finanziari. Il trading comporta il rischio di perdere anche tutto il capitale investito: le tue decisioni sono solo tue. Nessuno nella comunità è autorizzato a gestire i tuoi soldi o a chiederti denaro.</p>

      <h2>4. Le regole</h2>
      <p>Iscrivendoti accetti le <Link to="/regole">regole della comunità</Link>: niente segnali da copiare, niente promesse di guadagno, niente richieste di soldi, rispetto per tutti.</p>

      <h2>5. I tuoi contenuti</h2>
      <p>Quello che pubblichi resta tuo. Ci dai il permesso, gratuito e non esclusivo, di mostrarlo agli altri membri finché non lo cancelli. Pubblica solo contenuti di cui hai i diritti e non riprendere o registrare altre persone nelle Live senza il loro consenso. Se apri una Live con la registrazione attiva, ti impegni a usarla solo dentro la comunità: chi sale sul palco accetta di comparire nel video, che resta visibile ai membri finché tu o un amministratore non lo cancellate.</p>

      <h2>6. Moderazione e contestazioni</h2>
      <p>Chiunque può segnalare un contenuto. Moderatori e amministratori possono rimuovere contenuti o sospendere account che violano le regole o la legge. Ogni decisione ti arriva negli avvisi con la motivazione. Se non sei d'accordo puoi contestarla scrivendo al titolare: la decisione verrà riesaminata da una persona.</p>

      <h2>7. Disponibilità</h2>
      <p>Facciamo del nostro meglio perché il servizio funzioni sempre, ma essendo un progetto senza scopo di lucro può avere interruzioni o cambiare. Nei limiti consentiti dalla legge, non rispondiamo di danni derivanti dall'uso della comunità o da decisioni prese sulla base dei contenuti pubblicati dagli altri.</p>

      <h2>8. Lasciare la comunità</h2>
      <p>Puoi eliminare il tuo account quando vuoi dal profilo. Possiamo chiudere un account che viola in modo grave o ripetuto queste condizioni.</p>

      <h2>9. Modifiche</h2>
      <p>Se cambiamo queste condizioni te lo diremo nell'app prima che entrino in vigore.</p>

      <h2>10. Legge applicabile</h2>
      <p>Valgono la legge italiana e i diritti che ti riconosce il Codice del Consumo.</p>

      <p className="muted small">Vedi anche l'<Link to="/privacy">informativa privacy</Link>.</p>
    </Page>
  );
}
