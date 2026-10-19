// Modalità anteprima: un finto server in memoria, per provare l'app senza installare nulla.
// Si attiva solo con VITE_DEMO=1 (npm run build:demo). Niente viene salvato.

import demoVideo from './assets/demo-video.mp4';
import demoPoster from './assets/demo-video.jpg';

type U = { id: number; username: string; displayName: string; bio: string; interests: string[]; avatarUrl: string | null; role: 'member' | 'moderator' | 'admin'; isOwner?: boolean; canAppoint?: boolean };

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60000).toISOString();

const chart = (color: string, points: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="#0f1730"/>` +
    `<g stroke="#ffffff22">${[40, 80, 120, 160, 200].map((y) => `<line x1="0" x2="400" y1="${y}" y2="${y}"/>`).join('')}</g>` +
    `<polyline fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" points="${points}"/>` +
    `<line x1="0" x2="400" y1="150" y2="150" stroke="#fb7185" stroke-dasharray="6 6" stroke-width="2"/>` +
    `<text x="10" y="144" fill="#fb7185" font-family="sans-serif" font-size="13">stop loss</text></svg>`,
  );

const users: U[] = [
  { id: 1, username: 'francesco', displayName: 'Francesco', bio: 'Fondatore della comunità. Prima la gestione del rischio, poi tutto il resto.', interests: ['rischio', 'azioni', 'ETF'], avatarUrl: null, role: 'admin', isOwner: true, canAppoint: true },
  { id: 2, username: 'giulia', displayName: 'Giulia Rossi', bio: 'Swing trading su azioni europee. Diario delle mie operazioni, anche quelle andate male.', interests: ['azioni', 'diario'], avatarUrl: null, role: 'moderator' },
  { id: 3, username: 'marco', displayName: 'Marco Bianchi', bio: 'Imparo da 2 anni. Mai più di 1% a operazione.', interests: ['forex', 'psicologia'], avatarUrl: null, role: 'member' },
  { id: 4, username: 'sara', displayName: 'Sara Conti', bio: 'Investitrice di lungo periodo, ETF e pazienza.', interests: ['ETF', 'lungo periodo'], avatarUrl: null, role: 'member' },
];
const ME = 1;
// Messaggi privati dell'anteprima.
const dms = [
  { id: 1, from: 2, to: 1, body: 'Ciao Francesco! Stasera alla Live porto il mio diario di ottobre, ti va di commentarlo insieme?', at: ago(50), read: true },
  { id: 2, from: 1, to: 2, body: 'Volentieri! Portami anche il trade su STLAM, quello in cui sei uscita prima.', at: ago(45), read: true },
  { id: 3, from: 2, to: 1, body: 'Fatto, lo metto per primo 💪', at: ago(8), read: false },
  { id: 4, from: 3, to: 1, body: 'Grazie per il consiglio sullo stop: questa settimana l\'ho rispettato sempre.', at: ago(300), read: true },
];
const following = new Set([2, 3]);

let nextId = 100;
type DemoComment = { id: number; authorId: number; body: string; createdAt: string };
type DemoPost = { id: number; authorId: number; body: string; mediaUrl: string | null; mediaType: 'image' | 'video' | null; mediaPoster?: string; mediaDuration?: number; createdAt: string; likes: Set<number>; comments: DemoComment[]; flagged?: boolean; tradeId?: number };
type DemoRoom = { id: number; hostId: number; title: string; description: string; topic: string; status: 'scheduled' | 'live' | 'ended'; scheduledAt: string; startedAt: string | null; stage: number[]; hands: number[]; listeners: number; record?: boolean };
const posts: DemoPost[] = [
  { id: 6, authorId: 2, body: 'Dal mio diario: chiusa in guadagno, ma sono uscita prima dell\'obiettivo per paura. Voi lasciate lavorare il piano fino in fondo? #diario #psicologia', mediaUrl: null, mediaType: null, tradeId: 5, createdAt: ago(55), likes: new Set<number>([1, 3, 4]), comments: [{ id: 3, authorId: 3, body: 'Succede anche a me! Però +2 R resta un ottimo risultato.', createdAt: ago(40) }] },
  { id: 7, authorId: 3, body: 'In 60 secondi: come calcolo la size della posizione con l\'1% di rischio. Salvatevelo! #rischio #size', mediaUrl: demoVideo, mediaType: 'video' as const, mediaPoster: demoPoster, mediaDuration: 9, createdAt: ago(4), likes: new Set<number>([2]), comments: [] },
  { id: 5, authorId: 2, body: 'Primo video! Come decido lo stop loss prima di entrare, e perché non lo sposto mai. Ditemi come fate voi 👇 #stoploss', mediaUrl: demoVideo, mediaType: 'video' as const, mediaPoster: demoPoster, mediaDuration: 9, createdAt: ago(12), likes: new Set<number>([3, 4]), comments: [{ id: 2, authorId: 4, body: 'Chiarissimo, grazie Giulia!', createdAt: ago(6) }] },
  { id: 1, authorId: 2, body: 'Operazione chiusa in perdita (-0,8%). Ho rispettato lo stop loss senza spostarlo: per me oggi è una vittoria. Il grafico con il punto di uscita 👇 #stoploss #disciplina', mediaUrl: chart('#2dd4bf', '0,60 60,80 120,70 180,110 240,130 300,155 340,160'), mediaType: 'image' as const, createdAt: ago(35), likes: new Set<number>([1, 3]), comments: [{ id: 1, authorId: 3, body: 'Rispetto! Io lo spostavo sempre e perdevo il doppio.', createdAt: ago(20) }] },
  { id: 2, authorId: 3, body: 'Domanda per chi ha più esperienza: come gestite la voglia di "rifarvi" dopo una perdita? Stasera ne parliamo nella Live di @giulia? Intanto guardo $EURUSD #psicologia', mediaUrl: null, mediaType: null, createdAt: ago(80), likes: new Set([2]), comments: [] },
  { id: 3, authorId: 1, body: 'Benvenuti nella comunità! Regola numero uno: mai rischiare più dell\'1% del capitale su una singola operazione. Raccontate anche gli errori: è così che si impara.', mediaUrl: null, mediaType: null, createdAt: ago(300), likes: new Set([2, 3, 4]), comments: [] },
  { id: 4, authorId: 4, body: 'Piano di accumulo su ETF mondiale: 18 mesi, zero operazioni impulsive. Noioso? Sì. Funziona? Per me sì. #ETF #lungoperiodo', mediaUrl: chart('#a78bfa', '0,170 60,160 120,150 180,140 240,120 300,100 360,80 400,70'), mediaType: 'image' as const, createdAt: ago(600), likes: new Set([1]), comments: [] },
];

