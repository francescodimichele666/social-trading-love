// Modalità anteprima: un finto server in memoria, per provare l'app senza installare nulla.
// Si attiva solo con VITE_DEMO=1 (npm run build:demo). Niente viene salvato.

type U = { id: number; username: string; displayName: string; bio: string; interests: string[]; avatarUrl: string | null; role: 'member' | 'moderator' | 'admin'; isOwner?: boolean };

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
  { id: 1, username: 'francesco', displayName: 'Francesco', bio: 'Fondatore della comunità. Prima la gestione del rischio, poi tutto il resto.', interests: ['rischio', 'azioni', 'ETF'], avatarUrl: null, role: 'admin', isOwner: true },
  { id: 2, username: 'giulia', displayName: 'Giulia Rossi', bio: 'Swing trading su azioni europee. Diario delle mie operazioni, anche quelle andate male.', interests: ['azioni', 'diario'], avatarUrl: null, role: 'moderator' },
  { id: 3, username: 'marco', displayName: 'Marco Bianchi', bio: 'Imparo da 2 anni. Mai più di 1% a operazione.', interests: ['forex', 'psicologia'], avatarUrl: null, role: 'member' },
  { id: 4, username: 'sara', displayName: 'Sara Conti', bio: 'Investitrice di lungo periodo, ETF e pazienza.', interests: ['ETF', 'lungo periodo'], avatarUrl: null, role: 'member' },
];
const ME = 1;
const following = new Set([2, 3]);

let nextId = 100;
type DemoComment = { id: number; authorId: number; body: string; createdAt: string };
type DemoPost = { id: number; authorId: number; body: string; mediaUrl: string | null; mediaType: 'image' | 'video' | null; createdAt: string; likes: Set<number>; comments: DemoComment[]; flagged?: boolean };
type DemoRoom = { id: number; hostId: number; title: string; description: string; topic: string; status: 'scheduled' | 'live' | 'ended'; scheduledAt: string; startedAt: string | null; stage: number[]; hands: number[]; listeners: number };
const posts: DemoPost[] = [
  { id: 1, authorId: 2, body: 'Operazione chiusa in perdita (-0,8%). Ho rispettato lo stop loss senza spostarlo: per me oggi è una vittoria. Il grafico con il punto di uscita 👇', mediaUrl: chart('#2dd4bf', '0,60 60,80 120,70 180,110 240,130 300,155 340,160'), mediaType: 'image' as const, createdAt: ago(35), likes: new Set<number>([1, 3]), comments: [{ id: 1, authorId: 3, body: 'Rispetto! Io lo spostavo sempre e perdevo il doppio.', createdAt: ago(20) }] },
  { id: 2, authorId: 3, body: 'Domanda per chi ha più esperienza: come gestite la voglia di "rifarvi" dopo una perdita? Stasera ne parliamo nella Piazza di Giulia?', mediaUrl: null, mediaType: null, createdAt: ago(80), likes: new Set([2]), comments: [] },
  { id: 3, authorId: 1, body: 'Benvenuti nella comunità! Regola numero uno: mai rischiare più dell\'1% del capitale su una singola operazione. Raccontate anche gli errori: è così che si impara.', mediaUrl: null, mediaType: null, createdAt: ago(300), likes: new Set([2, 3, 4]), comments: [] },
  { id: 4, authorId: 4, body: 'Piano di accumulo su ETF mondiale: 18 mesi, zero operazioni impulsive. Noioso? Sì. Funziona? Per me sì.', mediaUrl: chart('#a78bfa', '0,170 60,160 120,150 180,140 240,120 300,100 360,80 400,70'), mediaType: 'image' as const, createdAt: ago(600), likes: new Set([1]), comments: [] },
];

const rooms: DemoRoom[] = [
  { id: 1, hostId: 2, title: 'Gestire le perdite senza farsi male', description: 'Chiacchierata aperta: raccontiamo come reagiamo dopo una perdita. Alzate la mano per intervenire.', topic: 'psicologia', status: 'live' as const, scheduledAt: ago(25), startedAt: ago(25), stage: [2, 3], hands: [4], listeners: 14 },
  { id: 2, hostId: 1, title: 'Come si calcola la size di una posizione', description: 'Esempi pratici con numeri veri: capitale, rischio per operazione, stop loss.', topic: 'rischio', status: 'scheduled' as const, scheduledAt: new Date(now + 26 * 3600000).toISOString(), startedAt: null, stage: [1], hands: [], listeners: 0 },
];

const notifications = [
  { id: 1, kind: 'room_live', message: '@giulia è in diretta: Gestire le perdite senza farsi male', link: '/piazze/1', read: false, createdAt: ago(25) },
  { id: 2, kind: 'comment', message: '@giulia ha commentato il tuo post', link: '/post/3', read: false, createdAt: ago(90) },
  { id: 3, kind: 'invite_reward', message: 'Marco Bianchi è entrato nella comunità: hai un invito in più.', link: '/inviti', read: true, createdAt: ago(2000) },
];

