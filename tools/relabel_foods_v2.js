/**
 * MaiMai Food DB relabel v2 — labels/metadata only.
 *
 * Rebuilds nameVi / preparation / foodKey / variantKey / aliases / cuisine
 * from each record's SOURCE name (MEXT: nameJa, USDA: originalLabels.nameEn)
 * using reviewed glossaries in tools/food_labels/. Fixes v1 problems:
 *   - regex prep rules matching inside words ("khoai" → dried, "unsweetened" → sweetened,
 *     every ゆで → hard_boiled)
 *   - Vietnamese labels attached to the wrong food (raw rice as "Cơm", egg rolls as "Trứng gà")
 *   - 1,678 MEXT rows whose nameVi was Japanese text
 *
 * Never touches: id, nutritionPer100g, source, sourceId, sourceVersion, provenance,
 * searchPrimary / duplicate fields, defaultGrams, originalLabels.
 * Idempotent: output depends only on source names + glossaries.
 *
 * Run: node tools/relabel_foods_v2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FOODS_DIR = path.join(ROOT, 'www', 'data', 'foods');
const FOODS_JSON = path.join(FOODS_DIR, 'foods.json');
const FOODS_DB_JS = path.join(FOODS_DIR, 'foods_db.js');
const PENDING = path.join(FOODS_DIR, 'food_catalog_pending.json');
const REPORT = path.join(FOODS_DIR, 'enrichment_report.json');
const LABELS = path.join(__dirname, 'food_labels');

const JA_VI = JSON.parse(fs.readFileSync(path.join(LABELS, 'mext_ja_vi_glossary.json'), 'utf8'));
const EN_VI = JSON.parse(fs.readFileSync(path.join(LABELS, 'usda_en_vi_glossary.json'), 'utf8'));

// ---------- preparation ----------
const PREP_LABELS = {
  raw: { vi: 'sống', en: 'raw', ja: '生' },
  boiled: { vi: 'luộc', en: 'boiled', ja: 'ゆで' },
  hard_boiled: { vi: 'luộc chín', en: 'hard-boiled', ja: 'ゆで' },
  steamed: { vi: 'hấp', en: 'steamed', ja: '蒸し' },
  stir_fried: { vi: 'xào', en: 'stir-fried', ja: '炒め' },
  fried: { vi: 'chiên', en: 'fried', ja: '焼き・揚げ' },
  deep_fried: { vi: 'chiên ngập dầu', en: 'deep-fried', ja: '揚げ' },
  grilled: { vi: 'nướng', en: 'grilled', ja: '焼き' },
  roasted: { vi: 'quay/rang', en: 'roasted', ja: 'ロースト・いり' },
  baked: { vi: 'nướng lò', en: 'baked', ja: 'オーブン焼き' },
  braised: { vi: 'om/hầm', en: 'braised/stewed', ja: '煮込み' },
  poached: { vi: 'chần', en: 'poached', ja: 'ポーチド' },
  scrambled: { vi: 'bác', en: 'scrambled', ja: 'スクランブル' },
  cooked: { vi: 'đã nấu', en: 'cooked', ja: '加熱' },
  dried: { vi: 'khô', en: 'dried', ja: '乾燥' },
  canned: { vi: 'đóng hộp', en: 'canned', ja: '缶詰' },
  sweetened: { vi: 'có đường', en: 'sweetened', ja: '加糖' },
  unspecified: { vi: null, en: null, ja: null }
};

// MEXT: exact token match, first rule wins.
const JA_PREP = [
  ['poached', ['ポーチドエッグ']],
  ['fried', ['目玉焼き', 'フライ']],
  ['deep_fried', ['素揚げ', '天ぷら', 'から揚げ', '揚げ', '生を揚げたもの', '市販冷凍食品を揚げたもの', '油揚げ']],
  ['stir_fried', ['油いため', 'ソテー']],
  ['steamed', ['蒸し']],
  ['grilled', ['焼き', '白焼き', 'かば焼', '焼き干し']],
  ['roasted', ['いり']],
  ['boiled', ['ゆで', '水煮']],
  ['cooked', ['めし', '水稲めし', '陸稲めし', '水稲軟めし', '水稲全かゆ', '水稲五分かゆ', '水稲おもゆ', '電子レンジ調理', '調理後全体', '調理後のめん']],
  ['canned', ['缶詰', '水煮缶詰', '味付け缶詰']],
  ['dried', ['乾', '素干し', '干し', '乾燥', '丸干し', '煮干し', '開き干し', '蒸し干し', '灰干し']],
  ['sweetened', ['加糖']],
  ['raw', ['生', '水稲穀粒', '陸稲穀粒', '玄穀', '精白粒']]
];

// Same kana means different foods in different MEXT food groups.
const JA_CATEGORY_OVERRIDE = {
  '05': { 'すいか': 'Hạt dưa hấu', 'かぼちゃ': 'Hạt bí' },
  '07': { 'もも': 'Đào', 'きはだ': 'Quả hoàng bá' },
  '10': { 'かき': 'Hàu' },
  '11': { '皮': 'da' },
  '16': { 'ラム': 'Rượu rum' }
};
// Dropped group label re-added when the first remaining token is not a food by itself.
const JA_GROUP_HEAD = {
  'だいこん類': 'Củ cải trắng', 'トマト類': 'Cà chua', 'なす類': 'Cà tím', 'こんぶ類': 'Rong kombu',
  'いわし類': 'Cá mòi', 'かつお類': 'Cá ngừ sọc dưa', 'さば類': 'Cá thu', 'たら類': 'Cá tuyết',
  'まぐろ類': 'Cá ngừ', 'えび類': 'Tôm', 'かに類': 'Cua', 'いか類': 'Mực'
};
const JA_GENERIC_FIRST = new Set(['加工品', '缶詰', '漬物', 'つくだ煮', 'みりん干し']);
const JA_PRE_REPLACE = [[/（にんじん類） きんとき/, '（にんじん類） 金時にんじん']];

// USDA: comma segments, word-boundary regex, first rule wins.
const EN_PREP = [
  ['hard_boiled', /\bhard[- ]boiled\b/],
  ['poached', /\bpoached\b/],
  ['scrambled', /\bscrambled\b/],
  ['stir_fried', /\bstir[- ]fried\b/],
  ['deep_fried', /\bdeep[- ]fried\b|\bbreaded and fried\b|\bfrench fried\b/],
  ['fried', /\b(pan-)?fried\b/],
  ['steamed', /^steamed$|\bsteamed\b(?! or boiled)/],
  ['boiled', /\bboiled\b/],
  ['braised', /\bbraised\b|\bstewed\b|\bsimmered\b/],
  ['grilled', /\bgrilled\b|\bbroiled\b|\bpan-broil(ed)?\b/],
  ['roasted', /\broasted\b/],
  ['baked', /\bbaked\b/],
  ['cooked', /\bcooked\b|\bdry heat\b|\bmoist heat\b|\bmicrowaved\b/],
  ['canned', /\bcanned\b/],
  ['dried', /\bdried\b|\bdehydrated\b/],
  ['sweetened', /(?<!un)\bsweetened\b|\bsugared\b/],
  ['raw', /\braw\b/]
];

function jaGroup(name) {
  const m = String(name || '').match(/（([^（）]*類)）/);
  return m ? m[1] : null;
}

function tokenizeJa(name) {
  for (const [re, rep] of JA_PRE_REPLACE) name = String(name || '').replace(re, rep);
  // drop ＜big category＞ and （group…類）; keep ［subtype］ and other （notes）
  const s = String(name || '')
    .replace(/＜[^＞]*＞/g, ' ')
    .replace(/（[^（）]*類）/g, ' ');
  return s.replace(/[［］（）()]/g, ' ').split(/[\s　・]+/).filter(Boolean);
}

function enSegments(name) {
  return String(name || '').split(/,\s*/).map((x) => x.trim()).filter(Boolean);
}

