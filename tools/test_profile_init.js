/**
 * Phase 1 regression: first-user profile must not use demo defaults.
 * Run: node tools/test_profile_init.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'www', 'index.html');
const ENERGY = path.join(ROOT, 'www', 'energy_engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// --- Pure helpers mirrored from www/index.html (keep in sync) ---
const DEMO_PROFILE_NAME = 'Bạn yêu';

function createUnsetProfile(lang, persona) {
  return {
    userName: '',
    age: null,
    sex: '',
    height: null,
    currentWeight: null,
    targetWeight: null,
    activityLevel: null,
    goalType: '',
    desiredRateKgPerWeek: null,
    targetCalo: null,
    persona: persona || 'sweet',
    lang: lang || 'vi',
    isSetup: false
  };
}

function createEmptyAppData(lang) {
  return {
    schemaVersion: 3,
    profile: createUnsetProfile(lang || 'vi', 'sweet'),
    weightLogs: [],
    dailyRecords: {},
    favorites: [],
    myFoods: []
  };
}

function isProfileSetup(profile) {
  return !!(profile && profile.isSetup === true);
}

function looksLikeDemoProfile(p) {
  if (!p) return true;
  const name = String(p.userName || '').trim();
  const age = Number(p.age);
  const height = Number(p.height);
  const tw = Number(p.targetWeight);
  const cw = Number(p.currentWeight);
  const act = Number(p.activityLevel);
  const demoName = !name || name === DEMO_PROFILE_NAME;
  const demoBody =
    age === 25 &&
    height === 160 &&
    (tw === 55 || tw === 60) &&
    (cw === 60 || cw === 61 || isNaN(cw)) &&
    (act === 1.375 || isNaN(act)) &&
    (p.sex === 'female' || !p.sex);
  return demoName && demoBody;
}

function sanitizeLoadedAppData(data) {
  if (!data || typeof data !== 'object') return createEmptyAppData('vi');
  if (!data.profile) data.profile = createUnsetProfile('vi', 'sweet');
  const p = data.profile;
  if (p.isSetup === true) {
    if (!data.schemaVersion || data.schemaVersion < 3) data.schemaVersion = 3;
    if (!Array.isArray(data.weightLogs)) data.weightLogs = [];
    if (!data.dailyRecords) data.dailyRecords = {};
    if (!Array.isArray(data.favorites)) data.favorites = [];
    if (!Array.isArray(data.myFoods)) data.myFoods = [];
    return data;
  }
  const lang = p.lang || 'vi';
  const persona = p.persona || 'sweet';
  data.profile = createUnsetProfile(lang, persona);
  const onlySeed =
    !data.weightLogs ||
    data.weightLogs.length === 0 ||
    (data.weightLogs.length === 1 &&
      (Number(data.weightLogs[0].weight) === 60 || Number(data.weightLogs[0].weight) === 61));
  if (onlySeed) data.weightLogs = [];
  if (!data.schemaVersion || data.schemaVersion < 3) data.schemaVersion = 3;
  if (!Array.isArray(data.weightLogs)) data.weightLogs = [];
  if (!data.dailyRecords) data.dailyRecords = {};
  if (!Array.isArray(data.favorites)) data.favorites = [];
  if (!Array.isArray(data.myFoods)) data.myFoods = [];
  return data;
}

function migrateLegacyAppData(legacy) {
  const lp = (legacy && legacy.profile) || {};
  const hasRealUser =
    !!String(lp.userName || '').trim() &&
    String(lp.userName).trim() !== DEMO_PROFILE_NAME &&
    lp.age != null &&
    lp.height != null &&
    lp.currentWeight != null;
  if (!hasRealUser && looksLikeDemoProfile(lp)) {
    return createEmptyAppData(lp.lang || 'vi');
  }
  const profile = Object.assign(createUnsetProfile(lp.lang || 'vi', lp.persona || 'sweet'), {
    userName: lp.userName != null ? String(lp.userName) : '',
    age: lp.age != null ? Number(lp.age) : null,
    sex: lp.sex || '',
    height: lp.height != null ? Number(lp.height) : null,
    currentWeight: lp.currentWeight != null ? Number(lp.currentWeight) : null,
    targetWeight: lp.targetWeight != null ? Number(lp.targetWeight) : null,
    activityLevel: lp.activityLevel != null ? Number(lp.activityLevel) : null,
    goalType: lp.goalType || '',
    desiredRateKgPerWeek: lp.desiredRateKgPerWeek != null ? Number(lp.desiredRateKgPerWeek) : null,
    targetCalo: lp.targetCalo != null ? Number(lp.targetCalo) : null,
    persona: lp.persona || 'sweet',
    lang: lp.lang || 'vi',
    isSetup: lp.isSetup === true || hasRealUser
  });
  if (!profile.isSetup) return createEmptyAppData(profile.lang);
  return {
    schemaVersion: 3,
    profile,
    weightLogs: Array.isArray(legacy.weightLogs) ? legacy.weightLogs : [],
    dailyRecords: legacy.dailyRecords || {},
    favorites: Array.isArray(legacy.favorites) ? legacy.favorites : [],
    myFoods: Array.isArray(legacy.myFoods) ? legacy.myFoods : []
  };
}

console.log('\n=== Phase 1: Profile init regression ===\n');

console.log('1) Source guards (index.html)');
const html = fs.readFileSync(INDEX, 'utf8');
assert(html.includes('createUnsetProfile'), 'createUnsetProfile exists');
assert(html.includes('clearOnboardingForm'), 'clearOnboardingForm exists');
assert(html.includes('isProfileSetup'), 'isProfileSetup exists');
assert(!/userName:\s*'Bạn yêu'/.test(html) && !/userName:\s*"Bạn yêu"/.test(html), 'no hard-coded userName Bạn yêu as default object field');
assert(!/id="ob-age"[^>]*value="25"/.test(html), 'ob-age has no HTML value=25');
assert(!/value="1\.375"\s+selected/.test(html) && !/selected\s+[^>]*value="1\.375"/.test(html), 'activity 1.375 not pre-selected');
assert(html.includes("if (!isProfileSetup(appData.profile)) return;"), 'energy migration skips unset profile');
assert(html.includes('clearOnboardingForm()'), 'open path clears form for unset');
assert(html.includes('fillOnboardingFormFromSavedProfile'), 'saved users fill from profile');
assert(!html.includes("p.age || 25"), 'openOnboarding no longer uses age || 25');
assert(!html.includes("p.height || 160"), 'no height || 160 fallback in profile UI path');
assert(!html.includes("p.targetWeight || 55"), 'no targetWeight || 55 fallback');
assert(!html.includes("getLatestWeight();") || html.includes('getLatestWeight() != null'), 'getLatestWeight null-safe usage present');
assert(!html.includes('return appData.profile.currentWeight || 60'), 'getLatestWeight no longer falls back to 60');

console.log('\n2) Empty first-user app data');
const empty = createEmptyAppData('vi');
assert(empty.profile.isSetup === false, 'isSetup false');
assert(empty.profile.userName === '', 'userName empty');
assert(empty.profile.age === null, 'age null');
assert(empty.profile.sex === '', 'sex empty');
assert(empty.profile.height === null, 'height null');
assert(empty.profile.currentWeight === null, 'currentWeight null');
assert(empty.profile.targetWeight === null, 'targetWeight null');
assert(empty.profile.activityLevel === null, 'activityLevel null');
assert(empty.profile.goalType === '', 'goalType empty');
assert(empty.weightLogs.length === 0, 'no seed weightLogs');

console.log('\n3) Scrub stored demo / unset profile');
const scrubbed = sanitizeLoadedAppData({
  schemaVersion: 2,
  profile: {
    userName: 'Bạn yêu',
    age: 25,
    sex: 'female',
    height: 160,
    currentWeight: 61,
    targetWeight: 55,
    activityLevel: 1.375,
    goalType: 'LOSE',
    targetCalo: 1500,
    persona: 'sweet',
    lang: 'vi'
  },
  weightLogs: [{ date: '2026-08-29', weight: 60 }],
  dailyRecords: {},
  favorites: ['mext_01088'],
  myFoods: []
});
assert(scrubbed.profile.isSetup === false, 'scrubbed isSetup false');
assert(scrubbed.profile.userName === '', 'scrubbed name cleared');
assert(scrubbed.profile.age === null, 'scrubbed age cleared');
assert(scrubbed.profile.height === null, 'scrubbed height cleared');
assert(scrubbed.weightLogs.length === 0, 'seed weight log cleared');
assert(scrubbed.profile.lang === 'vi', 'lang preserved');

console.log('\n4) Preserve returning user (isSetup true)');
const saved = {
  schemaVersion: 3,
  profile: {
    userName: 'Pham',
    age: 30,
    sex: 'male',
    height: 175,
    currentWeight: 70,
    targetWeight: 68,
    activityLevel: 1.55,
    goalType: 'LOSE',
    targetCalo: 2000,
    persona: 'expert',
    lang: 'en',
    isSetup: true
  },
  weightLogs: [{ date: '2026-08-01', weight: 70 }],
  dailyRecords: { '2026-08-01': { waterMl: 500, foodLogs: [] } },
  favorites: ['x'],
  myFoods: []
};
const kept = sanitizeLoadedAppData(JSON.parse(JSON.stringify(saved)));
assert(kept.profile.userName === 'Pham', 'returning name kept');
assert(kept.profile.age === 30, 'returning age kept');
assert(kept.profile.height === 175, 'returning height kept');
assert(kept.weightLogs.length === 1, 'returning weightLogs kept');
assert(kept.dailyRecords['2026-08-01'].waterMl === 500, 'returning dailyRecords kept');

console.log('\n5) Legacy demo → empty; legacy real user → setup');
const legacyDemo = migrateLegacyAppData({
  profile: { userName: 'Bạn yêu', age: 25, sex: 'female', height: 160, currentWeight: 60, targetWeight: 55, activityLevel: 1.375, lang: 'vi' }
});
assert(legacyDemo.profile.isSetup === false, 'legacy demo → unset');
assert(legacyDemo.profile.userName === '', 'legacy demo name empty');

const legacyReal = migrateLegacyAppData({
  profile: { userName: 'Lan', age: 28, sex: 'female', height: 158, currentWeight: 52, targetWeight: 50, activityLevel: 1.2, lang: 'vi' },
  weightLogs: [{ date: '2026-01-01', weight: 52 }]
});
assert(legacyReal.profile.isSetup === true, 'legacy real → isSetup');
assert(legacyReal.profile.userName === 'Lan', 'legacy real name kept');
assert(legacyReal.weightLogs.length === 1, 'legacy weightLogs kept');

console.log('\n6) Nutrition engine file untouched by Phase 1 scope check');
assert(fs.existsSync(ENERGY), 'energy_engine.js exists');
const energyStat = fs.statSync(ENERGY);
assert(energyStat.size > 1000, 'energy_engine.js present (not deleted)');

console.log('\n=== RESULT:', failed === 0 ? 'ALL PASS' : 'FAILED', `(${passed} passed, ${failed} failed) ===\n`);
process.exit(failed === 0 ? 0 : 1);
