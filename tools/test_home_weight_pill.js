/**
 * Home weight pill (#home-diff) regression — distance to goal.
 * Run: node tools/test_home_weight_pill.js
 */
'use strict';

function formatHomeDiffPill(currentW, targetW, isSetup) {
  if (!isSetup || currentW == null || targetW == null || isNaN(Number(currentW)) || isNaN(Number(targetW))) {
    return { text: '--', kind: 'unset' };
  }
  const diff = (Number(currentW) - Number(targetW)).toFixed(1);
  const n = Number(diff);
  return {
    text: n <= 0 ? `${diff} kg` : `+${diff} kg`,
    kind: n <= 0 ? 'at_or_below' : 'above',
    raw: n
  };
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('PASS', msg); }
  else { failed++; console.error('FAIL', msg); }
}

// CASE 1
{
  const r = formatHomeDiffPill(79, 72, true);
  assert(r.text === '+7.0 kg' && r.raw === 7, 'CASE1 79→72 = +7.0 kg');
}
// CASE 2
{
  const r = formatHomeDiffPill(70, 72, true);
  assert(r.text === '-2.0 kg' && r.raw === -2, 'CASE2 70→72 = -2.0 kg (signed distance)');
}
// CASE 3
{
  const r = formatHomeDiffPill(72, 72, true);
  assert(r.text === '0.0 kg' && r.raw === 0, 'CASE3 equal = 0.0 kg');
}
// CASE 4
{
  const r = formatHomeDiffPill(null, 72, true);
  assert(r.text === '--', 'CASE4 missing current → --');
}
// CASE 5
{
  const r = formatHomeDiffPill(79, null, true);
  assert(r.text === '--', 'CASE5 missing target → --');
}
// CASE 6 semantics: unset profile
{
  const r = formatHomeDiffPill(79, 72, false);
  assert(r.text === '--', 'CASE6 unset profile → --');
}

// Source guard: index uses targetWeight for home-diff
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
assert(html.includes('currentW - targetW') || html.includes('currentW - targetW'.replace(/\s/g, '')), 'index binds pill to target distance');
assert(/Home pill|#home-diff[\s\S]{0,200}targetWeight|distance current/.test(html), 'home-diff comment/intent present');
assert(!/const startW = \(appData\.weightLogs && appData\.weightLogs\[0\]/.test(html), 'old first-log startW removed from renderHome');

// Nutrition unchanged for sedentary lose 79
const eng = require(path.join(__dirname, '..', 'www', 'energy_engine.js'));
const plan = eng.computeEnergyPlan({
  sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 72,
  activityLevel: 1.2, goalType: 'LOSE'
});
assert(plan.bmr === 1758, 'BMR 1758');
assert(plan.tdee === 2109, 'TDEE 2109');
assert(plan.dailyTarget === 1933, 'target 1933');
assert(plan.warnings.indexOf('LOW_CALORIE_CLAMPED') >= 0, 'LOW_CALORIE_CLAMPED');
assert(Math.round(eng.computeBmi(79, 174) * 10) / 10 === 26.1, 'BMI 26.1');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
