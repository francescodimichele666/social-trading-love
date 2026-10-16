import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError } from '../app.js';
import { sendPush } from '../push.js';
import { config } from '../config.js';
import { hasRedFlags } from '../rules.js';
import { rewardInviterOnce } from '../invites.js';
import { closeLiveRoom, createLiveToken, setCanPublish } from '../livekit.js';
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
  if (!room) throw new HttpError(404, 'Piazza non trovata');
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
    if (data.record && !config.recordings) throw new HttpError(400, 'La registrazione delle Piazze non è attiva su questo server');
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

  // Dettaglio della Piazza. Chiamato ogni pochi secondi dal client: tiene aggiornata la presenza.
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
    return {
      room: serializeRoom(room),
      stage: members.filter((m) => m.role !== 'audience').map(person),
      raisedHands: isHost ? members.filter((m) => m.role === 'audience' && m.hand_raised_at).map(person) : [],
      me: { role: me?.role ?? null, handRaised: Boolean(me?.hand_raised_at), isHost },
      maxOnStage: MAX_ON_STAGE,
      recordings: room.status === 'ended' ? await roomRecordings(room.id) : [],
    };
  });

  // Registrazioni delle Piazze finite, le più recenti prima.
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

  // Chi ha condotto la Piazza o un amministratore può cancellare la registrazione.
  app.delete<{ Params: { id: string } }>('/recordings/:id', async (req) => {
    const rec = await one('SELECT rec.id, rec.file_name, r.host_id FROM recordings rec JOIN rooms r ON r.id = rec.room_id WHERE rec.id = $1 AND rec.removed_at IS NULL', [Number(req.params.id)]);
    if (!rec) throw new HttpError(404, 'Registrazione non trovata');
    if (rec.host_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'Solo chi ha condotto la Piazza o un amministratore può cancellarla');
    await query('UPDATE recordings SET removed_at = now() WHERE id = $1', [rec.id]);
    await unlink(path.join(path.resolve(config.recordingsDir), path.basename(rec.file_name))).catch(() => {});
    return { deleted: true };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/start', async (req) => {
    const room = await getRoom(Number(req.params.id));
    if (room.host_id !== req.user.id) throw new HttpError(403, 'Solo chi ha creato la Piazza può avviarla');
    if (room.status !== 'scheduled') throw new HttpError(400, 'La Piazza è già iniziata o finita');
    await query(`UPDATE rooms SET status = 'live', started_at = now() WHERE id = $1`, [room.id]);
    await notifyFollowers(req.user.id, req.user.username, room.id, room.title);
    if (room.record) await startRecording(room.id);
    return { room: serializeRoom(await getRoom(room.id)) };
  });

  app.post<{ Params: { id: string } }>('/rooms/:id/end', async (req) => {
    const room = await getRoom(Number(req.params.id));
    if (room.host_id !== req.user.id && req.user.role === 'member') throw new HttpError(403, 'Solo chi ha creato la Piazza può chiuderla');
    await query(`UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1 AND status <> 'ended'`, [room.id]);
    await closeLiveRoom(room.id);
    return { ended: true };
  });

  // Entra nella Piazza e ricevi il "biglietto" per il video. Chi è sul palco può trasmettere.
  app.post<{ Params: { id: string } }>('/rooms/:id/join', async (req) => {
    const room = await getRoom(Number(req.params.id));
    const isHost = room.host_id === req.user.id;
    if (room.status === 'ended') throw new HttpError(400, 'La Piazza è finita');
    if (room.status !== 'live' && !isHost) throw new HttpError(400, 'La Piazza non è ancora iniziata');
    const member = await one(
      `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET last_seen_at = now()
       RETURNING role`,
      [room.id, req.user.id, isHost ? 'host' : 'audience'],
    );
    const me = await one('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
    if (!isHost) await rewardInviterOnce(req.user.id);
    const canPublish = member.role !== 'audience';
    return {
      livekitUrl: config.livekitUrl,
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
    if (!res.rowCount) throw new HttpError(400, 'Entra nella Piazza prima di alzare la mano');
    return { handRaised: true };
  });

  app.delete<{ Params: { id: string } }>('/rooms/:id/hand', async (req) => {
    await query(`UPDATE room_members SET hand_raised_at = NULL WHERE room_id = $1 AND user_id = $2`, [Number(req.params.id), req.user.id]);
    return { handRaised: false };
  });

  // Chi ha creato la Piazza fa salire qualcuno sul palco (massimo 6 persone, conduttore incluso).
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
}

async function roomRecordings(roomId: number) {
  await refreshRecordings();
  const { rows } = await query(`SELECT * FROM recordings WHERE room_id = $1 AND removed_at IS NULL AND status IN ('ready', 'processing') ORDER BY started_at`, [roomId]);
  return rows.map(serializeRecording);
}

async function notifyFollowers(hostId: number, username: string, roomId: number, title: string) {
  const message = `@${username} è in diretta: ${title}`;
  const link = `/piazze/${roomId}`;
  const { rows } = await query(
    `INSERT INTO notifications (user_id, kind, message, link)
     SELECT follower_id, 'room_live', $2, $3 FROM follows WHERE followed_id = $1 RETURNING user_id`,
    [hostId, message, link],
  );
  setImmediate(() => { for (const r of rows) sendPush(r.user_id, message, link).catch(() => {}); });
}
