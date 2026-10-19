// Tutte le impostazioni arrivano dalle variabili d'ambiente (vedi .env.example).
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

// Un'email presa dal file .env, oppure quella predefinita se manca o è ancora quella d'esempio.
function emailOr(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim().toLowerCase();
  return v && !v.endsWith('@esempio.it') ? v : fallback;
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
  // Indirizzo con cui il server parla a LiveKit (dentro Docker: ws://livekit:7880)...
  livekitUrl: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  // ...e quello che usano i telefoni per collegarsi al video (wss://live.tuodominio).
  livekitPublicUrl: process.env.LIVEKIT_PUBLIC_URL ?? process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? 'devkey',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? 'devsecret-cambiami-con-almeno-32-caratteri',
  // false nei test o se LiveKit non è ancora installato: i permessi si aggiornano al prossimo ingresso.
  livekitSync: process.env.LIVEKIT_SYNC !== 'false',
  // Codice di prova per l'iscrizione finché la casella email non è impostata (vuoto = nessun codice).
  // Appena imposti l'email di invio, arrivano i codici veri e questo smette di valere.
  testAccessCode: (process.env.ACCESS_TEST_CODE ?? '').trim(),
  // Chi comanda la comunità, deciso da Francesco: lui è il proprietario, Lorenzo Giustarini amministratore.
  // Nessuno diventa amministratore perché si iscrive per primo. Gli altri amministratori li nomina solo il proprietario dall'app.
  // OWNER_EMAIL nel file .env vale solo nei test: così un errore di battitura in .env non toglie il posto al proprietario.
  ownerEmail: process.env.NODE_ENV === 'production' ? 'francescodimichele@gmail.com' : emailOr(process.env.OWNER_EMAIL, 'francescodimichele@gmail.com'),
  adminEmails: ['lorenzogiustarini@gmail.com', ...(process.env.ADMIN_EMAILS ?? '').split(/[,;\s]+/)].map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Indirizzo pubblico del sito, usato nei link delle email (es. https://lovetrading.duckdns.org).
  publicUrl: process.env.PUBLIC_URL ?? '',
  // Cartella dei backup, per mostrare nel pannello quando è stato fatto l'ultimo.
  backupDir: process.env.BACKUP_DIR ?? '',
  // Registrazione delle Live (servizio LiveKit Egress) e cartella dove finiscono i video.
  recordings: process.env.RECORDINGS === 'true',
  recordingsDir: process.env.RECORDINGS_DIR ?? './recordings',
  corsOrigin: process.env.CORS_ORIGIN ?? true,
};
