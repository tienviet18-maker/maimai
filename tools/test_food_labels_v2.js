/**
 * Food DB v2 label quality + Vietnamese search regression.
 * Uses the real catalog and the real searchFoods() from www/index.html.
 * Run: node tools/test_food_labels_v2.js
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

const foods = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'foods', 'foods.json'), 'utf8'));
const byId = new Map(foods.map((f) => [f.id, f]));
const JP = /[぀-ヿ一-鿿]/;

// ---- load searchFoods() exactly as shipped ----
const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
function extractFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const code = ['toHiragana', 'normalizeKeepDiacritics', 'normalizeStr', 'hasVietnameseDiacritics', 'buildFoodSearchIndex', 'searchFoods']
  .map(extractFn).join('\n');
const searchFoods = new Function('FOOD_MASTER', 'appData',
  'let FOOD_SEARCH_INDEX = null;\n' + code + '\nreturn searchFoods;')(foods, { myFoods: [] });
const top = (q, n) => searchFoods(q).masterMatches.slice(0, n || 40);

// ---- label integrity ----
assert(foods.every((f) => f.labelVersion === 2), 'all rows relabelled (labelVersion 2)');
assert(!foods.some((f) => f.nameViStatus === 'glossary' && JP.test(f.nameVi)), 'no Japanese text in translated nameVi');
assert(foods.filter((f) => f.source === 'MEXT' && JP.test(f.nameVi)).length === 0, 'every MEXT row has a Vietnamese name');
assert(foods.filter((f) => f.source !== 'MEXT').every((f) => f.nameEn === f.originalLabels.nameEn), 'USDA nameEn is the source description');

// ---- known v1 mislabels stay fixed ----
assert(!/^Cơm/.test(byId.get('mext_01083').nameVi) && byId.get('mext_01083').preparation === 'raw', 'raw polished rice is not labelled cooked rice');
assert(/^Cơm, gạo trắng, gạo tẻ/.test(byId.get('mext_01088').nameVi), 'cooked white rice labelled Cơm');
assert(/lúa mạch/i.test(byId.get('mext_01170').nameVi), 'barley rice labelled as barley');
assert(!/^Muối/.test(byId.get('mext_06235').nameVi) && /Cải thảo/.test(byId.get('mext_06235').nameVi), 'salted napa cabbage is not "Muối"');
assert(!/^Cà rốt/.test(byId.get('mext_06390').nameVi), 'tsurunijin is not carrot');
assert(/^Rau muống/.test(byId.get('mext_06298').nameVi), 'ようさい labelled Rau muống');
assert(/^Hàu/.test(byId.get('mext_10292') ? byId.get('mext_10292').nameVi : 'Hàu'), 'MEXT oyster (かき in 貝類) is Hàu, not persimmon');
for (const id of ['usda_sr_172103', 'usda_sr_172104', 'usda_sr_172105', 'usda_sr_167667', 'usda_fndds_2708702', 'usda_sr_172076', 'usda_sr_173300', 'usda_sr_172802']) {
  const f = byId.get(id);
  assert(f.family !== 'egg' && !/^Trứng/.test(f.nameVi), id + ' (' + f.nameEn.slice(0, 40) + ') not labelled as egg');
}
assert(!/^Cơm/.test(byId.get('usda_sr_172026').nameVi), 'gluten-free pasta not labelled brown rice');
assert(!/^Đậu phụ/.test(byId.get('usda_sr_167722').nameVi), 'tofu yogurt not labelled tofu');

// ---- preparation rules ----
const segs = (f) => String(f.nameEn || f.originalLabels.nameEn).toLowerCase().split(/,\s*/);
assert(!foods.some((f) => f.source !== 'MEXT' && f.preparation === 'sweetened' && segs(f).some((s) => /unsweetened/.test(s)) && !segs(f).some((s) => /(?<!un)sweetened/.test(s))), 'unsweetened rows never tagged sweetened');
assert(!foods.some((f) => f.family !== 'egg' && f.preparation === 'hard_boiled'), 'only eggs are hard_boiled');
assert(byId.get('mext_12005').preparation === 'hard_boiled', 'MEXT boiled egg is hard_boiled');
assert(byId.get('usda_sr_168483').preparation === 'baked', 'baked sweet potato is baked (v1: dried)');
assert(byId.get('usda_fndds_2707572').preparation !== 'sweetened', 'unsweetened coconut water not sweetened');
assert(byId.get('usda_fndds_2707125').preparation !== 'dried', 'pho without meat not dried (v1: "không" → khô)');
assert(byId.get('usda_sr_168914').preparation === 'cooked', 'cooked rice noodles are cooked (v1: hard_boiled)');

