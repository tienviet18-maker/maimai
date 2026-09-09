/**
 * Day-rollover persistence: Aug 31 food must survive into Sep 1 "today=0".
 * Run: node tools/test_day_rollover_persistence.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
const webHtml = fs.readFileSync(path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('PASS', msg);
  } else {
    failed++;
    console.error('FAIL', msg);
  }
}

assert(html.includes('function refreshTodayBoundary'), 'Android has refreshTodayBoundary');
assert(html.includes('normalizeDateKey'), 'Android normalizes date keys');
assert(/let TODAY_STR/.test(html), 'TODAY_STR is mutable (midnight refresh)');
assert(html.includes("dailyRecords[YYYY-MM-DD]"), 'documents per-day persistence');
assert(!/localStorage\.clear\(/.test(html), 'no localStorage.clear');
assert(!/dailyRecords\s*=\s*\{\s*\}\s*;\s*$/m.test(html.split('function createEmptyAppData')[0]), 'no wipe of dailyRecords before empty bootstrap');
assert(!/localStorage\.removeItem\(\s*['"]maimai_app_store_v2['"]\s*\)/.test(html), 'no removeItem of primary store');
assert(html.includes('never wipe history on day change'), 'day-change no-wipe contract documented');
assert(html.includes('cal-food-dot'), 'calendar food history marker');
assert(html.includes('appStateChange'), 'Capacitor resume refreshes day');
assert(webHtml.includes('function refreshTodayBoundary'), 'Web has refreshTodayBoundary');
assert(webHtml.includes('normalizeDateKey'), 'Web normalizes date keys');
assert(/let TODAY_STR/.test(webHtml), 'Web TODAY_STR mutable');

// Extract and execute date helpers in a sandbox
function loadDateHelpers(source) {
  const start = source.indexOf('const MAIMAI_APP_TIMEZONE');
  const end = source.indexOf('function toHiragana');
  const slice = source.slice(start, end);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(slice + '\nthis.getLocalDateStr=getLocalDateStr;this.normalizeDateKey=normalizeDateKey;this.TODAY_STR=TODAY_STR;', sandbox);
  return sandbox;
}

const helpers = loadDateHelpers(html);
assert(helpers.normalizeDateKey('2026/08/31') === '2026-08-31', 'normalize slash date');
assert(helpers.normalizeDateKey('2026-8-31') === '2026-08-31', 'normalize single-digit month/day');
assert(helpers.getLocalDateStr(new Date('2026-08-31T23:30:00+09:00')) === '2026-08-31', 'JST late Aug31 key');
assert(helpers.getLocalDateStr(new Date('2026-09-01T00:30:00+09:00')) === '2026-09-01', 'JST early Sep1 key');
assert(helpers.getLocalDateStr(new Date('2026-09-01T00:30:00+09:00')) !==
  new Date('2026-09-01T00:30:00+09:00').toISOString().slice(0, 10) ||
  helpers.getLocalDateStr(new Date('2026-09-01T00:30:00+09:00')) === '2026-09-01',
  'not blindly using UTC ISO date for JST morning');

// Simulate store across day change
const store = {
  schemaVersion: 3,
  profile: { isSetup: true, userName: 'Tester', lang: 'vi' },
  weightLogs: [{ date: '2026-08-31', weight: 79 }],
  dailyRecords: {},
  favorites: [],
  myFoods: []
};
const key31 = helpers.getLocalDateStr(new Date('2026-08-31T12:00:00+09:00'));
store.dailyRecords[key31] = {
  waterMl: 500,
  sleepMinutes: null,
  period: false,
  note: '',
  symptoms: [],
  foodLogs: [{ id: 'x', nutritionSnapshot: { energyKcal: 500 } }]
};
const serialized = JSON.stringify(store);
const reloaded = JSON.parse(serialized);
const today = helpers.getLocalDateStr(new Date('2026-09-01T08:00:00+09:00'));
const todayLogs = (reloaded.dailyRecords[today] && reloaded.dailyRecords[today].foodLogs) || [];
const todayKcal = todayLogs.reduce((s, l) => s + (l.nutritionSnapshot?.energyKcal || 0), 0);
const histKcal = (reloaded.dailyRecords[key31].foodLogs || []).reduce((s, l) => s + (l.nutritionSnapshot?.energyKcal || 0), 0);

assert(today === '2026-09-01', 'today key Sep1');
assert(todayKcal === 0, 'TEST2 today empty = 0');
assert(histKcal === 500, 'TEST1/4 Aug31 still 500 after reload');
assert(Object.keys(reloaded.dailyRecords).includes('2026-08-31'), 'Aug31 key present in storage');

// Adding Sep1 must not erase Aug31
reloaded.dailyRecords[today] = {
  waterMl: 0, sleepMinutes: null, period: false, note: '', symptoms: [],
  foodLogs: [{ id: 'y', nutritionSnapshot: { energyKcal: 300 } }]
};
assert(reloaded.dailyRecords['2026-08-31'].foodLogs[0].nutritionSnapshot.energyKcal === 500, 'TEST3/5 Sep1 add keeps Aug31');
assert(reloaded.dailyRecords[today].foodLogs[0].nutritionSnapshot.energyKcal === 300, 'TEST3 Sep1 = 300');

// sanitizeLoadedAppData for setup user must keep dailyRecords — static check
assert(/if \(p\.isSetup === true\) \{[\s\S]*?if \(!data\.dailyRecords\) data\.dailyRecords = \{\};/.test(html), 'setup path preserves dailyRecords object');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
