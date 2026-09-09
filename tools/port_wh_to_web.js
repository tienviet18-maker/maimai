/**
 * Surgically port Women's Health UI/JS/i18n from Android www/index.html
 * into MAIMAI_WEB_NETLIFY/index.html WITHOUT overwriting Web scrub/PWA/AdMob.
 *
 * Run: node tools/port_wh_to_web.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ANDROID = path.join(__dirname, '..', 'www', 'index.html');
const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'index.html');
const ENGINE_SRC = path.join(__dirname, '..', 'www', 'js', 'cycle', 'cycle_engine.js');
const ENGINE_DST = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'js', 'cycle', 'cycle_engine.js');

function replaceOnce(hay, needle, repl, label) {
  const i = hay.indexOf(needle);
  if (i < 0) throw new Error('anchor missing: ' + label);
  return hay.slice(0, i) + repl + hay.slice(i + needle.length);
}

function extractI18nBlock(src, lang) {
  const langToken = lang + ': {';
  const langStart = src.indexOf(langToken);
  if (langStart < 0) throw new Error('lang block missing ' + lang);
  // Find next language or end of I18N
  const nextLang = lang === 'vi' ? '\n            ja: {' : lang === 'ja' ? '\n            en: {' : '\n        };';
  const langEnd = src.indexOf(nextLang, langStart);
  const block = src.slice(langStart, langEnd);
  const startKey = block.indexOf('cycleCardTitle:');
  const endKey = block.indexOf('cyclePredictionDisclaimer:');
  if (startKey < 0 || endKey < 0) throw new Error('i18n WH keys missing in ' + lang);
  const after = block.indexOf('\n', endKey);
  return block.slice(startKey, after + 1);
}

function stripDuplicateFunctions(src, names) {
  // Keep the LAST definition of each function (ported Android WH overrides older Web).
  for (const name of names) {
    const re = new RegExp('function\\s+' + name + '\\s*\\(');
    const starts = [];
    let idx = 0;
    while (true) {
      const slice = src.slice(idx);
      const m = re.exec(slice);
      if (!m) break;
      const abs = idx + m.index;
      starts.push(abs);
      idx = abs + m[0].length;
    }
    if (starts.length <= 1) continue;
    // Remove all but the last, from end to start so indices stay valid
    for (let k = starts.length - 2; k >= 0; k--) {
      const abs = starts[k];
      let i = abs;
      while (i < src.length && src[i] !== '{') i++;
      if (src[i] !== '{') continue;
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') {
          depth--;
          if (depth === 0) { j++; break; }
        }
      }
      while (j < src.length && (src[j] === '\n' || src[j] === '\r' || src[j] === ' ')) j++;
      src = src.slice(0, abs) + src.slice(j);
    }
  }
  return src;
}

const android = fs.readFileSync(ANDROID, 'utf8').replace(/\r\n/g, '\n');
let web = fs.readFileSync(WEB, 'utf8').replace(/\r\n/g, '\n');
const webHadCrlf = fs.readFileSync(WEB, 'utf8').includes('\r\n');

if (web.includes('id="wh-dashboard"')) {
  console.log('Already ported; syncing engine only');
  fs.copyFileSync(ENGINE_SRC, ENGINE_DST);
  process.exit(0);
}

// 1) Home cycle card
const homeCard = `                <div id="home-cycle-card" class="bg-rose-50/90 border border-rose-100 p-4 rounded-2xl cursor-pointer active:scale-[0.99] transition" onclick="switchTab('track')">
                    <div class="flex items-start gap-3">
                        <span class="text-xl">🌸</span>
                        <div class="min-w-0 flex-1">
                            <p class="text-[10px] font-bold text-rose-500 uppercase tracking-wide" data-i18n="cycleCardTitle">Chu kỳ của bạn</p>
                            <p id="home-cycle-main" class="text-sm font-bold text-rose-800 mt-0.5">—</p>
                            <p id="home-cycle-sub" class="text-[11px] text-rose-500/90 mt-0.5 leading-relaxed"></p>
                        </div>
                        <span id="home-cycle-badge" class="text-[9px] font-bold text-rose-400 bg-white px-2 py-0.5 rounded-full shrink-0" data-i18n="cycleEstimateBadge">ước tính</span>
                    </div>
                </div>
`;

web = replaceOnce(
  web,
  `                <div class="bg-pink-50 border border-pink-100 p-4 rounded-2xl flex items-start space-x-3">
                    <span class="text-xl">💌</span>
                    <div>
                        <p class="text-xs text-gray-700 font-semibold leading-relaxed" id="daily-quote"></p>
                    </div>
                </div>

                <h3 class="font-bold text-gray-800 text-base px-1" data-i18n="todaySummary">Tổng quan hôm nay</h3>`,
  `                <div class="bg-pink-50 border border-pink-100 p-4 rounded-2xl flex items-start space-x-3">
                    <span class="text-xl">💌</span>
                    <div>
                        <p class="text-xs text-gray-700 font-semibold leading-relaxed" id="daily-quote"></p>
                    </div>
                </div>

${homeCard}
                <h3 class="font-bold text-gray-800 text-base px-1" data-i18n="todaySummary">Tổng quan hôm nay</h3>`,
  'home cycle card'
);

// 2) Dashboard + Quick Log (from Android, including closing white-card </div>)
const dashStart = android.indexOf('<div id="wh-dashboard"');
const roseStart = android.indexOf('<div class="bg-rose-50/90 p-5 rounded-[2rem] shadow-sm border border-rose-200 relative overflow-hidden">', dashStart);
if (dashStart < 0 || roseStart < 0) throw new Error('dash/rose markers missing');
const dashQuickAndClose = android.slice(dashStart, roseStart); // includes closing </div> of white card

web = replaceOnce(
  web,
  `                        <button onclick="openSleepModal('HEALTH')" class="px-3.5 py-1.5 bg-purple-500 text-white rounded-xl text-xs font-bold shadow-xs" data-i18n="updateBtn">Cập nhật</button>
                    </div>
                </div>

                <div class="bg-rose-50/90 p-5 rounded-[2rem] shadow-sm border border-rose-200 relative overflow-hidden">`,
  `                        <button onclick="openSleepModal('HEALTH')" class="px-3.5 py-1.5 bg-purple-500 text-white rounded-xl text-xs font-bold shadow-xs" data-i18n="updateBtn">Cập nhật</button>
                    </div>

                    ${dashQuickAndClose.trim()}

                <div class="bg-rose-50/90 p-5 rounded-[2rem] shadow-sm border border-rose-200 relative overflow-hidden">`,
  'dashboard+quicklog'
);

// 3) Legend
web = replaceOnce(
  web,
  `                        <div class="cal-legend" id="calendar-legend">
                            <span data-i18n="legendPeriodMark">🔴 Ngày dâu</span>`,
  `                        <div class="cal-legend" id="calendar-legend">
                            <span data-i18n="legendRecorded">● Đã ghi nhận</span>
                            <span data-i18n="legendEstimated">◌ Ước tính</span>
                            <span data-i18n="legendPeriodMark">🔴 Ngày dâu</span>`,
  'legend'
);

// 4) Day detail
web = replaceOnce(
  web,
  `                        <div id="symptoms-box" class="hidden space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-600" data-i18n="symptomTitle">Triệu chứng cơ thể:</p>
                            <div class="flex flex-wrap gap-1.5">
                                <button onclick="toggleSymptom('Đau bụng')" id="sym-1" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Đau bụng 🥺</button>
                                <button onclick="toggleSymptom('Mỏi lưng')" id="sym-2" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Mỏi lưng 🛋️</button>
                                <button onclick="toggleSymptom('Cáu gắt')" id="sym-3" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Cáu gắt 😤</button>
                                <button onclick="toggleSymptom('Thèm ngọt')" id="sym-4" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Thèm ngọt 🍰</button>
                            </div>
                        </div>`,
  `                        <div id="day-wh-meta" class="space-y-1 text-[11px] text-rose-700/90">
                            <p id="day-cycle-day-text" class="font-semibold"></p>
                            <p id="day-phase-text" class="text-[10px] text-rose-500"></p>
                            <p id="day-flow-mood-text" class="text-[10px] text-gray-500"></p>
                        </div>

                        <div id="day-lifestyle-box" class="bg-white/80 border border-rose-100 rounded-xl px-3 py-2 space-y-0.5">
                            <p class="text-[10px] font-bold text-rose-500" data-i18n="dayLifestyleTitle">Nhật ký ngày</p>
                            <p id="day-lifestyle-text" class="text-[10px] text-gray-600"></p>
                        </div>

                        <div id="symptoms-box" class="space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-600" data-i18n="symptomTitle">Triệu chứng cơ thể:</p>
                            <div id="day-symptom-buttons" class="flex flex-wrap gap-1.5"></div>
                        </div>`,
  'day detail WH'
);

// 5) History + insights
web = replaceOnce(
  web,
  `                        <button onclick="saveDailyNote()" class="w-full bg-rose-400 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-xl shadow-xs active:scale-95 transition" data-i18n="saveNoteBtn">
                            Lưu nhật ký
                        </button>
                    </div>
                </div>
            </div>

            <!-- TAB 4: BIỂU ĐỒ & PHÂN TÍCH CHUYÊN SÂU -->`,
  `                        <button onclick="saveDailyNote()" class="w-full bg-rose-400 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-xl shadow-xs active:scale-95 transition" data-i18n="saveNoteBtn">
                            Lưu nhật ký
                        </button>
                    </div>

                    <div class="mt-4 relative z-10 space-y-2">
                        <h4 class="text-xs font-bold text-rose-700" data-i18n="cycleHistoryTitle">Lịch sử chu kỳ</h4>
                        <div id="cycle-history-list" class="space-y-2"></div>
                        <div id="cycle-insights-box" class="bg-white/70 border border-rose-100 rounded-2xl p-3 space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-500" data-i18n="insightTitle">Nhận xét của MaiMai</p>
                            <div id="cycle-insights-list" class="text-[11px] text-gray-600 space-y-1"></div>
                        </div>
                        <p class="text-[9px] text-gray-400 leading-relaxed" data-i18n="cyclePredictionDisclaimer">Thông tin chu kỳ và các dự đoán chỉ mang tính tham khảo, không thay thế tư vấn y tế và không nên dùng làm biện pháp tránh thai.</p>
                    </div>
                </div>
            </div>

            <!-- TAB 4: BIỂU ĐỒ & PHÂN TÍCH CHUYÊN SÂU -->`,
  'history+insights'
);

// 6) i18n
function injectI18n(webHtml, lang) {
  const block = extractI18nBlock(android, lang);
  const marker = lang === 'vi'
    ? 'periodTitle: "Lịch Chu Kỳ"'
    : lang === 'ja'
      ? 'periodTitle: "生理周期管理"'
      : 'periodTitle: "Cycle Tracker"';
  return replaceOnce(webHtml, marker, block.trim() + '\n                ' + marker, 'i18n ' + lang);
}
web = injectI18n(web, 'vi');
web = injectI18n(web, 'ja');
web = injectI18n(web, 'en');

// 7) Storage
web = replaceOnce(
  web,
  `        function createEmptyAppData(lang) {
            return {
                schemaVersion: 3,
                profile: createUnsetProfile(lang || 'vi', 'sweet'),
                weightLogs: [],
                dailyRecords: {},
                favorites: [],
                myFoods: []
            };
        }`,
  `        function createEmptyAppData(lang) {
            return {
                schemaVersion: 4,
                profile: createUnsetProfile(lang || 'vi', 'sweet'),
                weightLogs: [],
                dailyRecords: {},
                periodRecords: [],
                favorites: [],
                myFoods: []
            };
        }`,
  'createEmptyAppData'
);

web = replaceOnce(
  web,
  `                if (Array.isArray(r.symptoms) && r.symptoms.length > 0) return true;
            }
            return false;
        }`,
  `                if (Array.isArray(r.symptoms) && r.symptoms.length > 0) return true;
                if (Array.isArray(r.whSymptoms) && r.whSymptoms.length > 0) return true;
                if (r.flow || r.mood || r.energy || r.pain != null) return true;
            }
            if (Array.isArray(data.periodRecords) && data.periodRecords.length > 0) return true;
            return false;
        }`,
  'meaningful activity'
);

web = replaceOnce(
  web,
  `        let appData = loadState();
        if (!appData) appData = createEmptyAppData('vi');`,
  `        let appData = loadState();
        if (!appData) appData = createEmptyAppData('vi');
        if (!Array.isArray(appData.periodRecords)) appData.periodRecords = [];
        if (!appData.schemaVersion || appData.schemaVersion < 4) appData.schemaVersion = 4;`,
  'periodRecords init'
);

// migrateLegacyAppData should include periodRecords
if (web.includes('schemaVersion: 3,') && web.includes('function migrateLegacyAppData')) {
  web = web.replace(
    /function migrateLegacyAppData\(legacy\) \{[\s\S]*?return \{[\s\S]*?schemaVersion:\s*3,/,
    (m) => m.replace('schemaVersion: 3,', 'schemaVersion: 4,')
  );
  if (!web.includes('periodRecords:') || web.split('periodRecords:').length < 3) {
    web = web.replace(
      /(function migrateLegacyAppData\(legacy\) \{[\s\S]*?dailyRecords:\s*legacy\.dailyRecords \|\| \{\},)/,
      '$1\n                periodRecords: Array.isArray(legacy.periodRecords) ? legacy.periodRecords : [],'
    );
  }
}

// 8) Inject WH JS (from getCycleEngine through renderCycleHistory)
const jsStart = android.indexOf('function getCycleEngine() { return window.MaiMaiCycleEngine || null; }');
const jsEnd = android.indexOf('function changeDietDateFromCalendar(dateStr) {');
if (jsStart < 0 || jsEnd < 0) throw new Error('JS extract markers missing');
const whJs = android.slice(jsStart, jsEnd).trim();

const insertBefore = web.indexOf('function renderCalendar() {');
if (insertBefore < 0) throw new Error('renderCalendar not found');
web = web.slice(0, insertBefore) +
  "\n        // ===== Women's Health (ported; shared MaiMaiCycleEngine) =====\n        " +
  whJs +
  '\n\n        ' +
  web.slice(insertBefore);

web = stripDuplicateFunctions(web, [
  'getCycleEngine', 'getCycleDateDeps', 'runCycleMigration',
  'updateMultiPersonaCoach', 'formatInsightLine',
  'renderHome', 'renderHomeCycleCard', 'renderWhDashboard',
  'openDayDetail', 'togglePeriodForSelectedDay', 'toggleSymptom', 'saveDailyNote',
  'phaseLabel', 'renderDaySymptomButtons', 'renderQuickLogSymptoms',
  'persistWhAndRefresh', 'quickStartPeriod', 'quickMarkOnPeriod', 'quickEndPeriod',
  'quickSetMood', 'quickSetEnergy', 'quickSetPain', 'quickSetFlow', 'quickToggleSymptom',
  'renderCycleHistory', 'getPredictedPeriodDates', 'getCycleStats', 'getPeriodStartDates',
  'getDayEnergyKcal', 'getFertilityForDate', 'renderFertilityPanel', 'renderCalendar'
]);

// Wire language / tabs / home
if (!web.includes('renderCycleHistory();')) {
  web = web.replace(
    /renderHealthAndHome\(\); renderCalendar\(\);/,
    'renderHealthAndHome(); renderCalendar(); renderQuickLogSymptoms(); renderCycleHistory(); renderHomeCycleCard();'
  );
}
web = web.replace(
  /if \(tabId === 'track'\)[^\n]*/,
  "if (tabId === 'track') { renderHealthScreen(); renderQuickLogSymptoms(); renderCycleHistory(); renderCalendar(); }"
);

