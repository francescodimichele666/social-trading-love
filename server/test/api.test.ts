import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://stl:stl@localhost:5432/stl_test';
process.env.LIVEKIT_SYNC = 'false';
process.env.UPLOAD_DIR = '/tmp/stl-test-uploads';
process.env.MAIL_TEST = '1';
process.env.PUSH = 'false';
process.env.RECORDINGS = 'true';
process.env.RECORDINGS_DIR = '/tmp/stl-test-recordings';
process.env.OWNER_EMAIL = 'francesco@example.com';
process.env.ADMIN_EMAILS = 'lorenzo@example.com';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { buildApp } = await import('../src/app.js');
const { isAdult } = await import('../src/routes/auth.js');
const { sentMails } = await import('../src/mail.js');
const { totpCode, currentStep } = await import('../src/security.js');

const lastCode = (to: string) => {
  const m = [...sentMails].reverse().find((x) => x.to === to && /codice/.test(x.subject));
  return m?.subject.match(/^(\d{6})/)?.[1] ?? '';
};

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  app = await buildApp({ rateLimit: false });
});

after(async () => {
  await app.close();
  await pool.end();
});

async function raw(method: string, url: string, token?: string, payload?: unknown) {
  const res = await app.inject({ method: method as any, url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() };
}

// Per i test più vecchi l'iscrizione si completa da sola con il codice arrivato via email.
// Il test "codice via email" più sotto controlla ogni passaggio a mano.
async function call(method: string, url: string, token?: string, payload?: unknown) {
  const res = await raw(method, url, token, payload);
  if (url === '/api/register' && res.body.verify) {
    const done = await raw('POST', '/api/verify-email', undefined, { ticket: res.body.ticket, code: lastCode(res.body.email) });
    return { status: res.status, body: done.body };
  }
  return res;
}

const person = (username: string, inviteCode?: string) => ({
  email: `${username}@example.com`, password: 'password123', username, displayName: username.toUpperCase(),
  birthDate: '1980-05-10', inviteCode, acceptRules: true, acceptTerms: true,
});

let admin = '', anna = '', bruno = '';
let annaId = 0, brunoId = 0;

test('verifica età', () => {
  assert.equal(isAdult('2000-01-01', new Date('2026-10-16')), true);
  assert.equal(isAdult('2008-10-17', new Date('2026-10-16')), false);
  assert.equal(isAdult('2008-10-16', new Date('2026-10-16')), true);
});

test("l'email del proprietario diventa proprietario e amministratore", async () => {
  const rules = await call('GET', '/api/rules');
  assert.equal(rules.body.firstUser, undefined);
  const res = await call('POST', '/api/register', undefined, person('francesco'));
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.isOwner, true);
  admin = res.body.token;
});

test('iscrizione libera per i maggiorenni, codice amico facoltativo', async () => {
  const minor = await call('POST', '/api/register', undefined, { ...person('piccolo'), birthDate: '2012-01-01' });
  assert.equal(minor.status, 400);

  const friend = await call('GET', '/api/invites', admin);
  assert.match(friend.body.code, /^[A-Z2-9]{8}$/);
  assert.equal((await call('GET', '/api/invites', admin)).body.code, friend.body.code, 'il codice personale non cambia');

  const ok = await call('POST', '/api/register', undefined, person('anna', friend.body.code));
  assert.equal(ok.status, 201);
  anna = ok.body.token;
  annaId = ok.body.user.id;

  // Senza codice, o con un codice sbagliato, ci si iscrive lo stesso.
  const b = await call('POST', '/api/register', undefined, person('bruno', 'FALSO123'));
  assert.equal(b.status, 201);
  bruno = b.body.token;
  brunoId = b.body.user.id;
  assert.equal((await call('POST', '/api/register', undefined, person('bruno'))).status, 409, 'nome già usato');

  const list = await call('GET', '/api/invites', admin);
  assert.equal(list.body.joined, 1);
  assert.equal(list.body.friends[0].username, 'anna');
});

test('login e profilo', async () => {
  const res = await call('POST', '/api/login', undefined, { login: 'ANNA', password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'anna', password: 'sbagliata' })).status, 401);
  const upd = await call('PATCH', '/api/me', anna, { bio: 'Imparo a gestire il rischio', interests: ['azioni', 'ETF'] });
  assert.deepEqual(upd.body.user.interests, ['azioni', 'ETF']);
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('quando un amico portato da te partecipa, ricevi un avviso una volta sola', async () => {
  const res = await call('POST', '/api/posts', anna, { body: 'Il mio piano: rischio massimo 1% a operazione' });
  assert.equal(res.status, 201);
  assert.equal((await call('GET', '/api/invites', admin)).body.active, 1);
  await call('POST', '/api/posts', anna, { body: 'Secondo post' });
  const notes = (await call('GET', '/api/notifications', admin)).body.notifications.filter((n: any) => n.kind === 'invite_reward');
  assert.equal(notes.length, 1);
});

test('feed onesto: prima chi segui, poi la comunità, poi la fine', async () => {
  await call('POST', '/api/posts', admin, { body: 'Benvenuti nella comunità' });
  await call('POST', '/api/users/anna/follow', bruno);
  const feed = await call('GET', '/api/feed', bruno);
  assert.equal(feed.body.end, true);
  assert.deepEqual(feed.body.posts.map((p: any) => [p.author.username, p.fromFollowing]), [
    ['anna', true], ['anna', true], ['francesco', false],
  ]);
  const profile = await call('GET', '/api/users/anna', bruno);
  assert.equal(profile.body.isFollowing, true);
  assert.equal(profile.body.followers, 1);
});

test('like e commenti', async () => {
  const feed = await call('GET', '/api/feed', bruno);
  const id = feed.body.posts[0].id;
  await call('POST', `/api/posts/${id}/like`, bruno);
  await call('POST', `/api/posts/${id}/like`, bruno);
  const c = await call('POST', `/api/posts/${id}/comments`, bruno, { body: 'Ottimo approccio' });
  assert.equal(c.status, 201);
  const detail = await call('GET', `/api/posts/${id}`, bruno);
  assert.equal(detail.body.post.likes, 1);
  assert.equal(detail.body.post.liked, true);
  assert.equal(detail.body.comments.length, 1);
  const notes = await call('GET', '/api/notifications', anna);
  assert.ok(notes.body.notifications.some((n: any) => n.kind === 'comment'));
});

