import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from './config.js';

export const roomName = (roomId: number) => `piazza-${roomId}`;

export async function createLiveToken(roomId: number, user: { id: number; displayName: string }, canPublish: boolean) {
  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: String(user.id),
    name: user.displayName,
    ttl: '6h',
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

export async function closeLiveRoom(roomId: number) {
  // Se la Piazza era registrata, la registrazione si ferma e il video va in preparazione.
  await (await import('./recordings.js')).stopRecording(roomId);
  if (!config.livekitSync) return;
  try {
    await service().deleteRoom(roomName(roomId));
  } catch {
    /* stanza già chiusa */
  }
}
