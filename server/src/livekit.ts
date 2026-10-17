import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from './config.js';

export const roomName = (roomId: number) => `piazza-${roomId}`;

export async function createLiveToken(roomId: number, user: { id: number; displayName: string }, canPublish: boolean) {
  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: String(user.id),
    name: user.displayName,
    // Breve: chi viene fatto uscire non può rientrare col vecchio biglietto. A chi resta collegato LiveKit lo rinnova da solo.
    ttl: '15m',
  });
  at.addGrant({ roomJoin: true, room: roomName(roomId), canPublish, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}

const service = () => new RoomServiceClient(config.livekitUrl.replace(/^ws/, 'http'), config.livekitApiKey, config.livekitApiSecret);

// Aggiorna al volo chi può parlare. Se LiveKit non risponde, il client si ricollega con un token nuovo.
export async function setCanPublish(roomId: number, userId: number, canPublish: boolean) {
  if (!config.livekitSync) return;
  try {
    await service().updateParticipant(roomName(roomId), String(userId), undefined, { canPublish, canSubscribe: true, canPublishData: true });
  } catch {
    /* partecipante non connesso in questo momento: nessun problema */
  }
}

// Stacca subito qualcuno dalla diretta (fatto uscire da chi conduce, o account sospeso).
export async function removeFromLive(roomId: number, userId: number) {
  if (!config.livekitSync) return;
  try {
    await service().removeParticipant(roomName(roomId), String(userId));
  } catch {
    /* non era collegato */
  }
}

export async function closeLiveRoom(roomId: number) {
  // Se la Live era registrata, la registrazione si ferma e il video va in preparazione.
  await (await import('./recordings.js')).stopRecording(roomId);
  if (!config.livekitSync) return;
  try {
    await service().deleteRoom(roomName(roomId));
  } catch {
    /* stanza già chiusa */
  }
}
