/**
 * Web Women's Health UI/wiring regression (source checks + engine smoke).
 * Run: node tools/test_web_wh_ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEB_ROOT = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY');
const ANDROID_ROOT = path.join(__dirname, '..');
const webIndex = path.join(WEB_ROOT, 'index.html');
const androidIndex = path.join(ANDROID_ROOT, 'www', 'index.html');
const webEngine = path.join(WEB_ROOT, 'js', 'cycle', 'cycle_engine.js');
const androidEngine = path.join(ANDROID_ROOT, 'www', 'js', 'cycle', 'cycle_engine.js');

let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

const html = fs.readFileSync(webIndex, 'utf8');
const androidHtml = fs.readFileSync(androidIndex, 'utf8');

assert(fs.existsSync(webIndex), 'web index exists');
assert(html.includes('id="wh-dashboard"'), 'web has WH dashboard');
assert(html.includes('id="ql-symptoms"'), 'web has quick log symptoms');
assert(html.includes('id="cycle-history-list"'), 'web has cycle history');
assert(html.includes('id="cycle-insights-list"'), 'web has insights list');
assert(html.includes('id="home-cycle-card"'), 'web has home cycle card');
assert(html.includes('id="day-lifestyle-text"'), 'web has day lifestyle');
assert(html.includes('id="day-symptom-buttons"'), 'web has dynamic day symptoms');
assert(html.includes('legendRecorded'), 'web recorded legend key');
assert(html.includes('legendEstimated'), 'web estimated legend key');
assert(html.includes('function getCycleEngine'), 'web getCycleEngine');
assert(html.includes('pickMaiCycleContext'), 'web Mai cycle context');
assert(html.includes('buildCycleDashboardSnapshot') || html.includes('renderWhDashboard'), 'web dashboard renderer');
assert(html.includes('renderCycleHistory'), 'web renderCycleHistory');
assert(html.includes('quickStartPeriod'), 'web quickStartPeriod');
assert(html.includes('histFlowSummary'), 'web histFlowSummary i18n');
assert(html.includes('histSymptomSummary'), 'web histSymptomSummary i18n');
assert(html.includes('histPainSummary'), 'web histPainSummary i18n');
assert(html.includes('periodRecords: []') || html.includes('periodRecords:[]'), 'web periodRecords in empty data');
assert(html.includes('schemaVersion: 4') || html.includes('schemaVersion:4'), 'web schemaVersion 4');
assert(html.includes('scrubToUnsetKeepingPrefs'), 'web scrub preserved');
assert(html.includes('apple-touch-icon.png'), 'web PWA apple touch preserved');
assert(html.includes('isClassicSeedProfile'), 'web classic seed detector preserved');
assert(html.includes('js/cycle/cycle_engine.js'), 'web loads cycle engine');

// i18n keys present for all langs
for (const key of ['whDashTitle', 'coachPeriodCare', 'insightAppetite', 'cyclePredictionDisclaimer', 'quickLogTitle']) {
  const count = html.split(key + ':').length - 1;
  assert(count >= 3, 'i18n ' + key + ' in >=3 langs (got ' + count + ')');
}

// No duplicate critical fns
for (const fn of ['setLanguage', 'openDayDetail', 'updateMultiPersonaCoach', 'getCycleEngine', 'renderCycleHistory']) {
  const count = html.split('function ' + fn + '(').length - 1;
  assert(count === 1, 'single ' + fn + ' (got ' + count + ')');
}

assert(html.includes("if (tabId === 'track')") && html.includes('renderCycleHistory()'), 'track tab refreshes WH');
assert(html.includes('eng.getPredictedPeriodDates') || html.includes('getPredictedPeriodDates(appData'), 'prediction uses engine');

// Engine identical Android ↔ Web
const h1 = crypto.createHash('sha256').update(fs.readFileSync(androidEngine)).digest('hex');
const h2 = crypto.createHash('sha256').update(fs.readFileSync(webEngine)).digest('hex');
assert(h1 === h2, 'Android/Web cycle_engine.js identical');

// Engine smoke: history summaries
const eng = require(webEngine);
const deps = eng.defaultDateHelpers();
const app = {
  schemaVersion: 4,
  profile: { isSetup: true, lang: 'vi' },
  weightLogs: [],
  dailyRecords: {},
  periodRecords: [],
  favorites: [],
  myFoods: []
};
eng.startPeriod(app, '2026-07-01', { flow: 'light' }, deps);
eng.markPeriodDay(app, '2026-07-02', true, deps);
eng.setFlowForDay(app, '2026-07-02', 'medium', deps);
eng.endPeriod(app, '2026-07-02', deps);
eng.setWhLog(app, '2026-07-01', { pain: 3, whSymptoms: ['headache'] });
eng.setWhLog(app, '2026-07-02', { pain: 5, whSymptoms: ['headache', 'fatigue'] });
const hist = eng.getCycleHistory(app, deps);
assert(hist[0].flowSummary && hist[0].flowSummary.loggedDays >= 1, 'engine flow summary on web module');
assert(hist[0].symptomSummary && hist[0].symptomSummary.top.indexOf('headache') >= 0, 'engine symptom summary on web module');
assert(hist[0].painSummary && hist[0].painSummary.max === 5, 'engine pain summary on web module');
const emptySnap = eng.buildCycleDashboardSnapshot({
  schemaVersion: 4, profile: {}, weightLogs: [], dailyRecords: {}, periodRecords: [], favorites: [], myFoods: []
}, '2026-08-01', deps);
assert(emptySnap.cycleCount === 0, 'empty dashboard cycleCount 0');
assert(Array.isArray(emptySnap.insights), 'empty dashboard insights array');

// AdMob stays disabled on web
const admob = fs.readFileSync(path.join(WEB_ROOT, 'admob.config.js'), 'utf8');
assert(/enabled\s*:\s*false/.test(admob), 'web AdMob enabled:false');

// Brace balance in main script
const main = html.replace(/\r/g, '').split('<script>').slice(1).join('').split('</script>')[0];
let depth = 0;
for (const ch of main) {
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
}
assert(depth === 0, 'web main script brace balanced');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