let flaggedPostId = 0;
test('frasi a rischio: il post resta visibile solo all\'autore e va in revisione', async () => {
  const res = await call('POST', '/api/posts', bruno, { body: 'Entra nel mio gruppo VIP, guadagno sicuro!' });
  assert.equal(res.status, 201);
  assert.ok(res.body.notice);
  flaggedPostId = res.body.post.id;
  const forAnna = await call('GET', '/api/feed', anna);
  assert.ok(!forAnna.body.posts.some((p: any) => p.id === flaggedPostId));
  const forBruno = await call('GET', '/api/feed', bruno);
  assert.ok(forBruno.body.posts.some((p: any) => p.id === flaggedPostId && p.inReview));
});

test('moderazione: segnalazione, rimozione con motivazione, sospensione', async () => {
  assert.equal((await call('GET', '/api/moderation/reports', anna)).status, 403);
  const rep = await call('POST', '/api/reports', anna, { targetType: 'user', targetId: brunoId, reason: 'truffa', details: 'Chiede soldi in privato' });
  assert.equal(rep.status, 201);

  const list = await call('GET', '/api/moderation/reports', admin);
  assert.equal(list.body.reports.length, 2);
  const auto = list.body.reports.find((r: any) => r.targetType === 'post');
  assert.equal(auto.reporter, 'sistema automatico');

  assert.equal((await call('POST', `/api/moderation/reports/${auto.id}/decide`, admin, { action: 'remove', statement: 'corto' })).status, 400);
  const done = await call('POST', `/api/moderation/reports/${auto.id}/decide`, admin, { action: 'remove', statement: 'Promessa di guadagno sicuro, vietata dalla regola 2.' });
  assert.equal(done.status, 200);
  const notes = await call('GET', '/api/notifications', bruno);
  assert.match(notes.body.notifications[0].message, /regola 2/);
  assert.equal((await call('GET', `/api/posts/${flaggedPostId}`, bruno)).status, 404);

  const userReport = list.body.reports.find((r: any) => r.targetType === 'user');
  await call('POST', `/api/moderation/reports/${userReport.id}/decide`, admin, { action: 'ban', statement: 'Richieste di denaro ad altri utenti.' });
  assert.equal((await call('GET', '/api/me', bruno)).status, 403);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'bruno', password: 'password123' })).status, 403);
});

test('Live: palco, mano alzata, limite di 6 persone', async () => {
  assert.equal((await call('POST', '/api/rooms', anna, { title: 'Rendimenti garantiti per tutti' })).status, 400);
  const created = await call('POST', '/api/rooms', anna, { title: 'Come gestire il rischio', topic: 'rischio' });
  assert.equal(created.status, 201);
  const id = created.body.room.id;
  assert.equal(created.body.room.status, 'scheduled');

  assert.equal((await call('POST', `/api/rooms/${id}/join`, admin)).status, 400, 'non ancora iniziata');
  const hostJoin = await call('POST', `/api/rooms/${id}/join`, anna);
  assert.equal(hostJoin.body.role, 'host');
  assert.ok(hostJoin.body.token);

  await call('POST', '/api/users/anna/follow', admin);
  assert.equal((await call('POST', `/api/rooms/${id}/start`, admin)).status, 403);
  assert.equal((await call('POST', `/api/rooms/${id}/start`, anna)).status, 200);
  const notes = await call('GET', '/api/notifications', admin);
  assert.ok(notes.body.notifications.some((n: any) => n.kind === 'room_live'));

  const join = await call('POST', `/api/rooms/${id}/join`, admin);
  assert.equal(join.body.role, 'audience');
  const grant = JSON.parse(Buffer.from(join.body.token.split('.')[1], 'base64url').toString()).video;
  assert.equal(grant.canPublish, false);

  await call('POST', `/api/rooms/${id}/hand`, admin);
  const view = await call('GET', `/api/rooms/${id}`, anna);
  assert.equal(view.body.raisedHands.length, 1);
  assert.equal(view.body.room.listeners, 2);

  const adminId = view.body.raisedHands[0].id;
  assert.equal((await call('POST', `/api/rooms/${id}/speakers/${adminId}`, admin)).status, 403);
  assert.equal((await call('POST', `/api/rooms/${id}/speakers/${adminId}`, anna)).status, 200);
  const rejoin = await call('POST', `/api/rooms/${id}/join`, admin);
  assert.equal(JSON.parse(Buffer.from(rejoin.body.token.split('.')[1], 'base64url').toString()).video.canPublish, true);

  // Riempie il palco fino a 6 con utenti finti.
  for (let i = 0; i < 4; i++) {
    const u = await pool.query(`INSERT INTO users (email, username, password_hash, display_name, birth_date, rules_version) VALUES ($1, $2, 'x', 'X', '1990-01-01', 'v') RETURNING id`, [`s${i}@x.it`, `s${i}`]);
    await pool.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'speaker')`, [id, u.rows[0].id]);
  }
  const extra = await pool.query(`INSERT INTO users (email, username, password_hash, display_name, birth_date, rules_version) VALUES ('e@x.it', 'extra', 'x', 'E', '1990-01-01', 'v') RETURNING id`);
  await pool.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'audience')`, [id, extra.rows[0].id]);
  const full = await call('POST', `/api/rooms/${id}/speakers/${extra.rows[0].id}`, anna);
  assert.equal(full.status, 400);
  assert.match(full.body.error, /pieno/);

  assert.equal((await call('DELETE', `/api/rooms/${id}/speakers/${adminId}`, admin)).status, 200, 'si può scendere da soli');
  assert.equal((await call('POST', `/api/rooms/${id}/end`, anna)).status, 200);
  assert.equal((await call('POST', `/api/rooms/${id}/join`, admin)).status, 400);
  const rooms = await call('GET', '/api/rooms', admin);
  assert.ok(!rooms.body.rooms.some((r: any) => r.id === id));
});

