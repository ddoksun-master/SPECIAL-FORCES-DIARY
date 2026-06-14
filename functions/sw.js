/* ================================================================
   sw.js  —  작전수첩 캐시 Service Worker  v2
   (FCM 백그라운드는 firebase-messaging-sw.js 가 처리)
   ================================================================ */

const CACHE_NAME = 'jjakjeon-v2';
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

/* notificationclick 은 firebase-messaging-sw.js 가 단독 처리
   (여기 중복 등록하면 두 SW가 동시에 반응해 포커스가 튀는 현상 발생) */
