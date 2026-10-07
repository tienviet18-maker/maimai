/**
 * Food catalog enrichment + search quality tests
 * Run: node tools/test_food_catalog.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

const foods = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'foods.json'), 'utf8'));
const { nutritionLock } = require('./relabel_foods_v2.js');

assert(foods.length === 10441, 'expected 10441 records');

// Nutrition + provenance integrity: fingerprint of (id, nutritionPer100g, source, sourceId, sourceVersion)
// for every row, pinned from the catalog before any label enrichment. Labels may change; numbers may not.
assert(nutritionLock(foods) === '3ab6c13c8f9759112103bfda4dcde27ab8b27994293220668c862e6c915a31ec',
  'nutritionPer100g/provenance unchanged for all ids (nutritionLock)');

assert(foods.every((f) => f.provenance && f.provenance.source && f.provenance.sourceId), 'all have provenance source+sourceId');
assert(foods.every((f) => f.foodKey && f.variantKey && f.nutritionBasis === 'per_100g'), 'all have foodKey/variantKey/basis');

const foodKeys = new Set(foods.map((f) => f.foodKey));
const variantKeys = new Set(foods.map((f) => f.variantKey));
assert(foodKeys.size >= 5000, 'canonical foodKeys >= 5000 (got ' + foodKeys.size + ')');
assert(variantKeys.size >= foodKeys.size, 'variantKeys >= foodKeys');

const demoted = foods.filter((f) => f.searchPrimary === false).length;
assert(demoted >= 1, 'some true duplicates demoted (got ' + demoted + ')');

assert(foods.filter((f) => String(f.nameVi).toLowerCase() === 'trứng').length === 0, 'no bare nameVi Trứng');
const eggPrimary = foods.filter((f) => f.family === 'egg' && f.searchPrimary !== false);
assert(eggPrimary.some((f) => /luộc/i.test(f.nameVi) && f.preparation === 'hard_boiled'), 'has trứng luộc variant');
assert(eggPrimary.some((f) => /chiên/i.test(f.nameVi) && f.preparation === 'fried'), 'has trứng chiên variant');
assert(eggPrimary.some((f) => /sống|raw/i.test(f.nameVi + f.preparation) && f.foodKey === 'egg.chicken.whole'), 'has raw chicken egg');
assert(foods.some((f) => f.foodKey === 'condiment.mayonnaise'), 'mayo not labeled as bare egg foodKey');

const vn = foods.filter((f) => f.cuisine === 'vietnamese').length;
assert(vn >= 100, 'vietnamese cuisine tagged coverage (' + vn + ')');

// Load repository with FOOD_MASTER on globalThis
globalThis.FOOD_MASTER = foods;
const repoApi = require(path.join(ROOT, 'www', 'js', 'food', 'food_repository.js'));
const repo = repoApi.create({ getMyFoods: () => [] });
assert(typeof repo.search === 'function', 'FoodRepository search API');

function searchNames(q) {
  return repo.search(q, 20, 'vi').master.map((f) => f.nameVi);
}

const trung = searchNames('trứng');
assert(trung.length > 0, 'search trứng returns results');
assert(trung.every((n) => !/^trứng$/i.test(n)), 'search trứng has no bare Trứng labels');
assert(trung.some((n) => /gà/i.test(n)), 'search trứng includes chicken egg');

const trungLuoc = searchNames('trung luoc');
assert(trungLuoc.some((n) => /luộc/i.test(n)), 'accentless trung luoc finds boiled');

const egg = searchNames('egg');
assert(egg.length > 0, 'search egg works');

const boiled = searchNames('boiled egg');
assert(boiled.some((n) => /luộc|boiled/i.test(n)), 'boiled egg finds boiled variant');

const variants = repo.getVariants(eggPrimary.find((f) => f.foodKey === 'egg.chicken.whole').id);
assert(variants.length >= 3, 'getVariants for chicken egg returns multiple preps (' + variants.length + ')');

const sample = foods.find((f) => f.id === 'mext_12005');
const nutr = repo.getNutrition(sample.id, 100);
assert(nutr && Math.round(nutr.energyKcal) === sample.nutritionPer100g.energyKcal, 'getNutrition uses selected record kcal');

const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'foods.json'))).digest('hex');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'enrichment_report.json'), 'utf8'));
assert(hash === report.foodsJsonSha256, 'foods.json hash matches enrichment_report (regenerate with tools/relabel_foods_v2.js)');

// Android index wiring
const idx = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
assert(idx.includes('function foodDisplayName'), 'UI foodDisplayName');
assert(idx.includes('searchPrimary === false'), 'UI hides demoted duplicates');
assert(idx.includes('foodResultSubtitle'), 'UI shows variant subtitle');

// foods_db.js present and references enrichment
const dbJs = fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'foods_db.js'), 'utf8');
assert(dbJs.includes('window.FOOD_MASTER'), 'foods_db exports FOOD_MASTER');
assert(dbJs.includes('Enrichment') || dbJs.includes('enrichment'), 'foods_db notes enrichment');
assert(dbJs.includes(fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'foods.json'), 'utf8')), 'foods_db.js embeds the same catalog as foods.json');

console.log('\nMETA', {
  records: foods.length,
  foodKeys: foodKeys.size,
  variantKeys: variantKeys.size,
  demoted,
  withProv: foods.filter((f) => f.provenance && f.provenance.sourceId).length,
  vnCuisine: vn
});
console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