// Ensure renderHome calls cycle card
if (web.includes('function renderHome()') && !web.includes('renderHomeCycleCard();')) {
  web = web.replace(
    /function renderHome\(\) \{/,
    'function renderHome() {\n            try { renderHomeCycleCard(); } catch (e) {}\n'
  );
}

// Init migration after date helpers exist
if (!web.includes('runCycleMigration({')) {
  if (web.includes('function bootApp(') || web.includes('function initApp(')) {
    web = web.replace(/function (bootApp|initApp)\([^)]*\)\s*\{/, function (m) {
      return m + '\n            try { if (typeof runCycleMigration === "function") runCycleMigration({ save: true }); } catch (e) {}\n            try { renderHomeCycleCard(); renderQuickLogSymptoms(); renderCycleHistory(); } catch (e) {}\n';
    });
  } else {
    web = replaceOnce(
      web,
      `if (!appData.schemaVersion || appData.schemaVersion < 4) appData.schemaVersion = 4;`,
      `if (!appData.schemaVersion || appData.schemaVersion < 4) appData.schemaVersion = 4;
        setTimeout(function () {
            try { if (typeof parseDateOnly === 'function' && typeof runCycleMigration === 'function') runCycleMigration({ save: true }); } catch (e) {}
            try { renderHomeCycleCard(); renderQuickLogSymptoms(); renderCycleHistory(); } catch (e) {}
        }, 0);`,
      'deferred cycle migrate'
    );
  }
}

fs.copyFileSync(ENGINE_SRC, ENGINE_DST);
const out = webHadCrlf ? web.replace(/\n/g, '\r\n') : web;
fs.writeFileSync(WEB, out, 'utf8');

console.log('PORT_OK');
console.log({
  whDashboard: web.includes('id="wh-dashboard"'),
  getCycleEngine: (web.match(/function getCycleEngine/g) || []).length,
  openDayDetail: (web.match(/function openDayDetail/g) || []).length,
  updateCoach: (web.match(/function updateMultiPersonaCoach/g) || []).length,
  scrub: web.includes('scrubToUnsetKeepingPrefs'),
  pwa: web.includes('apple-touch-icon.png'),
  periodRecords: web.includes('periodRecords: []'),
  histFlow: web.includes('histFlowSummary'),
  pickMai: web.includes('pickMaiCycleContext')
});