// ---- search: Vietnamese queries land on the right food ----
assert(top('trứng', 8).every((f) => f.family === 'egg'), 'trứng: top 8 are eggs');
assert(top('trung', 8).every((f) => f.family === 'egg'), 'trung (no accents): top 8 are eggs');
assert(top('egg', 5).every((f) => f.family === 'egg'), 'egg: top 5 are eggs (no egg rolls)');
assert(top('trứng luộc', 3).every((f) => f.family === 'egg' && f.preparation === 'hard_boiled'), 'trứng luộc: top 3 boiled eggs');
const comTrang = top('cơm trắng', 5);
assert(comTrang.length >= 3 && comTrang.every((f) => /^Cơm/.test(f.nameVi) && f.preparation === 'cooked'), 'cơm trắng: cooked rice only');
assert(top('com trang', 5).every((f) => /^Cơm/.test(f.nameVi)), 'com trang (no accents): cooked rice');
assert(top('cơm', 3).every((f) => f.preparation === 'cooked'), 'cơm: no raw rice in top 3');
assert(top('rau muống').some((f) => f.id === 'mext_06298'), 'rau muống found');
assert(top('rau muong').some((f) => f.id === 'mext_06298'), 'rau muong (no accents) found');
assert(top('khổ qua').length >= 2 && top('mướp đắng').length >= 1, 'khổ qua / mướp đắng found');
assert(top('gà luộc', 1)[0].family !== 'egg', 'gà luộc: top result is chicken, not egg');
assert(top('chả giò').every((f) => !/^Trứng/.test(f.nameVi)), 'chả giò never shows "Trứng" labels');
for (const q of ['dưa hấu', 'bưởi', 'thịt vịt', 'cá rô phi', 'thanh long', 'sả', 'đậu hũ', 'lạc', 'thịt lợn']) {
  assert(top(q).length > 0, q + ' has results');
}

// ---- coverage floor over common Vietnamese foods (raise as data grows) ----
const COMMON = ('phở bò|phở gà|bún bò Huế|bún chả|bún riêu|cơm tấm|cháo gà|xôi|bánh mì|bánh cuốn|bánh xèo|gỏi cuốn|chả giò|' +
  'thịt kho|cá kho|canh chua|trứng chiên|trứng luộc|gà luộc|thịt luộc|sữa chua|cà phê|trà sữa|nước mía|nước dừa|bia|cơm trắng|' +
  'bún|bánh phở|miến|đậu phộng|rau muống|cải ngọt|rau ngót|bầu|mướp|khổ qua|cà chua|dưa leo|bắp cải|giá đỗ|thanh long|xoài|chuối|' +
  'ổi|bưởi|cam|mít|sầu riêng|nhãn|vải|chôm chôm|đu đủ|dưa hấu|măng cụt|cá basa|cá rô phi|tôm|mực|cua|nghêu|thịt heo|thịt bò|' +
  'thịt gà|thịt vịt|nước mắm|tương ớt|đường|dầu ăn|mỡ heo|đậu phụ|đậu xanh|khoai lang|khoai môn|bí đỏ|nấm hương|hành lá|tỏi|gừng|sả').split('|');
const misses = COMMON.filter((q) => top(q).length === 0);
console.log('INFO common VN foods with 0 hits (' + misses.length + '/' + COMMON.length + '):', misses.join(', '));
assert(misses.length <= 6, 'coverage floor: ≤6 of ' + COMMON.length + ' common foods without results (got ' + misses.length + ')');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
