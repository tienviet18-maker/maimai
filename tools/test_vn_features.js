/**
 * Standard VN recipes, household portions, barcode lookup and cycle food tips.
 * Run: node tools/test_vn_features.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

const DIR = path.join(ROOT, 'www', 'data', 'foods');
const main = JSON.parse(fs.readFileSync(path.join(DIR, 'foods.json'), 'utf8'));
const ifct = JSON.parse(fs.readFileSync(path.join(DIR, 'foods_ifct.json'), 'utf8'));
const recipes = JSON.parse(fs.readFileSync(path.join(DIR, 'foods_vn_recipes.json'), 'utf8'));
const byId = {};
main.concat(ifct, recipes).forEach((f) => { byId[f.id] = f; });

(async () => {
  // ---------- standard recipes
  const { build } = require('./build_vn_recipes.js');
  assert(JSON.stringify(build()) === JSON.stringify(recipes), 'foods_vn_recipes.json matches tools/build_vn_recipes.js output');
  assert(fs.readFileSync(path.join(DIR, 'foods_vn_recipes.js'), 'utf8').includes(JSON.stringify(recipes)), 'foods_vn_recipes.js embeds the json');
  assert(recipes.length >= 20, 'at least 20 standard dishes (' + recipes.length + ')');
  assert(recipes.every((f) => f.provenanceType === 'calculated' && f.source === 'MAIMAI_RECIPE' && f.recipe && f.recipe.ingredients.length >= 3), 'every dish is marked calculated with its ingredients');
  assert(recipes.every((f) => f.recipe.ingredients.every((it) => byId[it.id] && byId[it.id].source !== 'MAIMAI_RECIPE')), 'every ingredient is a sourced database row');
  assert(recipes.every((f) => ['energyKcal', 'protein', 'fat', 'carbohydrate', 'fiber', 'sodium'].every((k) => typeof f.nutritionPer100g[k] === 'number')), 'every dish has all six nutrients');
  // serving totals equal the sum of ingredients (within rounding of per-100 g values)
  const bad = recipes.filter((f) => {
    const g = f.defaultGrams;
    const sum = f.recipe.ingredients.reduce((s, it) => s + byId[it.id].nutritionPer100g.energyKcal * it.grams / 100, 0);
    return Math.abs(sum - f.nutritionPer100g.energyKcal * g / 100) > g / 200 + 1;
  });
  assert(bad.length === 0, 'serving kcal = sum of ingredient kcal (' + bad.map((f) => f.id).join(',') + ')');
  assert(recipes.every((f) => f.servings && f.servings[0].grams === f.defaultGrams && f.servings[0].label.vi && f.servings[0].label.en && f.servings[0].label.ja), 'every dish has a labelled serving');
  const pho = byId.recipe_vn_pho_bo_tai;
  const phoKcal = pho.nutritionPer100g.energyKcal * pho.defaultGrams / 100;
  assert(phoKcal > 300 && phoKcal < 500, 'phở bò tái one bowl is 300-500 kcal (' + Math.round(phoKcal) + ')');

  globalThis.FOOD_MASTER = main.concat(ifct, recipes);
  const repo = require(path.join(ROOT, 'www', 'js', 'food', 'food_repository.js')).create({ getMyFoods: () => [] });
  const ids = (q) => repo.search(q, 20, 'vi').master.map((f) => f.id);
  assert(ids('bún chả').includes('recipe_vn_bun_cha'), 'search "bún chả" finds the dish');
  assert(ids('goi cuon').includes('recipe_vn_goi_cuon'), 'search "goi cuon" finds the dish');
  assert(ids('trà sữa').includes('recipe_vn_tra_sua_tran_chau'), 'search "trà sữa" finds the dish');

  const pending = JSON.parse(fs.readFileSync(path.join(DIR, 'food_catalog_pending.json'), 'utf8'));
  assert(pending.filter((p) => p.resolvedBy).every((p) => p.resolvedBy.every((id) => byId[id])), 'pending list points at existing rows');

  // ---------- portions
  const P = require(path.join(ROOT, 'www', 'js', 'food', 'portions.js'));
  const lbl = (id, lang) => P.getPortions(byId[id], lang || 'vi').filter((p) => p.kind !== 'grams').map((p) => p.label + '=' + p.grams);
  assert(lbl('mext_01088')[0] === '1 chén=150', 'cooked rice: 1 chén = 150 g');
  assert(lbl('usda_sr_173424')[0] === '1 quả=50', 'boiled chicken egg: 1 quả = 50 g');
  assert(lbl('ifct_m011')[0] === '1 quả=70', 'duck egg: 1 quả = 70 g');
  assert(lbl('usda_sr_171411')[0] === '1 muỗng canh=13.6', 'oil: 1 tablespoon (not caught by đậu = bean)');
  assert(lbl('ifct_b011').length === 0, 'mung beans get no oil spoon portion');
  assert(lbl('recipe_vn_pho_bo_tai')[0] === '1 tô=' + pho.defaultGrams, 'dish uses its own serving');
  assert(lbl('recipe_vn_pho_bo_tai', 'ja')[0].startsWith('1杯'), 'portion labels follow the language');
  assert(P.getPortions(byId.usda_sr_171411, 'vi').filter((p) => p.kind === 'grams').length === 4, 'gram presets always offered');

  // ---------- barcode
  const B = require(path.join(ROOT, 'www', 'js', 'food', 'barcode.js'));
  assert(B.isValidBarcode('8934563138165') && B.isValidBarcode('4902102072618') && B.isValidBarcode('96385074'), 'valid EAN-13 / EAN-8 accepted');
  assert(!B.isValidBarcode('8934563138166') && !B.isValidBarcode('12345') && !B.isValidBarcode('abc'), 'bad check digit / length rejected');
  const off = { status: 1, product: { product_name: 'Sữa tươi', brands: 'Vinamilk', quantity: '180 ml', serving_quantity: 180,
    nutriments: { 'energy-kcal_100g': 63, proteins_100g: 3, fat_100g: 3.5, carbohydrates_100g: 4.8, sodium_100g: 0.04 } } };
  const m = B.mapProduct(off, '8934673573165', 'vi');
  assert(m.ok && m.food.energyKcal === 63 && m.food.sodium === 40 && m.food.defaultGrams === 180, 'Open Food Facts nutriments mapped (Na g -> mg, serving)');
  assert(m.food.name === 'Sữa tươi (Vinamilk)', 'name carries the brand');
  const kj = B.mapProduct({ status: 1, product: { product_name: 'X', nutriments: { energy_100g: 418.4, salt_100g: 1 } } }, '1', 'en');
  assert(kj.ok && kj.food.energyKcal === 100 && kj.food.sodium === 400, 'kJ-only energy and salt converted');
  assert(B.mapProduct({ status: 1, product: { product_name: 'Y', nutriments: {} } }, '1').reason === 'no_nutrition', 'no energy value -> rejected, not guessed');
  assert(B.mapProduct({ status: 0 }, '1').reason === 'not_found', 'unknown product reported');
  let asked = '';
  const res = await B.lookup('8934563138165', { fetch: (u) => { asked = u; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(off) }); } });
  assert(res.ok && /world\.openfoodfacts\.org\/api\/v2\/product\/8934563138165\.json\?fields=/.test(asked), 'lookup calls Open Food Facts with only the code');
  assert(asked.split('?')[1].split('&').length === 1, 'request has no parameter besides the field list');
  assert((await B.lookup('8934563138165', { fetch: () => Promise.reject(new Error('net')) })).reason === 'offline', 'network failure -> offline');
  assert((await B.lookup('123', { fetch: () => { throw new Error('should not fetch'); } })).reason === 'invalid_code', 'invalid code never fetched');

  // ---------- cycle food tips
  const T = require(path.join(ROOT, 'www', 'js', 'cycle', 'cycle_food_tips.js'));
  const period = T.pickCycleFoodTip({ onPeriod: true, phase: 'menstrual', hasHistory: true }, { sex: 'female' });
  assert(period && period.textKey === 'cycleTipMenstrual' && period.estimated === false, 'recorded period -> iron tip, not estimated');
  const luteal = T.pickCycleFoodTip({ onPeriod: false, phase: 'luteal', hasHistory: true }, { sex: 'female' });
  assert(luteal && luteal.textKey === 'cycleTipLuteal' && luteal.estimated === true, 'luteal phase -> estimated tip');
  assert(T.pickCycleFoodTip({ onPeriod: false, phase: 'luteal', hasHistory: false }, { sex: 'female' }) === null, 'no history -> no tip');
  assert(T.pickCycleFoodTip({ onPeriod: false, phase: 'unknown', hasHistory: true }, {}) === null, 'unknown phase -> no tip');
  assert(T.pickCycleFoodTip({ onPeriod: true, phase: 'menstrual', hasHistory: true }, { sex: 'male' }) === null, 'not shown for male profiles');
  assert(Object.values(T.TIPS).every((t) => t.foods.every((id) => byId[id])), 'tip foods exist in the database');

  // ---------- wiring + i18n
  const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'www', 'sw.js'), 'utf8');
  ['data/foods/foods_vn_recipes.js', 'js/food/portions.js', 'js/food/barcode.js', 'js/cycle/cycle_food_tips.js'].forEach((f) => {
    assert(html.includes('<script src="' + f + '"></script>'), 'index.html loads ' + f);
    assert(sw.includes("'./" + f + "'"), 'service worker precaches ' + f);
  });
  assert(html.indexOf('foods_vn_recipes.js') > html.indexOf('foods_ifct.js'), 'recipes load after their IFCT ingredients');
  const keys = ['recipeStdSourceLine', 'portionLabel', 'portionNote', 'barcodeTitle', 'barcodeHint', 'barcodeNoCamera', 'barcodeInvalid', 'barcodeNotFound',
    'barcodeNoNutrition', 'barcodeOffline', 'barcodePer100', 'barcodeAttribution', 'cycleTipTitle', 'cycleTipEstimated', 'cycleTipDisclaimer',
    'cycleTipMenstrual', 'cycleTipFollicular', 'cycleTipFertile', 'cycleTipLuteal'];
  keys.forEach((k) => assert((html.match(new RegExp('^\\s+' + k + ': "', 'gm')) || []).length === 3, 'i18n ' + k + ' in vi/en/ja'));
  const privacy = fs.readFileSync(path.join(ROOT, 'www', 'privacy.html'), 'utf8');
  assert((privacy.match(/Open Food Facts/g) || []).length >= 3, 'privacy policy discloses Open Food Facts in all languages');

  console.log('\nRESULT passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
})();
