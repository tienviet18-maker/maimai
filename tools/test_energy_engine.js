/**
 * Deterministic unit tests for MaiMaiEnergyEngine (post validation-hardening).
 * Run: node tools/test_energy_engine.js
 */
const path = require('path');
const engine = require(path.join(__dirname, '..', 'www', 'energy_engine.js'));

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

function almost(a, b, tol, msg) {
  assert(Math.abs(a - b) <= (tol == null ? 1 : tol), msg + ` (got ${a}, expected ${b})`);
}

function full(p) {
  return Object.assign({
    sex: 'female', age: 25, height: 160, currentWeight: 60,
    targetWeight: 60, activityLevel: 1.375, goalType: 'MAINTAIN'
  }, p);
}

// --- BMR ---
almost(engine.computeBmr(60, 160, 25, 'female'), 1314, 0.01, 'BMR female 60/160/25');
almost(engine.computeBmr(75, 175, 30, 'male'), 1698.75, 0.01, 'BMR male 75/175/30');
almost(engine.computeBmr(60, 160, 40, 'female'), 1239, 0.01, 'BMR female age 40');
almost(engine.computeBmr(70, 160, 25, 'female'), 1414, 0.01, 'BMR female 70kg');
almost(engine.computeBmr(60, 170, 25, 'female'), 1376.5, 0.01, 'BMR female 170cm');
assert(engine.computeBmr(70, 174, 25, null) == null, 'BMR null sex → null');
assert(engine.computeBmr(70, 174, null, 'male') == null, 'BMR null age → null');
assert(engine.parseSex(null) == null, 'parseSex null');
assert(engine.parseSex('female') === 'female', 'parseSex female');
assert(engine.normalizeSex('') == null, 'normalizeSex empty → null (no female default)');

// --- Matrix A–F ---
{
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 25, height: 174, currentWeight: 70, targetWeight: 70,
    activityLevel: 1.375, goalType: 'MAINTAIN'
  }));
  almost(plan.bmi, 23.1, 0.05, 'A BMI');
  almost(plan.bmr, 1668, 0, 'A BMR');
  almost(plan.tdee, 2293, 0, 'A TDEE');
  almost(plan.dailyTarget, 2293, 0, 'A target');
  assert(plan.ok, 'A ok');
}

{
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 70,
    activityLevel: 1.375, goalType: 'LOSE'
  }));
  almost(plan.bmi, 26.1, 0.05, 'B BMI ~26.1');
  almost(plan.bmr, 1758, 0, 'B BMR');
  almost(plan.tdee, 2417, 0, 'B TDEE');
  almost(plan.dailyTarget, 2032, 0, 'B target 2417-385');
  assert(plan.ok, 'B ok');
}

{
  const plan = engine.computeEnergyPlan(full({
    sex: 'female', age: 30, height: 160, currentWeight: 55, targetWeight: 55,
    activityLevel: 1.55, goalType: 'MAINTAIN'
  }));
  almost(plan.dailyTarget, 1920, 0, 'C maintain moderate');
}

{
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 25, height: 175, currentWeight: 55, targetWeight: 65,
    activityLevel: 1.55, goalType: 'GAIN'
  }));
  assert(plan.dailyTarget > plan.tdee, 'D gain above TDEE');
  almost(plan.dailyTarget, 2637, 0, 'D gain target');
}

{
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 40, height: 170, currentWeight: 100, targetWeight: 80,
    activityLevel: 1.2, goalType: 'LOSE'
  }));
  almost(plan.dailyTarget, 2054, 0, 'E clamped lose');
  assert(plan.warnings.indexOf('LOW_CALORIE_CLAMPED') >= 0, 'E clamp warning');
}

{
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 30, height: 180, currentWeight: 75, targetWeight: 75,
    activityLevel: 1.9, goalType: 'MAINTAIN'
  }));
  almost(plan.dailyTarget, 3287, 0, 'F very high maintain');
}

// --- Invalid / missing (G–Q) ---
assert(!engine.computeEnergyPlan({}).ok, 'G empty invalid');
assert(engine.getCanonicalDailyTarget({}) == null, 'G canonical null (no 1807 demo)');
assert(!engine.computeEnergyPlan(full({ age: null })).ok, 'H missing age');
assert(!engine.computeEnergyPlan(full({ sex: null })).ok, 'I missing sex');
assert(!engine.computeEnergyPlan(full({ height: null })).ok, 'J missing height');
assert(!engine.computeEnergyPlan(full({ currentWeight: null })).ok, 'K missing weight');
assert(!engine.computeEnergyPlan(full({ goalType: null, targetWeight: 55 })).ok, 'L missing goal');
assert(!engine.computeEnergyPlan(full({ targetWeight: null })).ok, 'M missing target weight');
assert(!engine.computeEnergyPlan(full({ activityLevel: null })).ok, 'N missing activity');
assert(!engine.computeEnergyPlan(full({ age: 0 })).ok, 'O invalid age 0');
assert(!engine.computeEnergyPlan(full({ age: 200 })).ok, 'O invalid age 200');
assert(!engine.computeEnergyPlan(full({ height: -1 })).ok, 'P invalid height');
assert(!engine.computeEnergyPlan(full({ currentWeight: -5 })).ok, 'Q invalid weight');
assert(engine.computeEnergyPlan(full({ age: undefined })).ok === false, 'age undefined not silently 25');

