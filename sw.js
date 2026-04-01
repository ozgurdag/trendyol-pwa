/* ── SERVICE WORKER · sw.js ──────────────────────────────────────
   Offline çalışma için tüm statik dosyaları cache'ler
──────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'satis-yonetim-v8';
const CACHE_FILES = [
  '/',
  '/index.html',
  '/app.css',
  '/state.js',
  '/manifest.json',
  '/dashboard.html',
  '/fiyatlar.html',
  '/satis-giris.html',
  '/stok.html',
  '/alis-hesap.html',
  '/ayarlar.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // CDN isteklerini (xlsx, fonts) cache'leme, network'ten al
  if (e.request.url.includes('cdn.jsdelivr') || e.request.url.includes('fonts.google')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Statik dosyalar: önce cache, sonra network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
