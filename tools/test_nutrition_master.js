/**
 * Extended nutrition + web consistency regression.
 * Run: node tools/test_nutrition_master.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY');
const eng = require(path.join(ROOT, 'www', 'energy_engine.js'));

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('PASS', msg); }
  else { failed++; console.error('FAIL', msg); }
}
function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

const androidEng = path.join(ROOT, 'www', 'energy_engine.js');
const webEng = path.join(WEB, 'energy_engine.js');
const androidHtml = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
const foodsHash = sha(path.join(ROOT, 'www', 'data', 'foods', 'foods.json'));

assert(!/Number\(p\.age\)\s*\|\|\s*25/.test(fs.readFileSync(androidEng, 'utf8')), 'no age||25 in engine');
assert(!/sex \|\| 'female'/.test(fs.readFileSync(androidEng, 'utf8')), 'no sex||female invent');
assert(!/currentWeight:\s*60,\s*height:\s*160,\s*age:\s*25/.test(fs.readFileSync(androidEng, 'utf8')), 'no demo body in canonical');
assert(!/\|\|\s*1500/.test(androidHtml.replace(/1500 \* Math\.pow/g, 'RETRY')), 'no ||1500 calorie fallback in index');
assert(androidHtml.includes('syncDerivedEnergyPlan'), 'weight sync helper present');
assert(androidHtml.includes('eng.computeBmi'), 'BMI uses engine');
assert(androidHtml.includes('bmiUnitHint'), 'BMI unit hint present');
assert(!/userName:\s*'Bạn yêu'/.test(androidHtml), 'no Bạn yêu default object');

// Weight recalculation consistency
{
  const p1 = {
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 70,
    activityLevel: 1.375, goalType: 'LOSE', isSetup: true
  };
  const a = eng.computeEnergyPlan(p1);
  const p2 = Object.assign({}, p1, { currentWeight: 70 });
  const b = eng.computeEnergyPlan(p2);
  assert(a.ok && b.ok, 'T weight plans ok');
  assert(a.dailyTarget !== b.dailyTarget, 'T weight change changes target');
  assert(a.dailyTarget === 2032, 'T 79kg lose light = 2032');
}

// 1942 discrepancy investigation fixture:
// If someone used MAINTAIN instead of LOSE, or wrong activity, target differs.
{
  const maintain = eng.computeEnergyPlan({
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 79,
    activityLevel: 1.375, goalType: 'MAINTAIN'
  });
  const loseSed = eng.computeEnergyPlan({
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 70,
    activityLevel: 1.2, goalType: 'LOSE'
  });
  console.log('INFO maintain@79 light target=', maintain.dailyTarget, 'lose@sedentary=', loseSed.dailyTarget);
  assert(maintain.ok, 'maintain path ok');
}

assert(fs.existsSync(webEng), 'web energy_engine exists');
if (fs.existsSync(webEng)) {
  assert(sha(androidEng) === sha(webEng), 'Android/Web energy_engine.js identical SHA256');
}
const webHtmlPath = path.join(WEB, 'index.html');
if (fs.existsSync(webHtmlPath)) {
  const webHtml = fs.readFileSync(webHtmlPath, 'utf8');
  assert(!/88\.362|Harris|447\.593/.test(webHtml), 'Web Harris-Benedict removed');
  assert(!/\)\s*-\s*300\)/.test(webHtml) && !/\* \(parseFloat\(document\.getElementById\('ob-activity'\)\.value\) \|\| 1\.375\)\) - 300/.test(webHtml), 'Web fixed -300 removed');
  assert(webHtml.includes('energy_engine.js') || webHtml.includes('MaiMaiEnergyEngine'), 'Web loads engine');
  assert(!/userName:\s*'Bạn yêu'/.test(webHtml), 'Web no Bạn yêu default');
}

const admob = fs.readFileSync(path.join(ROOT, 'www', 'admob.config.js'), 'utf8');
assert(admob.includes('ca-app-pub-6588196119148846~8757683722'), 'AdMob app id intact');
assert(admob.includes('ca-app-pub-6588196119148846/3181038938'), 'AdMob banner id intact');
assert(/initializeForTesting:\s*false/.test(admob), 'initializeForTesting false');
assert(/isTesting:\s*false/.test(admob), 'isTesting false');
assert(!admob.includes('ca-app-pub-3940256099942544'), 'no Google test id');

assert(sha(path.join(ROOT, 'www', 'data', 'foods', 'foods.json')) === foodsHash, 'foods.json unchanged during this test run');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
