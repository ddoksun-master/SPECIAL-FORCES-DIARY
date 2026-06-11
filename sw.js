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

/* ── 알림 탭 → 앱 포커스 ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for (const c of list) {
        if (c.url.includes('index.html') || c.url.endsWith('/')) return c.focus();
      }
      return clients.openWindow('./index.html');
    })
  );
});