function detectPrepJa(tokens, isEgg) {
  const set = new Set(tokens);
  for (const [id, words] of JA_PREP) {
    if (words.some((w) => set.has(w))) {
      if (id === 'boiled' && isEgg) return 'hard_boiled';
      return id;
    }
  }
  return 'unspecified';
}

function detectPrepEn(name) {
  const segs = enSegments(name).map((s) => s.toLowerCase());
  for (const [id, re] of EN_PREP) {
    if (segs.some((s) => re.test(s))) return id;
  }
  return 'unspecified';
}

// ---------- names ----------
function ucFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// lower-case a Vietnamese glossary phrase; leave English/brand fragments (QUAKER, Florida) as written
function lcFirst(s) {
  if (!s || s.length < 2) return s;
  if (/^[A-Z][A-Z0-9'&.-]+\b/.test(s) || /^[A-Z][a-z]+$/.test(s) && !/[à-ỹđ]/i.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function composeParts(parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && prev.toLowerCase() === p.toLowerCase()) continue;
    // "Cá hồi" then "Cá hồi Đại Tây Dương" → keep the more specific one
    if (prev && p.toLowerCase().startsWith(prev.toLowerCase() + ' ')) { out[out.length - 1] = p; continue; }
    out.push(p);
  }
  return out.map((p, i) => (i === 0 ? ucFirst(p) : lcFirst(p))).join(', ');
}

function viNameMext(nameJa, category) {
  let tokens = tokenizeJa(nameJa);
  const over = JA_CATEGORY_OVERRIDE[category] || {};
  // cooked-rice subtypes replace the generic "Gạo" head
  if (tokens.some((t) => /めし$|かゆ$|おもゆ$/.test(t))) tokens = tokens.filter((t) => t !== 'こめ');
  const parts = [];
  const group = jaGroup(nameJa);
  if (tokens.length && JA_GENERIC_FIRST.has(tokens[0]) && JA_GROUP_HEAD[group]) parts.push(JA_GROUP_HEAD[group]);
  for (const t of tokens) {
    if (t in over) { parts.push(over[t]); continue; }
    if (!(t in JA_VI)) return null;
    parts.push(JA_VI[t]);
  }
  const name = composeParts(parts);
  return name || null;
}

const USDA_SKIP_TRANSLATE = /^(babyfood|fast foods?|restaurant|mcdonald|burger king|wendy|kfc|pizza hut|taco bell|subway|domino|papa john|little caesar|denny|applebee|carrabba|olive garden|on the border|t\.g\.i|cracker barrel|school lunch|infant formula|campbell|kraft|pillsbury|kellogg|general mills|quaker|nabisco|keebler|archway|mars|hershey|nestle|candies|popeyes|cereals ready-to-eat|formulated bar|snacks|frozen novelties|cookies|crackers)/i;

function viNameUsda(nameEn) {
  if (USDA_SKIP_TRANSLATE.test(nameEn)) return null;
  const segs = enSegments(nameEn);
  const parts = [];
  let i = 0;
  let headTranslated = false;
  while (i < segs.length) {
    const two = i + 1 < segs.length ? (segs[i] + ', ' + segs[i + 1]).toLowerCase() : null;
    if (two && two in EN_VI) { parts.push(EN_VI[two]); if (i === 0) headTranslated = true; i += 2; continue; }
    const one = segs[i].toLowerCase();
    if (one in EN_VI) { parts.push(EN_VI[one]); if (i === 0) headTranslated = true; }
    else parts.push(segs[i]); // keep untranslated detail in English rather than guess
    i += 1;
  }
  if (!headTranslated) return null;
  return composeParts(parts);
}

// ---------- aliases ----------
const VI_SYNONYMS = [
  ['đậu phụ', 'đậu hũ', 'tàu hũ'], ['đậu phộng', 'lạc'], ['thịt heo', 'thịt lợn'], ['ngô', 'bắp'],
  ['dứa', 'thơm', 'khóm'], ['mè', 'vừng'], ['khổ qua', 'mướp đắng'], ['dưa leo', 'dưa chuột'],
  ['bông cải xanh', 'súp lơ xanh'], ['rau chân vịt', 'cải bó xôi', 'rau bina'], ['xì dầu', 'nước tương'],
  ['khoai mì', 'sắn'], ['bí đỏ', 'bí ngô'], ['rau mùi', 'ngò', 'ngò rí'], ['chanh dây', 'chanh leo'],
  ['nấm hương', 'nấm đông cô'], ['quất', 'tắc'], ['su hào', 'su-hào'], ['củ đậu', 'củ sắn'],
  ['hành tím', 'hành củ'], ['na', 'mãng cầu ta'], ['hồng xiêm', 'sapoche', 'xa pô chê'],
  ['thanh long', 'dragon fruit'], ['bánh tráng', 'bánh đa nem'], ['miến', 'bún tàu'],
  ['cải thảo', 'cải bắp thảo'], ['rau muống', 'muống'], ['trứng cút', 'trứng chim cút'],
  ['mộc nhĩ', 'nấm mèo'], ['nấm kim châm', 'nấm enoki'], ['xá xíu', 'xá xíu heo']
];

const JA_PHRASE_ALIASES = [
  [/水稲めし.*精白米|精白米.*水稲めし/, ['cơm trắng', 'cơm']],
  [/水稲めし.*玄米/, ['cơm gạo lứt']],
  [/水稲めし.*もち米/, ['cơm nếp', 'xôi trắng']],
  [/水稲穀粒.*精白米/, ['gạo trắng', 'gạo sống']],
  [/^鶏卵 全卵/, ['trứng gà']],
  [/^＜鳥肉類＞ にわとり/, ['thịt gà']],
  [/^＜畜肉類＞ ぶた/, ['thịt heo', 'thịt lợn']],
  [/^＜畜肉類＞ うし/, ['thịt bò']]
];

function stripVi(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

function synonymAliases(nameVi) {
  const low = String(nameVi || '').toLowerCase();
  const out = [];
  for (const group of VI_SYNONYMS) {
    const hit = group.find((g) => new RegExp('(^|[\\s,(/])' + g + '($|[\\s,)/])').test(low));
    if (hit) for (const g of group) if (g !== hit) out.push(low.replace(hit, g));
  }
  return out;
}

// ---------- family / foodKey / cuisine ----------
function isRealEgg(f, srcName) {
  if (f.source === 'MEXT') return f.category === '12' && !/たまご豆腐|たまご焼|厚焼き|だし巻き/.test(srcName);
  return /^Egg, (whole|white|yolk|duck|goose|quail|turkey)/i.test(srcName);
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unknown';
}

const VN_CUISINE_DENY = /egg roll|croissan|bagel|puerto rican|sushi|tinkyada|tofu yogurt|mcdonald|burger king|fast food|bread, egg|crackers|rolls, dinner|wonton|imitation crab|crab salad/i;

const PREP_WORDS_VI = new Set(Object.values(PREP_LABELS).map((p) => p.vi).filter(Boolean)
  .concat(['luộc', 'nướng', 'khô', 'phơi khô', 'xào dầu', 'chiên', 'hấp', 'đông lạnh', 'đóng hộp']));

function baseKeyFromVi(nameVi) {
  return nameVi.split(', ').filter((p) => !PREP_WORDS_VI.has(p.toLowerCase())).join(' ');
}

// ---------- main ----------
function nutritionLock(list) {
  const h = crypto.createHash('sha256');
  for (const f of list) h.update(f.id + '|' + JSON.stringify(f.nutritionPer100g) + '|' + f.source + '|' + f.sourceId + '|' + f.sourceVersion + '\n');
  return h.digest('hex');
}

function sourceName(f) {
  return f.source === 'MEXT' ? f.nameJa : ((f.originalLabels && f.originalLabels.nameEn) || f.nameEn);
}

function relabel(f) {
  const src = sourceName(f);
  const isMext = f.source === 'MEXT';
  const egg = isRealEgg(f, src);
  const out = Object.assign({}, f);

  const prep = isMext ? detectPrepJa(tokenizeJa(src), egg) : detectPrepEn(src);
  let prepFinal = prep;
  if (!isMext && egg && prep === 'boiled') prepFinal = 'hard_boiled';
  if (!egg && prepFinal === 'hard_boiled') prepFinal = 'boiled';
  out.preparation = prepFinal;
  out.preparationLabel = Object.assign({}, PREP_LABELS[prepFinal]);

  let vi = isMext ? viNameMext(src, f.category) : viNameUsda(src);
  out.nameViStatus = vi ? 'glossary' : (isMext ? 'source_ja' : 'source_en');
  if (!vi) vi = src; // honest fallback: show the source name, never a guessed Vietnamese label
  out.nameVi = vi;
  // v1 copied EN/JA display names across unrelated rows (MEXT watermelon had nameEn "Squid").
  // Keep only names that come from the source; the UI falls back to nameVi / source name.
  if (isMext) { out.nameEn = ''; out.nameEnStatus = 'missing'; }
  else { out.nameEn = src; out.nameJa = ''; out.nameEnStatus = 'source'; }

  // family / foodKey
  if (f.family === 'egg' && !egg) out.family = 'generic';
  if (egg) out.family = 'egg';
  const trustedKey = (egg && /^egg\./.test(f.foodKey)) || f.foodKey === 'condiment.mayonnaise';
  if (!trustedKey) {
    const base = out.nameViStatus === 'glossary' ? baseKeyFromVi(vi) : enSegments(src)
      .filter((s) => !EN_PREP.some(([, re]) => re.test(s.toLowerCase()))).join(' ');
    out.foodKey = (isMext ? 'mext.' : 'usda.') + slug(base);
  }
  out.variantKey = out.foodKey + '.' + prepFinal;

  // cuisine: keep the v1 "vietnamese" tag only where the record is genuinely a VN staple
  if (f.cuisine === 'vietnamese' && (VN_CUISINE_DENY.test(src) || out.nameViStatus !== 'glossary')) out.cuisine = 'international';

  // aliases: source name + id + derived Vietnamese forms; v1 aliases are dropped because
  // many were copied onto unrelated rows (e.g. "trứng" on egg rolls).
  const aliases = new Set([src, f.sourceId]);
  if (out.nameViStatus === 'glossary') {
    aliases.add(vi);
    aliases.add(stripVi(vi));
    for (const a of synonymAliases(vi)) { aliases.add(a); aliases.add(stripVi(a)); }
  }
  if (isMext) {
    for (const [re, list] of JA_PHRASE_ALIASES) if (re.test(src)) list.forEach((a) => { aliases.add(a); aliases.add(stripVi(a)); });
  }
  out.aliases = Array.from(aliases).filter(Boolean);
  out.labelVersion = 2;
  return out;
}

function main() {
  const foods = JSON.parse(fs.readFileSync(FOODS_JSON, 'utf8'));
  const lockBefore = nutritionLock(foods);
  const next = foods.map(relabel);
  const lockAfter = nutritionLock(next);
  if (lockBefore !== lockAfter) throw new Error('nutrition/provenance changed — aborting');
  if (next.length !== foods.length || next.some((f, i) => f.id !== foods[i].id)) throw new Error('id set changed — aborting');

  const pending = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  const prevReport = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const count = (fn) => next.filter(fn).length;
  const report = Object.assign({}, prevReport, {
    generatedAt: new Date().toISOString(),
    enrichment: 'v2_source_relabel',
    nutritionLock: lockAfter,
    nameViGlossary: count((f) => f.nameViStatus === 'glossary'),
    nameViSourceJa: count((f) => f.nameViStatus === 'source_ja'),
    nameViSourceEn: count((f) => f.nameViStatus === 'source_en'),
    eggFamilyCount: count((f) => f.family === 'egg'),
    vietnameseCuisineTagged: count((f) => f.cuisine === 'vietnamese'),
    preparationCounts: next.reduce((m, f) => { m[f.preparation] = (m[f.preparation] || 0) + 1; return m; }, {}),
    canonicalFoodKeys: new Set(next.map((f) => f.foodKey)).size,
    variantKeys: new Set(next.map((f) => f.variantKey)).size,
    notes: (prevReport.notes || []).concat([
      'v2: labels rebuilt from source names via tools/food_labels glossaries; nutritionPer100g/provenance byte-identical (nutritionLock).',
      'v2: rows without a reviewed Vietnamese label show the source name (nameViStatus source_ja/source_en) instead of a guessed one.'
    ])
  });
  delete report.afterHash; delete report.beforeHash;

  const json = JSON.stringify(next);
  fs.writeFileSync(FOODS_JSON, json);
  report.foodsJsonSha256 = crypto.createHash('sha256').update(json).digest('hex');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  const header = '/* AUTO-GENERATED — do not edit. Sources: MEXT 2023, USDA SR Legacy, USDA FNDDS. Enrichment: v2 source relabel (tools/relabel_foods_v2.js). */\n';
  fs.writeFileSync(FOODS_DB_JS, header +
    'window.FOOD_MASTER = ' + json + ';\n' +
    'window.FOOD_CATALOG_PENDING = ' + JSON.stringify(pending) + ';\n' +
    'window.FOOD_DB_META = ' + JSON.stringify(report) + ';\n');
  console.log(JSON.stringify({
    records: next.length, nutritionLock: lockAfter,
    glossary: report.nameViGlossary, sourceJa: report.nameViSourceJa, sourceEn: report.nameViSourceEn,
    eggs: report.eggFamilyCount, vnCuisine: report.vietnameseCuisineTagged
  }, null, 2));
}

if (require.main === module) main();
module.exports = { relabel, viNameMext, viNameUsda, detectPrepJa, detectPrepEn, tokenizeJa, nutritionLock };
