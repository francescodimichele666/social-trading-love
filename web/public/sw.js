// Service worker: permette di installare l'app e mostra le notifiche sul telefono. Nessuna cache dei dati.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = { title: 'Love Trading Club', body: 'Hai un nuovo avviso', link: '/notifiche' };
  try { data = { ...data, ...event.data.json() }; } catch { /* messaggio vuoto */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    data: { link: data.link },
    tag: data.link,
  }));
});

// Tocco sulla notifica: apre l'app nella pagina giusta (o la porta in primo piano se è già aperta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) await c.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