test('pannello della Live: numeri, fai uscire e blocca chi disturba', async () => {
  const lino = (await call('POST', '/api/register', undefined, person('lino'))).body.token;
  const linoId = (await call('GET', '/api/me', lino)).body.user.id;
  const r = await call('POST', '/api/rooms', anna, { title: 'Domande sul rischio', startNow: true });
  const id = r.body.room.id;
  await call('POST', `/api/rooms/${id}/join`, anna);
  assert.equal((await call('POST', `/api/rooms/${id}/join`, lino)).status, 200);
  assert.equal((await call('POST', `/api/rooms/${id}/join`, admin)).status, 200);
  await call('POST', `/api/rooms/${id}/hand`, lino);

  assert.equal((await call('GET', `/api/rooms/${id}/panel`, lino)).status, 403, 'solo chi conduce');
  const panel = await call('GET', `/api/rooms/${id}/panel`, anna);
  assert.equal(panel.status, 200);
  assert.equal(panel.body.stats.listeners, 3);
  assert.equal(panel.body.stats.visitors, 2);
  assert.equal(panel.body.stats.hands, 1);
  assert.equal(panel.body.people[0].role, 'host');
  assert.ok(panel.body.people.some((p: any) => p.id === linoId && p.handRaised));

  assert.equal((await call('POST', `/api/rooms/${id}/kick/${annaId}`, anna, {})).status, 400, 'non te stesso');
  const kicked = await call('POST', `/api/rooms/${id}/kick/${linoId}`, anna, {});
  assert.equal(kicked.body.stats.listeners, 2);
  assert.equal(kicked.body.kicked[0].id, linoId);
  assert.equal((await call('GET', `/api/rooms/${id}`, lino)).body.me.removed, 'kicked');
  assert.equal((await call('POST', `/api/rooms/${id}/join`, lino)).status, 403);

  // Bloccato: fuori anche dalle Live successive della stessa persona.
  await call('POST', `/api/rooms/${id}/kick/${linoId}`, anna, { block: true });
  const next = await call('POST', '/api/rooms', anna, { title: 'Seconda diretta', startNow: true });
  const blocked = await call('POST', `/api/rooms/${next.body.room.id}/join`, lino);
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /bloccato/);

  const undo = await call('DELETE', `/api/rooms/${id}/kick/${linoId}`, anna);
  assert.equal(undo.body.blocked.length, 0);
  assert.equal((await call('POST', `/api/rooms/${next.body.room.id}/join`, lino)).status, 200);
  assert.equal((await call('POST', `/api/rooms/${id}/join`, lino)).status, 200);
  await call('POST', `/api/rooms/${id}/end`, anna);
  await call('POST', `/api/rooms/${next.body.room.id}/end`, anna);
});

test('caricamento di una foto nel post', async () => {
  const boundary = '----stl';
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5c60000000049454e44ae426082', 'hex');
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="body"\r\n\r\nIl mio grafico\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="g.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({ method: 'POST', url: '/api/posts', payload, headers: { authorization: `Bearer ${anna}`, 'content-type': `multipart/form-data; boundary=${boundary}` } });
  assert.equal(res.statusCode, 201);
  const post = res.json().post;
  assert.equal(post.mediaType, 'image');
  const file = await app.inject({ method: 'GET', url: post.mediaUrl });
  assert.equal(file.statusCode, 200);
});

