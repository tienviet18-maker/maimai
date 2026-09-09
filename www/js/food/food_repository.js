/**
 * MaiMai FoodRepository — commercial food catalog boundary.
 * Uses enriched FOOD_MASTER (foodKey / preparation / searchPrimary).
 * Nutrition always from the selected record's nutritionPer100g.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MaiMaiFoodRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function masterList() {
    return Array.isArray(rootFoodMaster()) ? rootFoodMaster() : [];
  }
  function rootFoodMaster() {
    return (typeof window !== 'undefined' && window.FOOD_MASTER) ||
      (typeof globalThis !== 'undefined' && globalThis.FOOD_MASTER) ||
      [];
  }

  function stripAccents(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function displayName(food, lang) {
    if (!food) return '';
    if (lang === 'ja') return food.nameJa || food.nameEn || food.nameVi || '';
    if (lang === 'en') return food.nameEn || food.nameVi || food.nameJa || '';
    return food.nameVi || food.nameEn || food.nameJa || '';
  }

  function prepLabel(food, lang) {
    var pl = food && food.preparationLabel;
    if (!pl) return '';
    if (lang === 'ja') return pl.ja || pl.en || '';
    if (lang === 'en') return pl.en || '';
    return pl.vi || pl.en || '';
  }

  function subtitle(food, lang) {
    if (!food) return '';
    var parts = [];
    var prep = prepLabel(food, lang);
    if (prep && food.preparation && food.preparation !== 'unspecified') parts.push(prep);
    if (food.nutritionBasis === 'per_100g') parts.push(lang === 'ja' ? '100gあたり' : lang === 'en' ? 'per 100g' : '/100g');
    if (food.source) parts.push(String(food.source));
    if (food.provenance && food.provenance.alternateSourceIds && food.provenance.alternateSourceIds.length) {
      parts.push(lang === 'ja' ? '他ソースあり' : lang === 'en' ? '+alts' : 'có nguồn khác');
    }
    return parts.join(' · ');
  }

  function haystack(food) {
    return stripAccents([
      food.nameVi, food.nameJa, food.nameEn, food.foodKey, food.variantKey,
      food.family, food.preparation
    ].concat(food.aliases || []).filter(Boolean).join(' '));
  }

  function scoreFood(food, qNorm, lang) {
    var nVi = stripAccents(food.nameVi);
    var nEn = stripAccents(food.nameEn);
    var nJa = stripAccents(food.nameJa || '');
    var score = 0;
    if (nVi === qNorm || nEn === qNorm || nJa === qNorm) score += 120;
    else if (nVi.indexOf(qNorm) === 0 || nEn.indexOf(qNorm) === 0 || nJa.indexOf(qNorm) === 0) score += 70;
    else if ((food.aliases || []).some(function (a) { return stripAccents(a) === qNorm; })) score += 55;
    else if (haystack(food).indexOf(qNorm) >= 0) score += 15;
    else return -1;

    if (food.searchPrimary === false) score -= 80;
    if (food.cuisine === 'vietnamese') score += 12;
    if (food.family === 'egg' && /(trung|trứng|egg|卵)/i.test(qNorm + food.nameVi)) score += 8;
    if (food.preparation && food.preparation !== 'unspecified' && qNorm.indexOf(stripAccents(prepLabel(food, 'vi') || prepLabel(food, 'en'))) >= 0) score += 25;
    // Prefer whole chicken egg over yolk/white for bare "trứng"/"egg"
    if (/^(trung|trứng|egg|卵)$/i.test(String(qNorm).trim()) || qNorm === 'trung' || qNorm === 'egg') {
      if (food.foodKey === 'egg.chicken.whole') score += 40;
      if (food.part === 'yolk' || food.family === 'egg' && /yolk|lòng đỏ|卵黄/i.test(food.nameVi + food.nameEn)) score -= 15;
      if (food.foodKey === 'condiment.mayonnaise') score -= 100;
    }
    return score;
  }

  function create(opts) {
    opts = opts || {};
    function getMyFoods() {
      return (opts.getMyFoods && opts.getMyFoods()) || [];
    }
    return {
      displayName: displayName,
      subtitle: subtitle,
      prepLabel: prepLabel,
      search: function (query, limit, lang) {
        limit = limit || 40;
        lang = lang || 'vi';
        var qNorm = stripAccents(String(query || '').trim());
        if (!qNorm) return { master: [], mine: [], groups: [] };
        var scored = [];
        masterList().forEach(function (f) {
          var s = scoreFood(f, qNorm, lang);
          if (s >= 0) scored.push({ f: f, score: s });
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        // Prefer primary; still allow non-primary if query is very specific and few hits
        var primary = scored.filter(function (x) { return x.f.searchPrimary !== false; });
        var use = primary.length >= 5 ? primary : scored;
        var master = use.slice(0, limit).map(function (x) { return x.f; });

        var mine = getMyFoods().filter(function (f) {
          return stripAccents(f.name || '').indexOf(qNorm) >= 0 ||
            ((f.aliases || []).some(function (a) { return stripAccents(a).indexOf(qNorm) >= 0; }));
        }).slice(0, limit);

        var groupMap = {};
        master.forEach(function (f) {
          var gk = f.foodKey || f.id;
          if (!groupMap[gk]) groupMap[gk] = { foodKey: gk, label: displayName(f, lang), items: [] };
          groupMap[gk].items.push(f);
        });
        var groups = Object.keys(groupMap).map(function (k) { return groupMap[k]; });
        return { master: master, mine: mine, groups: groups };
      },
      getById: function (id) {
        var m = masterList().find(function (f) { return f.id === id; });
        if (m) return { food: m, source: 'master' };
        var u = getMyFoods().find(function (f) { return f.id === id; });
        if (u) return { food: u, source: 'user' };
        return null;
      },
      getVariants: function (idOrKey) {
        var hit = this.getById(idOrKey);
        var key = hit ? hit.food.foodKey : idOrKey;
        if (!key) return hit ? [hit.food] : [];
        return masterList().filter(function (f) {
          return f.foodKey === key && f.searchPrimary !== false;
        });
      },
      getServings: function (id) {
        var hit = this.getById(id);
        if (!hit) return [];
        var g = hit.food.defaultGrams || 100;
        return [{ id: 'default', grams: g, label: g + 'g', basis: hit.food.nutritionBasis || 'per_100g' }];
      },
      getNutrition: function (id, grams) {
        var hit = this.getById(id);
        if (!hit || !hit.food.nutritionPer100g) return null;
        var n = hit.food.nutritionPer100g;
        var f = (Number(grams) || 100) / 100;
        return {
          energyKcal: (n.energyKcal || 0) * f,
          protein: (n.protein || 0) * f,
          fat: (n.fat || 0) * f,
          carbohydrate: (n.carbohydrate || 0) * f,
          fiber: (n.fiber || 0) * f,
          sodium: (n.sodium || 0) * f,
          basis: hit.food.nutritionBasis || 'per_100g',
          foodId: hit.food.id,
          variantKey: hit.food.variantKey || null
        };
      },
      getSource: function (id) {
        var hit = this.getById(id);
        return hit ? hit.source : null;
      },
      getProvenance: function (id) {
        var hit = this.getById(id);
        return hit && hit.food ? (hit.food.provenance || null) : null;
      }
    };
  }

  return { create: create, displayName: displayName, subtitle: subtitle };
});
