/**
 * Recipe builder math (www/js/food/recipe_builder.js): sums sourced per-100 g values, never guesses.
 * Run: node tools/test_recipe_builder.js
 */
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'www', 'js', 'food', 'recipe_builder.js'));
global.window = undefined;
const foods = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'www', 'data', 'foods', 'foods.json'), 'utf8'));
const list = Array.isArray(foods) ? foods : foods.foods;

let passed = 0, failed = 0;
function assert(c, m) { if (c) { passed++; console.log('PASS', m); } else { failed++; console.error('FAIL', m); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.051);

const A = { id: 'a', nutritionPer100g: { energyKcal: 200, protein: 10, fat: 5, carbohydrate: 30, fiber: 2, sodium: 100 } };
const B = { id: 'b', nutritionPer100g: { energyKcal: 50, protein: 1, fat: 0, carbohydrate: 10, fiber: null, sodium: 20 } };

let r = R.computeRecipe([{ food: A, grams: 100 }, { food: B, grams: 300 }]);
assert(r.ok && r.ingredientCount === 2, 'two ingredients counted');
assert(r.rawGrams === 400 && r.finalGrams === 400, 'raw weight summed');
assert(r.totals.energyKcal === 350, 'total kcal = 200 + 150');
assert(near(r.per100g.energyKcal, 88) && near(r.per100g.protein, 3.3), 'per 100 g spread over the dish');
assert(r.totals.fiber === null && r.per100g.fiber === null, 'nutrient missing in one ingredient is null, not undercounted');
assert(r.totals.sodium === 160, 'sodium summed');

r = R.computeRecipe([{ food: A, grams: 100 }, { food: B, grams: 300 }], 200);
assert(r.finalGrams === 200 && r.totals.energyKcal === 350 && r.per100g.energyKcal === 175, 'cooked weight concentrates per-100 g, total unchanged');

assert(!R.computeRecipe([]).ok, 'empty recipe is not ok');
assert(!R.computeRecipe([{ food: A, grams: 0 }]).ok, 'zero grams ignored');
assert(!R.computeRecipe([{ food: { id: 'x', nutritionPer100g: {} }, grams: 100 }]).ok, 'no energy -> not ok');

const rec = R.recipeRecord([{ food: Object.assign({ nameVi: 'Gà', source: 'MEXT', sourceId: '11220' }, A), grams: 120 }], 0);
assert(rec.ingredients.length === 1 && rec.ingredients[0].grams === 120 && rec.ingredients[0].source === 'MEXT', 'recipe record keeps ingredient provenance');
assert(rec.cookedWeight === null, 'no cooked weight stored as null');

// Real database rows: a simple bowl from sourced ingredients reproduces their own numbers.
const byId = (id) => list.find((f) => f.id === id);
const rice = list.find((f) => /^Cơm, gạo trắng/.test(f.nameVi || '') && f.source && /MEXT/i.test(f.source));
if (rice) {
  r = R.computeRecipe([{ food: rice, grams: 150 }]);
  assert(r.totals.energyKcal === Math.round(rice.nutritionPer100g.energyKcal * 1.5), 'single DB ingredient: 150 g rice = 1.5 x its own kcal');
} else {
  assert(false, 'MEXT cooked white rice row found');
}
assert(!byId('does-not-exist'), 'sanity');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
