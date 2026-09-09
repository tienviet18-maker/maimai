/**
 * Enrich MaiMai FOOD_MASTER for commercial nutrition UX.
 * - Keeps id + nutritionPer100g + source* unchanged (no invented macros)
 * - Improves display names / foodKey / preparation / variant labels
 * - Marks true nutrition duplicates for search demotion
 * - Regenerates foods_db.js + writes enrichment report
 *
 * Run: node tools/enrich_food_dataset.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FOODS_JSON = path.join(ROOT, 'www', 'data', 'foods', 'foods.json');
const FOODS_DB_JS = path.join(ROOT, 'www', 'data', 'foods', 'foods_db.js');
const PENDING = path.join(ROOT, 'www', 'data', 'foods', 'food_catalog_pending.json');
const REPORT = path.join(ROOT, 'www', 'data', 'foods', 'enrichment_report.json');
const WEB_FOODS = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'data', 'foods');

const PREP_RULES = [
  { id: 'hard_boiled', re: /hard[-\s]?boiled|ゆで|luộc|luoc|水煮/i, vi: 'luộc', en: 'boiled', ja: 'ゆで' },
  { id: 'poached', re: /poached|ポーチド|poach/i, vi: 'poached', en: 'poached', ja: 'ポーチド' },
  { id: 'deep_fried', re: /素揚げ|deep[-\s]?fried/i, vi: 'chiên ngập dầu', en: 'deep-fried', ja: '素揚げ' },
  { id: 'stir_fried', re: /いり(?!こ)|stir[-\s]?fried|xào/i, vi: 'chiên đảo', en: 'stir-fried', ja: 'いり' },
  { id: 'fried', re: /fried|chiên|chien|目玉焼き|炒め|いため/i, vi: 'chiên', en: 'fried', ja: '炒め/目玉焼き' },
  { id: 'scrambled', re: /scrambled|スクランブル/i, vi: 'trứng bác', en: 'scrambled', ja: 'スクランブル' },
  { id: 'steamed', re: /steamed|hấp|hap|蒸し/i, vi: 'hấp', en: 'steamed', ja: '蒸し' },
  { id: 'grilled', re: /grilled|nướng|nuong|焼き(?!目)/i, vi: 'nướng', en: 'grilled', ja: '焼き' },
  { id: 'dried', re: /dried|khô|kho|乾燥|dehydrated/i, vi: 'khô', en: 'dried', ja: '乾燥' },
  { id: 'sweetened', re: /加糖|sweetened|sugared/i, vi: 'có đường', en: 'sweetened', ja: '加糖' },
  { id: 'raw', re: /\braw\b|sống|song|(^|[\s、])生([\s、]|$)|生卵|生全卵/i, vi: 'sống', en: 'raw', ja: '生' },
  { id: 'cooked', re: /\bcooked\b|chín|chin|加熱/i, vi: 'đã nấu', en: 'cooked', ja: '加熱' },
  { id: 'canned', re: /canned|đóng hộp|缶詰/i, vi: 'đóng hộp', en: 'canned', ja: '缶詰' },
  { id: 'roasted', re: /roasted|rang|焙煎/i, vi: 'rang', en: 'roasted', ja: '焙煎' },
  { id: 'baked', re: /\bbaked\b|nướng lò/i, vi: 'nướng lò', en: 'baked', ja: 'オーブン' }
];

function detectPrep(blob) {
  for (const r of PREP_RULES) {
    if (r.re.test(blob)) return r;
  }
  return { id: 'unspecified', vi: '', en: '', ja: '' };
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function nutritionFingerprint(n) {
  if (!n) return '';
  return [
    Math.round(Number(n.energyKcal) || 0),
    Number(n.protein != null ? Number(n.protein).toFixed(1) : 0),
    Number(n.fat != null ? Number(n.fat).toFixed(1) : 0),
    Number(n.carbohydrate != null ? Number(n.carbohydrate).toFixed(1) : 0)
  ].join('|');
}

function classifyFood(f) {
  const en = String(f.nameEn || '');
  const ja = String(f.nameJa || '');
  const vi = String(f.nameVi || '');
  const aliases = (f.aliases || []).join(' ');
  const blob = [en, ja, vi, aliases].join(' | ');

  if (/マヨネーズ|mayonnaise/i.test(blob)) {
    return {
      foodKey: 'condiment.mayonnaise',
      family: 'mayonnaise',
      part: 'n/a',
      species: 'n/a',
      baseVi: 'Mayonnaise',
      baseEn: 'Mayonnaise',
      baseJa: 'マヨネーズ'
    };
  }

  // Dishes that merely contain egg — not canonical egg variants
  if (/noodle|custard|pudding|burrito|biscuit|sausage|turnover|babyfood|cereal|ふりかけ|たまご豆腐|だし巻|omelet|omelette|pancake|muffin|sandwich|salad|soup,/i.test(blob) &&
      !/鶏卵 全卵|卵白|卵黄|egg,\s*whole|egg\s*white|egg\s*yolk|trứng gà|trứng vịt/i.test(blob)) {
    // fall through to generic with egg mention in name
  } else if (/\begg\b|trứng|trung|卵|たまご/i.test(blob) &&
      !/noodle|custard|pudding|burrito|biscuit|sausage|turnover|babyfood|cereal|ふりかけ|sandwich|muffin|pancake/i.test(en + ' ' + ja)) {
    let species = 'chicken';
    let speciesVi = 'gà';
    let speciesEn = 'chicken';
    let speciesJa = '鶏';
    if (/duck|vịt|vit|あひる|鴨/i.test(blob)) {
      species = 'duck'; speciesVi = 'vịt'; speciesEn = 'duck'; speciesJa = 'あひる';
    } else if (/quail|cút|cut|うずら/i.test(blob)) {
      species = 'quail'; speciesVi = 'cút'; speciesEn = 'quail'; speciesJa = 'うずら';
    } else if (/うこっけい|ukokkei|silkie/i.test(blob)) {
      species = 'silkie'; speciesVi = 'gà ác'; speciesEn = 'silkie chicken'; speciesJa = 'うこっけい';
    } else if (/goose|ngỗng/i.test(blob)) {
      species = 'goose'; speciesVi = 'ngỗng'; speciesEn = 'goose'; speciesJa = 'ガチョウ';
    }

    let part = 'whole';
    let partVi = '';
    let partEn = '';
    let partJa = '全卵';
    if (/white|albumin|卵白|lòng trắng|long trang/i.test(blob)) {
      part = 'white'; partVi = 'lòng trắng'; partEn = 'white'; partJa = '卵白';
    } else if (/yolk|卵黄|lòng đỏ|long do/i.test(blob)) {
      part = 'yolk'; partVi = 'lòng đỏ'; partEn = 'yolk'; partJa = '卵黄';
    } else if (/century|pidan|皮蛋|ピータン|trứng bắc thảo/i.test(blob)) {
      part = 'century'; partVi = 'bắc thảo'; partEn = 'century egg'; partJa = 'ピータン';
    } else if (/たまご豆腐|egg tofu/i.test(blob)) {
      part = 'tofu'; partVi = 'đậu hũ trứng'; partEn = 'egg tofu'; partJa = 'たまご豆腐';
    } else if (/だし巻|dashimaki|rolled/i.test(blob)) {
      part = 'rolled_omelette'; partVi = 'trứng cuộn'; partEn = 'rolled omelette'; partJa = 'だし巻き';
    }

    // Sweetened / special process as part of key
    let process = '';
    if (/加糖|sweetened|sugared/i.test(blob)) process = 'sweetened';
    if (/素揚げ|deep[-\s]?fried/i.test(blob)) process = process || 'deep_fried';
    if (/いり(?!卵)/i.test(ja) || /\bscrambled\b|いり卵|いり\b/i.test(blob)) process = process || 'stir_fried';

    const baseVi = part === 'whole'
      ? `Trứng ${speciesVi}`
      : part === 'century'
        ? `Trứng ${partVi}`
        : part === 'tofu' || part === 'rolled_omelette'
          ? partVi
          : `Trứng ${speciesVi} (${partVi})`;
    const baseEn = part === 'whole'
      ? `${speciesEn} egg`
      : part === 'century'
        ? 'Century egg'
        : part === 'tofu' || part === 'rolled_omelette'
          ? partEn
          : `${speciesEn} egg ${partEn}`;
    const baseJa = part === 'century' ? 'ピータン' : (f.nameJa && f.nameJa.length > 4 ? f.nameJa : `${speciesJa}卵 ${partJa}`);

    const foodKey = process
      ? `egg.${species}.${part}.${process}`
      : `egg.${species}.${part}`;

    return {
      foodKey,
      family: 'egg',
      part,
      species,
      process: process || null,
      baseVi,
      baseEn,
      baseJa
    };
  }

  let core = en;
  if (!core || core === vi || (/[\u3040-\u30ff\u4e00-\u9faf]/.test(core) && core === ja)) {
    core = en || ja || vi;
  }
  let coreClean = core
    .replace(/\b(raw|cooked|boiled|fried|steamed|grilled|roasted|baked|dried|canned|fresh|frozen|poached|scrambled|hard[-\s]?boiled)\b/ig, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!coreClean) coreClean = core;
  const foodKey = 'food.' + slug(coreClean).slice(0, 60);
  return {
    foodKey,
    family: 'generic',
    part: null,
    species: null,
    baseVi: vi,
    baseEn: en || vi,
    baseJa: ja || en || vi
  };
}

function buildDisplayNames(cls, prep, f) {
  const prepVi = prep.id !== 'unspecified' ? prep.vi : '';
  const prepEn = prep.id !== 'unspecified' ? prep.en : '';
  const prepJa = prep.id !== 'unspecified' ? prep.ja : '';
  const ja = String(f.nameJa || '');
  const en = String(f.nameEn || '');

  let nameVi = cls.baseVi;
  let nameEn = cls.baseEn;
  let nameJa = cls.baseJa || f.nameJa;

  if (cls.family === 'egg') {
    if (prepVi && cls.part !== 'century' && cls.part !== 'tofu' && cls.part !== 'rolled_omelette') {
      nameVi = `${cls.baseVi} ${prepVi}`.replace(/\s+/g, ' ').trim();
    }
    if (prepEn && cls.part !== 'century' && cls.part !== 'tofu' && cls.part !== 'rolled_omelette') {
      nameEn = `${cls.baseEn}, ${prepEn}`;
    }
    if (f.nameJa && f.nameJa.length > 4) nameJa = f.nameJa;
    // Canned boiled eggs
    if (/水煮缶詰|canned/i.test(ja + en)) {
      nameVi = nameVi.includes('đóng hộp') ? nameVi : `${nameVi} (đóng hộp)`;
      nameEn = /canned/i.test(nameEn) ? nameEn : `${nameEn} (canned)`;
    }
    if (cls.process === 'sweetened' || /加糖/i.test(ja)) {
      if (!/đường|sweetened|có đường/i.test(nameVi)) nameVi = `${cls.baseVi} có đường`;
    }
  } else {
    const collapsed = f.nameVi && f.nameEn && f.nameVi === f.nameEn && String(f.nameVi).length <= 12;
    const genericShort = /^(trứng|egg|thịt bò|muối|cơm trắng|thịt heo|gà|cá)$/i.test(String(f.nameVi || '').trim());
    // Specific JP egg dishes that fell to generic
    if (/たまご豆腐/i.test(ja)) {
      nameVi = 'Đậu hũ trứng'; nameEn = 'Egg tofu'; nameJa = ja;
    } else if (/だし巻きたまご|だし巻き/i.test(ja)) {
      nameVi = 'Trứng cuộn Nhật (dashimaki)'; nameEn = 'Japanese rolled omelette'; nameJa = ja;
    } else if (/ふりかけ/i.test(ja)) {
      nameVi = 'Furikake vị trứng'; nameEn = 'Egg furikake seasoning'; nameJa = ja;
    } else if (genericShort || collapsed) {
      if (f.nameEn && /[,,]/.test(f.nameEn) && f.nameEn.length > 15) {
        nameEn = f.nameEn;
        if (prepVi) nameVi = `${f.nameVi} (${prepVi})`;
        else nameVi = f.nameVi;
      } else if (f.nameJa && f.nameJa !== f.nameVi && f.nameJa.length > 4) {
        if (prepVi) nameVi = `${f.nameVi} · ${prepVi}`;
        nameJa = f.nameJa;
        nameEn = f.nameEn || f.nameJa;
      } else if (prepVi) {
        nameVi = `${f.nameVi} (${prepVi})`;
        nameEn = prepEn ? `${f.nameEn}, ${prepEn}` : f.nameEn;
      } else {
        nameVi = f.nameVi;
        nameEn = f.nameEn;
        nameJa = f.nameJa;
      }
    } else {
      nameVi = f.nameVi;
      nameEn = f.nameEn;
      nameJa = f.nameJa;
    }
  }

  return { nameVi, nameEn, nameJa };
}

function defaultGramsFor(cls, prep) {
  if (cls.family === 'egg' && cls.part === 'whole') return 50;
  if (cls.family === 'egg' && cls.part === 'white') return 33;
  if (cls.family === 'egg' && cls.part === 'yolk') return 17;
  return null;
}

function enrichOne(f) {
  // Re-enrich from original labels when re-running
  const base = {
    id: f.id,
    type: f.type,
    nameVi: (f.originalLabels && f.originalLabels.nameVi) || f.nameVi,
    nameJa: (f.originalLabels && f.originalLabels.nameJa) || f.nameJa,
    nameEn: (f.originalLabels && f.originalLabels.nameEn) || f.nameEn,
    aliases: f.aliases || [],
    category: f.category,
    cuisine: f.cuisine,
    source: f.source,
    sourceId: f.sourceId,
    sourceVersion: f.sourceVersion,
    nutritionPer100g: f.nutritionPer100g
  };
  const blob = [base.nameEn, base.nameJa, base.nameVi, ...(base.aliases || [])].join(' | ');
  const cls = classifyFood(base);
  const prep = detectPrep(blob);
  const names = buildDisplayNames(cls, prep, base);
  const origVi = base.nameVi;
  const origEn = base.nameEn;
  const origJa = base.nameJa;

  const aliases = new Set();
  // Keep only short original-ish aliases (drop previous enrichment noise)
  (base.aliases || []).forEach(function (a) {
    const s = String(a || '').trim();
    if (!s || s.length > 48) return;
    if (/^egg\./.test(s) || /^food\./.test(s)) return;
    aliases.add(s);
  });
  [origVi, origEn, origJa, names.nameVi, names.nameEn, names.nameJa, cls.baseVi, cls.baseEn].forEach((a) => {
    if (a && String(a).trim()) aliases.add(String(a).trim());
  });
  // Accentless helpers for VN search
  if (names.nameVi) {
    const plain = names.nameVi.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (plain !== names.nameVi) aliases.add(plain);
  }
  if (/trứng/i.test(names.nameVi || '') || cls.family === 'egg') {
    aliases.add('trung');
    aliases.add('trứng');
    aliases.add('egg');
    if (prep.id === 'hard_boiled') {
      aliases.add('trung luoc');
      aliases.add('trứng luộc');
      aliases.add('boiled egg');
    }
    if (prep.id === 'fried') {
      aliases.add('trung chien');
      aliases.add('trứng chiên');
      aliases.add('fried egg');
    }
  }

  const grams = defaultGramsFor(cls, prep);
  const out = Object.assign({}, base, {
    nameVi: names.nameVi || base.nameVi,
    nameEn: names.nameEn || base.nameEn,
    nameJa: names.nameJa || base.nameJa,
    aliases: Array.from(aliases).slice(0, 24),
    foodKey: cls.foodKey,
    family: cls.family,
    preparation: prep.id,
    preparationLabel: {
      vi: prep.vi || null,
      en: prep.en || null,
      ja: prep.ja || null
    },
    variantKey: `${cls.foodKey}.${prep.id}`,
    nutritionBasis: 'per_100g',
    provenance: {
      source: base.source || null,
      sourceId: base.sourceId || null,
      sourceVersion: base.sourceVersion || null
    },
    searchPrimary: true,
    duplicateOf: null,
    duplicateGroupId: null
  });
  if (grams) out.defaultGrams = grams;
  out.originalLabels = { nameVi: origVi, nameEn: origEn, nameJa: origJa };
  return out;
}

function markDuplicates(foods) {
  const groups = new Map();
  foods.forEach((f) => {
    const fp = nutritionFingerprint(f.nutritionPer100g);
    const key = `${f.variantKey}::${fp}::${f.nutritionBasis}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });

  let duplicatePairs = 0;
  let demoted = 0;
  groups.forEach((list, key) => {
    if (list.length < 2) return;
    duplicatePairs += list.length - 1;
    // Prefer: descriptive EN name, then USDA, then MEXT, then shorter id
    list.sort((a, b) => {
      const score = (f) => {
        let s = 0;
        if (f.source && String(f.source).includes('USDA')) s += 30;
        if (f.source === 'MEXT') s += 10;
        if (f.nameEn && f.nameEn.length > 20) s += 20;
        if (f.nameVi && f.nameVi.length > 8) s += 10;
        if (f.originalLabels && f.originalLabels.nameVi !== f.nameVi) s += 5;
        return s;
      };
      return score(b) - score(a) || String(a.id).localeCompare(String(b.id));
    });
    const primary = list[0];
    const gid = 'dup_' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
    primary.searchPrimary = true;
    primary.duplicateOf = null;
    primary.duplicateGroupId = gid;
    primary.provenance = primary.provenance || {};
    primary.provenance.alternateSourceIds = list.slice(1).map((x) => ({
      id: x.id,
      source: x.source,
      sourceId: x.sourceId
    }));
    for (let i = 1; i < list.length; i++) {
      list[i].searchPrimary = false;
      list[i].duplicateOf = primary.id;
      list[i].duplicateGroupId = gid;
      demoted++;
    }
  });
  return { duplicatePairs, demoted, multiGroups: [...groups.values()].filter((g) => g.length > 2).length };
}

function main() {
  const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(FOODS_JSON)).digest('hex');
  const foods = JSON.parse(fs.readFileSync(FOODS_JSON, 'utf8'));
  const beforeCount = foods.length;
  const beforeBareEgg = foods.filter((f) => String(f.nameVi).toLowerCase() === 'trứng').length;

  // Snapshot nutrition to assert unchanged
  const nutrBefore = new Map(foods.map((f) => [f.id, JSON.stringify(f.nutritionPer100g)]));

  const enriched = foods.map(enrichOne);
  // Disambiguate identical display names with different nutrition (keep both, clarify label)
  const byName = new Map();
  enriched.forEach((f) => {
    const k = String(f.nameVi || '').toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(f);
  });
  byName.forEach((list) => {
    if (list.length < 2) return;
    const kcals = new Set(list.map((x) => Math.round(Number(x.nutritionPer100g && x.nutritionPer100g.energyKcal) || 0)));
    if (kcals.size < 2) return;
    list.forEach((f) => {
      const ja = String(f.nameJa || '');
      if (/水煮缶詰/i.test(ja) && !/đóng hộp/i.test(f.nameVi)) f.nameVi += ' (đóng hộp)';
      else if (f.source && String(f.source).includes('USDA') && !/· USDA/i.test(f.nameVi)) {
        const peers = list.filter((x) => x.id !== f.id && !/đóng hộp/i.test(x.nameVi || ''));
        if (peers.some((p) => p.source === 'MEXT' && p.nameVi === f.nameVi.replace(/\s*·\s*USDA$/i, ''))) {
          f.nameVi = f.nameVi + ' · USDA';
        } else if (peers.some((p) => p.source === 'MEXT')) {
          f.nameVi = f.nameVi + ' · USDA';
        }
      }
    });
  });
  const dupStats = markDuplicates(enriched);

  // Integrity: nutrition + ids
  enriched.forEach((f) => {
    if (nutrBefore.get(f.id) !== JSON.stringify(f.nutritionPer100g)) {
      throw new Error('Nutrition mutated for ' + f.id);
    }
  });
  if (enriched.length !== beforeCount) throw new Error('Count changed');

  const foodKeys = new Set(enriched.map((f) => f.foodKey));
  const variantKeys = new Set(enriched.map((f) => f.variantKey));
  const withProv = enriched.filter((f) => f.provenance && f.provenance.source && f.provenance.sourceId).length;
  const vnCuisine = enriched.filter((f) => f.cuisine === 'vietnamese').length;
  const afterBareEgg = enriched.filter((f) => String(f.nameVi).toLowerCase() === 'trứng').length;
  const eggFamily = enriched.filter((f) => f.family === 'egg').length;
  const searchPrimary = enriched.filter((f) => f.searchPrimary).length;

  const pending = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  const meta = {
    generatedAt: new Date().toISOString(),
    totalVerified: enriched.length,
    searchPrimary,
    demotedDuplicates: dupStats.demoted,
    duplicateExtraRecords: dupStats.duplicatePairs,
    multiSourceGroups: dupStats.multiGroups,
    canonicalFoodKeys: foodKeys.size,
    variantKeys: variantKeys.size,
    withProvenance: withProv,
    vietnameseCuisineTagged: vnCuisine,
    vietnamesePending: Array.isArray(pending) ? pending.length : 0,
    eggFamilyCount: eggFamily,
    bareTrungNameBefore: beforeBareEgg,
    bareTrungNameAfter: afterBareEgg,
    mext: enriched.filter((f) => f.source === 'MEXT').length,
    usdaSrLegacy: enriched.filter((f) => String(f.source || '').includes('SR')).length,
    usdaFndds: enriched.filter((f) => String(f.source || '').includes('FNDDS')).length,
    foodsWithCalories: enriched.filter((f) => f.nutritionPer100g && f.nutritionPer100g.energyKcal != null).length,
    foodsWithProtein: enriched.filter((f) => f.nutritionPer100g && f.nutritionPer100g.protein != null).length,
    foodsWithFat: enriched.filter((f) => f.nutritionPer100g && f.nutritionPer100g.fat != null).length,
    foodsWithCarbs: enriched.filter((f) => f.nutritionPer100g && f.nutritionPer100g.carbohydrate != null).length,
    duplicatesRemoved: 0,
    invalidRemoved: 0,
    beforeHash,
    enrichment: 'v1_canonical_variant_labels',
    sources: [
      '日本食品標準成分表（八訂）増補2023年 — https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
      'USDA FoodData Central SR Legacy — https://fdc.nal.usda.gov/download-datasets/',
      'USDA FoodData Central FNDDS Survey — https://fdc.nal.usda.gov/download-datasets/'
    ],
    notes: [
      'Nutrition values unchanged from source rows; only labels/metadata enriched.',
      'True same-variant+same-nutrition duplicates demoted via searchPrimary=false (ids kept for logs).',
      'Vietnamese Food Composition Table 2017 remains print-only; pending list unchanged (no invented macros).',
      'Multilingual display names improved from source nameJa/nameEn preparation cues.'
    ]
  };

  // Write foods.json
  fs.writeFileSync(FOODS_JSON, JSON.stringify(enriched));
  const afterHash = crypto.createHash('sha256').update(fs.readFileSync(FOODS_JSON)).digest('hex');
  meta.afterHash = afterHash;

  // Regenerate foods_db.js
  const dbJs =
    '/* AUTO-GENERATED — do not edit. Sources: MEXT 2023, USDA SR Legacy, USDA FNDDS. Enrichment: canonical/variant labels v1. */\n' +
    'window.FOOD_MASTER = ' + JSON.stringify(enriched) + ';\n' +
    'window.FOOD_CATALOG_PENDING = ' + JSON.stringify(pending) + ';\n' +
    'window.FOOD_DB_META = ' + JSON.stringify(meta) + ';\n';
  fs.writeFileSync(FOODS_DB_JS, dbJs);

  fs.writeFileSync(REPORT, JSON.stringify(meta, null, 2));

  // Sync Web if present
  if (fs.existsSync(WEB_FOODS)) {
    fs.copyFileSync(FOODS_JSON, path.join(WEB_FOODS, 'foods.json'));
    fs.copyFileSync(FOODS_DB_JS, path.join(WEB_FOODS, 'foods_db.js'));
    fs.copyFileSync(REPORT, path.join(WEB_FOODS, 'enrichment_report.json'));
    console.log('Synced Web food data');
  }

  console.log(JSON.stringify({
    beforeCount,
    afterCount: enriched.length,
    foodKeys: foodKeys.size,
    variantKeys: variantKeys.size,
    demoted: dupStats.demoted,
    withProv,
    bareTrungBefore: beforeBareEgg,
    bareTrungAfter: afterBareEgg,
    beforeHash,
    afterHash
  }, null, 2));
}

main();
