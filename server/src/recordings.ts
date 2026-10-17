import { EgressClient, EgressStatus, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset, RoomServiceClient } from 'livekit-server-sdk';
import { one, query } from './db.js';
import { config } from './config.js';
import { roomName } from './livekit.js';

// Registrazione delle Live con LiveKit Egress: un servizio a parte (docker-compose) che "guarda"
// la Live come uno spettatore e salva un video MP4 con tutte le persone sul palco, a griglia.
// I file finiscono nella cartella condivisa "recordings" e il server li mostra in /recordings/.

const http = () => config.livekitUrl.replace(/^ws/, 'http');
const egress = () => new EgressClient(http(), config.livekitApiKey, config.livekitApiSecret);

export async function startRecording(roomId: number) {
  const file = `piazza-${roomId}-${Date.now()}.mp4`;
  const rec = await one(`INSERT INTO recordings (room_id, file_name) VALUES ($1, $2) RETURNING id`, [roomId, file]);
  if (!config.recordings || !config.livekitSync) return rec.id; // nei test: resta solo la riga
  try {
    // La stanza LiveKit deve esistere prima che parta la registrazione.
    await new RoomServiceClient(http(), config.livekitApiKey, config.livekitApiSecret).createRoom({ name: roomName(roomId), emptyTimeout: 600 });
    const info = await egress().startRoomCompositeEgress(
      roomName(roomId),
      new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: `/out/${file}` }),
      { layout: 'grid', encodingOptions: EncodingOptionsPreset.H264_720P_30 },
    );
    await query('UPDATE recordings SET egress_id = $2 WHERE id = $1', [rec.id, info.egressId]);
  } catch (err) {
    console.error('Registrazione non avviata:', err);
    await query(`UPDATE recordings SET status = 'failed', ended_at = now() WHERE id = $1`, [rec.id]);
  }
  return rec.id;
}

export async function stopRecording(roomId: number) {
  const { rows } = await query(`UPDATE recordings SET status = 'processing', ended_at = now() WHERE room_id = $1 AND status = 'recording' RETURNING egress_id`, [roomId]);
  if (!config.recordings || !config.livekitSync) return;
  for (const r of rows) {
    if (r.egress_id) await egress().stopEgress(r.egress_id).catch(() => {});
  }
}

// Le registrazioni in lavorazione diventano pronte quando Egress ha finito di scrivere il file.
export async function refreshRecordings() {
  if (!config.recordings || !config.livekitSync) return;
  const { rows } = await query(`SELECT id, egress_id FROM recordings WHERE status IN ('recording', 'processing') AND egress_id IS NOT NULL`);
  for (const r of rows) {
    try {
      const [info] = await egress().listEgress({ egressId: r.egress_id });
      if (!info) continue;
      if (info.status === EgressStatus.EGRESS_COMPLETE || info.status === EgressStatus.EGRESS_LIMIT_REACHED) {
        const f = info.fileResults?.[0];
        await query(
          `UPDATE recordings SET status = 'ready', duration = $2, size_bytes = $3, ended_at = COALESCE(ended_at, now()) WHERE id = $1`,
          [r.id, f ? Math.round(Number(f.duration) / 1e9) : null, f ? Number(f.size) : null],
        );
      } else if (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) {
        await query(`UPDATE recordings SET status = 'failed', ended_at = COALESCE(ended_at, now()) WHERE id = $1`, [r.id]);
      }
    } catch {
      /* LiveKit non raggiungibile: si riprova alla prossima richiesta */
    }
  }
}
