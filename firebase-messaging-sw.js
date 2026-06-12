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

/* ── 아이콘 (base64 인라인 — 외부 파일 불필요) ── */
const ICON_DATA  = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOTIgMTkyIj4KICA8cmVjdCB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgcng9IjM4IiBmaWxsPSIjMUUyRDI0Ii8+CiAgPHJlY3QgeD0iOCIgeT0iOCIgd2lkdGg9IjE3NiIgaGVpZ2h0PSIxNzYiIHJ4PSIzMiIgZmlsbD0iIzJGNEEzNiIvPgogIDxwb2x5Z29uIHBvaW50cz0iOTYsMzggMTA2LDcwIDE0MCw3MCAxMTMsOTAgMTIzLDEyMiA5NiwxMDIgNjksMTIyIDc5LDkwIDUyLDcwIDg2LDcwIiBmaWxsPSIjQzRBOTZBIiBvcGFjaXR5PSIwLjk1Ii8+CiAgPHJlY3QgeD0iNjAiIHk9IjEzOCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjUiIHJ4PSIyLjUiIGZpbGw9IiNDNEE5NkEiIG9wYWNpdHk9IjAuNiIvPgogIDxyZWN0IHg9Ijc0IiB5PSIxNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI0IiByeD0iMiIgZmlsbD0iI0M0QTk2QSIgb3BhY2l0eT0iMC40Ii8+Cjwvc3ZnPg==';
const BADGE_DATA = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA3MiA3MiI+CiAgPHJlY3Qgd2lkdGg9IjcyIiBoZWlnaHQ9IjcyIiByeD0iMTYiIGZpbGw9IiMxRTJEMjQiLz4KICA8cG9seWdvbiBwb2ludHM9IjM2LDEwIDQyLDI4IDYyLDI4IDQ2LDQwIDUyLDU4IDM2LDQ2IDIwLDU4IDI2LDQwIDEwLDI4IDMwLDI4IiBmaWxsPSIjQzRBOTZBIi8+Cjwvc3ZnPg==';

/* ── 백그라운드 FCM 수신 → OS 알림 표시 ── */
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  return self.registration.showNotification(d.title || '작전수첩', {
    body:      d.body  || '',
    icon:      ICON_DATA,
    badge:     BADGE_DATA,
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
