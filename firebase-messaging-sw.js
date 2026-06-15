/* ============================================================
   firebase-messaging-sw.js  —  작전수첩 PWA
   역할: 앱이 닫혀있거나 백그라운드일 때 FCM 푸시 수신 + 표시
   배포 위치: 반드시 도메인 루트(/)에 있어야 합니다
   ============================================================ */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

/* ── Firebase 설정 (index.html과 동일하게 유지) ── */
firebase.initializeApp({
  apiKey:            "AIzaSyDG6QSmGSHsj7ASijKDeTRi5pzMvUPW3qE",   // ← 실제 키로 교체
  authDomain:        "special-forces-diary.firebaseapp.com",
  databaseURL:       "https://special-forces-diary-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "special-forces-diary",
  storageBucket:     "special-forces-diary.firebasestorage.app",
  messagingSenderId: "1036488823016",
  appId:             "1:1036488823016:web:057282751952b0c717395d"  // ← 실제 appId로 교체
});

const messaging = firebase.messaging();

/* ============================================================
   카테고리 C — 뱃지 +1 대상 이벤트 타입 목록
   이 타입이 포함된 알림만 뱃지 숫자를 올립니다
   ============================================================ */
const BADGE_EVENT_TYPES = [
  'partner_certified',   // 🎖 파트너 인증
  'cheer_request',       // 📣 응원 요청
  'mission_activated',   // 🌅 예약 활성화
  'deadline_warning'     // ⏰ 마감 임박
];

/* ============================================================
   백그라운드 메시지 핸들러
   — FCM data 페이로드를 받아 알림을 직접 표시합니다
   — notification 페이로드만 있으면 Firebase가 자동 표시하지만
     뱃지 제어가 안 되므로, data 페이로드로 통일합니다
   ============================================================ */
messaging.onBackgroundMessage(async (payload) => {
  console.log('[SW] 백그라운드 메시지 수신:', payload);

  const data      = payload.data || {};
  const title     = data.title     || '작전수첩';
  const body      = data.body      || '새 알림이 있습니다';
  const eventType = data.eventType || '';
  const category  = data.category  || 'B';   // A / B / C
  const url       = data.url       || '/';

  /* ── 뱃지 처리 (카테고리 C 이벤트만 +1) ── */
  if (BADGE_EVENT_TYPES.includes(eventType)) {
    await _incrementBadge();
  }

  /* ── 알림 아이콘 선택 ── */
  const icon = _getIcon(eventType, category);

  /* ── 알림 표시 ── */
  const options = {
    body,
    icon,
    badge: '/icons/badge-mono.png',   // 상단 상태바 모노 아이콘 (72×72, 흰색 실루엣)
    tag:   eventType || category,     // 같은 tag면 기존 알림 교체 (중복 방지)
    renotify: eventType !== '',       // 실시간 이벤트는 같은 태그여도 재진동
    data:  { url },
    actions: _getActions(eventType),
    vibrate: _getVibration(category),
    requireInteraction: category === 'C'  // 카테고리 C는 사용자가 직접 닫을 때까지 유지
  };

  await self.registration.showNotification(title, options);
});

/* ============================================================
   알림 클릭 핸들러
   ============================================================ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  /* 액션 버튼 처리 */
  if (event.action === 'open') {
    event.waitUntil(_focusOrOpen(url));
    return;
  }
  if (event.action === 'dismiss') {
    /* 무시 — 알림만 닫기 */
    return;
  }

  /* 알림 본문 클릭 */
  event.waitUntil(_focusOrOpen(url));
});

/* ============================================================
   알림 닫기 핸들러 (사용자가 스와이프로 닫을 때)
   ============================================================ */
self.addEventListener('notificationclose', (_event) => {
  /* 필요 시 분석 이벤트 전송 가능 */
});

/* ============================================================
   유틸리티
   ============================================================ */

/** 앱이 이미 열려있으면 포커스, 아니면 새 탭 */
async function _focusOrOpen(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if (client.url.includes(self.location.origin) && 'focus' in client) {
      await client.focus();
      client.postMessage({ type: 'NOTIFICATION_CLICK', url });
      return;
    }
  }
  await self.clients.openWindow(url);
}

/** IndexedDB를 이용한 뱃지 카운트 관리
    — SW에서는 localStorage 사용 불가이므로 IDB 사용 */
const DB_NAME    = 'badge-store';
const DB_VERSION = 1;
const STORE_NAME = 'badge';

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function _getBadgeCount() {
  const db  = await _openDB();
  return new Promise((resolve) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('count');
    req.onsuccess = (e) => resolve(e.target.result || 0);
    req.onerror   = ()  => resolve(0);
  });
}

async function _setBadgeCount(count) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(count, 'count');
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

async function _incrementBadge() {
  const current = await _getBadgeCount();
  const next    = current + 1;
  await _setBadgeCount(next);

  /* App Badge API — 홈 아이콘에 숫자 뱃지 */
  if ('setAppBadge' in self.navigator) {
    await self.navigator.setAppBadge(next).catch(() => {});
  }
}

/** 카테고리/이벤트별 아이콘 경로 */
function _getIcon(eventType, category) {
  const iconMap = {
    'partner_certified': '/icons/icon-medal.png',
    'cheer_request':     '/icons/icon-cheer.png',
    'mission_activated': '/icons/icon-sunrise.png',
    'deadline_warning':  '/icons/icon-timer.png',
  };
  if (iconMap[eventType]) return iconMap[eventType];
  if (category === 'A')   return '/icons/icon-mission.png';
  if (category === 'B')   return '/icons/icon-motivation.png';
  return '/icons/icon-192.png';  // 기본 아이콘
}

/** 카테고리별 진동 패턴 */
function _getVibration(category) {
  if (category === 'C') return [200, 100, 200, 100, 400]; // 강한 패턴
  if (category === 'A') return [200, 100, 200];            // 중간
  return [150];                                            // 약한 (동기부여)
}

/** 이벤트별 액션 버튼 */
function _getActions(eventType) {
  if (eventType === 'cheer_request') {
    return [
      { action: 'open',    title: '🔥 응원하기' },
      { action: 'dismiss', title: '나중에' }
    ];
  }
  if (eventType === 'partner_certified') {
    return [
      { action: 'open', title: '✅ 확인하기' }
    ];
  }
  if (eventType === 'deadline_warning') {
    return [
      { action: 'open',    title: '⚡ 지금 수행' },
      { action: 'dismiss', title: '넘기기' }
    ];
  }
  return [
    { action: 'open', title: '앱 열기' }
  ];
}
