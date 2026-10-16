// Service worker minimo: permette di installare l'app sul telefono. Nessuna cache dei dati.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
