/**
 * MaiMai Cycle Engine V2 regression harness
 * Run: node tools/test_cycle_engine_v2.js
 */
'use strict';
const path = require('path');
const eng = require(path.join(__dirname, '..', 'www', 'js', 'cycle', 'cycle_engine.js'));
const foodRepo = require(path.join(__dirname, '..', 'www', 'js', 'food', 'food_repository.js'));

let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

const deps = eng.defaultDateHelpers();

function emptyApp() {
  return {
    schemaVersion: 3,
    profile: { isSetup: true, userName: 'Test', lang: 'vi' },
    weightLogs: [{ date: '2026-08-01', weight: 55 }],
    dailyRecords: {},
    periodRecords: [],
    favorites: [],
    myFoods: []
  };
}

function markDays(app, days) {
  days.forEach(d => {
    if (!app.dailyRecords[d]) app.dailyRecords[d] = { waterMl: 0, sleepMinutes: null, period: true, note: '', symptoms: [], foodLogs: [] };
    else app.dailyRecords[d].period = true;
  });
}

// A. Period
let app = emptyApp();
eng.startPeriod(app, '2026-08-03', { flow: 'medium' }, deps);
assert(app.periodRecords.length === 1, 'A1 start period creates record');
assert(app.dailyRecords['2026-08-03'].period === true, 'A1 daily flag set');
eng.markPeriodDay(app, '2026-08-04', true, deps);
eng.markPeriodDay(app, '2026-08-05', true, deps);
eng.markPeriodDay(app, '2026-08-06', true, deps);
eng.markPeriodDay(app, '2026-08-07', true, deps);
eng.endPeriod(app, '2026-08-07', deps);
assert(app.periodRecords.length === 1, 'A3 no duplicate period after contiguous days');
assert(app.periodRecords[0].durationDays === 5, 'A4 period duration 5');
eng.setFlowForDay(app, '2026-08-05', 'heavy', deps);
assert(app.dailyRecords['2026-08-05'].flow === 'heavy', 'A5 flow per day');
assert(app.periodRecords[0].flowByDay['2026-08-05'] === 'heavy', 'A5 flow on period record');

// Second cycle 29 days later start 2026-09-01
eng.startPeriod(app, '2026-09-01', {}, deps);
eng.markPeriodDay(app, '2026-09-02', true, deps);
eng.markPeriodDay(app, '2026-09-03', true, deps);
eng.markPeriodDay(app, '2026-09-04', true, deps);
eng.endPeriod(app, '2026-09-04', deps);
assert(app.periodRecords.length === 2, 'A6 second period');

// B. Cycle lengths
assert(eng.calculateMedianCycleLength(app, deps) === 29, 'B9 median 29-day cycle');
assert(eng.calculateAverageCycleLength(app, deps) === 29, 'B8 avg 29');
let pred = eng.predictNextPeriod(app, deps);
assert(pred.ok === true && !!pred.estimateDate, 'B13 next period estimate from median');
assert(pred.confidence && pred.confidence.level, 'B13 confidence present');
assert(pred.isEstimate === true, 'B13 marked estimate');
assert(pred.estimateDate === '2026-09-30' || pred.estimateLength === 29, 'B13 estimate ~29 days after last start');