const rooms: DemoRoom[] = [
  { id: 1, hostId: 2, title: 'Gestire le perdite senza farsi male', description: 'Chiacchierata aperta: raccontiamo come reagiamo dopo una perdita. Alzate la mano per intervenire.', topic: 'psicologia', status: 'live' as const, scheduledAt: ago(25), startedAt: ago(25), stage: [2, 3], hands: [4], listeners: 14, record: true },
  { id: 2, hostId: 1, title: 'Come si calcola la size di una posizione', description: 'Esempi pratici con numeri veri: capitale, rischio per operazione, stop loss.', topic: 'rischio', status: 'scheduled' as const, scheduledAt: new Date(now + 26 * 3600000).toISOString(), startedAt: null, stage: [1], hands: [3], listeners: 0 },
];

rooms.push({ id: 3, hostId: 2, title: 'Il mio primo anno di trading: errori e lezioni', description: 'Giulia racconta cosa ha sbagliato e cosa rifarebbe.', topic: 'psicologia', status: 'ended', scheduledAt: ago(60 * 26), startedAt: ago(60 * 26), stage: [2], hands: [], listeners: 0, record: true });

const notifications = [
  { id: 1, kind: 'room_live', message: '@giulia è in diretta: Gestire le perdite senza farsi male', link: '/live/1', read: false, createdAt: ago(25) },
  { id: 2, kind: 'comment', message: '@giulia ha commentato il tuo post', link: '/post/3', read: false, createdAt: ago(90) },
  { id: 3, kind: 'invite_reward', message: 'Marco Bianchi è entrato nella comunità grazie a te.', link: '/inviti', read: true, createdAt: ago(2000) },
];

const friends = [
  { username: 'marco', displayName: 'Marco Bianchi', avatarUrl: null, active: true, joinedAt: ago(2000) },
  { username: 'sara', displayName: 'Sara Conti', avatarUrl: null, active: false, joinedAt: ago(300) },
];

const reports = [
  { id: 1, targetType: 'post', targetId: 99, reasonLabel: 'Frasi a rischio (automatico)', details: 'Segnalato in automatico: contiene frasi tipiche di promesse di guadagno o truffe', createdAt: ago(15), reporter: 'sistema automatico', target: { ownerId: 9, preview: 'Entra nel mio gruppo VIP: guadagno sicuro del 20% al mese! Scrivimi in privato.' } },
];

let mailSettings: any = null;
const legal = { controllerName: 'Francesco', contactEmail: 'privacy@esempio.it', city: '' };

const suspended = [
  { id: 9, username: 'guru_vip', displayName: 'Guru VIP', avatarUrl: null, role: 'member' as const, suspendedAt: ago(1500), reason: 'Chiedeva soldi in privato per un "gruppo VIP" con segnali garantiti.' },
];
// Iscrizioni finte degli ultimi 14 giorni, per il pannello amministratore.
const signupCounts = [2, 1, 3, 0, 4, 2, 5, 3, 6, 4, 7, 5, 9, 6];

// Diario: alcune operazioni di esempio. Il risultato in R si calcola come sul server vero.
type DemoTrade = { id: number; userId: number; symbol: string; market: string; direction: 'long' | 'short'; entryPrice: number; stopLoss: number; takeProfit: number | null; exitPrice: number | null; riskPercent: number; plan: string; lesson: string; emotion: string | null; followedPlan: boolean | null; movedStop: boolean | null; openedAt: string; closedAt: string | null };
const trades: DemoTrade[] = [
  { id: 1, userId: ME, symbol: 'ENI', market: 'azioni', direction: 'long', entryPrice: 14.2, stopLoss: 13.9, takeProfit: 14.95, exitPrice: null, riskPercent: 1, plan: 'Rimbalzo sul supporto di 14, esco se chiude sotto 13,90.', lesson: '', emotion: null, followedPlan: null, movedStop: null, openedAt: ago(200), closedAt: null },
  { id: 2, userId: ME, symbol: 'EURUSD', market: 'forex', direction: 'short', entryPrice: 1.0890, stopLoss: 1.0920, takeProfit: 1.0820, exitPrice: 1.0832, riskPercent: 1, plan: 'Rifiuto della resistenza, obiettivo il minimo della settimana.', lesson: "Ho aspettato la conferma invece di entrare d'impulso: entrata migliore.", emotion: 'calmo', followedPlan: true, movedStop: false, openedAt: ago(4000), closedAt: ago(2600) },
  { id: 3, userId: ME, symbol: 'NVDA', market: 'azioni', direction: 'long', entryPrice: 118, stopLoss: 114, takeProfit: 128, exitPrice: 114, riskPercent: 1.5, plan: 'Rottura del massimo con volumi.', lesson: 'Stop preso. Giusto così: il piano diceva di uscire lì.', emotion: 'concentrato', followedPlan: true, movedStop: false, openedAt: ago(9000), closedAt: ago(7000) },
  { id: 4, userId: ME, symbol: 'BTC', market: 'crypto', direction: 'long', entryPrice: 61000, stopLoss: 59500, takeProfit: null, exitPrice: 58200, riskPercent: 3, plan: 'Entrato dopo una notizia.', lesson: "Ho spostato lo stop \"per dargli respiro\" e ho perso quasi il doppio. Mai più sopra l'1%.", emotion: 'impulsivo', followedPlan: false, movedStop: true, openedAt: ago(15000), closedAt: ago(14000) },
  { id: 5, userId: 2, symbol: 'STLAM', market: 'azioni', direction: 'long', entryPrice: 12.4, stopLoss: 12.0, takeProfit: 13.4, exitPrice: 13.2, riskPercent: 1, plan: 'Doppio minimo su 12, stop sotto il secondo minimo.', lesson: "Sono uscita un po' prima dell'obiettivo per paura. Va bene lo stesso, ma la prossima volta lascio lavorare il piano.", emotion: 'ansioso', followedPlan: true, movedStop: false, openedAt: ago(3000), closedAt: ago(60) },
];
// Le operazioni salvate vanno sempre nel feed: anche quelle di esempio hanno il loro post.
for (const t of trades.filter((x) => x.userId === ME)) posts.push({ id: nextId++, authorId: ME, body: '', mediaUrl: null, mediaType: null, tradeId: t.id, createdAt: t.openedAt, likes: new Set([2]), comments: [] });
const round = (v: number) => Math.round(v * 100) / 100;
const serializeTrade = (t: DemoTrade) => {
  const risk = Math.abs(t.entryPrice - t.stopLoss);
  const r = t.exitPrice == null || !risk ? null : round((t.direction === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) / risk);
  return {
    ...t, rewardRisk: t.takeProfit != null ? round(Math.abs(t.takeProfit - t.entryPrice) / risk) : null,
    resultR: r, resultPercent: r == null ? null : round(r * t.riskPercent), status: t.exitPrice == null ? 'open' : 'closed',
  };
};
const journalStats = () => {
  const mine = trades.filter((t) => t.userId === ME).map(serializeTrade);
  const closed = mine.filter((t) => t.status === 'closed').sort((a, b) => b.closedAt!.localeCompare(a.closedAt!));
  const rs = closed.map((t) => t.resultR!).filter((r) => r != null);
  const pct = (k: 'followedPlan' | 'movedStop') => { const known = closed.filter((t) => t[k] != null); return known.length ? Math.round(known.filter((t) => t[k]).length / known.length * 100) : null; };
  let stopStreak = 0;
  for (const t of closed) { if (t.movedStop) break; stopStreak++; }
  return {
    closed: closed.length, open: mine.length - closed.length,
    winRate: rs.length ? Math.round(rs.filter((r) => r > 0).length / rs.length * 100) : null,
    avgR: rs.length ? round(rs.reduce((a, b) => a + b, 0) / rs.length) : null, totalR: round(rs.reduce((a, b) => a + b, 0)),
    avgRisk: closed.length ? round(closed.reduce((a, t) => a + t.riskPercent, 0) / closed.length) : null,
    overRisk: closed.filter((t) => t.riskPercent > 2).length, followedPlanPct: pct('followedPlan'), movedStopPct: pct('movedStop'), stopStreak,
  };
};

