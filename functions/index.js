/**
 * 작전수첩 Firebase Cloud Functions  v2
 *
 * [핵심 변경]
 * - notification 페이로드 → data 페이로드로 전면 교체
 *   → SW(firebase-messaging-sw.js)가 알림 직접 표시
 *   → "special-f..." 도메인 제거, S 아바타 제거
 *
 * [알림 카테고리]
 * - A: 작전 현황   (07/09/12/15/19시)  → on/off: notifSettings.missionStatus
 * - B: 동기부여    (11/13/17/21시)     → on/off: notifSettings.motivation
 * - C: 실시간 이벤트 (항상)            → 뱃지 +1 대상
 *     · partner_certified  🎖 파트너 인증
 *     · cheer_request      📣 응원 요청
 *     · mission_activated  🌅 예약 활성화
 *     · deadline_warning   ⏰ 마감 임박
 */

const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule }     = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getDatabase }    = require('firebase-admin/database');
const { getMessaging }   = require('firebase-admin/messaging');

initializeApp();

const APP_URL = 'https://special-forces-diary.vercel.app/index.html';

/* ============================================================
   공통 push 발송 — data 페이로드 전용
   SW가 알림을 직접 표시하므로 notification 블록 없음
   ============================================================ */
async function sendPush(token, { title, body, eventType, category, url }, uid) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      webpush: {
        data: {
          title:     title     || '작전수첩',
          body:      body      || '',
          eventType: eventType || '',
          category:  category  || 'B',
          url:       url       || APP_URL,
        },
        fcmOptions: { link: url || APP_URL }
      }
    });
  } catch (e) {
    console.error('sendPush error:', e.message);
    /* 만료 토큰 자동 삭제 */
    if (uid && (
      e.code === 'messaging/registration-token-not-registered' ||
      e.code === 'messaging/invalid-registration-token' ||
      (e.message && e.message.includes('registration-token-not-registered'))
    )) {
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

/* ============================================================
   카테고리 B — 동기부여 문구 20개
   ============================================================ */
const MOTIVATION_MSGS = [
  '오늘도 작전 개시! 함께라면 못할 게 없어 💪',
  '작은 실천이 쌓여 큰 변화를 만들어 🌱',
  '오늘 하루도 서로를 응원하며 달려보자 🔥',
  '힘든 날일수록 파트너가 있어 다행이야 💜',
  '지금 이 순간이 나중에 빛날 거야 ✨',
  '포기하지 마, 오늘의 나는 어제보다 강해 💎',
  '같이 해내는 우리가 최강이야 🏆',
  '작전 수행 중 — 넌 할 수 있어 🎯',
  '오늘 미션 하나씩 클리어하자 ✅',
  '함께 성장하는 매일이 쌓이고 있어 📈',
  '어렵더라도 한 걸음씩, 우린 같이 가 👣',
  '오늘의 노력이 내일의 자신감이 돼 🌟',
  '파트너도 열심히 하고 있어, 같이 가자 🤝',
  '지금 이 순간을 함께한다는 게 특별해 💫',
  '오늘도 작전 성공을 향해 전진! 🚀',
  '넌 생각보다 훨씬 강한 사람이야 🦁',
  '서로에게 힘이 되는 하루 만들어보자 🌈',
  '잠깐 쉬어도 괜찮아, 다시 시작하면 돼 🔄',
  '오늘 하루도 작전수첩과 함께 완주! 🏁',
  '우리의 매일이 모여 특별한 이야기가 돼 📖',
];

/* ============================================================
   카테고리 A — 작전 현황 메시지
   DB에서 오늘 미션 상태를 읽어 동적으로 생성
   ============================================================ */
async function getMissionStatusMsg(uid) {
  const db    = getDatabase();
  const today = todayKST();
  const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
  if (!qSnap.exists()) return { title: '📋 오늘의 작전 현황', body: '오늘 등록된 작전이 없어요.' };

  const quests     = qSnap.val() || [];
  const total      = quests.filter(q => q).length;
  const completed  = quests.filter(q => q && q.completed).length;
  const incomplete = total - completed;

  if (total === 0)         return { title: '📋 오늘의 작전 현황', body: '오늘 등록된 작전이 없어요.' };
  if (incomplete === 0)    return { title: '🎉 오늘 작전 완료!',  body: `${total}건 전부 완료! 오늘도 최강이야 💪` };
  return {
    title: '📋 작전 현황 보고',
    body:  `전체 ${total}건 중 ${completed}건 완료 — 남은 ${incomplete}건 파이팅! 🪖`,
  };
}

/* ============================================================
   카테고리 A — 작전 현황 (07/09/12/15/19시)
   ============================================================ */
const MISSION_STATUS_SCHEDULES = [
  { name: 'notifyMissionStatus07', cron: '0 7 * * *'  },
  { name: 'notifyMissionStatus09', cron: '0 9 * * *'  },
  { name: 'notifyMissionStatus12', cron: '0 12 * * *' },
  { name: 'notifyMissionStatus15', cron: '0 15 * * *' },
  { name: 'notifyMissionStatus19', cron: '0 19 * * *' },
];

MISSION_STATUS_SCHEDULES.forEach(({ name, cron }) => {
  exports[name] = onSchedule(
    { schedule: cron, timeZone: 'Asia/Seoul' },
    async () => {
      const db       = getDatabase();
      const usersSnap = await db.ref('users').get();
      if (!usersSnap.exists()) return;
      const tasks = [];
      usersSnap.forEach(userSnap => {
        tasks.push((async () => {
          const uid  = userSnap.key;
          const data = userSnap.val() || {};
          if (!data.fcmToken) return;
          if (data.notifSettings?.missionStatus === false) return;
          const { title, body } = await getMissionStatusMsg(uid);
          await sendPush(data.fcmToken, {
            title, body,
            eventType: '',
            category:  'A',
            url: APP_URL,
          }, uid);
        })());
      });
      await Promise.allSettled(tasks);
    }
  );
});

/* ============================================================
   카테고리 B — 동기부여 (11/13/17/21시)
   ============================================================ */
const MOTIVATION_SCHEDULES = [
  { name: 'notifyMotivation11', cron: '0 11 * * *' },
  { name: 'notifyMotivation13', cron: '0 13 * * *' },
  { name: 'notifyMotivation17', cron: '0 17 * * *' },
  { name: 'notifyMotivation21', cron: '0 21 * * *' },
];

MOTIVATION_SCHEDULES.forEach(({ name, cron }) => {
  exports[name] = onSchedule(
    { schedule: cron, timeZone: 'Asia/Seoul' },
    async () => {
      const db        = getDatabase();
      const usersSnap = await db.ref('users').get();
      if (!usersSnap.exists()) return;
      const msg   = MOTIVATION_MSGS[Math.floor(Math.random() * MOTIVATION_MSGS.length)];
      const tasks = [];
      usersSnap.forEach(userSnap => {
        tasks.push((async () => {
          const uid  = userSnap.key;
          const data = userSnap.val() || {};
          if (!data.fcmToken) return;
          if (data.notifSettings?.motivation === false) return;
          await sendPush(data.fcmToken, {
            title:     '💪 작전수첩',
            body:      msg,
            eventType: '',
            category:  'B',
            url: APP_URL,
          }, uid);
        })());
      });
      await Promise.allSettled(tasks);
    }
  );
});

/* ============================================================
   카테고리 C — 실시간 이벤트 (뱃지 +1)
   ============================================================ */

/* ── C-1: 파트너 인증 + 응원 요청 ── */
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
        title:     `🎖 ${n.fromNick || '파트너'} 인증 완료!`,
        body:      `"${n.questName || '작전'}" 완료 — 수고했어를 보내주세요 💜`,
        eventType: 'partner_certified',
        category:  'C',
        url:       APP_URL + '?tab=history',
      }, uid);

    } else if (n.type === 'cheer_request') {
      await sendPush(token, {
        title:     `📣 ${n.fromNick || '파트너'} 응원 요청`,
        body:      `"${n.questName || '작전'}" — 응원 메시지를 보내주세요 💬`,
        eventType: 'cheer_request',
        category:  'C',
        url:       APP_URL,
      }, uid);
    }
  }
);