// --- Goal direction R–S ---
{
  const badLose = engine.validateGoalDirection('LOSE', 79, 80);
  assert(!badLose.ok, 'R lose target >= current');
  const plan = engine.computeEnergyPlan(full({
    sex: 'male', age: 25, height: 174, currentWeight: 79, targetWeight: 80,
    activityLevel: 1.375, goalType: 'LOSE'
  }));
  assert(plan.ok, 'R still computes (warn, does not change goal)');
  assert(plan.warnings.indexOf('LOSE_TARGET_NOT_BELOW') >= 0, 'R warning code');
}
{
  const badGain = engine.validateGoalDirection('GAIN', 79, 70);
  assert(!badGain.ok, 'S gain target <= current');
}

// Sedentary / light maintain legacy cases
{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 60, height: 160, age: 25, sex: 'female',
    activityLevel: 1.2, goalType: 'MAINTAIN', targetWeight: 60
  }));
  almost(plan.bmr, 1314, 0, 'plan BMR');
  almost(plan.tdee, Math.round(1314 * 1.2), 0, 'sedentary TDEE');
  almost(plan.dailyTarget, plan.tdee, 0, 'MAINTAIN target = TDEE');
}

{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 60, height: 160, age: 25, sex: 'female',
    activityLevel: 1.55, goalType: 'LOSE', targetWeight: 55,
    desiredRateKgPerWeek: 0.35
  }));
  assert(plan.dailyTarget < plan.tdee, 'LOSE target < TDEE');
  assert(plan.adjustment < 0, 'LOSE negative adjustment');
}

{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 75, height: 175, age: 30, sex: 'male',
    activityLevel: 1.9, goalType: 'MAINTAIN', targetWeight: 75
  }));
  almost(plan.bmr, 1699, 0, 'male BMR rounded');
}

{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 50, height: 160, age: 25, sex: 'female',
    activityLevel: 1.375, goalType: 'GAIN', targetWeight: 55,
    desiredRateKgPerWeek: 0.25
  }));
  assert(plan.dailyTarget > plan.tdee, 'GAIN target > TDEE');
}

{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 42, height: 160, age: 25, sex: 'female',
    activityLevel: 1.375, goalType: 'LOSE', targetWeight: 40
  }));
  assert(plan.bmi < 18.5, 'BMI underweight');
  assert(plan.warnings.indexOf('UNDERWEIGHT_LOSE_NOT_RECOMMENDED') >= 0, 'underweight lose warning');
}

{
  const macros = engine.computeMacroTargets(1900, 'LOSE');
  almost(macros.totalKcal, 1900, 2, 'macro kcal sum ≈ target');
  assert(macros.proteinG > 0 && macros.fatG > 0 && macros.carbG > 0, 'macro grams positive');
}

{
  const plan = engine.computeEnergyPlan(full({
    currentWeight: 60, height: 160, age: 25, sex: 'female',
    activityLevel: 1.55, goalType: 'MAINTAIN', targetWeight: 60
  }));
  assert(plan.exercisePolicy === 'ACTIVITY_IN_TDEE_NO_DOUBLE_COUNT', 'no double-count policy');
}

{
  const t = engine.getCanonicalDailyTarget(full({
    currentWeight: 60, height: 160, age: 25, sex: 'female',
    activityLevel: 1.375, goalType: 'MAINTAIN', targetWeight: 60
  }));
  assert(t === Math.round(1314 * 1.375), 'canonical maintain target');
}

{
  const m = engine.migrateProfile({
    age: 28, sex: 'female', height: 158, currentWeight: 62, targetWeight: 55,
    activityLevel: 1.375, targetCalo: 1500, persona: 'sweet', lang: 'vi', userName: 'Test',
    goalType: 'LOSE'
  });
  assert(m.profile.userName === 'Test', 'migration keeps name');
  assert(m.profile.targetCalo === m.plan.dailyTarget, 'targetCalo synced to engine');
}

assert(engine.classifyBmi(26.1) === 'OVER', 'classify BMI 26.1 OVER Asian-Pacific');
assert(engine.ACTIVITY.LIGHT === 1.375, 'activity LIGHT centralized');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
