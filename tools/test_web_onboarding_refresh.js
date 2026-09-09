/**
 * Web production regression: legacy demo scrub + post-save Calo refresh contract.
 * Run: node tools/test_web_onboarding_refresh.js
 * (lives under MAIMAI_ANDROID/tools; reads MAIMAI_WEB_NETLIFY/index.html)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY');
const AND = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_ANDROID');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const eng = require(path.join(AND, 'www', 'energy_engine.js'));

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('PASS', msg); }
  else { failed++; console.error('FAIL', msg); }
}

assert(html.includes('isClassicSeedProfile'), 'legacy seed detector present');
assert(html.includes('hasMeaningfulUserActivity'), 'activity guard present');
assert(html.includes('updateDietAndHealthDisplay()'), 'diet refresh helper used');
assert(html.includes("Do NOT rely on previous/next date buttons"), 'save path documents immediate Calo refresh');
assert(/setLanguage\(currentLang\);\s*\n\s*updateDietAndHealthDisplay\(\);/.test(html), 'save → setLanguage then updateDietAndHealthDisplay');
assert(/function setLanguage\(lang\) \{[\s\S]*?updateDietAndHealthDisplay\(\);[\s\S]*?\n\s*\}/.test(html.split('function saveOnboardingProfile')[0]), 'setLanguage body calls updateDietAndHealthDisplay');
assert(/if \(tabId === 'diet'\) \{[\s\S]*?updateDietAndHealthDisplay\(\);/.test(html), 'switchTab diet refreshes Calo');
assert(!/userName:\s*'Bạn yêu'/.test(html), 'no Bạn yêu default object');
assert(!/88\.362|447\.593/.test(html), 'no Harris-Benedict');
assert(!/\|\|\s*1500/.test(html.replace(/1500 \* Math\.pow/g, 'X')), 'no ||1500 calorie fallback');

// Simulate sanitize logic (mirrored)
function createUnsetProfile(lang, persona) {
  return { userName: '', age: null, sex: '', height: null, currentWeight: null, targetWeight: null, activityLevel: null, goalType: '', targetCalo: null, persona: persona || 'sweet', lang: lang || 'vi', isSetup: false };
}
function isClassicSeedProfile(p) {
  const nameKey = String(p.userName || '').trim().toLowerCase().normalize('NFC');
  const nameHit = ['bạn yêu', 'ban yeu', 'mai'].indexOf(nameKey) >= 0;
  if (!nameHit) return false;
  return Number(p.age) === 25 && String(p.sex) === 'female' && Number(p.height) === 160 &&
    (Number(p.currentWeight) === 60 || Number(p.currentWeight) === 61) && Number(p.targetWeight) === 55 &&
    (Number(p.activityLevel) === 1.375 || p.activityLevel == null || p.activityLevel === '');
}
function hasMeaningfulUserActivity(data) {
  if (Array.isArray(data.myFoods) && data.myFoods.length) return true;
  if (Array.isArray(data.weightLogs) && data.weightLogs.length > 1) return true;
  const records = data.dailyRecords || {};
  for (const k of Object.keys(records)) {
    const r = records[k] || {};
    if ((r.foodLogs || []).length || (r.waterMl || 0) > 0 || r.sleepMinutes != null || r.period || (r.note && String(r.note).trim())) return true;
  }
  return false;
}
function sanitize(data) {
  const p = data.profile;
  if (p.isSetup === true) {
    if (isClassicSeedProfile(p) && !hasMeaningfulUserActivity(data)) {
      data.profile = createUnsetProfile(p.lang, p.persona);
      data.weightLogs = [];
    }
    return data;
  }
  data.profile = createUnsetProfile(p.lang, p.persona);
  return data;
}

{
  const scrubbed = sanitize({
    profile: { userName: 'Mai', age: 25, sex: 'female', height: 160, currentWeight: 60, targetWeight: 55, activityLevel: 1.375, goalType: 'LOSE', isSetup: true, lang: 'vi', persona: 'sweet' },
    weightLogs: [{ date: '2026-08-01', weight: 60 }], dailyRecords: {}, favorites: [], myFoods: []
  });
  assert(scrubbed.profile.isSetup === false && scrubbed.profile.userName === '', 'legacy Mai demo scrubbed');
}
{
  const kept = sanitize({
    profile: { userName: 'Mai', age: 25, sex: 'female', height: 160, currentWeight: 60, targetWeight: 55, activityLevel: 1.375, goalType: 'LOSE', isSetup: true, lang: 'vi' },
    weightLogs: [{ date: '2026-08-01', weight: 60 }],
    dailyRecords: { '2026-08-02': { waterMl: 500, foodLogs: [{ id: 'x' }] } },
    favorites: [], myFoods: []
  });
  assert(kept.profile.isSetup === true && kept.profile.userName === 'Mai', 'real Mai+diary preserved');
}
{
  const real = sanitize({
    profile: { userName: 'Việt', age: 30, sex: 'male', height: 174, currentWeight: 78, targetWeight: 72, activityLevel: 1.55, goalType: 'LOSE', isSetup: true },
    weightLogs: [{ date: '2026-08-01', weight: 78 }], dailyRecords: {}, favorites: [], myFoods: []
  });
  assert(real.profile.userName === 'Việt' && real.profile.isSetup === true, 'legitimate user preserved');
}

// Onboarding save energy expectation (engine SSOT)
{
  const plan = eng.computeEnergyPlan({
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 72,
    activityLevel: 1.2, goalType: 'LOSE'
  });
  assert(plan.ok && plan.dailyTarget === 1933 && plan.tdee === 2109 && plan.bmr === 1758, 'save profile → 1933 target');
  assert(plan.warnings.indexOf('LOW_CALORIE_CLAMPED') >= 0, 'clamp warning intact');
}

assert(fs.existsSync(path.join(WEB, 'energy_engine.js')), 'web energy_engine present');
assert(crypto.createHash('sha256').update(fs.readFileSync(path.join(WEB, 'energy_engine.js'))).digest('hex') ===
  crypto.createHash('sha256').update(fs.readFileSync(path.join(AND, 'www', 'energy_engine.js'))).digest('hex'),
  'Web energy_engine === Android SSOT');
assert(crypto.createHash('sha256').update(fs.readFileSync(path.join(WEB, 'data', 'foods', 'foods.json'))).digest('hex') ===
  '277e958fbc296f5f852d2389bcd5d056b02cabb48a431185873e06f2ea548d32',
  'foods hash matches enriched catalog');

const admob = fs.readFileSync(path.join(WEB, 'admob.config.js'), 'utf8');
assert(/enabled:\s*false/.test(admob), 'browser AdMob disabled');
assert(admob.includes('ca-app-pub-6588196119148846~8757683722'), 'AdMob app id intact on web copy');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