const invites = [
  { code: 'K7PQ2MXA', createdAt: ago(3000), usedAt: ago(2000), usedBy: { username: 'marco', displayName: 'Marco Bianchi' } },
  { code: 'R4TN8WEZ', createdAt: ago(100), usedAt: null, usedBy: null },
];
let invitesLeft = 2;

const reports = [
  { id: 1, targetType: 'post', targetId: 99, reasonLabel: 'Frasi a rischio (automatico)', details: 'Segnalato in automatico: contiene frasi tipiche di promesse di guadagno o truffe', createdAt: ago(15), reporter: 'sistema automatico', target: { ownerId: 9, preview: 'Entra nel mio gruppo VIP: guadagno sicuro del 20% al mese! Scrivimi in privato.' } },
];

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
const brief = (u: U) => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl });
const visible = (p: DemoPost) => !p.flagged || p.authorId === ME;
const serializePost = (p: DemoPost) => ({
  id: p.id, body: p.body, mediaUrl: p.mediaUrl, mediaType: p.mediaType, inReview: Boolean(p.flagged), createdAt: p.createdAt,
  author: brief(user(p.authorId)), likes: p.likes.size, comments: p.comments.length, liked: p.likes.has(ME),
  fromFollowing: p.authorId === ME || following.has(p.authorId),
});
const serializeRoom = (r: DemoRoom) => ({
  id: r.id, title: r.title, description: r.description, topic: r.topic, status: r.status, scheduledAt: r.scheduledAt,
  startedAt: r.startedAt, host: brief(user(r.hostId)), listeners: r.listeners,
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

  if (route === '/rules') return { version: 'anteprima', rules: RULES, inviteRequired: false };
  if (route === '/login' || route === '/register') return { token: 'demo', user: user(ME) };
  if (route === '/me' && method === 'PATCH') return { user: Object.assign(user(ME), body) };
  if (route === '/me') {
    const me = user(ME);
    return { user: { ...me, email: 'francesco@esempio.it', invitesLeft }, unreadNotifications: notifications.filter((n) => !n.read).length };
  }
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
  if ((match = m(/^\/users\/([a-z0-9_]+)\/follow$/))) {
    const u = users.find((x) => x.username === match![1])!;
    method === 'POST' ? following.add(u.id) : following.delete(u.id);
    return { following: method === 'POST' };
  }
  if ((match = m(/^\/users\/([a-z0-9_]+)$/))) {
    const u = users.find((x) => x.username === match![1]);
    if (!u) throw new DemoError(404, 'Utente non trovato');
    const followers = u.id === ME ? 3 : following.has(u.id) ? 2 : 1;
    return { user: u, followers, following: u.id === ME ? following.size : 2, posts: posts.filter((p) => p.authorId === u.id).length, isFollowing: following.has(u.id), isMe: u.id === ME };
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
  if (route === '/invites' && method === 'POST') {
    if (invitesLeft <= 0) throw new DemoError(400, 'Hai finito gli inviti: ne ricevi altri quando chi hai invitato partecipa');
    invitesLeft--;
    const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    invites.unshift({ code, createdAt: new Date().toISOString(), usedAt: null, usedBy: null });
    return { code, invitesLeft };
  }
  if (route === '/invites') return { invitesLeft, activeInvitees: 1, invites };
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
  if (route === '/rooms' && method === 'POST') {
    const r = { id: nextId++, hostId: ME, title: body.title, description: body.description ?? '', topic: body.topic ?? '', status: (body.startNow ? 'live' : 'scheduled') as any, scheduledAt: body.scheduledAt ?? new Date().toISOString(), startedAt: body.startNow ? new Date().toISOString() : null, stage: [ME], hands: [3], listeners: 1 };
    rooms.unshift(r);
    return { room: serializeRoom(r) };
  }
  if (route === '/rooms') return { rooms: rooms.filter((r) => r.status !== 'ended').map(serializeRoom) };
  if ((match = m(/^\/rooms\/(\d+)(?:\/(.+))?$/))) {
    const r = rooms.find((x) => x.id === Number(match![1]));
    if (!r) throw new DemoError(404, 'Piazza non trovata');
    const action = match[2] ?? '';
    const isHost = r.hostId === ME;
    if (action === 'start') { r.status = 'live'; r.startedAt = new Date().toISOString(); return { room: serializeRoom(r) }; }
    if (action === 'end') { (r as any).status = 'ended'; return { ended: true }; }
    if (action === 'join') {
      if (!isHost && !r.stage.includes(ME)) r.listeners++;
      return { livekitUrl: '', token: 'demo', role: isHost ? 'host' : r.stage.includes(ME) ? 'speaker' : 'audience' };
    }
    if (action === 'leave') return { left: true };
    if (action === 'hand') { method === 'POST' ? r.hands.push(ME) : (r.hands = r.hands.filter((h) => h !== ME)); return {}; }
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
    };
  }
  throw new DemoError(404, 'Non disponibile nell\'anteprima');
}
