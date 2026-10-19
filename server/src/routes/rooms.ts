import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { sendPush } from '../push.js';
import { config } from '../config.js';
import { hasRedFlags } from '../rules.js';
import { rewardInviterOnce } from '../invites.js';
import { closeLiveRoom, createLiveToken, removeFromLive, setCanPublish } from '../livekit.js';
import { refreshRecordings, startRecording } from '../recordings.js';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export const MAX_ON_STAGE = 6;
const ACTIVE = `last_seen_at > now() - interval '30 seconds'`;

function serializeRoom(r: any) {
  return {
    id: r.id, title: r.title, description: r.description, topic: r.topic, status: r.status,
    scheduledAt: r.scheduled_at, startedAt: r.started_at, endedAt: r.ended_at,
    host: { id: r.host_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url },
    listeners: r.listeners ?? 0, record: r.record,
  };
}

async function kickedOrBlocked(roomId: number, hostId: number, userId: number) {
  return one(
    `SELECT EXISTS (SELECT 1 FROM room_kicks WHERE room_id = $1 AND user_id = $3) AS kicked,
            EXISTS (SELECT 1 FROM host_blocks WHERE host_id = $2 AND user_id = $3) AS blocked`,
    [roomId, hostId, userId],
  );
}

function serializeRecording(r: any) {
  return {
    id: r.id, roomId: r.room_id, status: r.status, url: r.status === 'ready' ? `/recordings/${r.file_name}` : null,
    duration: r.duration, sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes), startedAt: r.started_at, endedAt: r.ended_at,
    title: r.title, host: r.host_username ? { username: r.host_username, displayName: r.host_display_name, avatarUrl: r.host_avatar_url } : undefined,
  };
}

const ROOM_SELECT = `
  SELECT r.*, u.username, u.display_name, u.avatar_url,
         (SELECT count(*)::int FROM room_members m WHERE m.room_id = r.id AND m.${ACTIVE}) AS listeners
  FROM rooms r JOIN users u ON u.id = r.host_id`;

async function getRoom(id: number) {
  const room = await one(`${ROOM_SELECT} WHERE r.id = $1 AND r.removed_at IS NULL AND u.banned_at IS NULL`, [id]);
  if (!room) throw new HttpError(404, 'Live non trovata');
  return room;
}

