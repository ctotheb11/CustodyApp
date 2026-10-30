// Offline support: keeps a copy of the app files on the device.
// Your data is never here — it lives in the app's local database.
const CACHE = 'custody-record-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from the device first (works offline), then refresh the copy in the
// background when online so updates arrive on the next launch.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : null;
  const isAsset = e.request.mode === 'navigate' || (rel !== null && ASSETS.includes(rel || './'));
  if (!isAsset) return;
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key);
      const fresh = fetch(e.request).then(res => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
