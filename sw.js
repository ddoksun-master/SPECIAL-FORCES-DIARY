const CACHE_NAME = 'jjakjeon-v4';
const ASSETS = ['./index.html', './manifest.json'];

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDG6QSmGSHsj7ASijKDeTRi5pzMvUPW3qE",
  authDomain:        "special-forces-diary.firebaseapp.com",
  databaseURL:       "https://special-forces-diary-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "special-forces-diary",
  storageBucket:     "special-forces-diary.firebasestorage.app",
  messagingSenderId: "1036488823016",
  appId:             "1:1036488823016:web:057282751952b0c717395d"
});

const messaging = firebase.messaging();

// ✅ FIX: onBackgroundMessage 대신 push 이벤트 직접 처리
// - 앱 열린 상태(포그라운드): 상단알림 표시 안 함
// - 앱 닫힌 상태(백그라운드): 상단알림 표시
self.addEventListener('push', e => {
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const focused = clients.some(c => c.visibilityState === 'visible');
      if (focused) return; // 앱 열려있으면 알림 표시 안 함

      // 앱 닫힌 상태 — payload에서 title/body 추출해서 직접 표시
      let title = '특전사 작전수첩';
      let body = '';
      try {
        const data = e.data && e.data.json();
        title = (data.notification && data.notification.title) || title;
        body  = (data.notification && data.notification.body)  || body;
      } catch(_) {}

      return self.registration.showNotification(title, {
        body,
        icon:    'icon-192.png',
        badge:   'icon-192.png',
        vibrate: [200, 100, 200],
      });
    })
  );
});

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
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
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