// Sfida della settimana: lunedì di questa settimana, in ora locale.
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = new Date(now); monday.setHours(12, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
const plusDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const TODAY = dayStr(new Date(now));
const PRESETS = [
  { key: 'stop', emoji: '🛑', title: 'Lo stop non si tocca', description: 'Per tutta la settimana lo stop loss si decide prima di entrare e non si sposta mai, nemmeno quando fa male.', rule: 'Oggi non ho spostato nessuno stop loss (o non ho fatto operazioni).' },
  { key: 'rischio1', emoji: '🎯', title: 'Massimo 1%', description: "Ogni operazione rischia al massimo l'1% del capitale. Calcola la size prima di entrare.", rule: "Oggi nessuna operazione ha rischiato più dell'1% del capitale." },
  { key: 'diario', emoji: '📓', title: 'Diario ogni giorno', description: "Scrivi nel diario ogni giorno: un'operazione, un'osservazione o un errore. Anche due righe bastano.", rule: 'Oggi ho scritto nel mio diario di trading.' },
  { key: 'vendetta', emoji: '🧘', title: 'Niente vendetta', description: 'Dopo una perdita si chiude per la giornata. Niente operazioni per "rifarsi".', rule: 'Oggi, dopo una perdita, non ho fatto operazioni per rifarmi.' },
  { key: 'piano', emoji: '🗺️', title: 'Prima il piano', description: "Prima di ogni operazione scrivi ingresso, stop loss e obiettivo. Se non c'è il piano, non si entra.", rule: 'Oggi ogni operazione aveva il piano scritto prima di entrare.' },
  { key: 'studio', emoji: '📚', title: '15 minuti di studio', description: "Ogni giorno 15 minuti per imparare: un capitolo di un libro, una lezione, l'analisi di un tuo errore.", rule: 'Oggi ho studiato almeno 15 minuti.' },
];
type DemoChallenge = { id: number; presetKey: string | null; title: string; description: string; rule: string; emoji: string; requiredDays: number; startsOn: string; endsOn: string; participants: number; completed: number; joined: boolean; checkins: { day: string; kept: boolean }[] };
const makeChallenge = (id: number, start: Date, p: (typeof PRESETS)[number], participants: number): DemoChallenge => ({
  id, presetKey: p.key, title: p.title, description: p.description, rule: p.rule, emoji: p.emoji, requiredDays: 5,
  startsOn: dayStr(start), endsOn: dayStr(plusDays(start, 6)), participants, completed: 0, joined: false, checkins: [],
});
const challenges = { current: makeChallenge(1, monday, PRESETS[0], 23), next: makeChallenge(2, plusDays(monday, 7), PRESETS[2], 0) };
// Nei giorni passati di questa settimana Francesco ha già risposto (oggi può prendere il badge).
challenges.current.joined = true;
challenges.current.checkins = [0, 1, 2, 3, 4, 5].map((i) => dayStr(plusDays(monday, i))).filter((d) => d < TODAY).map((day) => ({ day, kept: true }));
challenges.current.completed = 4;
const badges = [{ id: 1, userId: ME, title: 'Massimo 1%', emoji: '🎯', awardedAt: ago(60 * 24 * 9) }, { id: 2, userId: 2, title: 'Massimo 1%', emoji: '🎯', awardedAt: ago(60 * 24 * 9) }, { id: 3, userId: 2, title: 'Diario ogni giorno', emoji: '📓', awardedAt: ago(60 * 24 * 23) }];
const describeChallenge = (c: DemoChallenge) => ({
  id: c.id, presetKey: c.presetKey, title: c.title, description: c.description, rule: c.rule, emoji: c.emoji, requiredDays: c.requiredDays,
  startsOn: c.startsOn, endsOn: c.endsOn, today: TODAY, participants: c.participants, completed: c.completed,
  me: { joined: c.joined, checkins: c.checkins, keptDays: c.checkins.filter((x) => x.kept).length, badge: badges.some((b) => b.userId === ME && b.title === c.title && c.checkins.filter((x) => x.kept).length >= c.requiredDays) },
});

// Registrazioni: nell'anteprima usiamo il video di esempio.
const recordings = [
  { id: 1, roomId: 3, status: 'ready', url: demoVideo, duration: 2735, sizeBytes: 412000000, startedAt: ago(60 * 26), endedAt: ago(60 * 25), title: 'Il mio primo anno di trading: errori e lezioni', hostId: 2 },
  { id: 2, roomId: 4, status: 'ready', url: demoVideo, duration: 1820, sizeBytes: 260000000, startedAt: ago(60 * 24 * 4), endedAt: ago(60 * 24 * 4 - 30), title: 'ETF per chi inizia: domande e risposte', hostId: 4 },
];
const serializeRecording = (r: (typeof recordings)[number]) => {
  const h = user(r.hostId);
  return { ...r, host: { username: h.username, displayName: h.displayName, avatarUrl: h.avatarUrl } };
};

let myTwoFactor = false;
const demoUserExtra: Record<number, { lastLoginAt: string; emailVerified: boolean; twoFactor: boolean; history: any[] }> = {};
const adminUsers = () => [...users, { id: 9, username: 'guru_vip', displayName: 'Guru VIP', bio: '', interests: [], avatarUrl: null, role: 'member' as const }].map((u: any, i) => {
  const extra = demoUserExtra[u.id] ?? (demoUserExtra[u.id] = { lastLoginAt: ago(u.id * 37), emailVerified: u.id !== 4, twoFactor: u.id === 2, history: [] });
  const s = suspended.find((x) => x.id === u.id);
  return {
    id: u.id, username: u.username, displayName: u.displayName, email: `${u.username}@esempio.it`, avatarUrl: u.avatarUrl, role: u.role, isOwner: Boolean(u.isOwner),
    createdAt: ago(60 * 24 * (40 - i * 9)), lastLoginAt: u.id === ME ? new Date().toISOString() : extra.lastLoginAt,
    emailVerified: extra.emailVerified, twoFactor: u.id === ME ? myTwoFactor : extra.twoFactor,
    suspended: Boolean(s), suspendedAt: s?.suspendedAt ?? null, suspendReason: s?.reason ?? null,
    posts: posts.filter((p) => p.authorId === u.id).length, invitedBy: u.id === 3 ? 'francesco' : null, mentor: mentors.has(u.id),
  };
});

// Pannello di chi conduce: tutti gli altri utenti dell'anteprima sono "collegati".
const demoKicked = new Map<number, Set<number>>();
const demoBlocked = new Set<number>();
function demoLivePanel(r: DemoRoom, action: string, method: string, body: any) {
  if (r.hostId !== ME) throw new DemoError(403, 'Il pannello della Live è solo per chi la conduce');
  const kicked = demoKicked.get(r.id) ?? new Set<number>();
  demoKicked.set(r.id, kicked);
  const km = action.match(/^kick\/(\d+)$/);
  if (km) {
    const id = Number(km[1]);
    if (method === 'DELETE') { kicked.delete(id); demoBlocked.delete(id); }
    else {
      kicked.add(id);
      if (body?.block) demoBlocked.add(id);
      r.stage = r.stage.filter((x) => x !== id); r.hands = r.hands.filter((x) => x !== id);
    }
  }
  const present = users.filter((u) => u.id === ME || (!kicked.has(u.id) && !demoBlocked.has(u.id)));
  const role = (id: number) => (id === r.hostId ? 'host' : r.stage.includes(id) ? 'speaker' : 'audience');
  const order: Record<string, number> = { host: 0, speaker: 1, audience: 2 };
  const people = present
    .map((u) => ({ ...brief(u), role: role(u.id), handRaised: r.hands.includes(u.id), joinedAt: r.startedAt ?? new Date().toISOString() }))
    .sort((a, b) => order[a.role] - order[b.role] || Number(b.handRaised) - Number(a.handRaised));
  const seconds = r.startedAt ? Math.round((Date.now() - new Date(r.startedAt).getTime()) / 1000) : 0;
  return {
    stats: { listeners: people.length, peak: Math.max(people.length, 4), visitors: users.length - 1 + kicked.size, onStage: r.stage.length, hands: r.hands.length, seconds },
    people,
    kicked: [...kicked].filter((id) => !demoBlocked.has(id)).map((id) => ({ ...brief(user(id)), at: new Date().toISOString() })),
    blocked: [...demoBlocked].map((id) => ({ ...brief(user(id)), at: new Date().toISOString() })),
  };
}

const RULES = [
  'Qui si impara e ci si confronta: nessun consiglio di investimento personalizzato e nessun "segnale" da copiare.',
  'Niente promesse di guadagni sicuri, rendimenti garantiti o schemi per arricchirsi in fretta.',
  'Mostra anche le perdite: raccontare gli errori aiuta tutti a fare meglio.',
  'Nessuna raccolta di soldi, gestione di conti altrui o vendita di corsi e gruppi esterni.',
  'Rispetto per tutti: niente insulti, molestie, discriminazioni o contenuti illegali.',
  'Solo maggiorenni. Se vedi qualcosa che non va, usa il pulsante Segnala.',
];
const RED_FLAGS = ['guadagno sicuro', 'guadagni sicuri', 'garantit', 'senza rischi', 'gruppo vip', 'segnali vip', 'scrivimi in privato', 'diventa ricco'];

const user = (id: number) => users.find((u) => u.id === id)!;
const mentors = new Set<number>([2]);
const brief = (u: U) => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, isOwner: Boolean(u.isOwner), isMentor: mentors.has(u.id) });
const DEMO_TAG = /(?:^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{2,30})/gu;
const demoTags = (text: string) => [...new Set([...text.matchAll(DEMO_TAG)].map((x) => x[1].toLowerCase()))];
const visible = (p: DemoPost) => !p.flagged || p.authorId === ME;
const serializePost = (p: DemoPost) => ({
  id: p.id, body: p.body, mediaUrl: p.mediaUrl, mediaType: p.mediaType, mediaPoster: p.mediaPoster ?? null, mediaDuration: p.mediaDuration ?? null, inReview: Boolean(p.flagged), createdAt: p.createdAt,
  author: brief(user(p.authorId)), likes: p.likes.size, comments: p.comments.length, liked: p.likes.has(ME),
  fromFollowing: p.authorId === ME || following.has(p.authorId),
  trade: p.tradeId ? serializeTrade(trades.find((t) => t.id === p.tradeId)!) : null,
});
const serializeRoom = (r: DemoRoom) => ({
  id: r.id, title: r.title, description: r.description, topic: r.topic, status: r.status, scheduledAt: r.scheduledAt,
  startedAt: r.startedAt, host: brief(user(r.hostId)), listeners: r.listeners, record: Boolean(r.record),
});

