// Service worker: network-first for assets and cache cleanup
const CACHE_NAME = 'manuale-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => {
        if (k !== CACHE_NAME) return caches.delete(k);
        return Promise.resolve();
      })
    ))
  );
  self.clients.claim();
});

// Network-first strategy: try fetch, update cache, fallback to cache
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only handle navigation and same-origin GET requests
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) {
    return e.respondWith(fetch(req));
  }

  e.respondWith(
    fetch(req).then(networkResponse => {
      // Update cache asynchronously
      caches.open(CACHE_NAME).then(cache => cache.put(req, networkResponse.clone()));
      return networkResponse;
    }).catch(() => caches.match(req))
  );
});