export default async function roomRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/rooms', async () => {
    const { rows } = await query(
      `${ROOM_SELECT} WHERE r.removed_at IS NULL AND u.banned_at IS NULL
         AND (r.status = 'live' OR (r.status = 'scheduled' AND r.scheduled_at > now() - interval '12 hours'))
       ORDER BY (r.status = 'live') DESC, r.scheduled_at ASC LIMIT 50`,
    );
    return { rooms: rows.map(serializeRoom), recordingsEnabled: config.recordings };
  });

  app.post('/rooms', async (req, reply) => {
    const data = z.object({
      title: z.string().trim().min(3).max(80),
      description: z.string().trim().max(500).default(''),
      topic: z.string().trim().max(30).default(''),
      scheduledAt: z.string().datetime({ offset: true }).optional(),
      startNow: z.boolean().default(false),
      record: z.boolean().default(false),
    }).parse(req.body);
    if (data.record && !config.recordings) throw new HttpError(400, 'La registrazione delle Live non è attiva su questo server');
    if (hasRedFlags(`${data.title} ${data.description}`)) {
      throw new HttpError(400, 'Titolo o descrizione contengono promesse di guadagno non ammesse dalle regole della comunità');
    }
    const room = await one(
      `INSERT INTO rooms (host_id, title, description, topic, status, scheduled_at, started_at, record)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7, $8) RETURNING id`,
      [req.user.id, data.title, data.description, data.topic, data.startNow ? 'live' : 'scheduled', data.scheduledAt ?? null, data.startNow ? new Date() : null, data.record],
    );
    await query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'host')`, [room.id, req.user.id]);
    if (data.startNow) await notifyFollowers(req.user.id, req.user.username, room.id, data.title);
    if (data.startNow && data.record) await startRecording(room.id);
    reply.status(201);
    return { room: serializeRoom(await getRoom(room.id)) };
  });

  // Dettaglio della Live. Chiamato ogni pochi secondi dal client: tiene aggiornata la presenza.
  app.get<{ Params: { id: string } }>('/rooms/:id', async (req) => {
    const room = await getRoom(Number(req.params.id));
    await query(`UPDATE room_members SET last_seen_at = now() WHERE room_id = $1 AND user_id = $2`, [room.id, req.user.id]);
    const { rows: members } = await query(
      `SELECT m.user_id, m.role, m.hand_raised_at, u.username, u.display_name, u.avatar_url
       FROM room_members m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1 AND (m.role <> 'audience' OR m.hand_raised_at IS NOT NULL OR m.user_id = $2)
         AND (m.role = 'host' OR m.${ACTIVE})`,
      [room.id, req.user.id],
    );
    const person = (m: any) => ({ id: m.user_id, username: m.username, displayName: m.display_name, avatarUrl: m.avatar_url, role: m.role });
    const me = members.find((m) => m.user_id === req.user.id);
    const isHost = room.host_id === req.user.id;
    if (room.status === 'live') await query('UPDATE rooms SET peak_listeners = GREATEST(peak_listeners, $2) WHERE id = $1', [room.id, room.listeners]);
    const out = isHost ? null : await kickedOrBlocked(room.id, room.host_id, req.user.id);
    return {
      room: serializeRoom(room),
      stage: members.filter((m) => m.role !== 'audience').map(person),
      raisedHands: isHost ? members.filter((m) => m.role === 'audience' && m.hand_raised_at).map(person) : [],
      me: { role: me?.role ?? null, handRaised: Boolean(me?.hand_raised_at), isHost, removed: out?.blocked ? 'blocked' : out?.kicked ? 'kicked' : null },
      maxOnStage: MAX_ON_STAGE,
      recordings: room.status === 'ended' ? await roomRecordings(room.id) : [],
    };
  });

  // Registrazioni delle Live finite, le più recenti prima.
  app.get('/recordings', async () => {
    await refreshRecordings();
    const { rows } = await query(
      `SELECT rec.*, r.title, u.username AS host_username, u.display_name AS host_display_name, u.avatar_url AS host_avatar_url
       FROM recordings rec JOIN rooms r ON r.id = rec.room_id JOIN users u ON u.id = r.host_id
       WHERE rec.removed_at IS NULL AND r.removed_at IS NULL AND u.banned_at IS NULL AND rec.status IN ('ready', 'processing')
       ORDER BY rec.started_at DESC LIMIT 30`,
    );
    return { recordings: rows.map(serializeRecording) };
  });

  // Chi ha condotto la Live o un amministratore può cancellare la registrazione.
  app.delete<{ Params: { id: string } }>('/recordings/:id', async (req) => {
    const rec = await one('SELECT rec.id, rec.file_name, r.host_id FROM recordings rec JOIN rooms r ON r.id = rec.room_id WHERE rec.id = $1 AND rec.removed_at IS NULL', [Number(req.params.id)]);
    if (!rec) throw new HttpError(404, 'Registrazione non trovata');
    if (rec.host_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'Solo chi ha condotto la Live o un amministratore può cancellarla');
    await query('UPDATE recordings SET removed_at = now() WHERE id = $1', [rec.id]);
    await unlink(path.join(path.resolve(config.recordingsDir), path.basename(rec.file_name))).catch(() => {});
    return { deleted: true };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/start', async (req) => {
    const room = await getRoom(Number(req.params.id));
    if (room.host_id !== req.user.id) throw new HttpError(403, 'Solo chi ha creato la Live può avviarla');
    if (room.status !== 'scheduled') throw new HttpError(400, 'La Live è già iniziata o finita');
    await query(`UPDATE rooms SET status = 'live', started_at = now() WHERE id = $1`, [room.id]);
    await notifyFollowers(req.user.id, req.user.username, room.id, room.title);
    if (room.record) await startRecording(room.id);
    return { room: serializeRoom(await getRoom(room.id)) };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/end', async (req) => {
    const room = await getRoom(Number(req.params.id));
    if (room.host_id !== req.user.id && req.user.role === 'member') throw new HttpError(403, 'Solo chi ha creato la Live può chiuderla');
    await query(`UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1 AND status <> 'ended'`, [room.id]);
    await closeLiveRoom(room.id);
    return { ended: true };
  });

  // Entra nella Live e ricevi il "biglietto" per il video. Chi è sul palco può trasmettere.
  app.post<{ Params: { id: string } }>('/rooms/:id/join', async (req) => {
    const room = await getRoom(Number(req.params.id));
    const isHost = room.host_id === req.user.id;
    if (room.status === 'ended') throw new HttpError(400, 'La Live è finita');
    if (room.status !== 'live' && !isHost) throw new HttpError(400, 'La Live non è ancora iniziata');
    if (!isHost) {
      const out = await kickedOrBlocked(room.id, room.host_id, req.user.id);
      if (out.blocked) throw new HttpError(403, 'Chi conduce ti ha bloccato: non puoi entrare nelle sue Live');
      if (out.kicked) throw new HttpError(403, 'Chi conduce ti ha fatto uscire da questa Live');
    }
    const member = await one(
      `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()
       RETURNING role, (xmax = 0) AS inserted`,
      [room.id, req.user.id, isHost ? 'host' : 'audience'],
    );
    if (member.inserted && !isHost) await query('UPDATE rooms SET total_visitors = total_visitors + 1 WHERE id = $1', [room.id]);
    const me = await one('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
    if (!isHost) await rewardInviterOnce(req.user.id);
    const canPublish = member.role !== 'audience';
    return {
      livekitUrl: config.livekitPublicUrl,
      token: await createLiveToken(room.id, { id: req.user.id, displayName: me.display_name }, canPublish),
      role: member.role,
    };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/leave', async (req) => {
    await query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2 AND role <> 'host'`, [Number(req.params.id), req.user.id]);
    return { left: true };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/hand', async (req) => {
    const res = await query(
      `UPDATE room_members SET hand_raised_at = now() WHERE room_id = $1 AND user_id = $2 AND role = 'audience'`,
      [Number(req.params.id), req.user.id],
    );
    if (!res.rowCount) throw new HttpError(400, 'Entra nella Live prima di alzare la mano');
    return { handRaised: true };
  });

  app.delete<{ Params: { id: string } }>('/rooms/:id/hand', async (req) => {
    await query(`UPDATE room_members SET hand_raised_at = NULL WHERE room_id = $1 AND user_id = $2`, [Number(req.params.id), req.user.id]);
    return { handRaised: false };
  });

  // Chi ha creato la Live fa salire qualcuno sul palco (massimo 6 persone, conduttore incluso).
  app.post<{ Params: { id: string; userId: string } }>('/rooms/:id/speakers/:userId', async (req) => {
    const room = await getRoom(Number(req.params.id));
    if (room.host_id !== req.user.id) throw new HttpError(403, 'Solo chi conduce può far salire sul palco');
    const userId = Number(req.params.userId);
    const onStage = await one<{ n: number }>(`SELECT count(*)::int AS n FROM room_members WHERE room_id = $1 AND role <> 'audience'`, [room.id]);
    if ((onStage?.n ?? 0) >= MAX_ON_STAGE) throw new HttpError(400, `Il palco è pieno (massimo ${MAX_ON_STAGE} persone)`);
    const res = await query(
      `UPDATE room_members SET role = 'speaker', hand_raised_at = NULL WHERE room_id = $1 AND user_id = $2 AND role = 'audience'`,
      [room.id, userId],
    );
    if (!res.rowCount) throw new HttpError(404, 'Questa persona non è nel pubblico');
    await setCanPublish(room.id, userId, true);
    return { role: 'speaker' };
  });

  // Scende dal palco: lo decide chi conduce, oppure la persona stessa.
  app.delete<{ Params: { id: string; userId: string } }>('/rooms/:id/speakers/:userId', async (req) => {
    const room = await getRoom(Number(req.params.id));
    const userId = Number(req.params.userId);
    if (room.host_id !== req.user.id && userId !== req.user.id) throw new HttpError(403, 'Non puoi farlo');
    const res = await query(`UPDATE room_members SET role = 'audience' WHERE room_id = $1 AND user_id = $2 AND role = 'speaker'`, [room.id, userId]);
    if (!res.rowCount) throw new HttpError(404, 'Questa persona non è sul palco');
    await setCanPublish(room.id, userId, false);
    return { role: 'audience' };
  });

  const hostOnly = async (id: string, userId: number) => {
    const room = await getRoom(Number(id));
    if (room.host_id !== userId) throw new HttpError(403, 'Il pannello della Live è solo per chi la conduce');
    return room;
  };

  app.get<{ Params: { id: string } }>('/rooms/:id/panel', async (req) => {
    const room = await hostOnly(req.params.id, req.user.id);
    return livePanel(room.id);
  });

  // Fa uscire qualcuno che disturba. Con "block" non potrà più entrare in nessuna Live di chi conduce.
  app.post<{ Params: { id: string; userId: string } }>('/rooms/:id/kick/:userId', async (req) => {
    const room = await hostOnly(req.params.id, req.user.id);
    const { block } = z.object({ block: z.boolean().default(false) }).parse(req.body ?? {});
    const userId = Number(req.params.userId);
    if (userId === req.user.id) throw new HttpError(400, 'Non puoi far uscire te stesso');
    const target = await one('SELECT id FROM users WHERE id = $1', [userId]);
    if (!target) throw new HttpError(404, 'Utente non trovato');
    await query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, userId]);
    await query('INSERT INTO room_kicks (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room.id, userId]);
    if (block) await query('INSERT INTO host_blocks (host_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room.host_id, userId]);
    await removeFromLive(room.id, userId);
    return livePanel(room.id);
  });

  // Ripensamento: la persona può tornare in questa Live (e, se era bloccata, nelle Live future).
  app.delete<{ Params: { id: string; userId: string } }>('/rooms/:id/kick/:userId', async (req) => {
    const room = await hostOnly(req.params.id, req.user.id);
    const userId = Number(req.params.userId);
    await query('DELETE FROM room_kicks WHERE room_id = $1 AND user_id = $2', [room.id, userId]);
    await query('DELETE FROM host_blocks WHERE host_id = $1 AND user_id = $2', [room.host_id, userId]);
    return livePanel(room.id);
  });
}

