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

/* ── 앱에서 업데이트 요청 수신 ── */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ── 백그라운드 FCM 수신 → OS 알림 표시 ── */
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  /* fcmOptions.link 가 있으면 그걸, 없으면 기본 URL */
  const notifUrl = payload.fcmOptions?.link || d.link || './index.html';

  return self.registration.showNotification(d.title || '작전수첩', {
    body:      d.body  || '',
    icon:      './icons/icon-192.png',
    badge:     './icons/badge-72.png',
    image:     undefined,
    tag:       d.tag   || 'jjakjeon',
    renotify:  true,
    vibrate:   [200, 100, 200],
    data:      { url: notifUrl }   /* notificationclick 에서 사용 */
  });
});

/* ── 알림 탭 → 앱 포커스 + 딥링크 ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  /* data.url 에 ?tab=history 등 딥링크가 실려올 수 있음 */
  const targetUrl = (e.notification.data && e.notification.data.url)
    || './index.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      /* 이미 열린 앱 창이 있으면 포커스 후 딥링크 메시지 전달 */
      for (const c of list) {
        if (c.url.includes('index.html') || c.url.endsWith('/')) {
          c.focus();
          /* 앱에 탭 이동 메시지 전달 */
          c.postMessage({ type: 'NAVIGATE_TAB', url: targetUrl });
          return;
        }
      }
      /* 앱이 닫혀있으면 딥링크 URL로 새로 열기 */
      return clients.openWindow(targetUrl);
    })
  );
});
