const CACHE = 'landfill-weighing-shell-v1.1.1';
const FILES = ['./', './index.html', './styles.css?v=1.1.1', './app.js?v=1.1.1', './firebase-config.js?v=1.1.1', './manifest.webmanifest?v=1.1.1', './version.json', './icon-192.png?v=1.1.1', './icon-512.png?v=1.1.1', './apple-touch-icon.png?v=1.1.1'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('landfill-weighing-') && k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith(fetch(req).catch(() => caches.match(req)));
    } else if (req.mode === 'navigate') {
      event.respondWith(fetch(req).then(resp => {
        if (resp.ok) { const copy = resp.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put('./index.html', copy))); }
        return resp;
      }).catch(async () => await caches.match('./index.html') || await caches.match('./')));
    } else {
      event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(resp => {
        if (resp.ok) { const copy = resp.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
        return resp;
      })));
    }
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const existing = await cache.match(req);
      if (existing) return existing;
      const resp = await fetch(req);
      if (resp.ok) event.waitUntil(cache.put(req, resp.clone()));
      return resp;
    }));
  }
});
