import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './app.js';

const run = promisify(execFile);

// Al massimo due video convertiti insieme, per non bloccare il PC che fa da server.
let running = 0;
const waiting: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export async function videoDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run(config.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 30_000 });
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('durata non valida');
    return seconds;
  } catch {
    throw new HttpError(400, 'Non riesco a leggere questo video. Prova con un file MP4 o MOV.');
  }
}

// Controlla la durata e converte il video in MP4 (H.264, lato corto 720 px) che si vede su tutti i telefoni.
// Crea anche l'immagine di copertina. Il file originale viene cancellato.
export async function processVideo(original: string) {
  const base = original.replace(/\.[^.]+$/, '');
  const out = `${base}-v.mp4`;
  const poster = `${base}-v.jpg`;
  try {
    const duration = await videoDuration(original);
    if (duration > config.maxVideoSeconds + 0.5) {
      throw new HttpError(400, `Il video dura ${formatDuration(duration)}: il massimo è ${formatDuration(config.maxVideoSeconds)}`);
    }
    await slot(async () => {
      try {
        await run(config.ffmpegPath, [
          '-v', 'error', '-y', '-i', original,
          '-t', String(config.maxVideoSeconds),
          '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)',fps=30",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          '-movflags', '+faststart', out,
        ], { timeout: 10 * 60_000 });
        await run(config.ffmpegPath, ['-v', 'error', '-y', '-ss', String(Math.min(1, duration / 2)), '-i', out, '-frames:v', '1', '-q:v', '4', poster], { timeout: 60_000 });
      } catch {
        await unlink(out).catch(() => {});
        await unlink(poster).catch(() => {});
        throw new HttpError(400, 'Non riesco a preparare questo video. Prova con un altro file.');
      }
    });
    return {
      url: `/uploads/${path.basename(out)}`,
      posterUrl: `/uploads/${path.basename(poster)}`,
      duration: Math.round(Math.min(duration, config.maxVideoSeconds)),
    };
  } finally {
    await unlink(original).catch(() => {});
  }
}

export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
