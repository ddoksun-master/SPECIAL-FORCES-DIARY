/* ================================================================
   sw.js  —  작전수첩 캐시 Service Worker  v3
   (FCM 백그라운드는 firebase-messaging-sw.js 가 처리하나
    실제 push 이벤트는 이 SW가 컨트롤러이므로 여기서도 처리)
   ================================================================ */

const CACHE_NAME = 'jjakjeon-v3';
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

/* ── 백그라운드 Push 수신 → OS 알림 표시 ── */
self.addEventListener('push', e => {
  let d = {};
  try {
    const payload = e.data ? e.data.json() : {};
    d = payload.data || {};
  } catch (_) {
    d = {};
  }
  e.waitUntil(
    self.registration.showNotification(d.title || '작전수첩', {
      body:     d.body    || '',
      icon:     './icons/icon-192.png',
      badge:    './icons/badge-72.png',
      tag:      d.tag     || 'jjakjeon',
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: d.link || './index.html' }
    })
  );
});

/* ── 알림 탭 → 앱 포커스 ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('index.html') || c.url.endsWith('/')) {
          c.focus();
          c.postMessage({ type: 'NAVIGATE_TAB', url: targetUrl });
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
