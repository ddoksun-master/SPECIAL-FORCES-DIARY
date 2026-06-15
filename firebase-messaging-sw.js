/* ============================================================
   firebase-messaging-sw.js  —  작전수첩 PWA  (통합 SW)
   역할: 캐시 + FCM 백그라운드 알림 + 뱃지 — 단일 SW
   sw.js 는 삭제해도 됩니다
   ============================================================ */

/* ── 캐시 설정 (구 sw.js 기능 흡수) ── */
const CACHE_NAME = 'jjakjeon-v5';
const ASSETS     = ['./index.html', './manifest.json'];

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

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ── Firebase ── */
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

/* ── 뱃지 +1 대상 이벤트 (카테고리 C) ── */
const BADGE_EVENT_TYPES = [
  'partner_certified',
  'cheer_request',
  'mission_activated',
  'deadline_warning'
];

/* ── 백그라운드 메시지 수신 → 알림 표시 ── */
messaging.onBackgroundMessage(async (payload) => {
  const data      = payload.data || {};
  const title     = data.title     || '작전수첩';
  const body      = data.body      || '새 알림이 있습니다';
  const eventType = data.eventType || '';
  const category  = data.category  || 'B';
  const url       = data.url       || '/';

  if (BADGE_EVENT_TYPES.includes(eventType)) {
    await _incrementBadge();
  }

  await self.registration.showNotification(title, {
    body,
    icon:             '/icons/icon-192x192.png',
    tag:              eventType || category,
    renotify:         eventType !== '',
    data:             { url },
    actions:          _getActions(eventType),
    vibrate:          _getVibration(category),
    requireInteraction: category === 'C',
  });
});

/* ── 알림 클릭 ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  if (event.action === 'dismiss') return;
  event.waitUntil(_focusOrOpen(url));
});

/* ── 유틸 ── */
async function _focusOrOpen(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) {
    if (c.url.includes(self.location.origin) && 'focus' in c) {
      await c.focus();
      c.postMessage({ type: 'NOTIFICATION_CLICK', url });
      return;
    }
  }
  await self.clients.openWindow(url);
}

/* ── 뱃지 카운트 (IndexedDB) ── */
const DB_NAME = 'badge-store', DB_VERSION = 1, STORE_NAME = 'badge';

function _openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}

async function _getBadgeCount() {
  const db = await _openDB();
  return new Promise(res => {
    const r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('count');
    r.onsuccess = e => res(e.target.result || 0);
    r.onerror   = ()  => res(0);
  });
}

async function _setBadgeCount(n) {
  const db = await _openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(n, 'count');
    tx.oncomplete = res;
    tx.onerror    = rej;
  });
}

async function _incrementBadge() {
  const next = (await _getBadgeCount()) + 1;
  await _setBadgeCount(next);
  if ('setAppBadge' in self.navigator) await self.navigator.setAppBadge(next).catch(() => {});
}

function _getVibration(category) {
  if (category === 'C') return [200, 100, 200, 100, 400];
  if (category === 'A') return [200, 100, 200];
  return [150];
}

function _getActions(eventType) {
  if (eventType === 'cheer_request')    return [{ action: 'open', title: '🔥 응원하기' }, { action: 'dismiss', title: '나중에' }];
  if (eventType === 'partner_certified') return [{ action: 'open', title: '✅ 확인하기' }];
  if (eventType === 'deadline_warning')  return [{ action: 'open', title: '⚡ 지금 수행' }, { action: 'dismiss', title: '넘기기' }];
  return [{ action: 'open', title: '앱 열기' }];
}
