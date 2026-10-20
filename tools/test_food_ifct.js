/**
 * IFCT 2017 supplement (www/data/foods/foods_ifct.*) and USDA label coverage.
 * Run: node tools/test_food_ifct.js
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
const ifct = JSON.parse(fs.readFileSync(path.join(DIR, 'foods_ifct.json'), 'utf8'));
const main = JSON.parse(fs.readFileSync(path.join(DIR, 'foods.json'), 'utf8'));
const src = require('./food_sources/ifct2017/compositions_selected.json');
const { build } = require('./import_ifct2017.js');

// --- generated files are current
assert(JSON.stringify(build()) === JSON.stringify(ifct), 'foods_ifct.json matches tools/import_ifct2017.js output');
const js = fs.readFileSync(path.join(DIR, 'foods_ifct.js'), 'utf8');
assert(js.includes(JSON.stringify(ifct)), 'foods_ifct.js embeds foods_ifct.json');

// --- shape, provenance, no id clash with the main catalog
const mainIds = new Set(main.map((f) => f.id));
assert(ifct.length === 121, 'expected 121 IFCT rows (got ' + ifct.length + ')');
assert(ifct.every((f) => !mainIds.has(f.id)), 'IFCT ids do not clash with foods.json');
assert(new Set(ifct.map((f) => f.id)).size === ifct.length, 'IFCT ids unique');
assert(ifct.every((f) => f.provenance && f.provenance.source === 'IFCT_2017' && /^[A-Z]\d{3}$/.test(f.provenance.sourceId)), 'every row has IFCT provenance');
assert(ifct.every((f) => f.nameVi && f.nameJa && f.nameEn && f.foodKey && f.variantKey && f.nutritionBasis === 'per_100g'), 'every row has vi/ja/en names and keys');
assert(ifct.every((f) => ['energyKcal', 'protein', 'fat', 'carbohydrate', 'fiber', 'sodium'].every((k) => typeof f.nutritionPer100g[k] === 'number')), 'every row has all six nutrients');

// --- numbers come from the source: kJ -> kcal, g -> mg sodium, nothing else
const byCode = {};
src.rows.forEach((r) => { byCode[r.code] = r; });
assert(ifct.every((f) => {
  const r = byCode[f.sourceId];
  const n = f.nutritionPer100g;
  return n.energyKcal === Math.round(Number(r.enerc) / 4.184) && n.protein === Math.round(Number(r.protcnt) * 100) / 100 &&
    n.fat === Math.round(Number(r.fatce) * 100) / 100 && Math.abs(n.sodium - Number(r.na) * 1000) < 0.06;
}), 'nutrients equal the IFCT values (kJ/4.184, Na g*1000)');
// Atwater sanity check: energy within 20% of the 4/9/4 estimate (IFCT energy does not count fibre)
const off = ifct.filter((f) => {
  const n = f.nutritionPer100g;
  const est = 4 * n.protein + 9 * n.fat + 4 * n.carbohydrate;
  return est > 20 && Math.abs(est - n.energyKcal) / n.energyKcal > 0.2;
});
assert(off.length === 0, 'energy consistent with macros (' + off.map((f) => f.id).join(',') + ')');

const pick = (id) => ifct.find((f) => f.id === id);
assert(pick('ifct_s005').originalLabels.scientificName === 'Pangasianodon hypophthalmus', 'cá tra row is Pangasianodon hypophthalmus');
assert(pick('ifct_i002').nutritionPer100g.energyKcal === 58, 'nước mía 58 kcal/100 g (IFCT I002)');
assert(pick('ifct_r001').nameEn === 'Green mussel, raw', 'Perna viridis labelled as mussel, not clam');

// --- search finds the new rows (accents, no accents, English)
globalThis.FOOD_MASTER = main.concat(ifct);
const repo = require(path.join(ROOT, 'www', 'js', 'food', 'food_repository.js')).create({ getMyFoods: () => [] });
const ids = (q) => repo.search(q, 20, 'vi').master.map((f) => f.id);
assert(ids('nước mía').includes('ifct_i002'), 'search "nước mía"');
assert(ids('nuoc mia').includes('ifct_i002'), 'search "nuoc mia"');
assert(ids('cá basa').includes('ifct_s005'), 'search "cá basa" finds cá tra');
assert(ids('mong toi').includes('ifct_c007'), 'search "mong toi"');
assert(ids('chôm chôm').includes('ifct_e059'), 'search "chôm chôm"');
assert(ids('sugarcane juice').includes('ifct_i002'), 'search English "sugarcane juice"');

// --- wiring
const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
assert(html.indexOf('data/foods/foods_ifct.js') > html.indexOf('data/foods/foods_db.js'), 'index.html loads foods_ifct.js after foods_db.js');
assert(fs.readFileSync(path.join(ROOT, 'www', 'sw.js'), 'utf8').includes('./data/foods/foods_ifct.js'), 'service worker precaches foods_ifct.js');

// --- USDA labels: glossary coverage did not regress
const english = main.filter((f) => f.nameViStatus === 'source_en').length;
assert(english <= 2015, 'USDA rows left in English <= 2015 (got ' + english + ')');
const byEn = (en) => main.find((f) => f.originalLabels && f.originalLabels.nameEn === en);
assert(byEn('Water convolvulus,raw').nameVi === 'Rau muống, sống', 'USDA water convolvulus is rau muống');
assert(byEn('Amaranth leaves, raw').nameVi === 'Rau dền, sống', 'USDA amaranth leaves is rau dền');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