// 28-day
app = emptyApp();
markDays(app, ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05']);
markDays(app, ['2026-06-29','2026-06-30','2026-07-01','2026-07-02']);
eng.migrateAppDataToCycleV2(app, deps);
assert(eng.calculateMedianCycleLength(app, deps) === 28, 'B8 28-day from flags migration');

// 30-day
app = emptyApp();
markDays(app, ['2026-05-01','2026-05-02','2026-05-03']);
markDays(app, ['2026-05-31','2026-06-01','2026-06-02']);
eng.migrateAppDataToCycleV2(app, deps);
assert(eng.calculateMedianCycleLength(app, deps) === 30, 'B10 30-day');

// insufficient
app = emptyApp();
eng.startPeriod(app, '2026-08-01', {}, deps);
assert(eng.getPredictionConfidence(app, deps).ready === false, 'B12 insufficient history');
assert(eng.predictNextPeriod(app, deps).ok === false, 'B12 no fabricated prediction');

// irregular
app = emptyApp();
markDays(app, ['2026-01-01','2026-01-02']);
markDays(app, ['2026-01-20','2026-01-21']); // 19-day
markDays(app, ['2026-03-01','2026-03-02']); // long gap
eng.migrateAppDataToCycleV2(app, deps);
const irreg = eng.calculateCycleVariability(app, deps);
assert(irreg.irregular === true || eng.getPredictionConfidence(app, deps).ready === false, 'B11 irregular handled');

// C. Phase
app = emptyApp();
markDays(app, ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05']);
markDays(app, ['2026-08-29','2026-08-30','2026-08-31','2026-09-01']);
eng.migrateAppDataToCycleV2(app, deps);
assert(eng.getMenstrualPhaseEstimate(app, '2026-08-30', deps).phase === 'menstrual', 'C16 menstrual observed');
const ph = eng.getMenstrualPhaseEstimate(app, '2026-09-10', deps);
assert(['follicular','estimated_fertile_window','luteal','unknown'].indexOf(ph.phase) >= 0, 'C17-19 phase estimate enum');
let app2 = emptyApp();
assert(eng.getMenstrualPhaseEstimate(app2, '2026-09-01', deps).phase === 'unknown', 'C20 insufficient → unknown');

// D. Symptoms
app = emptyApp();
eng.setWhLog(app, '2026-09-01', { mood: 'irritable', energy: 'low', pain: 7, whSymptoms: ['abdominal_cramps'] });
assert(app.dailyRecords['2026-09-01'].mood === 'irritable', 'D24 mood');
assert(app.dailyRecords['2026-09-01'].energy === 'low', 'D25 energy');
assert(app.dailyRecords['2026-09-01'].pain === 7, 'D26 pain');
eng.toggleWhSymptom(app, '2026-09-01', 'back_pain');
assert(app.dailyRecords['2026-09-01'].whSymptoms.indexOf('back_pain') >= 0, 'D21 add symptom');
eng.toggleWhSymptom(app, '2026-09-01', 'back_pain');
assert(app.dailyRecords['2026-09-01'].whSymptoms.indexOf('back_pain') < 0, 'D22 remove symptom');
eng.setWhLog(app, '2026-09-01', { whSymptoms: ['abdominal_cramps', 'headache', 'fatigue'] });
assert(app.dailyRecords['2026-09-01'].whSymptoms.length === 3, 'D23 multiple symptoms');
eng.setWhLog(app, '2026-09-01', { pain: 99 });
assert(app.dailyRecords['2026-09-01'].pain === 10, 'D26 pain clamp 0-10');

// E. Persistence / migration
app = emptyApp();
app.schemaVersion = 3;
markDays(app, ['2026-07-10','2026-07-11','2026-07-12']);
app.dailyRecords['2026-07-10'].symptoms = ['Đau bụng'];
const mig1 = eng.migrateAppDataToCycleV2(app, deps);
const mig2 = eng.migrateAppDataToCycleV2(app, deps);
assert(mig1.appData.schemaVersion === 4, 'E30 schema → 4');
assert(mig1.appData.periodRecords.length === 1, 'E29 old period flags → periodRecords');
assert(mig2.appData.periodRecords.length === 1, 'E30 migration idempotent');
assert(app.dailyRecords['2026-07-10'].whSymptoms.indexOf('abdominal_cramps') >= 0, 'E29 legacy symptom mapped');
const serialized = JSON.stringify(app);
const reloaded = JSON.parse(serialized);
assert(reloaded.periodRecords[0].startDate === '2026-07-10', 'E27 save→reload period');
assert(reloaded.weightLogs[0].weight === 55, 'F31 weight preserved');

// Food diary preserved while cycle mutates
reloaded.dailyRecords['2026-07-10'].foodLogs = [{ id: 'f1', nutritionSnapshot: { energyKcal: 400 } }];
reloaded.dailyRecords['2026-07-10'].waterMl = 1200;
reloaded.dailyRecords['2026-07-10'].sleepMinutes = 420;
eng.markPeriodDay(reloaded, '2026-07-11', true, deps);
assert(reloaded.dailyRecords['2026-07-10'].foodLogs[0].nutritionSnapshot.energyKcal === 400, 'F32 food preserved');
assert(reloaded.dailyRecords['2026-07-10'].waterMl === 1200, 'F33 water preserved');
assert(reloaded.dailyRecords['2026-07-10'].sleepMinutes === 420, 'F34 sleep preserved');
assert(reloaded.profile.lang === 'vi', 'F35 language preserved');

// Cross-data interfaces exist
assert(typeof eng.getWeightAroundCycle === 'function', 'cross getWeightAroundCycle');
assert(typeof eng.getNutritionAroundCycle === 'function', 'cross getNutritionAroundCycle');
assert(typeof eng.generateCycleInsights === 'function', 'insights API');
const insights = eng.generateCycleInsights(reloaded, deps);
assert(Array.isArray(insights) && insights.length > 0, 'insights returns array');

// Food repository boundary
const repo = foodRepo.create({ getMyFoods: () => [] });
assert(typeof repo.search === 'function' && typeof repo.getById === 'function', 'FoodRepository API');

// Current cycle day
app = emptyApp();
markDays(app, ['2026-08-01','2026-08-02','2026-08-03']);
markDays(app, ['2026-08-29','2026-08-30']);
eng.migrateAppDataToCycleV2(app, deps);
const cur = eng.getCurrentCycleDay(app, '2026-09-05', deps);
assert(cur.ok && cur.day === 8, 'current cycle day from last start');

// G. Dashboard + Mai context + cross-data insights
assert(typeof eng.buildCycleDashboardSnapshot === 'function', 'G dashboard API');
assert(typeof eng.pickMaiCycleContext === 'function', 'G Mai context API');
assert(typeof eng.calculateMinCycleLength === 'function', 'G min cycle API');
assert(typeof eng.calculateMaxCycleLength === 'function', 'G max cycle API');

app = emptyApp();
markDays(app, ['2026-06-01','2026-06-02','2026-06-03','2026-06-04']);
markDays(app, ['2026-06-29','2026-06-30','2026-07-01']);
markDays(app, ['2026-07-27','2026-07-28','2026-07-29','2026-07-30']);
eng.migrateAppDataToCycleV2(app, deps);
assert(eng.calculateMinCycleLength(app, deps) === 28, 'G min cycle length');
assert(eng.calculateMaxCycleLength(app, deps) === 28, 'G max cycle length');
const snap = eng.buildCycleDashboardSnapshot(app, '2026-08-05', deps);
assert(snap.cycleCount >= 2, 'G dashboard cycleCount');
assert(snap.medianCycleLength === 28, 'G dashboard median');
assert(Array.isArray(snap.insights), 'G dashboard insights');
assert(snap.summary && snap.summary.hasHistory === true, 'G dashboard summary history');
const mai = eng.pickMaiCycleContext(app, '2026-07-28', deps);
assert(mai.onPeriod === true, 'G Mai onPeriod when marked');
assert(typeof mai.phase === 'string', 'G Mai phase string');

// Cross-data appetite insight (deterministic thresholds)
app = emptyApp();
markDays(app, ['2026-04-03','2026-04-04','2026-04-05']);
markDays(app, ['2026-05-01','2026-05-02','2026-05-03']);
markDays(app, ['2026-05-29','2026-05-30','2026-05-31']);
eng.migrateAppDataToCycleV2(app, deps);
function seedDay(date, kcal, water, sleep) {
  if (!app.dailyRecords[date]) app.dailyRecords[date] = { waterMl: 0, sleepMinutes: null, period: false, note: '', symptoms: [], foodLogs: [] };
  app.dailyRecords[date].foodLogs = [{ id: 'x', nutritionSnapshot: { energyKcal: kcal } }];
  app.dailyRecords[date].waterMl = water;
  app.dailyRecords[date].sleepMinutes = sleep;
}
// Pre-period high kcal vs mid-cycle baseline for both starts
['2026-04-28','2026-04-29','2026-04-30'].forEach(d => seedDay(d, 2200, 800, 300));
['2026-05-06','2026-05-07','2026-05-08','2026-05-09','2026-05-10','2026-05-11'].forEach(d => seedDay(d, 1600, 1600, 450));
['2026-05-26','2026-05-27','2026-05-28'].forEach(d => seedDay(d, 2300, 700, 280));
['2026-06-03','2026-06-04','2026-06-05','2026-06-06','2026-06-07','2026-06-08'].forEach(d => seedDay(d, 1550, 1700, 480));
app.weightLogs.push({ date: '2026-05-01', weight: 56.2 });
app.weightLogs.push({ date: '2026-05-10', weight: 55.0 });
app.weightLogs.push({ date: '2026-05-29', weight: 56.4 });
app.weightLogs.push({ date: '2026-06-10', weight: 55.1 });
const crossInsights = eng.generateCycleInsights(app, deps);
const ids = crossInsights.map(i => i.id);
assert(ids.indexOf('cycle_length_range') >= 0, 'G insight cycle_length_range');
assert(ids.indexOf('appetite_before_period') >= 0, 'G insight appetite before period');
assert(ids.indexOf('water_lower_before_period') >= 0, 'G insight water lower before period');
assert(ids.indexOf('sleep_lower_before_period') >= 0, 'G insight sleep lower before period');
assert(ids.every((id, i) => ids.indexOf(id) === i), 'G insights deduped');
assert(crossInsights.length <= 6, 'G insights capped');

// Insufficient data empty-ish path
const emptySnap = eng.buildCycleDashboardSnapshot(emptyApp(), '2026-08-01', deps);
assert(emptySnap.cycleCount === 0, 'G empty dashboard cycleCount 0');
const emptyInsights = eng.generateCycleInsights(emptyApp(), deps);
assert(emptyInsights.some(i => i.id === 'need_more_data'), 'G need_more_data when empty');

// H. Historical cycle flow / symptom / pain summaries
app = emptyApp();
eng.startPeriod(app, '2026-08-01', { flow: 'light' }, deps);
eng.markPeriodDay(app, '2026-08-02', true, deps);
eng.setFlowForDay(app, '2026-08-02', 'medium', deps);
eng.markPeriodDay(app, '2026-08-03', true, deps);
eng.setFlowForDay(app, '2026-08-03', 'heavy', deps);
eng.endPeriod(app, '2026-08-03', deps);
eng.setWhLog(app, '2026-08-01', { pain: 4, whSymptoms: ['abdominal_cramps'] });
eng.setWhLog(app, '2026-08-02', { pain: 8, whSymptoms: ['abdominal_cramps', 'back_pain'] });
eng.setWhLog(app, '2026-08-03', { pain: 6, whSymptoms: ['fatigue'] });
const histDetail = eng.getCycleHistory(app, deps);
assert(histDetail.length === 1, 'H history one cycle');
assert(histDetail[0].flowSummary && histDetail[0].flowSummary.loggedDays === 3, 'H flow summary days');
assert(histDetail[0].flowSummary.dominant === 'light' || histDetail[0].flowSummary.sequence.length === 3, 'H flow sequence present');
assert(histDetail[0].symptomSummary && histDetail[0].symptomSummary.top.indexOf('abdominal_cramps') >= 0, 'H symptom top includes cramps');
assert(histDetail[0].painSummary && histDetail[0].painSummary.max === 8, 'H pain max');
assert(histDetail[0].painSummary.average === 6, 'H pain average');
const thin = eng.summarizeFlowByDay({});
assert(thin === null, 'H empty flow summary is null (no invent)');
const thinPain = eng.summarizePainInRange(emptyApp(), '2026-08-01', '2026-08-03', deps);
assert(thinPain === null, 'H insufficient pain → null');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
