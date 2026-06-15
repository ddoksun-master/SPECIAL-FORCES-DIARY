/**
 * 작전수첩 Firebase Cloud Functions
 *
 * [변경 이력]
 * - notifyCoopEvent: notifyCertDone + notifyCheerRequest 통합 (race condition 해소)
 * - sendPush 실패 시 만료 토큰 자동 DB 삭제
 * - notifyMission: 카테고리A — 작전 현황 알림 (07/09/12/15/19시)
 * - notifyMotivation: 카테고리B — 동기부여 랜덤 문구 (11/13/17/21시)
 * - 카테고리C 실시간 이벤트 뱃지 카운트: coopNotif 기록 시 badgeCount +1
 */

const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule }     = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getDatabase }    = require('firebase-admin/database');
const { getMessaging }   = require('firebase-admin/messaging');

initializeApp();

/* ── 공통 push 발송 ── */
async function sendPush(token, { title, body, tag, link, badge }, uid) {
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
          badge:    'https://special-forces-diary.vercel.app/icons/icon-96.png',
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

function nowHourKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
}

/* ── 뱃지 카운트 +1 ── */
async function incrementBadge(uid) {
  const db = getDatabase();
  const ref = db.ref(`users/${uid}/badgeCount`);
  const snap = await ref.get();
  const cur = snap.exists() ? (snap.val() || 0) : 0;
  await ref.set(cur + 1);
}

/* ════════════════════════════════════════════════════
   카테고리 C — 실시간 이벤트 (파트너인증 / 응원요청)
   뱃지 +1 포함
   ════════════════════════════════════════════════════ */
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
      await incrementBadge(uid);
      await sendPush(token, {
        title: `🎖 ${n.fromNick || '파트너'} 인증 완료!`,
        body:  `"${n.questName || '작전'}" 완료 — 수고했어를 보내주세요 💜`,
        tag:   'cert-' + key,
        link:  'https://special-forces-diary.vercel.app/index.html?tab=history',
      }, uid);
    } else if (n.type === 'cheer_request') {
      await incrementBadge(uid);
      await sendPush(token, {
        title: `📣 ${n.fromNick || '파트너'} 응원 요청`,
        body:  `"${n.questName || '작전'}" — 응원 메시지를 보내주세요 💬`,
        tag:   'cheer-' + key,
      }, uid);
    }
  }
);

/* ════════════════════════════════════════════════════
   카테고리 C — 매일 22:00 마감 임박 (뱃지 +1)
   ════════════════════════════════════════════════════ */
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
        if (data.notifSettings?.deadline === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        const incomplete = quests.filter(q => q && !q.completed && !q.failed);
        if (incomplete.length === 0) return;
        await incrementBadge(uid);
        await sendPush(token, {
          title: '⏰ 작전 마감 임박!',
          body:  `미완료 작전 ${incomplete.length}건 — 자정 전에 완료하세요 🪖`,
          tag:   'deadline-' + today,
        }, uid);
      })());
    });
    await Promise.allSettled(tasks);
  }
);

/* ════════════════════════════════════════════════════
   카테고리 C — 매일 06:00 예약 작전 활성화 (뱃지 +1)
   ════════════════════════════════════════════════════ */
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
        if (data.notifSettings?.reserve === false) return;
        const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
        if (!qSnap.exists()) return;
        const quests = qSnap.val() || [];
        const reserved = quests.filter(q => q && q.reserved && !q.completed && !q.failed);
        if (reserved.length === 0) return;
        await incrementBadge(uid);
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

/* ════════════════════════════════════════════════════
   카테고리 A — 작전 현황 알림 (07/09/12/15/19시)
   작전 상태에 따라 동적 메시지
   ════════════════════════════════════════════════════ */
const MISSION_SCHEDULES = [
  { schedule: '0 22 * * *', label: '07:00' }, // UTC 22 = KST 07
  { schedule: '0 0 * * *',  label: '09:00' }, // UTC 00 = KST 09
  { schedule: '0 3 * * *',  label: '12:00' }, // UTC 03 = KST 12
  { schedule: '0 6 * * *',  label: '15:00' }, // UTC 06 = KST 15
  { schedule: '0 10 * * *', label: '19:00' }, // UTC 10 = KST 19
];

