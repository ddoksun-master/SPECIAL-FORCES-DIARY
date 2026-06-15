/**
 * 작전수첩 Firebase Cloud Functions
 *
 * [변경 이력]
 * - notifyCertDone + notifyCheerRequest 를 notifyCoopEvent 하나로 통합
 *   → 같은 DB 경로(coopNotif/{toUid}/{key})에 중복 트리거가 걸려
 *     알림이 오다말다 하는 race condition 해소
 * - sendPush 실패 시 토큰 만료(registration-token-not-registered) 감지 →
 *   자동으로 DB에서 해당 토큰 삭제 (좀비 토큰 방지)
 */

const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule }     = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getDatabase }    = require('firebase-admin/database');
const { getMessaging }   = require('firebase-admin/messaging');

initializeApp();

/* ── 공통 push 발송 ── */
async function sendPush(token, { title, body, tag, link }, uid) {
  if (!token) return;
  const targetLink = link || 'https://special-forces-diary.vercel.app/index.html';
  try {
    await getMessaging().send({
      token,
      webpush: {
        notification: {
          title,
          body,
          icon:     'https://special-forces-diary.vercel.app/icons/icon-192.png',
          tag:      tag || 'jjakjeon',
          renotify: true,
        },
        fcmOptions: { link: targetLink }
      }
    });
  } catch (e) {
    console.error('sendPush error:', e.message);
    if (
      uid &&
      (e.code === 'messaging/registration-token-not-registered' ||
       e.code === 'messaging/invalid-registration-token' ||
       (e.message && e.message.includes('registration-token-not-registered')))
    ) {
      try {
        await getDatabase().ref(`users/${uid}/fcmToken`).remove();
        console.log(`[FCM] 만료 토큰 제거: ${uid}`);
      } catch (_) {}
    }
  }
}

async function getToken(uid) {
  const snap = await getDatabase().ref(`users/${uid}/fcmToken`).get();
  return snap.exists() ? snap.val() : null;
}

function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/* ── 매일 KST 22:00 — 마감 임박 ── */
exports.notifyDeadline = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const db = getDatabase();
    const today = todayKST();
    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;
    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid  = userSnap.key;
        const data = userSnap.val() || {};
        const token = data.fcmToken;
        if (!token) return;
        if ((data.notifSettings?.deadline) === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        const incomplete = quests.filter(q => q && !q.completed && !q.failed);
        if (incomplete.length === 0) return;
        await sendPush(token, {
          title: '⏰ 작전 마감 임박!',
          body:  `오늘 미완료 작전 ${incomplete.length}건 — 자정 전에 완료하세요 🪖`,
          tag:   'deadline-' + today,
        }, uid);
      })());
    });
    await Promise.allSettled(tasks);
  }
);

/* ── 매일 KST 06:00 — 예약 활성화 ── */
exports.notifyReserve = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const db = getDatabase();
    const today = todayKST();
    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;
    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid  = userSnap.key;
        const data = userSnap.val() || {};
        const token = data.fcmToken;
        if (!token) return;
        if ((data.notifSettings?.reserve) === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        const reserved = quests.filter(q => q && q.reserved && !q.completed && !q.failed);
        if (reserved.length === 0) return;
        await sendPush(token, {
          title: '🌅 예약 작전 활성화!',
          body:  `오늘 ${reserved.length}건의 작전이 시작됩니다. 작전을 개시하세요 💪`,
          tag:   'reserve-' + today,
        }, uid);
      })());
    });
    await Promise.allSettled(tasks);
  }
);

exports.notifyCoopEvent = onValueCreated(
  { ref: 'coopNotif/{toUid}/{key}', region: 'asia-southeast1' },
  async (event) => {
    const n   = event.data.val();
    const uid = event.params.toUid;
    const key = event.params.key;

    if (!n) return;

    const token = await getToken(uid);
    if (!token) return;

    if (n.type === 'empathy_request') {
      await sendPush(token, {
        title:   `🎖 ${n.fromNick || '파트너'} 인증 완료!`,
        body:    `"${n.questName || '작전'}" 완료 — 수고했어를 보내주세요 💜`,
        tag:     'cert-' + key,
        link:    'https://special-forces-diary.vercel.app/index.html?tab=history',
      }, uid);

    } else if (n.type === 'cheer_request') {
      await sendPush(token, {
        title: `📣 ${n.fromNick || '파트너'} 응원 요청`,
        body:  `"${n.questName || '작전'}" — 응원 메시지를 보내주세요 💬`,
        tag:   'cheer-' + key,
      }, uid);
    }
  }
);
