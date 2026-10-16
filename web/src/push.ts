import { api, DEMO } from './api';

// Notifiche sul telefono: chiede il permesso, registra il dispositivo e lo comunica al server.

export function pushSupport(): 'ok' | 'ios-install' | 'unsupported' {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  if (ios && !standalone) return 'ios-install'; // su iPhone funzionano solo dall'app aggiunta alla schermata Home
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

function keyBytes(base64: string) {
  const s = atob(base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js');
}

export async function pushEnabled(): Promise<boolean> {
  if (DEMO) return localStorageGet('demo-push') === '1';
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const reg = await registration();
  return Boolean(await reg.pushManager.getSubscription());
}

export async function enablePush() {
  if (DEMO) { localStorageSet('demo-push', '1'); return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permesso negato. Puoi riattivarlo dalle impostazioni del browser o del telefono.');
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  } catch {
    throw new Error('Non riesco ad attivare le notifiche su questo browser. Prova con Chrome o Safari aggiornati, oppure dall\'app installata sul telefono.');
  }
  await api('/push/subscribe', { body: sub.toJSON() });
}

export async function disablePush() {
  if (DEMO) { localStorageSet('demo-push', '0'); return; }
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}

function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* niente */ } }
