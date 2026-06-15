/* ================================================================
   sw.js  —  작전수첩 캐시 Service Worker  v4
   캐시/오프라인 전용. FCM 백그라운드 알림은 firebase-messaging-sw.js 단독 처리.
   ================================================================ */

const CACHE_NAME = 'jjakjeon-v4';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
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
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis')) return;
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});

/* ── 앱에서 업데이트 요청 수신 ── */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
