// Piccolo client per il server: aggiunge il token e trasforma gli errori in messaggi leggibili.
const TOKEN_KEY = 'stl_token';
export const DEMO = import.meta.env.VITE_DEMO === '1';
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (DEMO) return memoryToken;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  if (DEMO) { memoryToken = token; return; }
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* modalità privata */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  if (DEMO) {
    const { demoApi } = await import('./demo');
    const method = options.method ?? (options.form || options.body !== undefined ? 'POST' : 'GET');
    try {
      return await demoApi(path, method, options.form ?? options.body);
    } catch (e: any) {
      throw new ApiError(e.status ?? 500, e.message);
    }
  }
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(options.body); }
  const res = await fetch(`/api${path}`, { method: options.method ?? (body ? 'POST' : 'GET'), headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details) ? `: ${data.details.join(', ')}` : '';
    throw new ApiError(res.status, (data.error ?? 'Qualcosa è andato storto') + detail);
  }
  return data as T;
}

export type User = { id: number; username: string; displayName: string; bio: string; interests: string[]; avatarUrl: string | null; role: 'member' | 'moderator' | 'admin'; isOwner?: boolean };
export type Post = {
  id: number; body: string; mediaUrl: string | null; mediaType: 'image' | 'video' | null; mediaPoster?: string | null; mediaDuration?: number | null; inReview: boolean; createdAt: string;
  author: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>; likes: number; comments: number; liked: boolean; fromFollowing?: boolean;
};
export type Room = {
  id: number; title: string; description: string; topic: string; status: 'scheduled' | 'live' | 'ended';
  scheduledAt: string; startedAt: string | null; host: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>; listeners: number;
};

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
