/**
 * 작전수첩 Firebase Cloud Functions
 * 
 * 담당 알림 4종:
 *  1. 작전 마감 임박 (22:00 스케줄) — 미완료 작전 있을 때
 *  2. 예약 작전 활성화 (06:00 스케줄) — 예약 작전 있을 때
 *  3. 파트너 인증 완료 (Firebase DB 트리거 — 실시간)
 *  4. 응원 메시지 요청  (Firebase DB 트리거 — 실시간)
 * 
 * 설치:
 *   cd functions && npm install firebase-admin firebase-functions
 *   firebase deploy --only functions
 */

const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule }     = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getDatabase }    = require('firebase-admin/database');
const { getMessaging }   = require('firebase-admin/messaging');

initializeApp();

/* ================================================================
   헬퍼 — FCM 단건 발송
   ================================================================ */
async function sendPush(token, { title, body, tag }) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      data: { title, body, tag: tag || 'jjakjeon' },
      webpush: {
        notification: { title, body, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', tag, renotify: 'true' },
        fcmOptions:   { link: '/index.html' }
      }
    });
  } catch (e) {
    // 만료/무효 토큰이면 DB에서 제거
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      console.warn('Invalid FCM token, removing:', token.slice(0,20));
    }
    console.error('sendPush error:', e.message);
  }
}

/* ================================================================
   헬퍼 — uid의 FCM 토큰 조회
   ================================================================ */
async function getToken(uid) {
  const snap = await getDatabase()
    .ref(`users/${uid}/fcmToken`).get();
  return snap.exists() ? snap.val() : null;
}

/* ================================================================
   헬퍼 — YYYYMMDD 날짜 문자열
   ================================================================ */
function todayKST() {
  // Cloud Functions 기본 타임존은 UTC — KST(+9) 보정
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/* ================================================================
   1. 알림 설정 토글 로드 헬퍼
   ================================================================ */
async function isNotifEnabled(uid, key) {
  const snap = await getDatabase()
    .ref(`users/${uid}/notifSettings/${key}`).get();
  // 없으면 기본 true (설정 안 한 사람은 켜진 것)
  return !snap.exists() || snap.val() !== false;
}

/* ================================================================
   2. 작전 마감 임박 알림  —  매일 KST 22:00
      사용자별로 오늘 미완료 작전 개수 확인 후 push
   ================================================================ */
exports.notifyDeadline = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'Asia/Seoul' }, // UTC 13:00 = KST 22:00
  async () => {
    const db = getDatabase();
    const today = todayKST();

    // 모든 유저 fcmToken 목록 조회
    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;

    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid = userSnap.key;
        const data = userSnap.val() || {};
        const token = data.fcmToken;
        if (!token) return;
        // 마감 알림 설정 확인
        const enabled = (data.notifSettings?.deadline) !== false;
        if (!enabled) return;

        // 오늘 작전 로드
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        const incomplete = quests.filter(q => q && !q.completed && !q.failed);
        if (incomplete.length === 0) return;

        await sendPush(token, {
          title: '⏰ 작전 마감 임박!',
          body:  `오늘 미완료 작전 ${incomplete.length}건 — 자정 전에 완료하세요 🪖`,
          tag:   'deadline-' + today,
        });
      })());
    });

    await Promise.allSettled(tasks);
  }
);

/* ================================================================
   3. 예약 작전 활성화 알림  —  매일 KST 06:00
      오늘 날짜로 예약된 작전이 있으면 push
   ================================================================ */
exports.notifyReserve = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'Asia/Seoul' }, // UTC 21:00 = 다음날 KST 06:00
  async () => {
    const db = getDatabase();
    const today = todayKST();

    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;

    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid = userSnap.key;
        const data = userSnap.val() || {};
        const token = data.fcmToken;
        if (!token) return;
        const enabled = (data.notifSettings?.reserve) !== false;
        if (!enabled) return;

        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        // reservedAt이 있고 아직 완료 안 된 예약 작전
        const reserved = quests.filter(q =>
          q && q.reservedAt && !q.completed && !q.failed
        );
        if (reserved.length === 0) return;

        await sendPush(token, {
          title: '🌅 예약 작전 활성화!',
          body:  `오늘 ${reserved.length}건의 작전이 시작됩니다. 작전을 개시하세요 💪`,
          tag:   'reserve-' + today,
        });
      })());
    });

    await Promise.allSettled(tasks);
  }
);

/* ================================================================
   4. 파트너 인증 완료 알림  —  coopNotif/{uid}/{key} 생성 시
      type === 'empathy_request' → 상대방이 인증 완료
   ================================================================ */
exports.notifyCertDone = onValueCreated(
  { ref: 'coopNotif/{toUid}/{key}', region: 'asia-southeast1' },
  async (event) => {
    const n = event.data.val();
    if (!n || n.type !== 'empathy_request') return;

    const { toUid } = event.params;
    const token = await getToken(toUid);
    if (!token) return;

    await sendPush(token, {
      title: `🎖 ${n.fromNick || '파트너'} 인증 완료!`,
      body:  `"${n.questName || '작전'}" 완료 — 수고했어를 보내주세요 💜`,
      tag:   'cert-' + event.params.key,
    });
  }
);

/* ================================================================
   5. 응원 메시지 요청 알림  —  coopNotif/{uid}/{key} 생성 시
      type === 'cheer_request'
   ================================================================ */
exports.notifyCheerRequest = onValueCreated(
  { ref: 'coopNotif/{toUid}/{key}', region: 'asia-southeast1' },
  async (event) => {
    const n = event.data.val();
    if (!n || n.type !== 'cheer_request') return;

    const { toUid } = event.params;
    const token = await getToken(toUid);
    if (!token) return;

    await sendPush(token, {
      title: `📣 ${n.fromNick || '파트너'} 응원 요청`,
      body:  `"${n.questName || '작전'}" — 응원 메시지를 보내주세요 💬`,
      tag:   'cheer-' + event.params.key,
    });
  }
);