async function _notifyMissionStatus(hourLabel) {
  const db = getDatabase();
  const today = todayKST();
  const nowMs = Date.now() + 9 * 3600 * 1000; // KST ms
  const usersSnap = await db.ref('users').get();
  if (!usersSnap.exists()) return;
  const tasks = [];
  usersSnap.forEach(userSnap => {
    tasks.push((async () => {
      const uid  = userSnap.key;
      const data = userSnap.val() || {};
      const token = data.fcmToken;
      if (!token) return;
      if (data.notifSettings?.mission === false) return;

      const qSnap = await db.ref(`users/${uid}/quests/${today}`).get();
      const quests = qSnap.exists() ? (qSnap.val() || []) : [];
      const valid = quests.filter(q => q && !q.failed);

      let title, body;

      if (valid.length === 0) {
        // 작전 없음
        title = '🪖 오늘 작전이 없어요!';
        body  = '지금 작전을 등록하고 하루를 시작하세요 💪';
      } else {
        const completed  = valid.filter(q => q.completed || q.stamped);
        const incomplete = valid.filter(q => !q.completed && !q.stamped);
        const nowKst     = new Date(nowMs);
        const nowMins    = nowKst.getUTCHours() * 60 + nowKst.getUTCMinutes();

        if (incomplete.length === 0) {
          // 전부 완료
          title = '🎉 오늘 모든 작전 완료!';
          body  = `${completed.length}건 모두 인증 완료 — 정말 수고했어요 🏆`;
        } else {
          // 인증 가능 여부 확인 (certAvailableAt 기준)
          const canCert = incomplete.filter(q => {
            const avail = q.certAvailableAt || 0;
            return (nowMs - 9 * 3600 * 1000) >= avail; // UTC ms 비교
          });

          if (canCert.length > 0) {
            title = '📸 지금 인증할 수 있어요!';
            body  = `"${canCert[0].name}" 등 ${canCert.length}건 인증 대기 중 — 지금 바로 완료하세요`;
          } else {
            // 아직 인증 시간 전
            const earliest = incomplete.reduce((min, q) =>
              (q.certAvailableAt || 0) < (min.certAvailableAt || 0) ? q : min
            , incomplete[0]);
            const availKst = new Date((earliest.certAvailableAt || 0) + 9 * 3600 * 1000);
            const hh = String(availKst.getUTCHours()).padStart(2,'0');
            const mm = String(availKst.getUTCMinutes()).padStart(2,'0');
            title = '⏱ 작전 준비 중...';
            body  = `"${earliest.name}" — ${hh}:${mm}부터 인증 가능해요. 준비하세요 🪖`;
          }
        }
      }

      await sendPush(token, {
        title,
        body,
        tag: `mission-${today}-${hourLabel}`,
      }, uid);
    })());
  });
  await Promise.allSettled(tasks);
}

exports.notifyMission07 = onSchedule({ schedule: '0 22 * * *', timeZone: 'UTC' }, () => _notifyMissionStatus('07:00'));
exports.notifyMission09 = onSchedule({ schedule: '0 0 * * *',  timeZone: 'UTC' }, () => _notifyMissionStatus('09:00'));
exports.notifyMission12 = onSchedule({ schedule: '0 3 * * *',  timeZone: 'UTC' }, () => _notifyMissionStatus('12:00'));
exports.notifyMission15 = onSchedule({ schedule: '0 6 * * *',  timeZone: 'UTC' }, () => _notifyMissionStatus('15:00'));
exports.notifyMission19 = onSchedule({ schedule: '0 10 * * *', timeZone: 'UTC' }, () => _notifyMissionStatus('19:00'));

/* ════════════════════════════════════════════════════
   카테고리 B — 동기부여 랜덤 문구 (11/13/17/21시)
   ════════════════════════════════════════════════════ */