// Pannello di chi conduce: i numeri della diretta e chi è collegato, con i tasti per far uscire o bloccare.
export async function livePanel(roomId: number) {
  const r = await one(
    `SELECT r.status, r.started_at, r.ended_at, r.peak_listeners, r.total_visitors, r.host_id,
            (SELECT count(*)::int FROM room_members m WHERE m.room_id = r.id AND m.${ACTIVE}) AS listeners
     FROM rooms r WHERE r.id = $1`,
    [roomId],
  );
  const { rows: people } = await query(
    `SELECT m.user_id, m.role, m.hand_raised_at, m.joined_at, u.username, u.display_name, u.avatar_url
     FROM room_members m JOIN users u ON u.id = m.user_id
     WHERE m.room_id = $1 AND m.${ACTIVE}
     ORDER BY (m.role = 'host') DESC, (m.role = 'speaker') DESC, m.hand_raised_at NULLS LAST, m.joined_at`,
    [roomId],
  );
  const { rows: kicked } = await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, k.created_at FROM room_kicks k JOIN users u ON u.id = k.user_id
     WHERE k.room_id = $1 AND NOT EXISTS (SELECT 1 FROM host_blocks b WHERE b.host_id = $2 AND b.user_id = k.user_id) ORDER BY k.created_at DESC`,
    [roomId, r.host_id],
  );
  const { rows: blocked } = await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, b.created_at FROM host_blocks b JOIN users u ON u.id = b.user_id
     WHERE b.host_id = $1 ORDER BY b.created_at DESC`,
    [r.host_id],
  );
  const brief = (u: any) => ({ id: u.id ?? u.user_id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url });
  const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
  return {
    stats: {
      listeners: r.listeners, peak: Math.max(r.peak_listeners, r.listeners), visitors: r.total_visitors,
      onStage: people.filter((p) => p.role !== 'audience').length, hands: people.filter((p) => p.hand_raised_at).length,
      seconds: r.started_at ? Math.max(0, Math.round((end - new Date(r.started_at).getTime()) / 1000)) : 0,
    },
    people: people.map((p) => ({ ...brief(p), role: p.role, handRaised: Boolean(p.hand_raised_at), joinedAt: p.joined_at })),
    kicked: kicked.map((u) => ({ ...brief(u), at: u.created_at })),
    blocked: blocked.map((u) => ({ ...brief(u), at: u.created_at })),
  };
}

async function roomRecordings(roomId: number) {
  await refreshRecordings();
  const { rows } = await query(`SELECT * FROM recordings WHERE room_id = $1 AND removed_at IS NULL AND status IN ('ready', 'processing') ORDER BY started_at`, [roomId]);
  return rows.map(serializeRecording);
}

async function notifyFollowers(hostId: number, username: string, roomId: number, title: string) {
  const message = `@${username} è in diretta: ${title}`;
  const link = `/live/${roomId}`;
  const { rows } = await query(
    `INSERT INTO notifications (user_id, kind, message, link)
     SELECT follower_id, 'room_live', $2, $3 FROM follows WHERE followed_id = $1 RETURNING user_id`,
    [hostId, message, link],
  );
  setImmediate(() => { for (const r of rows) sendPush(r.user_id, message, link).catch(() => {}); });
}
