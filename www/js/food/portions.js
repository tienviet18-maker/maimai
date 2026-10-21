/**
 * Household portions for the food calculator ("1 chén cơm", "1 quả trứng", "1 tô phở").
 * Each portion is only a gram preset: the gram box stays editable and nutrition is always grams x per-100 g.
 * Sources of the gram values:
 *  - food.servings: the dish's own serving (standard recipes, saved recipes)
 *  - RULES below: common reference weights (rice bowl 150 g as in MEXT/JP meal guides; USDA FNDDS
 *    portion weights for egg 50 g, banana 118 g, apple 182 g, cup 240-250 g, tablespoon of oil 13.6 g, sugar 12.5 g).
 */
(function (root) {
  'use strict';

  function plain(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  // [test on "plain vi | accented vi | plain en | ja", portions[]]; first match wins
  var L = function (vi, en, ja) { return { vi: vi, en: en, ja: ja }; };
  var RULES = [
    [/trung cut|quail egg|うずら/, [[L('1 quả', '1 egg', '1個'), 10]]],
    [/trung vit|duck egg|アヒルの卵/, [[L('1 quả', '1 egg', '1個'), 70]]],
    [/^trung ga|egg, whole|鶏卵 全卵/, [[L('1 quả', '1 egg', '1個'), 50]]],
    [/^com\b|cooked rice|rice, white.*cooked|めし/, [[L('1 chén', '1 bowl', '茶碗1杯'), 150], [L('1 đĩa', '1 plate', '1皿'), 250]]],
    [/^chao\b|porridge|congee|かゆ/, [[L('1 tô', '1 bowl', '1杯'), 350]]],
    [/bun\/banh pho|rice noodles, cooked|^bun\b.*da nau/, [[L('1 tô (sợi)', '1 bowl (noodles)', '1杯（麺）'), 200]]],
    [/^banh mi, french|french or vienna/, [[L('1 ổ', '1 loaf', '1本'), 90]]],
    [/^banh mi\b|^bread\b|食パン/, [[L('1 lát', '1 slice', '1枚'), 28]]],
    [/^chuoi|banana/, [[L('1 quả vừa', '1 medium', '中1本'), 118]]],
    [/^tao\b(?! ta)|^apples?,/, [[L('1 quả vừa', '1 medium', '中1個'), 182]]],
    [/^cam\b|^oranges?,/, [[L('1 quả vừa', '1 medium', '中1個'), 140]]],
    [/^sua\b|^milk\b|牛乳|^nuoc ep|juice|^nuoc mia|^nuoc dua|^tra\b|^ca phe|coffee|^tea\b/, [[L('1 ly', '1 glass', 'コップ1杯'), 250]]],
    [/^sua chua|yogurt|ヨーグルト/, [[L('1 hộp', '1 cup', '1個'), 100]]],
    [/^duong\b|^sugars?,/, [[L('1 muỗng canh', '1 tbsp', '大さじ1'), 12.5], [L('1 muỗng cà phê', '1 tsp', '小さじ1'), 4.2]]],
    [/^nuoc mam|fish sauce|^xi dau|^nuoc tuong|soy sauce/, [[L('1 muỗng canh', '1 tbsp', '大さじ1'), 18], [L('1 muỗng cà phê', '1 tsp', '小さじ1'), 6]]],
    // "dầu" (oil) and "đậu" (bean) are both "dau" without accents, so oil is matched on the accented name
    [/\| dầu[ ,]|\| oil,/, [[L('1 muỗng canh', '1 tbsp', '大さじ1'), 13.6], [L('1 muỗng cà phê', '1 tsp', '小さじ1'), 4.5]]],
    [/sua dac|condensed, sweetened/, [[L('1 muỗng canh', '1 tbsp', '大さじ1'), 20]]],
    [/^rau\b|^cai\b|leaves|greens|spinach/, [[L('1 đĩa rau', '1 plate of greens', '1皿'), 100]]]
  ];

  var GENERIC = [50, 100, 150, 200];

  /** @returns {Array<{label:string, grams:number, kind:'serving'|'household'|'grams'}>} */
  function getPortions(food, lang) {
    lang = lang === 'en' || lang === 'ja' ? lang : 'vi';
    var out = [];
    (food && food.servings || []).forEach(function (s) {
      if (s && Number(s.grams) > 0) {
        var lbl = s.label && (s.label[lang] || s.label.vi) || (lang === 'ja' ? '1人前' : lang === 'en' ? '1 serving' : '1 phần');
        out.push({ label: lbl, grams: Math.round(Number(s.grams)), kind: 'serving' });
      }
    });
    if (!out.length && food) {
      var en = food.nameEn || (food.originalLabels && food.originalLabels.nameEn) || '';
      var hay = [plain(food.nameVi), String(food.nameVi || '').toLowerCase(), plain(en), food.nameJa || ''].join(' | ');
      for (var i = 0; i < RULES.length; i++) {
        if (RULES[i][0].test(hay)) {
          RULES[i][1].forEach(function (p) { out.push({ label: p[0][lang], grams: p[1], kind: 'household' }); });
          break;
        }
      }
    }
    GENERIC.forEach(function (g) {
      if (!out.some(function (p) { return p.grams === g; })) out.push({ label: g + ' g', grams: g, kind: 'grams' });
    });
    return out;
  }

  var api = { getPortions: getPortions, RULES: RULES };
  root.MaiMaiPortions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
