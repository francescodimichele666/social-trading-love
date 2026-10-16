import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://stl:stl@localhost:5432/stl_test';
process.env.LIVEKIT_SYNC = 'false';
process.env.UPLOAD_DIR = '/tmp/stl-test-uploads';

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { buildApp } = await import('../src/app.js');
const { isAdult } = await import('../src/routes/auth.js');

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

async function call(method: string, url: string, token?: string, payload?: unknown) {
  const res = await app.inject({ method: method as any, url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() };
}

const person = (username: string, inviteCode?: string) => ({
  email: `${username}@example.com`, password: 'password123', username, displayName: username.toUpperCase(),
  birthDate: '1980-05-10', inviteCode, acceptRules: true,
});

let admin = '', anna = '', bruno = '';
let annaId = 0, brunoId = 0;

test('verifica età', () => {
  assert.equal(isAdult('2000-01-01', new Date('2026-10-16')), true);
  assert.equal(isAdult('2008-10-17', new Date('2026-10-16')), false);
  assert.equal(isAdult('2008-10-16', new Date('2026-10-16')), true);
});

test('il primo iscritto diventa amministratore senza invito', async () => {
  const rules = await call('GET', '/api/rules');
  assert.equal(rules.body.inviteRequired, false);
  const res = await call('POST', '/api/register', undefined, person('francesco'));
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'admin');
  admin = res.body.token;
});

test('dopo il primo serve un invito valido e la maggiore età', async () => {
  assert.equal((await call('POST', '/api/register', undefined, person('anna'))).status, 400);
  assert.equal((await call('POST', '/api/register', undefined, person('anna', 'FALSO123'))).status, 400);

  const inv = await call('POST', '/api/invites', admin);
  assert.equal(inv.status, 201);
  assert.equal(inv.body.invitesLeft, 2);

  const minor = await call('POST', '/api/register', undefined, { ...person('piccolo', inv.body.code), birthDate: '2012-01-01' });
  assert.equal(minor.status, 400);

  const ok = await call('POST', '/api/register', undefined, person('anna', inv.body.code));
  assert.equal(ok.status, 201);
  anna = ok.body.token;
  annaId = ok.body.user.id;
  assert.equal((await call('POST', '/api/register', undefined, person('anna2', inv.body.code))).status, 400, 'codice già usato');

  const inv2 = await call('POST', '/api/invites', anna);
  const b = await call('POST', '/api/register', undefined, person('bruno', inv2.body.code));
  bruno = b.body.token;
  brunoId = b.body.user.id;
});

test('login e profilo', async () => {
  const res = await call('POST', '/api/login', undefined, { login: 'ANNA', password: 'password123' });
  assert.equal(res.status, 200);
  assert.equal((await call('POST', '/api/login', undefined, { login: 'anna', password: 'sbagliata' })).status, 401);
  const upd = await call('PATCH', '/api/me', anna, { bio: 'Imparo a gestire il rischio', interests: ['azioni', 'ETF'] });
  assert.deepEqual(upd.body.user.interests, ['azioni', 'ETF']);
  assert.equal((await call('GET', '/api/me')).status, 401);
});

test('il primo post di un invitato premia chi lo ha invitato', async () => {
  const res = await call('POST', '/api/posts', anna, { body: 'Il mio piano: rischio massimo 1% a operazione' });
  assert.equal(res.status, 201);
  const invites = await call('GET', '/api/invites', admin);
  assert.equal(invites.body.invitesLeft, 3);
  assert.equal(invites.body.activeInvitees, 1);
  await call('POST', '/api/posts', anna, { body: 'Secondo post' });
  assert.equal((await call('GET', '/api/invites', admin)).body.invitesLeft, 3, 'premio una volta sola');
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

test('Piazze live: palco, mano alzata, limite di 6 persone', async () => {
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
