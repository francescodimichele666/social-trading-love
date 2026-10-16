import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { config } from './config.js';
import { HttpError } from './app.js';
import { processVideo } from './video.js';

const TYPES: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
};

// Salva il file caricato con un nome casuale; rifiuta tipi non ammessi e file troppo grandi.
export async function saveUpload(file: MultipartFile, allowed: Array<'image' | 'video'>) {
  const type = TYPES[file.mimetype];
  if (!type || !allowed.includes(type.kind)) {
    file.file.resume();
    throw new HttpError(400, 'Formato file non supportato');
  }
  const name = `${randomUUID()}.${type.ext}`;
  const dest = path.join(path.resolve(config.uploadDir), name);
  await pipeline(file.file, createWriteStream(dest));
  if (file.file.truncated) {
    await unlink(dest).catch(() => {});
    throw new HttpError(413, `File troppo grande (massimo ${config.maxUploadMb} MB)`);
  }
  if (type.kind === 'video') return { kind: type.kind, ...(await processVideo(dest)) };
  return { url: `/uploads/${name}`, kind: type.kind, posterUrl: null, duration: null };
}
