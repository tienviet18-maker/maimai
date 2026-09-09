/**
 * Android immediate Calo refresh contract after profile/weight save.
 * Run: node tools/test_android_calo_refresh.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const eng = require(path.join(__dirname, '..', 'www', 'energy_engine.js'));

const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('PASS', msg); }
  else { failed++; console.error('FAIL', msg); }
}

assert(html.includes("Do NOT rely on previous/next date buttons"), 'save documents immediate refresh');
assert(/setLanguage\(currentLang\);\s*\n\s*updateDietAndHealthDisplay\(\);/.test(html), 'save → setLanguage + updateDiet');
assert(/function setLanguage\(lang\) \{[\s\S]*?updateDietAndHealthDisplay\(\);/.test(html.split('function saveOnboardingProfile')[0]), 'setLanguage refreshes diet');
assert(/if \(tabId === 'diet'\) \{[\s\S]*?updateDietAndHealthDisplay\(\);/.test(html), 'switchTab diet refreshes');
assert(/syncDerivedEnergyPlan\(\{ save: true \}\);[\s\S]{0,400}?updateDietAndHealthDisplay\(\);/.test(html), 'weight save refreshes diet');
assert(!/Number\(p\.age\)\s*\|\|\s*25/.test(fs.readFileSync(path.join(__dirname, '..', 'www', 'energy_engine.js'), 'utf8')), 'no age||25');

const plan = eng.computeEnergyPlan({
  sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 72,
  activityLevel: 1.2, goalType: 'LOSE'
});
assert(plan.bmr === 1758 && plan.tdee === 2109 && plan.dailyTarget === 1933, 'nutrition reference intact');
assert(plan.warnings.indexOf('LOW_CALORIE_CLAMPED') >= 0, 'clamp intact');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