/* ── C-2: 예약 활성화 (매일 KST 06:00) ── */
exports.notifyMissionActivated = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const db    = getDatabase();
    const today = todayKST();
    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;
    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid  = userSnap.key;
        const data = userSnap.val() || {};
        if (!data.fcmToken) return;
        if (data.notifSettings?.reserve === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests   = qSnap.val() || [];
        const reserved = quests.filter(q => q && q.reserved && !q.completed && !q.failed);
        if (reserved.length === 0) return;
        await sendPush(data.fcmToken, {
          title:     '🌅 예약 작전 활성화!',
          body:      `오늘 ${reserved.length}건의 작전이 시작됩니다. 작전을 개시하세요 💪`,
          eventType: 'mission_activated',
          category:  'C',
          url:       APP_URL,
        }, uid);
      })());
    });
    await Promise.allSettled(tasks);
  }
);

/* ── C-3: 마감 임박 (매일 KST 22:00) ── */
exports.notifyDeadlineWarning = onSchedule(
  { schedule: '0 22 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const db    = getDatabase();
    const today = todayKST();
    const usersSnap = await db.ref('users').get();
    if (!usersSnap.exists()) return;
    const tasks = [];
    usersSnap.forEach(userSnap => {
      tasks.push((async () => {
        const uid  = userSnap.key;
        const data = userSnap.val() || {};
        if (!data.fcmToken) return;
        if (data.notifSettings?.deadline === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests     = qSnap.val() || [];
        const incomplete = quests.filter(q => q && !q.completed && !q.failed);
        if (incomplete.length === 0) return;
        await sendPush(data.fcmToken, {
          title:     '⏰ 작전 마감 임박!',
          body:      `오늘 미완료 작전 ${incomplete.length}건 — 자정 전에 완료하세요 🪖`,
          eventType: 'deadline_warning',
          category:  'C',
          url:       APP_URL,
        }, uid);
      })());
    });
    await Promise.allSettled(tasks);
  }
);
