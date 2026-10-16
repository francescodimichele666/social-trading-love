// Tutte le impostazioni arrivano dalle variabili d'ambiente (vedi .env.example).
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL', 'postgres://stl:stl@localhost:5432/stl'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-cambiami'),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 500),
  // Durata massima dei video nei post (2 minuti) e programmi usati per controllarli e convertirli.
  maxVideoSeconds: Number(process.env.MAX_VIDEO_SECONDS ?? 120),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
  livekitUrl: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? 'devsecret-cambiami-con-almeno-32-caratteri',
  // false nei test o se LiveKit non è ancora installato: i permessi si aggiornano al prossimo ingresso.
  livekitSync: process.env.LIVEKIT_SYNC !== 'false',
  // Se impostata, solo questa email può diventare il primo iscritto (il proprietario).
  ownerEmail: (process.env.OWNER_EMAIL ?? '').trim().toLowerCase(),
  // Indirizzo pubblico del sito, usato nei link delle email (es. https://lovetrading.duckdns.org).
  publicUrl: process.env.PUBLIC_URL ?? '',
  // Cartella dei backup, per mostrare nel pannello quando è stato fatto l'ultimo.
  backupDir: process.env.BACKUP_DIR ?? '',
  // Registrazione delle Piazze (servizio LiveKit Egress) e cartella dove finiscono i video.
  recordings: process.env.RECORDINGS === 'true',
  recordingsDir: process.env.RECORDINGS_DIR ?? './recordings',
  corsOrigin: process.env.CORS_ORIGIN ?? true,
};