async function postVideo(file: string, token: string) {
  const { readFile } = await import('node:fs/promises');
  const boundary = '----stlvideo';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="body"\r\n\r\nIl mio video\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="v.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
    await readFile(file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({ method: 'POST', url: '/api/posts', payload, headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` } });
}

test('video nel post: convertito, con copertina, massimo 2 minuti', async () => {
  const { execFileSync } = await import('node:child_process');
  const dir = '/tmp/stl-test-videos';
  execFileSync('mkdir', ['-p', dir]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=4', '-c:v', 'libx264', `${dir}/short.mp4`]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:size=160x120:rate=5:duration=125', '-c:v', 'libx264', `${dir}/long.mp4`]);

  const ok = await postVideo(`${dir}/short.mp4`, anna);
  assert.equal(ok.statusCode, 201);
  const post = ok.json().post;
  assert.equal(post.mediaType, 'video');
  assert.equal(post.mediaDuration, 4);
  assert.match(post.mediaUrl, /\.mp4$/);
  assert.equal((await app.inject({ method: 'GET', url: post.mediaUrl })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: post.mediaPoster })).statusCode, 200);
  const size = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', `/tmp/stl-test-uploads/${post.mediaUrl.split('/').pop()}`]).toString().trim();
  assert.equal(size, '720,1280', 'il video verticale viene ridotto a 720 px di larghezza');

  const long = await postVideo(`${dir}/long.mp4`, anna);
  assert.equal(long.statusCode, 400);
  assert.match(long.json().error, /massimo è 2:00/);
});

test('solo il proprietario nomina amministratori', async () => {
  const me = await call('GET', '/api/me', admin);
  assert.equal(me.body.user.isOwner, true);
  const ownerId = me.body.user.id;

  assert.equal((await call('POST', `/api/moderation/users/${annaId}/role`, anna, { role: 'admin' })).status, 403);
  assert.equal((await call('POST', `/api/moderation/users/${annaId}/role`, admin, { role: 'admin' })).status, 200);

  const carlo = await call('POST', '/api/register', undefined, person('carlo'));
  const carloId = carlo.body.user.id;

  // Anna è amministratrice ma non proprietaria: può nominare moderatori, non amministratori.
  const denied = await call('POST', `/api/moderation/users/${carloId}/role`, anna, { role: 'admin' });
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /proprietario/);
  assert.equal((await call('POST', `/api/moderation/users/${carloId}/role`, anna, { role: 'moderator' })).status, 200);
  assert.equal((await call('POST', `/api/moderation/users/${ownerId}/role`, anna, { role: 'member' })).status, 403);

  // Un amministratore non può sospendere il proprietario né un altro moderatore.
  await call('POST', '/api/reports', anna, { targetType: 'user', targetId: ownerId, reason: 'altro' });
  await call('POST', '/api/reports', anna, { targetType: 'user', targetId: carloId, reason: 'altro' });
  const open = (await call('GET', '/api/moderation/reports', anna)).body.reports;
  const onOwner = open.find((r: any) => r.targetId === ownerId);
  const onCarlo = open.find((r: any) => r.targetId === carloId);
  assert.equal((await call('POST', `/api/moderation/reports/${onOwner.id}/decide`, anna, { action: 'ban', statement: 'Prova di sospensione.' })).status, 403);
  assert.equal((await call('POST', `/api/moderation/reports/${onCarlo.id}/decide`, anna, { action: 'ban', statement: 'Prova di sospensione.' })).status, 403);
  assert.equal((await call('POST', `/api/moderation/reports/${onCarlo.id}/decide`, anna, { action: 'dismiss', statement: 'Nessun problema.' })).status, 200);

  assert.equal((await call('POST', `/api/moderation/users/${annaId}/role`, admin, { role: 'member' })).status, 200);
  assert.equal((await call('GET', '/api/me', anna)).body.user.role, 'member');
});

test('strumenti amministratori: numeri, rimozione immediata, riattivazione', async () => {
  const ownerId = (await call('GET', '/api/me', admin)).body.user.id;
  const dario = (await call('POST', '/api/register', undefined, person('dario'))).body;
  const elena = (await call('POST', '/api/register', undefined, person('elena'))).body;
  assert.equal((await call('POST', `/api/moderation/users/${elena.user.id}/role`, admin, { role: 'moderator' })).status, 200);

  // Solo gli amministratori: i membri e i moderatori non vedono questi strumenti.
  assert.equal((await call('GET', '/api/admin/stats', dario.token)).status, 403);
  assert.equal((await call('GET', '/api/admin/stats', elena.token)).status, 403);

  assert.equal((await call('POST', `/api/moderation/users/${annaId}/role`, admin, { role: 'admin' })).status, 200);
  const stats = await call('GET', '/api/admin/stats', anna);
  assert.equal(stats.status, 200);
  assert.equal(stats.body.signups.length, 14);
  assert.ok(stats.body.members >= 5);
  assert.ok(stats.body.suspended >= 1);
  assert.ok(stats.body.videos >= 1);

  // Rimozione immediata con motivazione, senza segnalazione.
  const post = (await call('POST', '/api/posts', dario.token, { body: 'Post da togliere' })).body.post;
  assert.equal((await call('POST', '/api/admin/remove', anna, { targetType: 'post', targetId: post.id, statement: 'corto' })).status, 400);
  assert.equal((await call('POST', '/api/admin/remove', anna, { targetType: 'post', targetId: post.id, statement: 'Pubblicità di un servizio a pagamento.' })).status, 200);
  assert.equal((await call('GET', `/api/posts/${post.id}`, dario.token)).status, 404);
  assert.match((await call('GET', '/api/notifications', dario.token)).body.notifications[0].message, /Pubblicità/);
  const ownerPost = (await call('POST', '/api/posts', admin, { body: 'Post del proprietario' })).body.post;
  assert.equal((await call('POST', '/api/admin/remove', anna, { targetType: 'post', targetId: ownerPost.id, statement: 'Prova di rimozione.' })).status, 403);

  // Riattivazione: un amministratore riattiva i membri, solo il proprietario riattiva moderatori e amministratori.
  const suspended = (await call('GET', '/api/admin/suspended', anna)).body.users;
  assert.ok(suspended.some((u: any) => u.id === brunoId && u.reason));
  assert.equal((await call('POST', `/api/admin/users/${brunoId}/reinstate`, anna, { statement: 'Ha chiarito, era un malinteso.' })).status, 200);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'bruno', password: 'password123' })).status, 200);

  await call('POST', '/api/reports', dario.token, { targetType: 'user', targetId: elena.user.id, reason: 'altro' });
  const rep = (await call('GET', '/api/moderation/reports', admin)).body.reports.find((r: any) => r.targetId === elena.user.id);
  assert.equal((await call('POST', `/api/moderation/reports/${rep.id}/decide`, admin, { action: 'ban', statement: 'Prova di sospensione.' })).status, 200);
  assert.equal((await call('POST', `/api/admin/users/${elena.user.id}/reinstate`, anna, { statement: 'Prova di riattivazione.' })).status, 403);
  assert.equal((await call('POST', `/api/admin/users/${elena.user.id}/reinstate`, admin, { statement: 'Prova di riattivazione.' })).status, 200);
  assert.equal(ownerId > 0, true);
});

test('password dimenticata: link via email, nuova password, vecchi accessi annullati', async () => {
  const { sentMails } = await import('../src/mail.js');
  const fede = (await call('POST', '/api/register', undefined, person('fede'))).body;
  sentMails.length = 0;
  const unknown = await call('POST', '/api/password/forgot', undefined, { email: 'nessuno@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(sentMails.length, 0, 'nessuna email a chi non è iscritto, ma stessa risposta');

  assert.equal((await call('POST', '/api/password/forgot', undefined, { email: 'fede@example.com' })).status, 200);
  assert.equal(sentMails.length, 1);
  const token = sentMails[0].text.match(/token=([\w-]+)/)![1];
  assert.equal((await call('POST', '/api/password/reset', undefined, { token: 'x'.repeat(30), password: 'nuovapassword1' })).status, 400);

  await new Promise((r) => setTimeout(r, 1100)); // i token durano al secondo
  assert.equal((await call('POST', '/api/password/reset', undefined, { token, password: 'nuovapassword1' })).status, 200);
  assert.equal((await call('POST', '/api/password/reset', undefined, { token, password: 'altrapassword1' })).status, 400, 'il link vale una volta sola');
  assert.equal((await call('GET', '/api/me', fede.token)).status, 401, 'il vecchio accesso non vale più');
  assert.equal((await call('POST', '/api/login', undefined, { login: 'fede', password: 'password123' })).status, 401);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'fede', password: 'nuovapassword1' })).status, 200);
});

test('iscrizione: serve il consenso a privacy e condizioni', async () => {
  const res = await call('POST', '/api/register', undefined, { ...person('gino'), acceptTerms: false });
  assert.equal(res.status, 400);
  const ok = await call('POST', '/api/register', undefined, person('gino'));
  assert.equal(ok.status, 201);
  const me = await call('GET', '/api/me', ok.body.token);
  assert.equal(me.body.user.termsVersion, me.body.currentTermsVersion);
});

test('impostazioni email e titolare: solo il proprietario', async () => {
  const mail = { host: 'smtp.gmail.com', port: 465, secure: true, user: 'club@gmail.com', password: 'abcd efgh ijkl mnop', fromName: 'Love Trading Club', fromEmail: '' };
  assert.equal((await call('PUT', '/api/owner/settings/mail', anna, mail)).status, 403);
  assert.equal((await call('PUT', '/api/owner/settings/mail', admin, mail)).status, 200);
  const s = await call('GET', '/api/owner/settings', admin);
  assert.equal(s.body.mail.user, 'club@gmail.com');
  assert.equal(s.body.mail.hasPassword, true);
  assert.equal(s.body.mail.password, undefined, 'la password non torna mai indietro');
  const { pool: p } = await import('../src/db.js');
  const stored = (await p.query(`SELECT value FROM settings WHERE key = 'mail'`)).rows[0].value;
  assert.notEqual(stored.password, mail.password, 'la password è salvata cifrata');
  // Si può cambiare la casella senza riscrivere la password.
  assert.equal((await call('PUT', '/api/owner/settings/mail', admin, { ...mail, user: 'altra@libero.it', host: 'smtp.libero.it', password: '' })).status, 200);
  assert.equal((await call('GET', '/api/owner/settings', admin)).body.mail.hasPassword, true);

  assert.equal((await call('PUT', '/api/owner/settings/legal', admin, { controllerName: 'Francesco Rossi', contactEmail: 'privacy@example.com', city: 'Roma' })).status, 200);
  assert.equal((await call('GET', '/api/legal')).body.controllerName, 'Francesco Rossi');
});

test('notifiche sul telefono: chiave pubblica e iscrizione del dispositivo', async () => {
  const key = await call('GET', '/api/push/key');
  assert.match(key.body.publicKey, /^[\w-]{80,}$/);
  assert.equal((await call('GET', '/api/push/key')).body.publicKey, key.body.publicKey, 'la chiave resta la stessa');
  const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'BPk', auth: 'xyz' } };
  assert.equal((await call('POST', '/api/push/subscribe', anna, sub)).status, 200);
  assert.equal((await call('POST', '/api/push/unsubscribe', anna, { endpoint: sub.endpoint })).status, 200);
});

test('privacy: scarica i tuoi dati ed elimina l\'account', async () => {
  const hugo = (await call('POST', '/api/register', undefined, person('hugo'))).body;
  await call('POST', '/api/posts', hugo.token, { body: 'Il mio primo post' });
  const exp = await app.inject({ method: 'GET', url: '/api/me/export', headers: { authorization: `Bearer ${hugo.token}` } });
  assert.equal(exp.statusCode, 200);
  assert.match(String(exp.headers['content-disposition']), /attachment/);
  assert.equal(exp.json().posts[0].body, 'Il mio primo post');
  assert.equal(exp.json().account.email, 'hugo@example.com');

  assert.equal((await call('POST', '/api/me/delete', admin, { password: 'password123' })).status, 400, 'il proprietario non si elimina');
  assert.equal((await call('POST', '/api/me/delete', hugo.token, { password: 'sbagliata' })).status, 400);
  assert.equal((await call('POST', '/api/me/delete', hugo.token, { password: 'password123' })).status, 200);
  assert.equal((await call('GET', '/api/me', hugo.token)).status, 401);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'hugo', password: 'password123' })).status, 401);
  assert.equal((await call('GET', '/api/users/hugo', admin)).status, 404);
  const { pool: p } = await import('../src/db.js');
  const row = (await p.query(`SELECT email, username FROM users WHERE id = $1`, [hugo.user.id])).rows[0];
  assert.match(row.email, /^eliminato-/);
  assert.equal((await p.query(`SELECT count(*)::int AS n FROM posts WHERE author_id = $1`, [hugo.user.id])).rows[0].n, 0);
  // Si può iscrivere di nuovo con la stessa email.
  assert.equal((await call('POST', '/api/register', undefined, person('hugo'))).status, 201);
});

test('diario di trading: operazione, chiusura, statistiche, condivisione come post', async () => {
  const bad = await call('POST', '/api/journal', anna, { symbol: 'eni', market: 'azioni', direction: 'long', entryPrice: 14, stopLoss: 15, riskPercent: 1 });
  assert.equal(bad.status, 400, 'in un long lo stop va sotto il prezzo di ingresso');
  assert.match(bad.body.error, /sotto/);

  const open = await call('POST', '/api/journal', anna, { symbol: 'eni', market: 'azioni', direction: 'long', entryPrice: 14, stopLoss: 13.5, takeProfit: 15.5, riskPercent: 1, plan: 'Rimbalzo sul supporto' });
  assert.equal(open.status, 201);
  assert.equal(open.body.trade.symbol, 'ENI');
  assert.equal(open.body.trade.rewardRisk, 3);
  assert.equal(open.body.warning, null);
  assert.ok(open.body.postId, "l'operazione salvata va subito nel feed");
  const auto = await call('GET', `/api/posts/${open.body.postId}`, bruno);
  assert.equal(auto.body.post.trade.status, 'open');

  const closed = await call('POST', `/api/journal/${open.body.trade.id}/close`, anna, { exitPrice: 15, lesson: 'Ho preso profitto prima del target', emotion: 'calmo', followedPlan: true, movedStop: false });
  assert.equal(closed.body.trade.resultR, 2);
  assert.equal(closed.body.trade.resultPercent, 2);

  const short = await call('POST', '/api/journal', anna, { symbol: 'EURUSD', market: 'forex', direction: 'short', entryPrice: 1.1, stopLoss: 1.11, riskPercent: 3, exitPrice: 1.11, movedStop: true });
  assert.equal(short.body.trade.resultR, -1);
  assert.match(short.body.warning, /2%/);

  const j = await call('GET', '/api/journal', anna);
  assert.equal(j.body.stats.closed, 2);
  assert.equal(j.body.stats.winRate, 50);
  assert.equal(j.body.stats.avgR, 0.5);
  assert.equal(j.body.stats.overRisk, 1);
  assert.equal(j.body.stats.stopStreak, 0, "l'ultima operazione ha spostato lo stop");
  assert.equal((await call('GET', '/api/journal', bruno)).body.trades.length, 0, 'il diario è privato');

  assert.equal((await call('POST', `/api/journal/${open.body.trade.id}/share`, bruno, { text: 'non mia' })).status, 404);
  const shared = await call('POST', `/api/journal/${open.body.trade.id}/share`, anna, { text: 'Operazione da manuale' });
  assert.equal(shared.status, 200);
  assert.equal(shared.body.postId, open.body.postId, 'nessun doppione: il testo va nel post già pubblicato');
  const post = await call('GET', `/api/posts/${shared.body.postId}`, bruno);
  assert.equal(post.body.post.trade.symbol, 'ENI');
  assert.equal(post.body.post.trade.resultR, 2);
  assert.equal(post.body.post.trade.lesson, 'Ho preso profitto prima del target');
  assert.equal(post.body.post.body, 'Operazione da manuale');
  assert.equal((await call('DELETE', `/api/journal/${short.body.trade.id}`, anna)).status, 200);
  assert.equal((await call('GET', `/api/posts/${short.body.postId}`, bruno)).status, 404, 'cancellata l\'operazione sparisce anche il post');
});

test('sfida della settimana: partecipa, check-in, badge sul profilo', async () => {
  const cur = await call('GET', '/api/challenges/current', anna);
  assert.equal(cur.status, 200);
  assert.ok(cur.body.challenge.title);
  assert.equal(cur.body.challenge.me.joined, false);
  assert.equal((await call('POST', '/api/challenges/current/checkin', anna, { kept: true })).status, 400, 'prima bisogna partecipare');

  // Solo gli amministratori scelgono la sfida; con 1 giorno richiesto la prova è immediata.
  assert.equal((await call('PUT', '/api/challenges/current', bruno, { presetKey: 'stop' })).status, 403);
  const custom = await call('PUT', '/api/challenges/current', admin, { title: 'Prova veloce', description: 'Una sfida di prova per i test.', rule: 'Oggi ho fatto la prova.', emoji: '🧪', requiredDays: 1 });
  assert.equal(custom.status, 200);
  assert.equal(custom.body.challenge.title, 'Prova veloce');

  assert.equal((await call('POST', '/api/challenges/current/join', anna)).status, 200);
  assert.equal((await call('PUT', '/api/challenges/current', admin, { presetKey: 'stop' })).status, 400, 'con partecipanti non si cambia più');
  assert.equal((await call('PUT', '/api/challenges/next', admin, { presetKey: 'studio' })).status, 200, 'la prossima settimana sì');

  const no = await call('POST', '/api/challenges/current/checkin', anna, { kept: false });
  assert.equal(no.body.earned, false);
  const yes = await call('POST', '/api/challenges/current/checkin', anna, { kept: true });
  assert.equal(yes.body.earned, true);
  assert.equal(yes.body.challenge.me.keptDays, 1);
  assert.equal(yes.body.challenge.completed, 1);
  assert.equal((await call('POST', '/api/challenges/current/checkin', anna, { kept: true })).body.earned, false, 'il badge si prende una volta');

  const profile = await call('GET', '/api/users/anna', bruno);
  assert.equal(profile.body.badges.length, 1);
  assert.equal(profile.body.badges[0].emoji, '🧪');
  const plan = await call('GET', '/api/challenges/plan', admin);
  assert.equal(plan.body.next.presetKey, 'studio');
  assert.equal(plan.body.presets.length, 6);
});

test('Live registrate: avviso, registrazione e cancellazione', async () => {
  const r = await call('POST', '/api/rooms', anna, { title: 'Analisi del venerdì', startNow: true, record: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.room.record, true);
  const { pool: p } = await import('../src/db.js');
  const rec = (await p.query('SELECT * FROM recordings WHERE room_id = $1', [r.body.room.id])).rows[0];
  assert.equal(rec.status, 'recording');

  assert.equal((await call('POST', `/api/rooms/${r.body.room.id}/end`, anna)).status, 200);
  assert.equal((await p.query('SELECT status FROM recordings WHERE id = $1', [rec.id])).rows[0].status, 'processing');

  // Simula Egress che ha finito di scrivere il file.
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('/tmp/stl-test-recordings', { recursive: true });
  await writeFile(`/tmp/stl-test-recordings/${rec.file_name}`, 'video');
  await p.query(`UPDATE recordings SET status = 'ready', duration = 1800 WHERE id = $1`, [rec.id]);

  const list = await call('GET', '/api/recordings', bruno);
  const item = list.body.recordings.find((x: any) => x.id === rec.id);
  assert.equal(item.title, 'Analisi del venerdì');
  assert.equal(item.host.username, 'anna');
  assert.equal((await app.inject({ method: 'GET', url: item.url })).statusCode, 200);
  const detail = await call('GET', `/api/rooms/${r.body.room.id}`, bruno);
  assert.equal(detail.body.recordings.length, 1);

  assert.equal((await call('DELETE', `/api/recordings/${rec.id}`, bruno)).status, 403);
  assert.equal((await call('DELETE', `/api/recordings/${rec.id}`, anna)).status, 200);
  assert.equal((await app.inject({ method: 'GET', url: item.url })).statusCode, 404, 'il file è cancellato');
});

test('iscrizione con codice via email: senza codice non si entra', async () => {
  const res = await raw('POST', '/api/register', undefined, person('ivo'));
  assert.equal(res.status, 201);
  assert.equal(res.body.verify, true);
  assert.equal(res.body.token, undefined, 'niente accesso prima del codice');
  assert.equal((await raw('GET', '/api/me', res.body.ticket)).status, 401, 'il biglietto non vale come accesso');
  const code = lastCode('ivo@example.com');
  assert.match(code, /^\d{6}$/);

  const wrong = await raw('POST', '/api/verify-email', undefined, { ticket: res.body.ticket, code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /tentativi/);

  // Anche il login, finché l'email non è confermata, chiede il codice.
  const login = await raw('POST', '/api/login', undefined, { login: 'ivo', password: 'password123' });
  assert.equal(login.body.verify, true);
  const ok2 = await raw('POST', '/api/verify-email', undefined, { ticket: login.body.ticket, code: lastCode('ivo@example.com') });
  assert.equal(ok2.status, 200);
  assert.ok(ok2.body.token);
  assert.equal((await raw('GET', '/api/me', ok2.body.token)).status, 200);
  assert.ok((await raw('POST', '/api/login', undefined, { login: 'ivo', password: 'password123' })).body.token, 'dopo la conferma si entra subito');
});

test('accesso a due fattori: app, codici di riserva, blocco dopo 5 errori', async () => {
  const lea = (await call('POST', '/api/register', undefined, person('lea'))).body.token;
  assert.equal((await raw('POST', '/api/me/2fa/setup', lea, { password: 'sbagliata' })).status, 400);
  const setup = await raw('POST', '/api/me/2fa/setup', lea, { password: 'password123' });
  assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.equal((await raw('POST', '/api/me/2fa/enable', lea, { code: '123456' })).status, 400);
  const en = await raw('POST', '/api/me/2fa/enable', lea, { code: totpCode(setup.body.secret, currentStep()) });
  assert.equal(en.status, 200);
  assert.equal(en.body.recoveryCodes.length, 10);
  assert.equal((await raw('GET', '/api/me/security', lea)).body.twoFactor, true);

  const step1 = await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' });
  assert.equal(step1.body.twoFactor, true);
  assert.equal(step1.body.token, undefined);
  assert.equal((await raw('GET', '/api/me', step1.body.ticket)).status, 401);
  // Lo stesso codice usato per attivare non vale una seconda volta: si usa il prossimo.
  const next = totpCode(setup.body.secret, currentStep() + 1);
  const in1 = await raw('POST', '/api/login/2fa', undefined, { ticket: step1.body.ticket, code: next });
  assert.equal(in1.status, 200);
  assert.ok(in1.body.token);
  assert.equal((await raw('POST', '/api/login/2fa', undefined, { ticket: step1.body.ticket, code: next })).status, 401, 'il biglietto vale una volta');

  // Codice di riserva: funziona una volta sola.
  const step2 = await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' });
  const rc = en.body.recoveryCodes[0];
  assert.equal((await raw('POST', '/api/login/2fa', undefined, { ticket: step2.body.ticket, code: rc.toUpperCase() })).status, 200);
  const step3 = await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' });
  assert.equal((await raw('POST', '/api/login/2fa', undefined, { ticket: step3.body.ticket, code: rc })).status, 400);

  // Cinque errori e il biglietto si blocca.
  const step4 = await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' });
  for (let i = 0; i < 5; i++) await raw('POST', '/api/login/2fa', undefined, { ticket: step4.body.ticket, code: '000000' });
  const blocked = await raw('POST', '/api/login/2fa', undefined, { ticket: step4.body.ticket, code: totpCode(setup.body.secret, currentStep() + 1) });
  assert.equal(blocked.status, 429);

  assert.equal((await raw('POST', '/api/me/2fa/disable', in1.body.token, { password: 'password123', code: en.body.recoveryCodes[1] })).status, 200);
  assert.ok((await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' })).body.token, 'senza due fattori si entra con la password');
});

test('pannello utenti: elenco, ricerca, gestione e limiti', async () => {
  const list = await raw('GET', '/api/admin/users?q=lea', admin);
  assert.equal(list.status, 200);
  assert.equal(list.body.users.length, 1);
  const lea = list.body.users[0];
  assert.equal(lea.email, 'lea@example.com');
  assert.ok(list.body.counts.all >= 5);
  const member = (await call('POST', '/api/register', undefined, person('mimmo'))).body.token;
  assert.equal((await raw('GET', '/api/admin/users', member)).status, 403, 'solo amministratori');

  const detail = await raw('GET', `/api/admin/users/${lea.id}`, admin);
  assert.equal(detail.body.canManage, true);
  assert.ok(detail.body.user.lastLoginAt, "c'è l'ultimo accesso");

  // Esci da tutti i dispositivi: il vecchio accesso non vale più.
  const leaLogin = (await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' })).body.token;
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await raw('POST', `/api/admin/users/${lea.id}/logout`, admin)).status, 200);
  assert.equal((await raw('GET', '/api/me', leaLogin)).status, 401);

  assert.equal((await raw('POST', `/api/admin/users/${lea.id}/suspend`, admin, { statement: 'corto' })).status, 400);
  assert.equal((await raw('POST', `/api/admin/users/${lea.id}/suspend`, admin, { statement: 'Spam ripetuto nei commenti dopo due avvisi' })).status, 200);
  assert.equal((await raw('POST', '/api/login', undefined, { login: 'lea', password: 'password123' })).status, 403);
  assert.equal((await raw('GET', '/api/admin/users?filter=suspended&q=lea', admin)).body.users.length, 1);

  assert.equal((await raw('POST', `/api/admin/users/${lea.id}/password-reset`, admin)).status, 200);
  assert.ok(sentMails.some((m) => m.to === 'lea@example.com' && /password/i.test(m.subject)));

  // Un amministratore non proprietario non può toccare il proprietario né altri amministratori.
  const owner = (await raw('GET', '/api/admin/users?q=francesco', admin)).body.users[0];
  assert.equal((await raw('POST', `/api/admin/users/${owner.id}/suspend`, admin, { statement: 'prova sul proprietario' })).status, 403);
});

test('codice di prova per iscriversi finché la casella email non è impostata', async () => {
  const { config } = await import('../src/config.js');
  const saved = (await pool.query(`SELECT value FROM settings WHERE key = 'mail'`)).rows[0]?.value;
  await pool.query(`DELETE FROM settings WHERE key = 'mail'`);
  process.env.MAIL_TEST = '0';
  config.testAccessCode = '424242';
  try {
    const before = sentMails.length;
    const res = await raw('POST', '/api/register', undefined, person('prova'));
    assert.equal(res.body.verify, true);
    assert.equal(res.body.testCode, true);
    assert.equal(sentMails.length, before, 'nessuna email parte');
    assert.equal((await raw('POST', '/api/verify-email', undefined, { ticket: res.body.ticket, code: '111111' })).status, 400);
    const ok = await raw('POST', '/api/verify-email', undefined, { ticket: res.body.ticket, code: '424242' });
    assert.ok(ok.body.token);
  } finally {
    process.env.MAIL_TEST = '1';
    config.testAccessCode = '';
    if (saved) await pool.query(`INSERT INTO settings (key, value) VALUES ('mail', $1)`, [saved]);
  }
});

test('ricerca, hashtag e badge Mentore', async () => {
  const sara = (await call('POST', '/api/register', undefined, person('sara'))).body.token;
  await call('POST', '/api/posts', sara, { body: 'Il mio piano su #ETF mondiale, senza fretta. #LungoPeriodo' });
  await call('POST', '/api/posts', sara, { body: 'Ho letto di #ETFtematici ma non fanno per me' });
  await call('POST', '/api/posts', anna, { body: 'Prezzo con il # da solo e email a#b non sono hashtag' });

  const tag = await call('GET', '/api/hashtags/etf/posts', admin);
  assert.equal(tag.body.posts.length, 1, '#ETFtematici non conta come #ETF');
  const trending = await call('GET', '/api/hashtags/trending', admin);
  assert.ok(trending.body.tags.some((t: any) => t.tag === 'lungoperiodo'));

  const search = await call('GET', '/api/search?q=sar', admin);
  assert.equal(search.body.users[0].username, 'sara');
  const byTag = await call('GET', '/api/search?q=%23etf', admin);
  assert.equal(byTag.body.users.length, 0);
  assert.equal(byTag.body.posts.length, 1);
  assert.deepEqual(byTag.body.tags.map((t: any) => t.tag).sort(), ['etf', 'etftematici']);
  assert.equal((await call('GET', '/api/search?q=senza%20fretta', admin)).body.posts.length, 1);

  const saraId = search.body.users[0].id;
  assert.equal((await call('POST', `/api/admin/users/${saraId}/mentor`, sara, { mentor: true })).status, 403, 'solo amministratori');
  assert.equal((await call('POST', `/api/admin/users/${saraId}/mentor`, admin, { mentor: true })).status, 200);
  assert.equal((await call('GET', '/api/users/sara', anna)).body.user.isMentor, true);
  assert.equal(tag.status, 200);
  const again = await call('GET', '/api/hashtags/etf/posts', anna);
  assert.equal(again.body.posts[0].author.isMentor, true);
  assert.equal((await call('GET', '/api/mentors', anna)).body.users[0].username, 'sara');
  assert.equal((await call('GET', '/api/admin/users?filter=mentor', admin)).body.users.length, 1);
  await call('POST', `/api/admin/users/${saraId}/mentor`, admin, { mentor: false });
  assert.equal((await call('GET', '/api/mentors', anna)).body.users.length, 0);
});

test('inviti: classifica del mese con gli amici attivi', async () => {
  const code = (await call('GET', '/api/invites', bruno)).body.code ?? (await call('GET', '/api/invites', admin)).body.code;
  const host = (await call('GET', '/api/invites', admin)).body.code;
  const tea = (await call('POST', '/api/register', undefined, { ...person('tea'), inviteCode: host })).body.token;
  await call('POST', '/api/posts', tea, { body: 'Ciao a tutti, sono nuova!' });
  const inv = await call('GET', '/api/invites', admin);
  const me = inv.body.leaderboard.find((r: any) => r.isMe);
  assert.ok(me && me.active >= 1);
  assert.equal(inv.body.leaderboard[0].rank, 1);
  assert.ok(code);
});

test('pagina di presentazione: numeri e prossime Live senza accesso', async () => {
  await call('POST', '/api/rooms', anna, { title: 'Domande per chi inizia', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
  const res = await raw('GET', '/api/public/overview');
  assert.equal(res.status, 200);
  assert.ok(res.body.members > 3);
  const item = res.body.upcoming.find((r: any) => r.title === 'Domande per chi inizia');
  assert.equal(item.host.displayName, 'ANNA');
  assert.equal(JSON.stringify(res.body).includes('@example.com'), false, 'nessuna email');
});

test('solo le email scelte diventano amministratori, mai chi si iscrive e basta', async () => {
  const { config } = await import('../src/config.js');
  const { syncStaff } = await import('../src/staff.js');
  const lorenzo = await call('POST', '/api/register', undefined, person('lorenzo'));
  assert.equal(lorenzo.body.user.role, 'admin');
  assert.equal(lorenzo.body.user.isOwner, false);
  const ugo = await call('POST', '/api/register', undefined, person('ugo'));
  assert.equal(ugo.body.user.role, 'member');

  // Lorenzo, amministratore fondatore, può nominare e togliere amministratori come il proprietario.
  assert.equal(lorenzo.body.user.canAppoint, true);
  assert.equal((await call('POST', `/api/moderation/users/${ugo.body.user.id}/role`, lorenzo.body.token, { role: 'admin' })).status, 200);
  assert.equal((await call('POST', `/api/moderation/users/${ugo.body.user.id}/role`, lorenzo.body.token, { role: 'member' })).status, 200);
  const owner = (await call('GET', '/api/me', admin)).body.user;
  assert.equal((await call('POST', `/api/moderation/users/${owner.id}/role`, lorenzo.body.token, { role: 'member' })).status, 403);

  // Un'email aggiunta dopo: all'avvio l'account già iscritto prende il ruolo.
  config.adminEmails.push('ugo@example.com');
  await syncStaff();
  assert.equal((await call('GET', '/api/me', ugo.body.token)).body.user.role, 'admin');

  // Se il proprietario cambia email in .env, il posto passa a quell'account e il vecchio torna membro.
  config.ownerEmail = 'ugo@example.com';
  await syncStaff();
  const { rows } = await pool.query(`SELECT username, role, is_owner FROM users WHERE username IN ('francesco', 'ugo') ORDER BY username`);
  assert.deepEqual(rows.map((r) => [r.username, r.role, r.is_owner]), [['francesco', 'member', false], ['ugo', 'admin', true]]);
});
