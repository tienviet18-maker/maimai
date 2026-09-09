/**
 * MaiMai Cycle Engine V2 — Women's Health foundation (deterministic, estimate-only).
 * Browser: window.MaiMaiCycleEngine
 * Node: module.exports
 *
 * Does NOT diagnose medical conditions. Predictions are ESTIMATES with confidence.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MaiMaiCycleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FLOW = { SPOTTING: 'spotting', LIGHT: 'light', MEDIUM: 'medium', HEAVY: 'heavy' };
  var PHASE = {
    MENSTRUAL: 'menstrual',
    FOLLICULAR: 'follicular',
    ESTIMATED_FERTILE_WINDOW: 'estimated_fertile_window',
    LUTEAL: 'luteal',
    UNKNOWN: 'unknown'
  };
  var PHYSICAL = [
    'abdominal_cramps', 'back_pain', 'headache', 'breast_tenderness', 'bloating',
    'swelling', 'fatigue', 'nausea', 'constipation', 'diarrhea', 'appetite_change', 'food_craving'
  ];
  var MOOD = ['normal', 'happy', 'sad', 'irritable', 'anxious', 'stressed', 'sensitive'];
  var ENERGY = ['low', 'medium', 'high'];

  /** Legacy Vietnamese / free-text → canonical IDs */
  var LEGACY_SYMPTOM_MAP = {
    'đau bụng': 'abdominal_cramps',
    'dau bung': 'abdominal_cramps',
    'mỏi lưng': 'back_pain',
    'moi lung': 'back_pain',
    'cáu gắt': 'irritable',
    'cau gat': 'irritable',
    'thèm ngọt': 'food_craving',
    'them ngot': 'food_craving',
    'cramps': 'abdominal_cramps',
    'back pain': 'back_pain',
    'irritable': 'irritable',
    'craving': 'food_craving'
  };

  function pad2(n) { return String(n).padStart(2, '0'); }

  function defaultDateHelpers() {
    return {
      getLocalDateStr: function (d) {
        var date = d instanceof Date ? d : new Date(d);
        if (isNaN(date.getTime())) return null;
        try {
          var raw = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
          }).format(date);
          var m = String(raw).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
          if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
        } catch (e) {}
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
      },
      parseDateOnly: function (dateStr) {
        var p = String(dateStr || '').split('-').map(Number);
        if (p.length !== 3 || !p[0]) return null;
        return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
      },
      daysBetween: function (aStr, bStr) {
        var a = this.parseDateOnly(aStr); var b = this.parseDateOnly(bStr);
        if (!a || !b) return null;
        return Math.round((b - a) / 86400000);
      }
    };
  }

  function uid(prefix) {
    return (prefix || 'per') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function median(nums) {
    if (!nums || !nums.length) return null;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  function mean(nums) {
    if (!nums || !nums.length) return null;
    return nums.reduce(function (s, n) { return s + n; }, 0) / nums.length;
  }

  function stdDev(nums) {
    if (!nums || nums.length < 2) return 0;
    var m = mean(nums);
    var v = nums.reduce(function (s, n) { return s + Math.pow(n - m, 2); }, 0) / nums.length;
    return Math.sqrt(v);
  }

  function normalizeSymptomId(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (PHYSICAL.indexOf(s) >= 0 || MOOD.indexOf(s) >= 0) return s;
    var key = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (LEGACY_SYMPTOM_MAP[s.toLowerCase()]) return LEGACY_SYMPTOM_MAP[s.toLowerCase()];
    if (LEGACY_SYMPTOM_MAP[key]) return LEGACY_SYMPTOM_MAP[key];
    return null;
  }

  function isValidFlow(v) {
    return v === FLOW.SPOTTING || v === FLOW.LIGHT || v === FLOW.MEDIUM || v === FLOW.HEAVY;
  }

  function clampPain(n) {
    if (n == null || n === '') return null;
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Math.max(0, Math.min(10, Math.round(v)));
  }

  function ensureDaily(appData, dateStr) {
    if (!appData.dailyRecords) appData.dailyRecords = {};
    if (!appData.dailyRecords[dateStr]) {
      appData.dailyRecords[dateStr] = {
        waterMl: 0, sleepMinutes: null, period: false, note: '',
        symptoms: [], foodLogs: [],
        flow: null, mood: null, energy: null, pain: null, whSymptoms: []
      };
    }
    var d = appData.dailyRecords[dateStr];
    if (!Array.isArray(d.symptoms)) d.symptoms = [];
    if (!Array.isArray(d.whSymptoms)) d.whSymptoms = [];
    if (!Array.isArray(d.foodLogs)) d.foodLogs = [];
    return d;
  }

  function collectPeriodDayKeys(appData) {
    return Object.keys(appData.dailyRecords || {})
      .filter(function (d) { return !!(appData.dailyRecords[d] && appData.dailyRecords[d].period); })
      .sort();
  }

  function groupConsecutiveDays(sortedDays, daysBetween) {
    var groups = [];
    var cur = null;
    for (var i = 0; i < sortedDays.length; i++) {
      var day = sortedDays[i];
      if (!cur) { cur = [day]; continue; }
      var gap = daysBetween(cur[cur.length - 1], day);
      if (gap != null && gap === 1) cur.push(day);
      else { groups.push(cur); cur = [day]; }
    }
    if (cur) groups.push(cur);
    return groups;
  }

  function periodFromDays(days, nowIso) {
    var start = days[0];
    var end = days[days.length - 1];
    var durationDays = days.length;
    return {
      id: uid('per'),
      startDate: start,
      endDate: end,
      durationDays: durationDays,
      flowByDay: {},
      notes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      source: 'migrated_daily_flags'
    };
  }

  /**
   * Idempotent migration: build periodRecords from dailyRecords.period flags if missing.
   * schemaVersion 3 → 4. Does not delete daily flags.
   */
  function migrateAppDataToCycleV2(appData, deps) {
    deps = deps || defaultDateHelpers();
    var changed = false;
    if (!appData || typeof appData !== 'object') return { appData: appData, changed: false };
    if (!Array.isArray(appData.periodRecords)) {
      appData.periodRecords = [];
      changed = true;
    }

    // Normalize daily WH fields + map legacy symptoms
    Object.keys(appData.dailyRecords || {}).forEach(function (dateStr) {
      var day = ensureDaily(appData, dateStr);
      if (day.whSymptoms.length === 0 && day.symptoms.length) {
        day.symptoms.forEach(function (s) {
          var id = normalizeSymptomId(s);
          if (id && day.whSymptoms.indexOf(id) < 0) day.whSymptoms.push(id);
        });
        changed = true;
      }
    });

    if (appData.periodRecords.length === 0) {
      var days = collectPeriodDayKeys(appData);
      var groups = groupConsecutiveDays(days, deps.daysBetween.bind(deps));
      var nowIso = new Date().toISOString();
      groups.forEach(function (g) {
        appData.periodRecords.push(periodFromDays(g, nowIso));
      });
      if (groups.length) changed = true;
    }

    // Sync durationDays
    appData.periodRecords.forEach(function (p) {
      if (p.startDate && p.endDate) {
        var gap = deps.daysBetween(p.startDate, p.endDate);
        var dur = gap != null ? gap + 1 : p.durationDays;
        if (p.durationDays !== dur) { p.durationDays = dur; changed = true; }
      }
    });

    if (!appData.schemaVersion || appData.schemaVersion < 4) {
      appData.schemaVersion = 4;
      changed = true;
    }
    return { appData: appData, changed: changed };
  }

  function syncDailyFlagsFromPeriods(appData, deps) {
    deps = deps || defaultDateHelpers();
    var periods = appData.periodRecords || [];
    // Rebuild period flags from periodRecords (canonical), preserving non-period days' other fields
    Object.keys(appData.dailyRecords || {}).forEach(function (d) {
      if (appData.dailyRecords[d]) appData.dailyRecords[d].period = false;
    });
    periods.forEach(function (p) {
      if (!p.startDate) return;
      var start = deps.parseDateOnly(p.startDate);
      var end = p.endDate ? deps.parseDateOnly(p.endDate) : start;
      if (!start || !end) return;
      for (var t = start.getTime(); t <= end.getTime(); t += 86400000) {
        var ds = deps.getLocalDateStr(new Date(t));
        var day = ensureDaily(appData, ds);
        day.period = true;
        if (p.flowByDay && p.flowByDay[ds] && isValidFlow(p.flowByDay[ds])) {
          day.flow = p.flowByDay[ds];
        }
      }
    });
  }

  function summarizeFlowByDay(flowByDay) {
    var counts = {};
    var sequence = [];
    Object.keys(flowByDay || {}).sort().forEach(function (d) {
      var f = flowByDay[d];
      if (!isValidFlow(f)) return;
      counts[f] = (counts[f] || 0) + 1;
      sequence.push(f);
    });
    if (!sequence.length) return null;
    var dominant = null;
    var max = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > max) { max = counts[k]; dominant = k; }
    });
    return { loggedDays: sequence.length, counts: counts, dominant: dominant, sequence: sequence };
  }

  function eachDateInRange(startDate, endDate, deps, fn) {
    var start = deps.parseDateOnly(startDate);
    var end = endDate ? deps.parseDateOnly(endDate) : start;
    if (!start) return;
    if (!end || end < start) end = start;
    var cur = new Date(start.getTime());
    var guard = 0;
    while (cur <= end && guard < 45) {
      fn(deps.getLocalDateStr(cur));
      cur = new Date(cur.getTime() + 86400000);
      guard++;
    }
  }

  function summarizeSymptomsInRange(appData, startDate, endDate, deps) {
    var counts = {};
    var total = 0;
    eachDateInRange(startDate, endDate, deps, function (key) {
      var rec = (appData.dailyRecords || {})[key] || {};
      var list = (rec.whSymptoms && rec.whSymptoms.length) ? rec.whSymptoms : (rec.symptoms || []);
      list.forEach(function (raw) {
        var id = normalizeSymptomId(raw);
        if (!id) return;
        counts[id] = (counts[id] || 0) + 1;
        total++;
      });
    });
    if (!total) return null;
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 4);
    return { totalLogs: total, uniqueCount: Object.keys(counts).length, counts: counts, top: top };
  }

  function summarizePainInRange(appData, startDate, endDate, deps) {
    var vals = [];
    eachDateInRange(startDate, endDate, deps, function (key) {
      var rec = (appData.dailyRecords || {})[key] || {};
      if (rec.pain == null || rec.pain === '') return;
      var n = Number(rec.pain);
      if (!isNaN(n)) vals.push(Math.max(0, Math.min(10, n)));
    });
    if (vals.length < 2) return null;
    var sum = vals.reduce(function (s, n) { return s + n; }, 0);
    return {
      loggedDays: vals.length,
      average: Math.round((sum / vals.length) * 10) / 10,
      max: Math.max.apply(null, vals)
    };
  }

  function getCycleHistory(appData, deps) {
    deps = deps || defaultDateHelpers();
    var periods = (appData.periodRecords || []).slice().sort(function (a, b) {
      return String(a.startDate).localeCompare(String(b.startDate));
    });
    var cycles = [];
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      var next = periods[i + 1];
      var cycleLength = next ? deps.daysBetween(p.startDate, next.startDate) : null;
      var durationDays = p.durationDays || (p.endDate ? (deps.daysBetween(p.startDate, p.endDate) + 1) : null);
      var endForWindow = p.endDate || p.startDate;
      var flowSummary = summarizeFlowByDay(p.flowByDay || {});
      var symptomSummary = summarizeSymptomsInRange(appData, p.startDate, endForWindow, deps);
      var painSummary = summarizePainInRange(appData, p.startDate, endForWindow, deps);
      cycles.push({
        index: i + 1,
        periodId: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        durationDays: durationDays,
        cycleLength: cycleLength,
        flowByDay: p.flowByDay || {},
        flowSummary: flowSummary,
        symptomSummary: symptomSummary,
        painSummary: painSummary,
        notes: p.notes || ''
      });
    }
    return cycles;
  }

  function calculateCycleLengths(appData, deps) {
    return getCycleHistory(appData, deps)
      .map(function (c) { return c.cycleLength; })
      .filter(function (n) { return n != null && n >= 15 && n <= 45; });
  }

  function calculateAverageCycleLength(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    var m = mean(lens);
    return m == null ? null : Math.round(m * 10) / 10;
  }

  function calculateMedianCycleLength(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    var m = median(lens);
    return m == null ? null : Math.round(m * 10) / 10;
  }

  function calculateMinCycleLength(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    return lens.length ? Math.min.apply(null, lens) : null;
  }

  function calculateMaxCycleLength(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    return lens.length ? Math.max.apply(null, lens) : null;
  }

  function calculateCycleVariability(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    if (lens.length < 2) return { std: null, range: null, irregular: false, reason: 'insufficient' };
    var std = stdDev(lens);
    var range = Math.max.apply(null, lens) - Math.min.apply(null, lens);
    var irregular = std > 7 || range > 10;
    return { std: Math.round(std * 10) / 10, range: range, irregular: irregular, lengths: lens };
  }

  function getPredictionConfidence(appData, deps) {
    var lens = calculateCycleLengths(appData, deps);
    if (lens.length < 1) return { level: 'insufficient', ready: false, reason: 'insufficient' };
    var med = median(lens);
    var avg = mean(lens);
    var std = lens.length >= 2 ? stdDev(lens) : 0;
    var range = lens.length >= 2 ? (Math.max.apply(null, lens) - Math.min.apply(null, lens)) : 0;
    if (lens.length >= 2 && (std > 12 || range > 14)) {
      return { level: 'low', ready: false, reason: 'irregular', median: med, average: avg, std: std, range: range, count: lens.length };
    }
    var unusual = med < 21 || med > 35;
    var level = 'low';
    if (lens.length >= 3 && std <= 3 && !unusual) level = 'high';
    else if (lens.length >= 2 && std <= 7 && !unusual) level = 'mid';
    else level = 'low'; // single observed cycle length → estimate allowed, low confidence
    return {
      level: unusual ? 'low' : level,
      ready: true,
      reason: unusual ? 'unusual_length' : (lens.length < 2 ? 'single_cycle' : 'ok'),
      median: med,
      average: avg,
      std: std,
      range: range,
      count: lens.length
    };
  }

  function predictNextPeriod(appData, deps) {
    deps = deps || defaultDateHelpers();
    var periods = (appData.periodRecords || []).slice().sort(function (a, b) {
      return String(a.startDate).localeCompare(String(b.startDate));
    });
    var conf = getPredictionConfidence(appData, deps);
    if (!periods.length) {
      return { ok: false, estimateDate: null, confidence: conf, reason: 'no_periods' };
    }
    var last = periods[periods.length - 1];
    var estimateLen = calculateMedianCycleLength(appData, deps) || calculateAverageCycleLength(appData, deps);
    if (!conf.ready || estimateLen == null) {
      return {
        ok: false,
        estimateDate: null,
        confidence: conf,
        lastStart: last.startDate,
        reason: conf.reason || 'insufficient'
      };
    }
    var start = deps.parseDateOnly(last.startDate);
    if (!start) return { ok: false, estimateDate: null, confidence: conf, reason: 'bad_date' };
    var next = new Date(start.getTime() + Math.round(estimateLen) * 86400000);
    return {
      ok: true,
      estimateDate: deps.getLocalDateStr(next),
      estimateLength: Math.round(estimateLen),
      confidence: conf,
      lastStart: last.startDate,
      method: 'median_recent_history',
      isEstimate: true
    };
  }

  function getCurrentCycleDay(appData, todayStr, deps) {
    deps = deps || defaultDateHelpers();
    var periods = (appData.periodRecords || []).slice().sort(function (a, b) {
      return String(a.startDate).localeCompare(String(b.startDate));
    });
    if (!periods.length || !todayStr) return { ok: false, day: null, start: null };
    var last = periods[periods.length - 1];
    var start = last.startDate;
    var day = deps.daysBetween(start, todayStr);
    if (day == null || day < 0) return { ok: false, day: null, start: start };
    // If prediction says we should already be in next cycle but no new period logged, still count from last start
    return { ok: true, day: day + 1, start: start, periodId: last.id };
  }

  function getMenstrualPhaseEstimate(appData, dateStr, deps) {
    deps = deps || defaultDateHelpers();
    var dayRec = (appData.dailyRecords || {})[dateStr];
    if (dayRec && dayRec.period) {
      return { phase: PHASE.MENSTRUAL, confidence: 'observed', isEstimate: false };
    }
    var conf = getPredictionConfidence(appData, deps);
    var cur = getCurrentCycleDay(appData, dateStr, deps);
    var med = calculateMedianCycleLength(appData, deps) || calculateAverageCycleLength(appData, deps);
    if (!cur.ok || med == null || !conf.ready) {
      return { phase: PHASE.UNKNOWN, confidence: 'insufficient', isEstimate: true };
    }
    var day = cur.day;
    var periodDur = 5;
    var periods = appData.periodRecords || [];
    var durs = periods.map(function (p) { return p.durationDays; }).filter(function (n) { return n > 0 && n <= 10; });
    if (durs.length) periodDur = Math.round(median(durs));
    // Luteal approx 14 days → ovulation ≈ cycleLen - 14
    var ovulationDay = Math.max(periodDur + 1, Math.round(med) - 14);
    var fertileStart = Math.max(periodDur + 1, ovulationDay - 5);
    var fertileEnd = Math.min(Math.round(med) - 1, ovulationDay + 1);

    if (day <= periodDur) return { phase: PHASE.MENSTRUAL, confidence: conf.level, isEstimate: true, cycleDay: day };
    if (day >= fertileStart && day <= fertileEnd) {
      return { phase: PHASE.ESTIMATED_FERTILE_WINDOW, confidence: conf.level, isEstimate: true, cycleDay: day, ovulationDayEstimate: ovulationDay };
    }
    if (day < fertileStart) return { phase: PHASE.FOLLICULAR, confidence: conf.level, isEstimate: true, cycleDay: day };
    if (day > fertileEnd) return { phase: PHASE.LUTEAL, confidence: conf.level, isEstimate: true, cycleDay: day };
    return { phase: PHASE.UNKNOWN, confidence: 'low', isEstimate: true, cycleDay: day };
  }

  /** Compatibility wrapper matching legacy getCycleStats shape */
  function getCycleStatsCompat(appData, deps) {
    deps = deps || defaultDateHelpers();
    var starts = (appData.periodRecords || []).map(function (p) { return p.startDate; }).filter(Boolean).sort();
    // Fallback to daily flags if periodRecords empty
    if (!starts.length) {
      starts = collectPeriodDayKeys(appData);
      starts = groupConsecutiveDays(starts, deps.daysBetween.bind(deps)).map(function (g) { return g[0]; });
    }
    var conf = getPredictionConfidence(appData, deps);
    var lengths = calculateCycleLengths(appData, deps);
    var avg = calculateAverageCycleLength(appData, deps);
    var med = calculateMedianCycleLength(appData, deps);
    var variability = calculateCycleVariability(appData, deps);
    if (!conf.ready) {
      return {
        ready: false,
        starts: starts,
        lengths: lengths,
        avgCycle: avg,
        medianCycle: med,
        irregular: !!(variability && variability.irregular),
        confidence: conf.level === 'insufficient' ? null : 'low',
        reason: conf.reason,
        std: variability.std,
        minL: calculateMinCycleLength(appData, deps),
        maxL: calculateMaxCycleLength(appData, deps)
      };
    }
    return {
      ready: true,
      starts: starts,
      lengths: lengths,
      avgCycle: avg,
      medianCycle: med,
      irregular: !!(variability && variability.irregular),
      confidence: conf.level === 'high' ? 'high' : conf.level === 'mid' ? 'mid' : 'low',
      std: variability.std,
      minL: calculateMinCycleLength(appData, deps),
      maxL: calculateMaxCycleLength(appData, deps),
      unusualLength: med != null && (med < 21 || med > 35),
      sdmEligible: med != null && med >= 26 && med <= 32 && !(variability && variability.irregular)
    };
  }

  function getPredictedPeriodDates(appData, deps, horizonDays) {
    deps = deps || defaultDateHelpers();
    horizonDays = horizonDays || 45;
    var pred = predictNextPeriod(appData, deps);
    if (!pred.ok || !pred.estimateDate) return [];
    var avgDur = 5;
    var durs = (appData.periodRecords || []).map(function (p) { return p.durationDays; }).filter(function (n) { return n > 0 && n <= 10; });
    if (durs.length) avgDur = Math.round(median(durs));
    var out = [];
    var start = deps.parseDateOnly(pred.estimateDate);
    if (!start) return [];
    for (var i = 0; i < avgDur; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      out.push(deps.getLocalDateStr(d));
    }
    return out;
  }

  // ---- Mutations (canonical appData) ----

  function findOpenPeriod(appData) {
    var list = appData.periodRecords || [];
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].endDate == null) return list[i];
    }
    return null;
  }

  function findPeriodCovering(appData, dateStr, deps) {
    deps = deps || defaultDateHelpers();
    var list = appData.periodRecords || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.startDate) continue;
      var end = p.endDate || dateStr;
      var a = deps.daysBetween(p.startDate, dateStr);
      var b = deps.daysBetween(dateStr, end);
      if (a != null && b != null && a >= 0 && b >= 0) return p;
    }
    return null;
  }

  function startPeriod(appData, dateStr, opts, deps) {
    deps = deps || defaultDateHelpers();
    opts = opts || {};
    migrateAppDataToCycleV2(appData, deps);
    var existing = findPeriodCovering(appData, dateStr, deps);
    if (existing) {
      ensureDaily(appData, dateStr).period = true;
      syncDailyFlagsFromPeriods(appData, deps);
      return { ok: true, period: existing, created: false };
    }
    var open = findOpenPeriod(appData);
    if (open) {
      // Close previous open period day before start
      if (!open.endDate) {
        var gap = deps.daysBetween(open.startDate, dateStr);
        if (gap != null && gap > 0) {
          var prev = deps.parseDateOnly(dateStr);
          prev.setDate(prev.getDate() - 1);
          open.endDate = deps.getLocalDateStr(prev);
          open.durationDays = deps.daysBetween(open.startDate, open.endDate) + 1;
          open.updatedAt = new Date().toISOString();
        }
      }
    }
    var nowIso = new Date().toISOString();
    var rec = {
      id: uid('per'),
      startDate: dateStr,
      endDate: null,
      durationDays: null,
      flowByDay: {},
      notes: opts.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
      source: 'user'
    };
    if (opts.flow && isValidFlow(opts.flow)) rec.flowByDay[dateStr] = opts.flow;
    appData.periodRecords.push(rec);
    ensureDaily(appData, dateStr).period = true;
    if (opts.flow) ensureDaily(appData, dateStr).flow = opts.flow;
    syncDailyFlagsFromPeriods(appData, deps);
    // For open period, mark only start day until more days logged
    ensureDaily(appData, dateStr).period = true;
    return { ok: true, period: rec, created: true };
  }

  function markPeriodDay(appData, dateStr, on, deps) {
    deps = deps || defaultDateHelpers();
    migrateAppDataToCycleV2(appData, deps);
    var day = ensureDaily(appData, dateStr);
    if (on) {
      var covering = findPeriodCovering(appData, dateStr, deps);
      var open = findOpenPeriod(appData);
      if (covering) {
        day.period = true;
      } else if (open) {
        // Extend open period if contiguous or close
        var gap = deps.daysBetween(open.startDate, dateStr);
        if (gap != null && gap >= 0 && gap <= 14) {
          day.period = true;
          // Rebuild end as max marked day — sync from daily after flag
        } else {
          startPeriod(appData, dateStr, {}, deps);
        }
      } else {
        startPeriod(appData, dateStr, {}, deps);
      }
      day.period = true;
      // Rebuild periodRecords from daily consecutive groups to avoid duplicates
      rebuildPeriodsFromDailyFlags(appData, deps);
    } else {
      day.period = false;
      rebuildPeriodsFromDailyFlags(appData, deps);
    }
    return { ok: true };
  }

  function rebuildPeriodsFromDailyFlags(appData, deps) {
    deps = deps || defaultDateHelpers();
    var oldFlows = {};
    (appData.periodRecords || []).forEach(function (p) {
      Object.keys(p.flowByDay || {}).forEach(function (k) { oldFlows[k] = p.flowByDay[k]; });
    });
    var days = collectPeriodDayKeys(appData);
    var groups = groupConsecutiveDays(days, deps.daysBetween.bind(deps));
    var nowIso = new Date().toISOString();
    var today = deps.getLocalDateStr(new Date());
    appData.periodRecords = groups.map(function (g) {
      var end = g[g.length - 1];
      var stillOpen = end === today;
      var flowByDay = {};
      g.forEach(function (d) {
        if (oldFlows[d]) flowByDay[d] = oldFlows[d];
        var dr = appData.dailyRecords[d];
        if (dr && dr.flow && isValidFlow(dr.flow)) flowByDay[d] = dr.flow;
      });
      return {
        id: uid('per'),
        startDate: g[0],
        endDate: stillOpen ? null : end,
        durationDays: stillOpen ? (deps.daysBetween(g[0], end) + 1) : g.length,
        flowByDay: flowByDay,
        notes: '',
        createdAt: nowIso,
        updatedAt: nowIso,
        source: 'daily_sync'
      };
    });
  }

  function endPeriod(appData, dateStr, deps) {
    deps = deps || defaultDateHelpers();
    migrateAppDataToCycleV2(appData, deps);
    var open = findOpenPeriod(appData) || findPeriodCovering(appData, dateStr, deps);
    if (!open) {
      // Mark day off and rebuild
      ensureDaily(appData, dateStr).period = true;
      rebuildPeriodsFromDailyFlags(appData, deps);
      open = findPeriodCovering(appData, dateStr, deps);
    }
    if (!open) return { ok: false, reason: 'no_open_period' };
    open.endDate = dateStr;
    open.durationDays = deps.daysBetween(open.startDate, dateStr) + 1;
    open.updatedAt = new Date().toISOString();
    // Ensure all days from start..end flagged
    var start = deps.parseDateOnly(open.startDate);
    var end = deps.parseDateOnly(dateStr);
    for (var t = start.getTime(); t <= end.getTime(); t += 86400000) {
      ensureDaily(appData, deps.getLocalDateStr(new Date(t))).period = true;
    }
    rebuildPeriodsFromDailyFlags(appData, deps);
    return { ok: true };
  }

  function setFlowForDay(appData, dateStr, flow, deps) {
    deps = deps || defaultDateHelpers();
    if (flow != null && !isValidFlow(flow)) return { ok: false, reason: 'invalid_flow' };
    var day = ensureDaily(appData, dateStr);
    day.flow = flow;
    var p = findPeriodCovering(appData, dateStr, deps);
    if (p) {
      if (!p.flowByDay) p.flowByDay = {};
      if (flow) p.flowByDay[dateStr] = flow;
      else delete p.flowByDay[dateStr];
      p.updatedAt = new Date().toISOString();
    }
    return { ok: true };
  }

  function setWhLog(appData, dateStr, patch) {
    var day = ensureDaily(appData, dateStr);
    if (patch.mood != null) {
      day.mood = MOOD.indexOf(patch.mood) >= 0 ? patch.mood : day.mood;
    }
    if (patch.energy != null) {
      day.energy = ENERGY.indexOf(patch.energy) >= 0 ? patch.energy : day.energy;
    }
    if (patch.pain !== undefined) day.pain = clampPain(patch.pain);
    if (Array.isArray(patch.whSymptoms)) {
      day.whSymptoms = patch.whSymptoms.map(normalizeSymptomId).filter(Boolean);
      // mirror legacy display strings lightly
      day.symptoms = day.whSymptoms.slice();
    }
    if (patch.note != null) day.note = String(patch.note);
    if (patch.flow !== undefined) setFlowForDay(appData, dateStr, patch.flow);
    return { ok: true, day: day };
  }

  function toggleWhSymptom(appData, dateStr, symptomId) {
    var id = normalizeSymptomId(symptomId) || symptomId;
    var day = ensureDaily(appData, dateStr);
    if (!Array.isArray(day.whSymptoms)) day.whSymptoms = [];
    var idx = day.whSymptoms.indexOf(id);
    if (idx >= 0) day.whSymptoms.splice(idx, 1);
    else day.whSymptoms.push(id);
    day.symptoms = day.whSymptoms.slice();
    return { ok: true, whSymptoms: day.whSymptoms.slice() };
  }

  function generateCycleInsights(appData, deps) {
    deps = deps || defaultDateHelpers();
    var insights = [];
    var seen = {};
    function push(ins) {
      if (!ins || !ins.id || seen[ins.id]) return;
      seen[ins.id] = true;
      insights.push(ins);
    }
    var lengths = calculateCycleLengths(appData, deps);
    var med = calculateMedianCycleLength(appData, deps);
    var variability = calculateCycleVariability(appData, deps);
    var durs = (appData.periodRecords || []).map(function (p) { return p.durationDays; }).filter(function (n) { return n > 0 && n <= 12; });
    var medDur = median(durs);
    var starts = (appData.periodRecords || []).map(function (p) { return p.startDate; }).filter(Boolean).sort();
    if (lengths.length >= 2 && med != null) {
      push({ id: 'cycle_length_range', kind: 'observation', priority: 10, severity: 'info',
        data: { median: med, min: Math.min.apply(null, lengths), max: Math.max.apply(null, lengths), count: lengths.length } });
    }
    if (lengths.length >= 3 && variability && variability.irregular) {
      push({ id: 'cycle_irregular', kind: 'observation', priority: 20, severity: 'info',
        data: { std: variability.std, range: variability.range, count: lengths.length } });
    }
    if (durs.length >= 2 && medDur != null) {
      push({ id: 'period_duration_range', kind: 'observation', priority: 15, severity: 'info',
        data: { median: medDur, min: Math.min.apply(null, durs), max: Math.max.apply(null, durs), count: durs.length } });
    }
    var preHits = 0, preChecked = 0;
    starts.forEach(function (start) {
      var sd = deps.parseDateOnly(start); if (!sd) return;
      for (var i = 1; i <= 3; i++) {
        var key = deps.getLocalDateStr(new Date(sd.getTime() - i * 86400000));
        preChecked++;
        var rec = (appData.dailyRecords || {})[key];
        if (rec && ((rec.whSymptoms && rec.whSymptoms.length) || (rec.symptoms && rec.symptoms.length))) preHits++;
      }
    });
    if (starts.length >= 2 && preChecked > 0 && preHits / preChecked >= 0.25) {
      push({ id: 'symptoms_before_period', kind: 'observation', priority: 25, severity: 'info',
        data: { rate: Math.round((preHits / preChecked) * 100), starts: starts.length } });
    }
    var recentStarts = starts.slice(-4);
    if (recentStarts.length >= 2) {
      var preKcal = [], baseKcal = [], preWater = [], baseWater = [], preSleep = [], baseSleep = [], preWeight = [], baseWeight = [];
      function avg(a) { return a.length ? a.reduce(function (s, n) { return s + n; }, 0) / a.length : null; }
      recentStarts.forEach(function (start) {
        getNutritionAroundCycle(appData, start, 7, deps).forEach(function (row) {
          var off = deps.daysBetween(start, row.date); if (off == null) return;
          if (off >= -3 && off <= -1 && row.kcal > 0) preKcal.push(row.kcal);
          if (off >= 5 && off <= 10 && row.kcal > 0) baseKcal.push(row.kcal);
        });
        getWaterAroundCycle(appData, start, 7, deps).forEach(function (row) {
          var off = deps.daysBetween(start, row.date); if (off == null || row.value == null) return;
          if (off >= -3 && off <= -1) preWater.push(row.value);
          if (off >= 5 && off <= 10) baseWater.push(row.value);
        });
        getSleepAroundCycle(appData, start, 7, deps).forEach(function (row) {
          var off = deps.daysBetween(start, row.date); if (off == null || row.value == null) return;
          if (off >= -3 && off <= -1) preSleep.push(row.value);
          if (off >= 5 && off <= 10) baseSleep.push(row.value);
        });
        getWeightAroundCycle(appData, start, 7, deps).forEach(function (w) {
          var off = deps.daysBetween(start, w.date); if (off == null || w.weight == null) return;
          if (off >= -2 && off <= 2) preWeight.push(Number(w.weight));
          if (off >= 8 && off <= 14) baseWeight.push(Number(w.weight));
        });
      });
      var aPreK = avg(preKcal), aBaseK = avg(baseKcal);
      if (preKcal.length >= 3 && baseKcal.length >= 3 && aPreK != null && aBaseK != null && aBaseK > 0 && aPreK >= aBaseK * 1.12) {
        push({ id: 'appetite_before_period', kind: 'observation', priority: 30, severity: 'info', data: { preAvg: Math.round(aPreK), baseAvg: Math.round(aBaseK) } });
      }
      var aPreW = avg(preWater), aBaseW = avg(baseWater);
      if (preWater.length >= 3 && baseWater.length >= 3 && aPreW != null && aBaseW != null && aBaseW > 0 && aPreW <= aBaseW * 0.85) {
        push({ id: 'water_lower_before_period', kind: 'observation', priority: 28, severity: 'info', data: { preAvg: Math.round(aPreW), baseAvg: Math.round(aBaseW) } });
      }
      var aPreS = avg(preSleep), aBaseS = avg(baseSleep);
      if (preSleep.length >= 3 && baseSleep.length >= 3 && aPreS != null && aBaseS != null && aBaseS > 0 && aPreS <= aBaseS * 0.9) {
        push({ id: 'sleep_lower_before_period', kind: 'observation', priority: 27, severity: 'info', data: { preAvgHours: Math.round((aPreS / 60) * 10) / 10, baseAvgHours: Math.round((aBaseS / 60) * 10) / 10 } });
      }
      var aPreWt = avg(preWeight), aBaseWt = avg(baseWeight);
      if (preWeight.length >= 2 && baseWeight.length >= 2 && aPreWt != null && aBaseWt != null && Math.abs(aPreWt - aBaseWt) >= 0.4) {
        push({ id: 'weight_around_period', kind: 'observation', priority: 22, severity: 'info', data: { aroundAvg: Math.round(aPreWt * 10) / 10, laterAvg: Math.round(aBaseWt * 10) / 10 } });
      }
    }
    var today = deps.getLocalDateStr(new Date());
    var todayD = deps.parseDateOnly(today);
    if (todayD) {
      var logged = 0;
      for (var di = 0; di < 30; di++) {
        var dkey = deps.getLocalDateStr(new Date(todayD.getTime() - di * 86400000));
        var drec = (appData.dailyRecords || {})[dkey];
        if (!drec) continue;
        if ((drec.foodLogs && drec.foodLogs.length) || (drec.waterMl || 0) > 0 || drec.sleepMinutes != null || (drec.whSymptoms && drec.whSymptoms.length) || drec.period || (drec.note && String(drec.note).trim())) logged++;
      }
      if (logged >= 10) push({ id: 'logging_consistency', kind: 'observation', priority: 5, severity: 'info', data: { daysLogged: logged, window: 30 } });
    }
    if (!insights.length) push({ id: 'need_more_data', kind: 'guidance', priority: 1, severity: 'info', data: {} });
    insights.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
    return insights.slice(0, 6);
  }

  function buildCycleDashboardSnapshot(appData, todayStr, deps) {
    deps = deps || defaultDateHelpers();
    migrateAppDataToCycleV2(appData, deps);
    var summary = homeCycleSummary(appData, todayStr, deps);
    var hist = getCycleHistory(appData, deps);
    var variability = calculateCycleVariability(appData, deps);
    var day = (appData.dailyRecords || {})[todayStr] || {};
    var recentSymptoms = [];
    var keys = Object.keys(appData.dailyRecords || {}).sort().reverse();
    for (var i = 0; i < keys.length && recentSymptoms.length < 8; i++) {
      var rec = appData.dailyRecords[keys[i]] || {};
      (rec.whSymptoms || []).forEach(function (sy) { if (recentSymptoms.indexOf(sy) < 0) recentSymptoms.push(sy); });
    }
    return {
      summary: summary,
      cycleCount: hist.length,
      averageCycleLength: calculateAverageCycleLength(appData, deps),
      medianCycleLength: calculateMedianCycleLength(appData, deps),
      minCycleLength: calculateMinCycleLength(appData, deps),
      maxCycleLength: calculateMaxCycleLength(appData, deps),
      variability: variability,
      recentSymptoms: recentSymptoms,
      todayMood: day.mood || null,
      todayEnergy: day.energy || null,
      todayPain: day.pain,
      todayFlow: day.flow || null,
      insights: generateCycleInsights(appData, deps),
      history: hist.slice().reverse().slice(0, 8)
    };
  }

  function pickMaiCycleContext(appData, todayStr, deps) {
    deps = deps || defaultDateHelpers();
    var snap = buildCycleDashboardSnapshot(appData, todayStr, deps);
    var sum = snap.summary || {};
    var water = ((appData.dailyRecords || {})[todayStr] || {}).waterMl || 0;
    var sleep = ((appData.dailyRecords || {})[todayStr] || {}).sleepMinutes;
    var topInsight = (snap.insights && snap.insights[0] && snap.insights[0].id !== 'need_more_data') ? snap.insights[0].id : null;
    return {
      onPeriod: !!sum.onPeriod,
      phase: sum.phase || 'unknown',
      cycleDay: sum.cycleDay,
      daysUntilNextPeriod: sum.daysUntilNextPeriod,
      lowWater: water > 0 && water < 1000,
      lowSleep: sleep != null && sleep < 360,
      topInsightId: topInsight,
      hasHistory: !!sum.hasHistory
    };
  }


  // Cross-data interfaces (Phase 2 ready)
  function getWeightAroundCycle(appData, cycleStart, windowDays, deps) {
    deps = deps || defaultDateHelpers();
    windowDays = windowDays || 7;
    var start = deps.parseDateOnly(cycleStart);
    if (!start) return [];
    var from = new Date(start.getTime() - windowDays * 86400000);
    var to = new Date(start.getTime() + windowDays * 86400000);
    return (appData.weightLogs || []).filter(function (w) {
      var d = deps.parseDateOnly(w.date);
      return d && d >= from && d <= to;
    });
  }

  function getNutritionAroundCycle(appData, cycleStart, windowDays, deps) {
    deps = deps || defaultDateHelpers();
    windowDays = windowDays || 7;
    var start = deps.parseDateOnly(cycleStart);
    if (!start) return [];
    var out = [];
    for (var i = -windowDays; i <= windowDays; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      var key = deps.getLocalDateStr(d);
      var rec = (appData.dailyRecords || {})[key];
      var logs = (rec && rec.foodLogs) || [];
      var kcal = logs.reduce(function (s, l) { return s + ((l.nutritionSnapshot && l.nutritionSnapshot.energyKcal) || 0); }, 0);
      out.push({ date: key, kcal: kcal, mealCount: logs.length });
    }
    return out;
  }

  function getSleepAroundCycle(appData, cycleStart, windowDays, deps) {
    return _metricAround(appData, cycleStart, windowDays, deps, 'sleepMinutes');
  }
  function getWaterAroundCycle(appData, cycleStart, windowDays, deps) {
    return _metricAround(appData, cycleStart, windowDays, deps, 'waterMl');
  }
  function getSymptomsAroundCycle(appData, cycleStart, windowDays, deps) {
    deps = deps || defaultDateHelpers();
    windowDays = windowDays || 7;
    var start = deps.parseDateOnly(cycleStart);
    if (!start) return [];
    var out = [];
    for (var i = -windowDays; i <= windowDays; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      var key = deps.getLocalDateStr(d);
      var rec = (appData.dailyRecords || {})[key] || {};
      out.push({ date: key, whSymptoms: (rec.whSymptoms || []).slice(), mood: rec.mood || null, energy: rec.energy || null, pain: rec.pain });
    }
    return out;
  }
  function _metricAround(appData, cycleStart, windowDays, deps, field) {
    deps = deps || defaultDateHelpers();
    windowDays = windowDays || 7;
    var start = deps.parseDateOnly(cycleStart);
    if (!start) return [];
    var out = [];
    for (var i = -windowDays; i <= windowDays; i++) {
      var d = new Date(start.getTime() + i * 86400000);
      var key = deps.getLocalDateStr(d);
      var rec = (appData.dailyRecords || {})[key] || {};
      out.push({ date: key, value: rec[field] != null ? rec[field] : null });
    }
    return out;
  }

  function homeCycleSummary(appData, todayStr, deps) {
    deps = deps || defaultDateHelpers();
    migrateAppDataToCycleV2(appData, deps);
    var cur = getCurrentCycleDay(appData, todayStr, deps);
    var pred = predictNextPeriod(appData, deps);
    var phase = getMenstrualPhaseEstimate(appData, todayStr, deps);
    var dayRec = (appData.dailyRecords || {})[todayStr] || {};
    var daysUntil = null;
    if (pred.ok && pred.estimateDate) daysUntil = deps.daysBetween(todayStr, pred.estimateDate);
    return {
      hasHistory: (appData.periodRecords || []).length > 0,
      cycleDay: cur.ok ? cur.day : null,
      phase: phase.phase,
      phaseConfidence: phase.confidence,
      nextPeriodEstimate: pred.ok ? pred.estimateDate : null,
      daysUntilNextPeriod: daysUntil,
      predictionConfidence: pred.confidence && pred.confidence.level,
      onPeriod: !!dayRec.period,
      isEstimate: true
    };
  }

  return {
    FLOW: FLOW,
    PHASE: PHASE,
    PHYSICAL_SYMPTOMS: PHYSICAL,
    MOOD: MOOD,
    ENERGY: ENERGY,
    defaultDateHelpers: defaultDateHelpers,
    normalizeSymptomId: normalizeSymptomId,
    migrateAppDataToCycleV2: migrateAppDataToCycleV2,
    getCycleHistory: getCycleHistory,
    summarizeFlowByDay: summarizeFlowByDay,
    summarizeSymptomsInRange: summarizeSymptomsInRange,
    summarizePainInRange: summarizePainInRange,
    calculateCycleLength: calculateCycleLengths,
    calculateCycleLengths: calculateCycleLengths,
    calculateAverageCycleLength: calculateAverageCycleLength,
    calculateMedianCycleLength: calculateMedianCycleLength,
    calculateMinCycleLength: calculateMinCycleLength,
    calculateMaxCycleLength: calculateMaxCycleLength,
    calculateCycleVariability: calculateCycleVariability,
    predictNextPeriod: predictNextPeriod,
    getCurrentCycleDay: getCurrentCycleDay,
    getPredictionConfidence: getPredictionConfidence,
    getMenstrualPhaseEstimate: getMenstrualPhaseEstimate,
    getCycleStatsCompat: getCycleStatsCompat,
    getPredictedPeriodDates: getPredictedPeriodDates,
    startPeriod: startPeriod,
    endPeriod: endPeriod,
    markPeriodDay: markPeriodDay,
    setFlowForDay: setFlowForDay,
    setWhLog: setWhLog,
    toggleWhSymptom: toggleWhSymptom,
    generateCycleInsights: generateCycleInsights,
    buildCycleDashboardSnapshot: buildCycleDashboardSnapshot,
    pickMaiCycleContext: pickMaiCycleContext,
    getWeightAroundCycle: getWeightAroundCycle,
    getNutritionAroundCycle: getNutritionAroundCycle,
    getSleepAroundCycle: getSleepAroundCycle,
    getWaterAroundCycle: getWaterAroundCycle,
    getSymptomsAroundCycle: getSymptomsAroundCycle,
    homeCycleSummary: homeCycleSummary,
    rebuildPeriodsFromDailyFlags: rebuildPeriodsFromDailyFlags,
    SCHEMA_VERSION: 4
  };
});
