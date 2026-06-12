/* ================================================================
   firebase-messaging-sw.js  —  작전수첩 FCM 백그라운드 수신 SW
   ⚠ 파일명 고정 필수 (Firebase Messaging SDK 요구사항)
   ================================================================ */

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

/* ── 백그라운드 FCM 수신 → OS 알림 표시 ── */
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};

  /* image / person 스타일 필드를 명시적으로 제거해 S 동그라미 아바타 차단 */
  return self.registration.showNotification(d.title || '작전수첩', {
    body:      d.body  || '',
    icon:      './icons/icon-192.png',
    badge:     './icons/badge-72.png',
    image:     undefined,
    tag:       d.tag   || 'jjakjeon',
    renotify:  true,
    vibrate:   [200, 100, 200],
    data:      { url: './index.html' }
  });
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