class DemoError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const wait = () => new Promise((r) => setTimeout(r, 120));

export async function demoApi(path: string, method: string, body: any): Promise<any> {
  await wait();
  const [route, qs] = path.split('?');
  const params = new URLSearchParams(qs ?? '');
  const m = (re: RegExp) => route.match(re);
  let match: RegExpMatchArray | null;

  if (route === '/journal' && method === 'POST') {
    const num = (v: any) => (v == null || v === '' ? null : Number(v));
    const d = body;
    if (!d.symbol || num(d.entryPrice) == null || num(d.stopLoss) == null || !num(d.riskPercent)) throw new DemoError(400, 'Compila strumento, ingresso, stop loss e rischio');
    if (d.direction === 'long' && d.stopLoss >= d.entryPrice) throw new DemoError(400, 'In un acquisto (long) lo stop loss va sotto il prezzo di ingresso');
    if (d.direction === 'short' && d.stopLoss <= d.entryPrice) throw new DemoError(400, 'In una vendita (short) lo stop loss va sopra il prezzo di ingresso');
    const t: DemoTrade = { id: nextId++, userId: ME, symbol: String(d.symbol).toUpperCase(), market: d.market, direction: d.direction, entryPrice: d.entryPrice, stopLoss: d.stopLoss, takeProfit: num(d.takeProfit), exitPrice: num(d.exitPrice), riskPercent: d.riskPercent, plan: d.plan ?? '', lesson: d.lesson ?? '', emotion: d.emotion ?? null, followedPlan: d.followedPlan ?? null, movedStop: d.movedStop ?? null, openedAt: new Date().toISOString(), closedAt: d.exitPrice != null ? new Date().toISOString() : null };
    trades.unshift(t);
    const post: DemoPost = { id: nextId++, authorId: ME, body: '', mediaUrl: null, mediaType: null, tradeId: t.id, createdAt: new Date().toISOString(), likes: new Set(), comments: [] };
    posts.unshift(post);
    return { trade: { ...serializeTrade(t), postId: post.id }, postId: post.id, warning: d.riskPercent > 2 ? "Stai rischiando più del 2% del capitale: la regola della comunità consiglia di restare tra l'1% e il 2%." : null };
  }
  if (route === '/journal') {
    const mine = trades.filter((t) => t.userId === ME).map((t) => ({ ...serializeTrade(t), postId: posts.find((p) => p.tradeId === t.id)?.id ?? null }))
      .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || (b.closedAt ?? b.openedAt).localeCompare(a.closedAt ?? a.openedAt));
    return { trades: mine, stats: journalStats() };
  }
  if ((match = m(/^\/journal\/(\d+)(?:\/(close|share))?$/))) {
    const t = trades.find((x) => x.id === Number(match![1]) && x.userId === ME);
    if (!t) throw new DemoError(404, 'Operazione non trovata');
    if (match[2] === 'close') {
      Object.assign(t, { exitPrice: Number(body.exitPrice), lesson: body.lesson ?? '', emotion: body.emotion, followedPlan: body.followedPlan, movedStop: body.movedStop, closedAt: t.closedAt ?? new Date().toISOString() });
      return { trade: serializeTrade(t) };
    }
    if (match[2] === 'share') {
      const existing = posts.find((p) => p.tradeId === t.id);
      if (existing) { if (body.text) existing.body = String(body.text).trim(); return { postId: existing.id, inReview: false }; }
      const p: DemoPost = { id: nextId++, authorId: ME, body: String(body.text ?? '').trim(), mediaUrl: null, mediaType: null, tradeId: t.id, createdAt: new Date().toISOString(), likes: new Set(), comments: [] };
      posts.unshift(p);
      return { postId: p.id, inReview: false };
    }
    trades.splice(trades.indexOf(t), 1);
    for (let i = posts.length - 1; i >= 0; i--) if (posts[i].tradeId === t.id) posts.splice(i, 1);
    return { deleted: true };
  }
  if (route === '/challenges/current') return { challenge: describeChallenge(challenges.current) };
  if (route === '/challenges/current/join') { const c = challenges.current; if (!c.joined) { c.joined = true; c.participants++; } return { challenge: describeChallenge(c) }; }
  if (route === '/challenges/current/checkin') {
    const c = challenges.current;
    const before = describeChallenge(c).me.keptDays;
    c.checkins = [...c.checkins.filter((x) => x.day !== TODAY), { day: TODAY, kept: Boolean(body.kept) }].sort((a, b) => a.day.localeCompare(b.day));
    const kept = c.checkins.filter((x) => x.kept).length;
    const earned = before < c.requiredDays && kept >= c.requiredDays && !badges.some((b) => b.userId === ME && b.title === c.title);
    if (earned) { badges.unshift({ id: nextId++, userId: ME, title: c.title, emoji: c.emoji, awardedAt: new Date().toISOString() }); c.completed++; }
    return { challenge: describeChallenge(c), earned };
  }
  if (route === '/challenges/plan') return { presets: PRESETS, current: describeChallenge(challenges.current), next: describeChallenge(challenges.next) };
  if ((match = m(/^\/challenges\/(current|next)$/))) {
    const c = challenges[match[1] as 'current' | 'next'];
    if (c.participants > 0) throw new DemoError(400, `La sfida è già iniziata con ${c.participants} partecipanti: puoi cambiare quella della prossima settimana`);
    const p = body.presetKey ? PRESETS.find((x) => x.key === body.presetKey)! : { key: null, ...body };
    Object.assign(c, { presetKey: p.key, title: p.title, description: p.description, rule: p.rule, emoji: p.emoji, requiredDays: body.requiredDays ?? 5 });
    return { challenge: describeChallenge(c) };
  }
  if (route === '/rules') return { version: 'anteprima', rules: RULES };
  if (route === '/login' || route === '/register') return { token: 'demo', user: user(ME) };
  if (route === '/me' && method === 'PATCH') return { user: Object.assign(user(ME), body) };
  if (route === '/me') {
    const me = user(ME);
    return { user: { ...me, email: 'francesco@esempio.it' }, unreadNotifications: notifications.filter((n) => !n.read).length, unreadMessages: dms.filter((d) => d.to === ME && !d.read).length };
  }
  if (route === '/videos') {
    return { posts: posts.filter((p) => visible(p) && p.mediaType === 'video').map(serializePost), end: true, nextPage: null };
  }
  if (route === '/messages') {
    const others = [...new Set(dms.filter((d) => d.from === ME || d.to === ME).map((d) => (d.from === ME ? d.to : d.from)))];
    const conversations = others.map((o) => {
      const mine = dms.filter((d) => (d.from === ME && d.to === o) || (d.from === o && d.to === ME));
      const last = mine[mine.length - 1];
      return { with: brief(user(o)), unread: mine.filter((d) => d.to === ME && !d.read).length, last: { body: last.body, createdAt: last.at, mine: last.from === ME }, _id: last.id };
    }).sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
    return { conversations };
  }
  if ((match = m(/^\/messages\/([a-z0-9_]+)$/))) {
    const other = users.find((u) => u.username === match![1]);
    if (!other) throw new DemoError(404, 'Utente non trovato');
    if (method === 'POST') {
      const text = String(body?.body ?? '').trim();
      if (!text) throw new DemoError(400, 'Scrivi qualcosa');
      const d = { id: dms.length + 1, from: ME, to: other.id, body: text, at: new Date().toISOString(), read: false };
      dms.push(d);
      return { message: { id: d.id, body: d.body, createdAt: d.at, mine: true, read: false } };
    }
    const list = dms.filter((d) => (d.from === ME && d.to === other.id) || (d.from === other.id && d.to === ME));
    list.forEach((d) => { if (d.to === ME) d.read = true; });
    return { with: brief(other), messages: list.map((d) => ({ id: d.id, body: d.body, createdAt: d.at, mine: d.from === ME, read: d.read })), blockedByMe: false, canWrite: other.id !== ME };
  }
  if ((match = m(/^\/users\/[a-z0-9_]+\/block$/))) return { blocked: method === 'POST' };
  if (route === '/feed') {
    const list = posts.filter(visible).map(serializePost).sort((a, b) => Number(b.fromFollowing) - Number(a.fromFollowing) || b.createdAt.localeCompare(a.createdAt));
    return { posts: list, end: true, nextPage: null };
  }
  if (route === '/posts' && method === 'POST') {
    let text = '';
    let mediaUrl: string | null = null;
    let mediaType: 'image' | 'video' | null = null;
    if (body instanceof FormData) {
      text = String(body.get('body') ?? '');
      const file = body.get('file');
      if (file instanceof File) { mediaUrl = URL.createObjectURL(file); mediaType = file.type.startsWith('video') ? 'video' : 'image'; }
    } else text = body?.body ?? '';
    text = text.trim();
    if (!text && !mediaUrl) throw new DemoError(400, 'Scrivi qualcosa o aggiungi una foto o un video');
    const flagged = RED_FLAGS.some((f) => text.toLowerCase().includes(f));
    const p: any = { id: nextId++, authorId: ME, body: text, mediaUrl, mediaType, createdAt: new Date().toISOString(), likes: new Set(), comments: [], flagged };
    posts.unshift(p);
    return { post: serializePost(p), notice: flagged ? 'Il post contiene frasi che le regole considerano a rischio: lo vedi solo tu finché un moderatore non lo controlla.' : null };
  }
  if ((match = m(/^\/posts\/(\d+)\/like$/))) {
    const p = posts.find((x) => x.id === Number(match![1]))!;
    method === 'POST' ? p.likes.add(ME) : p.likes.delete(ME);
    return { liked: method === 'POST' };
  }
  if ((match = m(/^\/posts\/(\d+)\/comments$/))) {
    const p = posts.find((x) => x.id === Number(match![1]))!;
    const c = { id: nextId++, authorId: ME, body: String(body.body), createdAt: new Date().toISOString() };
    p.comments.push(c);
    return { comment: { ...c, inReview: false } };
  }
  if ((match = m(/^\/posts\/(\d+)$/))) {
    const idx = posts.findIndex((x) => x.id === Number(match![1]));
    if (idx < 0) throw new DemoError(404, 'Post non trovato');
    if (method === 'DELETE') { posts.splice(idx, 1); return { deleted: true }; }
    const p = posts[idx];
    return { post: serializePost(p), comments: p.comments.map((c) => ({ id: c.id, body: c.body, inReview: false, createdAt: c.createdAt, author: brief(user(c.authorId)) })) };
  }
  if ((match = m(/^\/comments\/(\d+)$/))) {
    for (const p of posts) p.comments = p.comments.filter((c) => c.id !== Number(match![1]));
    return { deleted: true };
  }
  if ((match = m(/^\/users\/([a-z0-9_]+)\/posts$/))) {
    const u = users.find((x) => x.username === match![1]);
    return { posts: posts.filter((p) => p.authorId === u?.id && visible(p)).map(serializePost), nextPage: null };
  }
  if ((match = m(/^\/users\/([a-z0-9_]+)\/connections$/))) {
    const u = users.find((x) => x.username === match![1]);
    if (!u) throw new DemoError(404, 'Utente non trovato');
    // Nell'anteprima tutti seguono Francesco; lui segue chi c'è in `following`.
    const follows = (a: number, b: number) => (a === ME ? following.has(b) : b === ME);
    const others = users.filter((x) => x.id !== u.id);
    const lists = {
      seguiti: others.filter((x) => follows(u.id, x.id)),
      follower: others.filter((x) => follows(x.id, u.id)),
      amici: others.filter((x) => follows(u.id, x.id) && follows(x.id, u.id)),
    };
    const tipo = (['amici', 'seguiti', 'follower'].includes(params.get('tipo') ?? '') ? params.get('tipo') : 'amici') as keyof typeof lists;
    return {
      tipo, counts: { amici: lists.amici.length, seguiti: lists.seguiti.length, follower: lists.follower.length },
      users: lists[tipo].map((x) => ({ ...x, isMentor: mentors.has(x.id), isFollowing: follows(ME, x.id), followsMe: follows(x.id, ME), isMe: x.id === ME })),
    };
  }
  if ((match = m(/^\/users\/([a-z0-9_]+)\/follow$/))) {
    const u = users.find((x) => x.username === match![1])!;
    method === 'POST' ? following.add(u.id) : following.delete(u.id);
    return { following: method === 'POST' };
  }
  if ((match = m(/^\/users\/([a-z0-9_]+)$/))) {
    const u = users.find((x) => x.username === match![1]);
    if (!u) throw new DemoError(404, 'Utente non trovato');
    const followers = u.id === ME ? users.length - 1 : following.has(u.id) ? 1 : 0;
    return { user: { ...u, isMentor: mentors.has(u.id) }, followers, following: u.id === ME ? following.size : 1, posts: posts.filter((p) => p.authorId === u.id).length, isFollowing: following.has(u.id), isMe: u.id === ME,
      badges: badges.filter((b) => b.userId === u.id).map(({ id, title, emoji, awardedAt }) => ({ id, title, emoji, awardedAt })) };
  }
  if (route === '/me/avatar') {
    const file = (body as FormData).get('file');
    if (file instanceof File) user(ME).avatarUrl = URL.createObjectURL(file);
    return { user: user(ME) };
  }
  if ((match = m(/^\/moderation\/users\/(\d+)\/role$/))) {
    const u = user(Number(match[1]));
    if (u.isOwner) throw new DemoError(403, 'Il ruolo del proprietario non si può cambiare');
    u.role = body.role;
    return { role: body.role };
  }
  if (route === '/invites') {
    const leaderboard = [[2, 4], [1, 2], [4, 1]].map(([id, active], i) => ({ rank: i + 1, ...brief(user(id)), active, isMe: id === ME }));
    return { code: 'K7PQ2MXA', joined: friends.length, active: friends.filter((f) => f.active).length, friends, leaderboard };
  }
  if (route === '/public/overview') {
    const up = rooms.filter((r) => r.status !== 'ended').sort((x, y) => Number(y.status === 'live') - Number(x.status === 'live'));
    return { members: 48, lives: 12, trades: 310, upcoming: up.map((r) => ({ id: r.id, title: r.title, topic: r.topic, live: r.status === 'live', scheduledAt: r.scheduledAt, host: brief(user(r.hostId)) })) };
  }
  if (route === '/mentors') return { users: users.filter((u) => mentors.has(u.id)).map((u) => ({ ...u, isMentor: true })) };
  if (route === '/hashtags/trending' || route === '/search') {
    const count = new Map<string, number>();
    posts.filter(visible).forEach((p) => demoTags(p.body).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    const all = [...count].map(([tag, n]) => ({ tag, posts: n })).sort((a, b) => b.posts - a.posts || a.tag.localeCompare(b.tag));
    if (route === '/hashtags/trending') return { tags: all };
    const raw = (params.get('q') ?? '').trim();
    const isTag = raw.startsWith('#');
    const q = raw.replace(/^[#@]/, '').toLowerCase();
    return {
      users: isTag ? [] : users.filter((u) => `${u.username} ${u.displayName}`.toLowerCase().includes(q)).map((u) => ({ ...u, isMentor: mentors.has(u.id) })),
      posts: posts.filter(visible).filter((p) => (isTag ? demoTags(p.body).includes(q) : p.body.toLowerCase().includes(q))).map(serializePost),
      tags: all.filter((t) => t.tag.startsWith(q)),
    };
  }
  if ((match = m(/^\/hashtags\/([^/]+)\/posts$/))) {
    const tag = decodeURIComponent(match[1]).toLowerCase();
    return { tag, posts: posts.filter(visible).filter((p) => demoTags(p.body).includes(tag)).map(serializePost), nextPage: null };
  }
  if (route === '/notifications/read') { notifications.forEach((n) => (n.read = true)); return { ok: true }; }
  if (route === '/notifications') return { notifications };
  if (route === '/report-reasons') {
    return { reasons: { consigli_personalizzati: 'Consigli di investimento personalizzati o segnali', promesse_guadagno: 'Promesse di guadagni sicuri', truffa: 'Possibile truffa o richiesta di soldi', molestie: 'Insulti o molestie', spam: 'Spam o pubblicità', contenuto_illegale: 'Contenuto illegale', minore: 'Possibile minorenne', altro: 'Altro' } };
  }
  if (route === '/reports') return { message: 'Grazie, la segnalazione è arrivata ai moderatori.' };
  if (route === '/moderation/reports') return { reports: params.get('status') && params.get('status') !== 'open' ? [] : reports };
  if ((match = m(/^\/moderation\/reports\/(\d+)\/decide$/))) {
    if (body.action !== 'dismiss' && String(body.statement ?? '').trim().length < 10) throw new DemoError(400, 'Dati non validi: statement: Scrivi una motivazione chiara (almeno 10 caratteri)');
    reports.splice(reports.findIndex((r) => r.id === Number(match![1])), 1);
    return { done: true };
  }
  // Account, privacy e impostazioni del proprietario (nell'anteprima non parte nessuna email).
  if (route === '/legal') return { termsVersion: '2026-10-16', ...legal };
  if (route === '/owner/settings' ) return { mail: mailSettings, legal };
  if (route === '/owner/settings/mail') {
    if (!body.password && !mailSettings) throw new DemoError(400, 'Inserisci la password della casella');
    mailSettings = { host: body.host, port: body.port, secure: body.secure, user: body.user, fromName: body.fromName, fromEmail: body.fromEmail, hasPassword: true };
    return { saved: true };
  }
  if (route === '/owner/settings/mail/test') return { message: "Nell'anteprima non parte nessuna email: sul tuo server arriverà a francesco@esempio.it." };
  if (route === '/owner/settings/legal') { Object.assign(legal, body); return { saved: true }; }
  if (route === '/password/forgot') return { message: "Se l'email è iscritta, ti abbiamo mandato un link per scegliere una nuova password. Controlla anche lo spam." };
  if (route === '/password/reset') return { message: 'Password cambiata. Ora puoi entrare con la nuova password.' };
  if (route === '/me/password') return { token: 'demo' };
  if (route === '/me/export') return { exportedAt: new Date().toISOString(), account: { ...user(ME), email: 'francesco@esempio.it' }, posts: posts.filter((p) => p.authorId === ME).map((p) => ({ id: p.id, body: p.body, createdAt: p.createdAt })) };
  if (route === '/me/delete') throw new DemoError(400, "Il proprietario non può eliminare il proprio account: è necessario per gestire la comunità");
  if (route.startsWith('/push/')) return { ok: true };
  if (route === '/admin/stats') {
    const signups = signupCounts.map((count, i) => ({ day: new Date(now - (13 - i) * 86400000).toISOString().slice(0, 10), count }));
    return {
      members: 57 + users.length, newMembers7d: signupCounts.slice(7).reduce((a, b) => a + b, 0), active7d: 34, suspended: suspended.length,
      staff: users.filter((u) => u.role !== 'member').length, posts: 180 + posts.length, posts7d: 41, videos: posts.filter((p) => p.mediaType === 'video').length + 6,
      comments: 412, liveRooms: rooms.filter((r) => r.status === 'live').length, rooms7d: 5, openReports: reports.length, signups,
      lastBackup: new Date(now - 5 * 3600000).toISOString(),
    };
  }
  if (route === '/admin/suspended') return { users: suspended };
  // Pannello utenti (nell'anteprima le azioni cambiano solo i dati in memoria).
  if (route === '/admin/users') {
    const q = (params.get('q') ?? '').toLowerCase();
    const filter = params.get('filter') ?? 'all';
    const all = adminUsers();
    const test: Record<string, (u: any) => boolean> = {
      all: () => true, staff: (u) => u.role !== 'member', suspended: (u) => u.suspended, unverified: (u) => !u.emailVerified,
      twofactor: (u) => u.twoFactor, mentor: (u) => u.mentor, new: (u) => Date.now() - +new Date(u.createdAt) < 7 * 86400000,
    };
    const counts = Object.fromEntries(Object.entries(test).map(([k, f]) => [k, all.filter(f).length]));
    const list = all.filter(test[filter]).filter((u) => !q || `${u.username} ${u.displayName} ${u.email}`.toLowerCase().includes(q));
    return { users: list, nextPage: null, counts };
  }
  if ((match = m(/^\/admin\/users\/(\d+)(?:\/(.+))?$/))) {
    const id = Number(match[1]);
    const u = adminUsers().find((x) => x.id === id);
    if (!u) throw new DemoError(404, 'Utente non trovato');
    const action = match[2];
    const extra = demoUserExtra[id] ?? (demoUserExtra[id] = { lastLoginAt: ago(id * 37), emailVerified: id !== 4, twoFactor: id === 2, history: [] });
    if (action === 'mentor') {
      if (body.mentor) mentors.add(id); else mentors.delete(id);
      extra.history.unshift({ action: body.mentor ? 'mentor' : 'unmentor', statement: body.mentor ? 'Badge Mentore assegnato' : 'Badge Mentore tolto', createdAt: new Date().toISOString(), by: 'francesco' });
      return { mentor: body.mentor };
    }
    if (action) {
      if (u.isOwner) throw new DemoError(403, 'Il proprietario non si può modificare da qui');
      const log = (a: string, st: string) => extra.history.unshift({ action: a, statement: st, createdAt: new Date().toISOString(), by: 'francesco' });
      if (['suspend', 'reinstate', 'reset-2fa'].includes(action) && String(body?.statement ?? '').trim().length < 10) throw new DemoError(400, 'Scrivi una motivazione chiara (almeno 10 caratteri)');
      if (action === 'suspend') { suspended.unshift({ id, username: u.username, displayName: u.displayName, avatarUrl: null, role: u.role, suspendedAt: new Date().toISOString(), reason: body.statement }); log('ban', body.statement); }
      if (action === 'reinstate') { const i = suspended.findIndex((x) => x.id === id); if (i >= 0) suspended.splice(i, 1); log('reinstate', body.statement); }
      if (action === 'reset-2fa') { extra.twoFactor = false; log('reset_2fa', body.statement); }
      if (action === 'verify-email') { extra.emailVerified = true; log('verify_email', 'Email confermata a mano da un amministratore'); }
      if (action === 'logout') { log('logout', 'Chiusi tutti gli accessi aperti'); return { done: true, message: `${u.displayName} dovrà rientrare con email e password su tutti i dispositivi.` }; }
      if (action === 'password-reset') return { done: true, message: `Nell'anteprima non parte nessuna email: sul server vero arriva a ${u.email}` };
      return { done: true };
    }
    return {
      user: { ...u, birthDate: '1985-01-01', comments: 3 * id, followers: 5 + id, invited: id === 1 ? 2 : 0, trades: trades.filter((t) => t.userId === id).length, rooms: rooms.filter((r) => r.hostId === id).length, reports: id === 9 ? 2 : 0 },
      history: extra.history,
      canManage: !u.isOwner,
    };
  }
  if (route === '/me/security') return { email: 'francesco@esempio.it', emailVerified: true, twoFactor: myTwoFactor, twoFactorSince: null, recoveryCodesLeft: myTwoFactor ? 10 : 0 };
  if (route === '/me/2fa/setup') return { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Love%20Trading%20Club%3Afrancesco%40esempio.it?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Love%20Trading%20Club' };
  if (route === '/me/2fa/enable') {
    if (!/^\d{6}$/.test(String(body.code).trim())) throw new DemoError(400, "Codice non corretto: controlla che l'ora del telefono sia giusta e riprova");
    myTwoFactor = true;
    return { recoveryCodes: ['k7pq-2mxa', 'h3vd-9wcz', 'r8nt-4eky', 'b2sf-7qjm', 'x5gu-3hpa', 'm9ce-6tdw', 'p4yr-8nkb', 'w6ja-2vxs', 'd3zm-5fqe', 't7kh-9rcu'] };
  }
  if (route === '/me/2fa/disable') { myTwoFactor = false; return { disabled: true }; }
  if (route === '/me/2fa/recovery-codes') return { recoveryCodes: ['n2wd-8kpe', 'f5ry-3mta', 'c9qh-6zvb', 'j4ex-7sgn', 'u8kb-2dwm', 'a3tp-5yhc', 'g6vn-9rqx', 'y2ms-4kfe', 'e7bz-8wja', 'q5dh-3nut'] };
  if ((match = m(/^\/admin\/users\/(\d+)\/reinstate$/))) {
    if (String(body.statement ?? '').trim().length < 10) throw new DemoError(400, 'Scrivi una motivazione chiara (almeno 10 caratteri)');
    suspended.splice(suspended.findIndex((u) => u.id === Number(match![1])), 1);
    return { reinstated: true };
  }
  if (route === '/admin/remove') {
    if (String(body.statement ?? '').trim().length < 10) throw new DemoError(400, 'Scrivi una motivazione chiara (almeno 10 caratteri)');
    if (body.targetType === 'post') { const i = posts.findIndex((p) => p.id === body.targetId); if (i >= 0) posts.splice(i, 1); }
    if (body.targetType === 'comment') posts.forEach((p) => { p.comments = p.comments.filter((c) => c.id !== body.targetId); });
    return { removed: true };
  }
  if (route === '/rooms' && method === 'POST') {
    const r = { record: Boolean(body.record), id: nextId++, hostId: ME, title: body.title, description: body.description ?? '', topic: body.topic ?? '', status: (body.startNow ? 'live' : 'scheduled') as any, scheduledAt: body.scheduledAt ?? new Date().toISOString(), startedAt: body.startNow ? new Date().toISOString() : null, stage: [ME], hands: [3], listeners: 1 };
    rooms.unshift(r);
    return { room: serializeRoom(r) };
  }
  if (route === '/rooms') return { rooms: rooms.filter((r) => r.status !== 'ended').map(serializeRoom), recordingsEnabled: true };
  if (route === '/recordings') return { recordings: recordings.map(serializeRecording) };
  if ((match = m(/^\/recordings\/(\d+)$/))) { recordings.splice(recordings.findIndex((r) => r.id === Number(match![1])), 1); return { deleted: true }; }
  if ((match = m(/^\/rooms\/(\d+)(?:\/(.+))?$/))) {
    const r = rooms.find((x) => x.id === Number(match![1]));
    if (!r) throw new DemoError(404, 'Live non trovata');
    const action = match[2] ?? '';
    const isHost = r.hostId === ME;
    if (action === 'start') { r.status = 'live'; r.startedAt = new Date().toISOString(); r.listeners = users.length; return { room: serializeRoom(r) }; }
    if (action === 'end') { (r as any).status = 'ended'; return { ended: true }; }
    if (action === 'join') {
      if (!isHost && !r.stage.includes(ME)) r.listeners++;
      return { livekitUrl: '', token: 'demo', role: isHost ? 'host' : r.stage.includes(ME) ? 'speaker' : 'audience' };
    }
    if (action === 'leave') return { left: true };
    if (action === 'hand') { method === 'POST' ? r.hands.push(ME) : (r.hands = r.hands.filter((h) => h !== ME)); return {}; }
    if (action === 'panel' || action.startsWith('kick/')) return demoLivePanel(r, action, method, body);
    if ((match = action.match(/^speakers\/(\d+)$/))) {
      const id = Number(match[1]);
      if (method === 'POST') {
        if (r.stage.length >= 6) throw new DemoError(400, 'Il palco è pieno (massimo 6 persone)');
        r.stage.push(id); r.hands = r.hands.filter((h) => h !== id);
      } else r.stage = r.stage.filter((s) => s !== id);
      return {};
    }
    const person = (id: number, role: string) => ({ ...brief(user(id)), role });
    const myRole = isHost ? 'host' : r.stage.includes(ME) ? 'speaker' : 'audience';
    return {
      room: serializeRoom(r),
      stage: r.stage.map((id) => person(id, id === r.hostId ? 'host' : 'speaker')),
      raisedHands: isHost ? r.hands.map((id) => person(id, 'audience')) : [],
      me: { role: myRole, handRaised: r.hands.includes(ME), isHost },
      maxOnStage: 6,
      recordings: r.status === 'ended' ? recordings.filter((x) => x.roomId === r.id).map(serializeRecording) : [],
    };
  }
  throw new DemoError(404, 'Non disponibile nell\'anteprima');
}
