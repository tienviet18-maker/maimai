/**
 * MaiMai Notification & Empathetic Messaging Engine
 * Offline-first: evaluates local appData (+ cycle engine), schedules local reminders,
 * shows via Notification API / Service Worker. Optional cloud log via Supabase.
 *
 * Usage:
 *   MaiMaiNotificationEngine.init({ getAppData, getTodayStr, getCycleDeps, getLang })
 *   MaiMaiNotificationEngine.setEnabled(true)
 */
(function (root) {
  'use strict';

  var STORAGE_PREF = 'maimai_notif_pref_v1';
  var STORAGE_SENT = 'maimai_notif_sent_v1';
  var SW_PATH = 'sw.js';

  var timers = [];
  var swReg = null;
  var deps = {
    getAppData: function () { return root.appData || null; },
    getTodayStr: function () { return root.TODAY_STR || isoToday(); },
    getCycleDeps: function () { return null; },
    getLang: function () { return 'vi'; }
  };

  var SLOTS = [
    { id: 'morning', hour: 7, minute: 0 },
    { id: 'hydration', hour: 10, minute: 0 },
    { id: 'afternoon', hour: 15, minute: 0 },
    { id: 'evening', hour: 20, minute: 0 }
  ];

  /** Localized copy pools — standard vs care (empathetic) tone */
  var MESSAGES = {
    vi: {
      standard: {
        morning: [
          { title: 'Chào buổi sáng 🌸', body: 'MaiMai nhắc nhẹ: ăn sáng nhẹ nhàng và uống một ly nước ấm nhé.' },
          { title: 'Khởi động ngày mới', body: 'Uống nước, thở sâu vài nhịp — cơ thể sẽ cảm ơn bạn.' }
        ],
        hydration: [
          { title: 'Nhắc uống nước 💧', body: 'Giữa buổi sáng rồi — thêm một ly nước giúp tỉnh táo hơn.' },
          { title: 'Hydration check', body: 'Bạn đã uống đủ nước chưa? Một ngụm nhỏ cũng tốt.' }
        ],
        afternoon: [
          { title: 'Giữa chiều rồi 🌤️', body: 'Đứng dậy vươn vai một chút và bổ sung nước nhé.' },
          { title: 'Năng lượng chiều', body: 'Ăn nhẹ lành mạnh nếu đói — đừng bỏ bữa quá lâu.' }
        ],
        evening: [
          { title: 'Buổi tối dịu dàng 🌙', body: 'Chuẩn bị ngủ sớm: giảm màn hình, thư giãn vai cổ.' },
          { title: 'Gió xuống tối nay', body: 'Ghi lại nước/giấc ngủ hôm nay giúp MaiMai chăm bạn tốt hơn.' }
        ]
      },
      care: {
        morning: [
          { title: 'MaiMai ở đây với bạn 💗', body: 'Hôm nay cơ thể cần dịu dàng hơn. Ăn sáng ấm, uống nước ấm, không vội nhé.' },
          { title: 'Chào bạn yêu', body: 'Nếu đang khó chịu, hãy cho phép mình chậm lại. Một ngày nhẹ nhàng cũng là đủ.' }
        ],
        hydration: [
          { title: 'Uống nước ấm giúp dễ chịu hơn 🫖', body: 'Trong những ngày nhạy cảm, nước ấm và nghỉ ngơi ngắn sẽ rất hữu ích.' },
          { title: 'Nhắc nhẹ từ MaiMai', body: 'Uống từng ngụm nhỏ. Nếu đau bụng, thử chườm ấm và thở sâu.' }
        ],
        afternoon: [
          { title: 'Chăm sóc giữa ngày 🤍', body: 'Đừng ép mình quá. Nghỉ 5 phút, giữ ấm bụng, giảm vận động mạnh.' },
          { title: 'Bạn đang làm rất tốt', body: 'Cơ thể đang làm việc chăm chỉ. Hãy dịu dàng với chính mình.' }
        ],
        evening: [
          { title: 'Buổi tối êm ái 🌙', body: 'Ngủ sớm giúp phục hồi. Túi chườm ấm, ánh sáng dịu, tắt thông báo thừa.' },
          { title: 'MaiMai gửi lời yêu thương', body: 'Hôm nay đã đủ rồi. Nghỉ ngơi thật sâu — ngày mai sẽ nhẹ hơn.' }
        ]
      }
    },
    en: {
      standard: {
        morning: [
          { title: 'Good morning 🌸', body: 'Gentle start: a light breakfast and a glass of water.' },
          { title: 'New day check-in', body: 'Hydrate, breathe, and take it one step at a time.' }
        ],
        hydration: [
          { title: 'Water reminder 💧', body: 'Mid-morning sip — your body will thank you.' },
          { title: 'Hydration check', body: 'Have you had enough water yet?' }
        ],
        afternoon: [
          { title: 'Afternoon stretch 🌤️', body: 'Stand up, stretch, and top up your water.' },
          { title: 'Energy check', body: 'A light snack is okay if you feel low.' }
        ],
        evening: [
          { title: 'Wind down 🌙', body: 'Ease into sleep: softer lights, less screen time.' },
          { title: 'Evening note', body: 'Log water & sleep so MaiMai can care for you better.' }
        ]
      },
      care: {
        morning: [
          { title: 'MaiMai is with you 💗', body: 'Be gentle today. Warm drinks, soft food, no rush.' },
          { title: 'Soft morning', body: 'If you feel tender, slow is okay. Rest counts as progress.' }
        ],
        hydration: [
          { title: 'Warm water helps 🫖', body: 'On sensitive days, warm sips and short rests ease discomfort.' },
          { title: 'Gentle reminder', body: 'Sip slowly. A heat pad and deep breaths can help cramps.' }
        ],
        afternoon: [
          { title: 'Midday care 🤍', body: 'Don’t push hard. Warmth, rest, and kindness to yourself.' },
          { title: 'You’re doing enough', body: 'Your body is working hard — soft care is allowed.' }
        ],
        evening: [
          { title: 'Soft evening 🌙', body: 'Sleep early if you can. Warmth, quiet, and rest.' },
          { title: 'With love from MaiMai', body: 'Today was enough. Rest deeply — tomorrow can be lighter.' }
        ]
      }
    },
    ja: {
      standard: {
        morning: [
          { title: 'おはよう 🌸', body: '軽い朝食とお水でやさしくスタートしましょう。' },
          { title: '朝のチェックイン', body: '水分をとり、深呼吸して一日を始めましょう。' }
        ],
        hydration: [
          { title: '水分リマインド 💧', body: '午前の水分補給、忘れずに。' },
          { title: 'Hydration check', body: 'お水は足りていますか？' }
        ],
        afternoon: [
          { title: '午後のひと息 🌤️', body: 'ストレッチと水分補給でリフレッシュ。' },
          { title: 'エネルギー確認', body: 'お腹が空いたら軽いおやつもOK。' }
        ],
        evening: [
          { title: '夜のクールダウン 🌙', body: '早めの休息を。画面を減らしてリラックス。' },
          { title: '夜のメモ', body: '水分と睡眠を記録するとMaiMaiがより寄り添えます。' }
        ]
      },
      care: {
        morning: [
          { title: 'MaiMaiはそばにいます 💗', body: '今日は無理せず。温かい飲み物とゆっくりした朝を。' },
          { title: 'やさしい朝', body: 'つらい日はゆっくりで大丈夫。休むことも大切です。' }
        ],
        hydration: [
          { title: '温かいお水を 🫖', body: '敏感な日は温かい水分と短い休憩が助けになります。' },
          { title: 'やさしいリマインド', body: '少しずつ飲んで。腹痛には温めと深呼吸を。' }
        ],
        afternoon: [
          { title: '昼のケア 🤍', body: '無理しないで。温め・休息・自分への優しさを。' },
          { title: '十分がんばっています', body: '体は頑張っています。やさしくしてあげてください。' }
        ],
        evening: [
          { title: '穏やかな夜 🌙', body: '早めの睡眠を。温かさと静けさで休んで。' },
          { title: 'MaiMaiより', body: '今日はもう十分。深く休んで、明日はもっと楽に。' }
        ]
      }
    }
  };

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function log() {
    try {
      if (root.console && console.debug) {
        console.debug.apply(console, ['[MaiMaiNotify]'].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  function warn() {
    try {
      if (root.console && console.warn) {
        console.warn.apply(console, ['[MaiMaiNotify]'].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  function loadPref() {
    try {
      var raw = root.localStorage.getItem(STORAGE_PREF);
      var o = raw ? JSON.parse(raw) : null;
      if (o && typeof o.enabled === 'boolean') return o;
    } catch (e) { /* ignore */ }
    return { enabled: false, permission: 'default' };
  }

  function savePref(pref) {
    try {
      root.localStorage.setItem(STORAGE_PREF, JSON.stringify(pref));
    } catch (e) { /* ignore */ }
  }

  function loadSentMap() {
    try {
      var raw = root.localStorage.getItem(STORAGE_SENT);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function markSent(dateStr, slotId) {
    var map = loadSentMap();
    var key = dateStr + ':' + slotId;
    map[key] = Date.now();
    // prune older than 3 days
    var cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    Object.keys(map).forEach(function (k) {
      if (map[k] < cutoff) delete map[k];
    });
    try {
      root.localStorage.setItem(STORAGE_SENT, JSON.stringify(map));
    } catch (e) { /* ignore */ }
  }

  function wasSent(dateStr, slotId) {
    var map = loadSentMap();
    return !!map[dateStr + ':' + slotId];
  }

  function isStandalonePwa() {
    try {
      if (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) return true;
      if (root.navigator && root.navigator.standalone === true) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function pick(arr) {
    if (!arr || !arr.length) return { title: 'MaiMai', body: '' };
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Evaluate emotional/physical context from local metrics + cycle engine.
   * Does not require network.
   */
  function evaluateUserContext(appData, todayStr) {
    appData = appData || deps.getAppData() || {};
    todayStr = todayStr || deps.getTodayStr();
    var day = (appData.dailyRecords && appData.dailyRecords[todayStr]) || {};
    var waterMl = Math.max(0, Number(day.waterMl) || 0);
    var sleepMin = day.sleepMinutes != null ? Number(day.sleepMinutes) : null;
    var wh = day.whSymptoms || [];
    var pain = day.pain != null && day.pain !== '' ? Number(day.pain) : null;
    var flow = day.flow || null;
    var onPeriod = !!day.period;
    var phase = 'unknown';
    var cycleDay = null;

    try {
      var eng = root.MaiMaiCycleEngine;
      if (eng && eng.pickMaiCycleContext) {
        var ctx = eng.pickMaiCycleContext(appData, todayStr, deps.getCycleDeps());
        if (ctx) {
          onPeriod = onPeriod || !!ctx.onPeriod;
          phase = ctx.phase || phase;
          cycleDay = ctx.cycleDay;
        }
      } else if (eng && eng.homeCycleSummary) {
        var sum = eng.homeCycleSummary(appData, todayStr, deps.getCycleDeps());
        if (sum) {
          onPeriod = onPeriod || !!sum.onPeriod;
          phase = sum.phase || phase;
          cycleDay = sum.cycleDay;
        }
      }
    } catch (e) {
      warn('cycle_context_failed', e && e.message);
    }

    var crampish =
      wh.indexOf('abdominal_cramps') >= 0 ||
      wh.indexOf('back_pain') >= 0 ||
      wh.indexOf('headache') >= 0;
    var heavy = flow === 'heavy';
    var highPain = pain != null && !isNaN(pain) && pain >= 5;
    var menstrualPhase = phase === 'menstrual' || phase === 'menstruation';

    var careMode =
      onPeriod || menstrualPhase || crampish || heavy || highPain;

    var lowWater = waterMl > 0 && waterMl < 1000;
    var noWaterYet = waterMl === 0;
    var lowSleep = sleepMin != null && sleepMin < 360;

    return {
      mode: careMode ? 'care' : 'normal',
      careMode: careMode,
      onPeriod: onPeriod,
      phase: phase,
      cycleDay: cycleDay,
      waterMl: waterMl,
      sleepMinutes: sleepMin,
      lowWater: lowWater,
      noWaterYet: noWaterYet,
      lowSleep: lowSleep,
      pain: pain,
      flow: flow,
      whSymptoms: wh.slice(),
      isStandalonePwa: isStandalonePwa()
    };
  }

  function generateContextualMessage(context, slotId, lang) {
    context = context || evaluateUserContext();
    lang = lang || deps.getLang() || 'vi';
    if (!MESSAGES[lang]) lang = 'vi';
    var tone = context.careMode ? 'care' : 'standard';
    var pool = (MESSAGES[lang][tone] && MESSAGES[lang][tone][slotId]) || MESSAGES.vi[tone][slotId] || [];
    var msg = pick(pool);

    // Soft overlays for unmet hydration / sleep without sounding robotic
    if (!context.careMode && (context.lowWater || context.noWaterYet) && (slotId === 'hydration' || slotId === 'afternoon')) {
      if (lang === 'en') {
        msg = { title: msg.title, body: msg.body + ' A little more water would be lovely.' };
      } else if (lang === 'ja') {
        msg = { title: msg.title, body: msg.body + ' もう少し水分をとりましょう。' };
      } else {
        msg = { title: msg.title, body: msg.body + ' Thêm một chút nước sẽ dễ chịu hơn.' };
      }
    }
    if (context.lowSleep && slotId === 'evening') {
      if (lang === 'en') {
        msg = { title: msg.title, body: 'Sleep looked short recently — try an earlier wind-down tonight.' };
      } else if (lang === 'ja') {
        msg = { title: msg.title, body: '最近の睡眠が短めです。今夜は早めに休みましょう。' };
      } else {
        msg = { title: msg.title, body: 'Giấc ngủ gần đây hơi thiếu — tối nay hãy nghỉ sớm hơn một chút nhé.' };
      }
    }

    return {
      title: msg.title,
      body: msg.body,
      slotId: slotId,
      tone: tone,
      contextMode: context.mode
    };
  }

  function clearTimers() {
    timers.forEach(function (id) {
      try { clearTimeout(id); } catch (e) { /* ignore */ }
    });
    timers = [];
  }

  function msUntilNext(hour, minute) {
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  async function ensureServiceWorker() {
    if (!root.navigator || !root.navigator.serviceWorker) return null;
    try {
      swReg = await root.navigator.serviceWorker.register(SW_PATH, { scope: './' });
      log('sw_registered', !!swReg);
      return swReg;
    } catch (e) {
      warn('sw_register_failed', e && e.message);
      return null;
    }
  }

  async function showLocalNotification(payload) {
    if (!payload) return { ok: false, reason: 'no_payload' };
    var title = payload.title || 'MaiMai';
    var options = {
      body: payload.body || '',
      icon: payload.icon || undefined,
      badge: payload.badge || undefined,
      tag: 'maimai-' + (payload.slotId || 'generic'),
      renotify: true,
      data: { url: './', slotId: payload.slotId, tone: payload.tone }
    };

    try {
      if (swReg && swReg.showNotification) {
        await swReg.showNotification(title, options);
        return { ok: true, via: 'service_worker' };
      }
    } catch (e) {
      warn('sw_notify_failed', e && e.message);
    }

    try {
      if (root.Notification && root.Notification.permission === 'granted') {
        // eslint-disable-next-line no-new
        new root.Notification(title, options);
        return { ok: true, via: 'notification_api' };
      }
    } catch (e2) {
      warn('notification_api_failed', e2 && e2.message);
    }

    // In-app fallback: coach message area if present
    try {
      var el = root.document && root.document.getElementById('coach-message');
      if (el) {
        el.innerText = title + ' — ' + (payload.body || '');
        return { ok: true, via: 'in_app_fallback' };
      }
    } catch (e3) { /* ignore */ }

    return { ok: false, reason: 'no_channel' };
  }

  async function fireSlot(slotId, opts) {
    opts = opts || {};
    var pref = loadPref();
    if (!pref.enabled && !opts.force) return { ok: false, reason: 'disabled' };
    if (typeof root.Notification !== 'undefined' && root.Notification.permission !== 'granted' && !opts.forceInApp) {
      return { ok: false, reason: 'no_permission' };
    }

    var today = deps.getTodayStr();
    if (!opts.force && wasSent(today, slotId)) {
      return { ok: false, reason: 'already_sent' };
    }

    var context = evaluateUserContext(deps.getAppData(), today);
    var msg = generateContextualMessage(context, slotId, deps.getLang());
    var shown = await showLocalNotification(msg);
    if (shown.ok) {
      markSent(today, slotId);
      logNotificationOptionally(msg, context);
    }
    return Object.assign({ context: context, message: msg }, shown);
  }

  function logNotificationOptionally(msg, context) {
    // Best-effort cloud log — never block UI; privacy-safe (no message body in clear if desired)
    try {
      var client =
        root.MaiMaiSupabase && root.MaiMaiSupabase.isReady && root.MaiMaiSupabase.isReady()
          ? root.MaiMaiSupabase.getClient()
          : null;
      var userId =
        root.MaiMaiSupabaseSync && root.MaiMaiSupabaseSync.getUserId
          ? root.MaiMaiSupabaseSync.getUserId()
          : null;
      if (!client || !userId) return;
      client
        .from('notification_logs')
        .insert({
          user_id: userId,
          slot_id: msg.slotId,
          tone: msg.tone,
          context_mode: context && context.mode,
          title: msg.title
        })
        .then(function () { /* ok */ })
        .catch(function () { /* silent */ });
    } catch (e) { /* silent */ }
  }

  function scheduleAll() {
    clearTimers();
    var pref = loadPref();
    if (!pref.enabled) return;

    SLOTS.forEach(function (slot) {
      var delay = msUntilNext(slot.hour, slot.minute);
      var id = setTimeout(function () {
        fireSlot(slot.id).catch(function (e) {
          warn('fire_slot_failed', slot.id, e && e.message);
        });
        // re-arm for next day
        scheduleAll();
      }, delay);
      timers.push(id);
      log('scheduled', slot.id, Math.round(delay / 60000) + 'min');
    });
  }

  async function requestPermissionAndEnable() {
    if (typeof root.Notification === 'undefined') {
      return {
        ok: false,
        reason: 'unsupported',
        tip: 'Notifications API not available in this browser.'
      };
    }

    // iOS: notifications for PWAs generally require Home Screen install (iOS 16.4+)
    var ios =
      /iPad|iPhone|iPod/.test(root.navigator.userAgent || '') ||
      (root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1);
    if (ios && !isStandalonePwa()) {
      return {
        ok: false,
        reason: 'ios_not_standalone',
        tip: 'On iPhone/iPad, add MaiMai to Home Screen first, then enable notifications.'
      };
    }

    await ensureServiceWorker();
    var permission = root.Notification.permission;
    if (permission !== 'granted') {
      try {
        permission = await root.Notification.requestPermission();
      } catch (e) {
        return { ok: false, reason: 'permission_error', error: String(e && e.message || e) };
      }
    }

    var pref = { enabled: permission === 'granted', permission: permission };
    savePref(pref);

    // Mirror into profile for UI persistence
    try {
      var appData = deps.getAppData();
      if (appData && appData.profile) {
        appData.profile.notificationsEnabled = pref.enabled;
        if (typeof root.saveState === 'function') root.saveState();
        else if (root.localStorage && appData) {
          root.localStorage.setItem('maimai_app_store_v2', JSON.stringify(appData));
        }
      }
    } catch (e2) { /* ignore */ }

    if (pref.enabled) scheduleAll();
    else clearTimers();

    return {
      ok: pref.enabled,
      permission: permission,
      isStandalonePwa: isStandalonePwa(),
      reason: pref.enabled ? 'enabled' : 'denied'
    };
  }

  function setEnabled(enabled) {
    if (enabled) return requestPermissionAndEnable();
    var pref = loadPref();
    pref.enabled = false;
    savePref(pref);
    clearTimers();
    try {
      var appData = deps.getAppData();
      if (appData && appData.profile) {
        appData.profile.notificationsEnabled = false;
        if (typeof root.saveState === 'function') root.saveState();
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve({ ok: true, enabled: false });
  }

  function syncToggleUi() {
    try {
      var el = root.document && root.document.getElementById('ob-notifications-enabled');
      if (!el) return;
      var pref = loadPref();
      var profileOn =
        deps.getAppData() &&
        deps.getAppData().profile &&
        deps.getAppData().profile.notificationsEnabled === true;
      el.checked = !!(pref.enabled || profileOn);
    } catch (e) { /* ignore */ }
  }

  async function init(options) {
    options = options || {};
    if (options.getAppData) deps.getAppData = options.getAppData;
    if (options.getTodayStr) deps.getTodayStr = options.getTodayStr;
    if (options.getCycleDeps) deps.getCycleDeps = options.getCycleDeps;
    if (options.getLang) deps.getLang = options.getLang;

    // Expose appData on window if still only a local let — caller should pass getter
    try {
      if (!root.appData && options.getAppData) {
        Object.defineProperty(root, 'appData', {
          configurable: true,
          get: function () {
            try { return options.getAppData(); } catch (e) { return null; }
          }
        });
      }
    } catch (e) { /* ignore */ }

    await ensureServiceWorker();
    syncToggleUi();

    var pref = loadPref();
    var appData = deps.getAppData();
    if (appData && appData.profile && appData.profile.notificationsEnabled === true) {
      pref.enabled = true;
      savePref(pref);
    }

    if (pref.enabled && typeof root.Notification !== 'undefined' && root.Notification.permission === 'granted') {
      scheduleAll();
    }

    try {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.visibilityState === 'visible') {
          syncToggleUi();
          // Catch up: if we're past a slot and not sent, fire once (gentle)
          catchUpMissedSlots();
        }
      });
    } catch (e2) { /* ignore */ }

    return {
      ok: true,
      enabled: !!loadPref().enabled,
      isStandalonePwa: isStandalonePwa(),
      permission:
        typeof root.Notification !== 'undefined' ? root.Notification.permission : 'unsupported'
    };
  }

  function catchUpMissedSlots() {
    var pref = loadPref();
    if (!pref.enabled) return;
    if (typeof root.Notification === 'undefined' || root.Notification.permission !== 'granted') return;
    var now = new Date();
    var today = deps.getTodayStr();
    SLOTS.forEach(function (slot) {
      var slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slot.hour, slot.minute, 0, 0);
      // Only catch up within 90 minutes after slot
      var delta = now.getTime() - slotDate.getTime();
      if (delta >= 0 && delta <= 90 * 60 * 1000 && !wasSent(today, slot.id)) {
        fireSlot(slot.id).catch(function () { /* silent */ });
      }
    });
  }

  function reschedule() {
    scheduleAll();
  }

  root.MaiMaiNotificationEngine = {
    init: init,
    setEnabled: setEnabled,
    requestPermissionAndEnable: requestPermissionAndEnable,
    evaluateUserContext: evaluateUserContext,
    generateContextualMessage: generateContextualMessage,
    fireSlot: fireSlot,
    reschedule: reschedule,
    syncToggleUi: syncToggleUi,
    isStandalonePwa: isStandalonePwa,
    getPref: loadPref,
    SLOTS: SLOTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