const MOTIVATION_QUOTES = [
  { title: '💡 오늘의 교훈', body: '작은 행동이 쌓여 큰 변화를 만든다. 오늘 하루도 전진하라.' },
  { title: '🔥 불꽃 같은 하루', body: '포기하는 순간이 가장 힘든 순간이다. 딱 한 걸음만 더.' },
  { title: '🌟 특전사의 마음가짐', body: '훈련은 힘들다. 하지만 후회는 더 힘들다.' },
  { title: '💪 전진 또 전진', body: '완벽하지 않아도 괜찮다. 어제보다 나은 오늘이면 충분하다.' },
  { title: '🎯 목표를 향해', body: '목표가 있는 사람은 흔들리지 않는다. 오늘의 작전을 완수하라.' },
  { title: '🧠 지혜의 한마디', body: '규칙적인 습관은 의지력보다 강하다. 오늘도 루틴을 지켜라.' },
  { title: '⚡ 에너지 충전', body: '지금 이 순간이 앞으로의 나를 만든다. 최선을 다하자.' },
  { title: '🪖 특전사 정신', body: '힘들수록 기본으로 돌아가라. 기본이 흔들리지 않으면 무너지지 않는다.' },
  { title: '🌅 새로운 시작', body: '매일이 새로운 기회다. 오늘 하루를 낭비하지 마라.' },
  { title: '🤝 함께라서 강하다', body: '혼자 가면 빠르고, 함께 가면 멀리 간다. 파트너와 함께 오늘도 완주하자.' },
  { title: '📌 집중의 힘', body: '한 번에 하나씩. 지금 이 작전에 집중하면 반드시 완수할 수 있다.' },
  { title: '🏆 승리의 공식', body: '작은 승리가 모여 큰 승리가 된다. 오늘 작전 하나를 정복하라.' },
  { title: '💬 자신에게 하는 말', body: '"나는 할 수 있다"는 말이 가장 강력한 무기다.' },
  { title: '🔄 꾸준함의 기적', body: '천재는 꾸준함을 이길 수 없다. 오늘도 묵묵히 전진.' },
  { title: '🌿 성장의 법칙', body: '불편함 속에서만 성장이 일어난다. 오늘의 도전을 두려워하지 마라.' },
  { title: '⏳ 시간의 가치', body: '오늘 쓴 1시간이 내일의 나를 바꾼다. 지금 시작하라.' },
  { title: '🎖 명예로운 하루', body: '하루가 끝날 때 "오늘 최선을 다했다"고 말할 수 있는 삶을 살자.' },
  { title: '🧭 방향이 먼저다', body: '속도보다 방향이 중요하다. 오늘 작전의 목적을 다시 확인하라.' },
  { title: '💥 한계를 돌파하라', body: '한계는 머릿속에 있다. 몸이 먼저 움직이면 마음이 따라온다.' },
  { title: '🫶 응원을 보내며', body: '오늘 하루도 파트너와 함께 작전을 완수하자. 서로가 서로의 힘이다.' },
];

async function _notifyMotivation(hourLabel) {
  const db = getDatabase();
  const usersSnap = await db.ref('users').get();
  if (!usersSnap.exists()) return;
  const tasks = [];
  usersSnap.forEach(userSnap => {
    tasks.push((async () => {
      const uid  = userSnap.key;
      const data = userSnap.val() || {};
      const token = data.fcmToken;
      if (!token) return;
      if (data.notifSettings?.motivation === false) return;
      const quote = MOTIVATION_QUOTES[Math.floor(Math.random() * MOTIVATION_QUOTES.length)];
      await sendPush(token, {
        title: quote.title,
        body:  quote.body,
        tag:   `motivation-${todayKST()}-${hourLabel}`,
      }, uid);
    })());
  });
  await Promise.allSettled(tasks);
}

exports.notifyMotivation11 = onSchedule({ schedule: '0 2 * * *',  timeZone: 'UTC' }, () => _notifyMotivation('11:00'));
exports.notifyMotivation13 = onSchedule({ schedule: '0 4 * * *',  timeZone: 'UTC' }, () => _notifyMotivation('13:00'));
exports.notifyMotivation17 = onSchedule({ schedule: '0 8 * * *',  timeZone: 'UTC' }, () => _notifyMotivation('17:00'));
exports.notifyMotivation21 = onSchedule({ schedule: '0 12 * * *', timeZone: 'UTC' }, () => _notifyMotivation('21:00'));
