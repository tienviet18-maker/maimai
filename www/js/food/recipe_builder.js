/**
 * Recipe builder: nutrition of a home-made dish from database ingredients.
 * Every number comes from the ingredients' own sourced per-100 g values; nothing is estimated here.
 * A nutrient is reported only when every ingredient has it (otherwise null, never a silent undercount).
 * cookedWeight (optional) is the dish's weight after cooking; per-100 g values are spread over it,
 * so water lost or absorbed while cooking is reflected without guessing yield factors.
 */
(function (root) {
  'use strict';

  var NUTRIENTS = ['energyKcal', 'protein', 'fat', 'carbohydrate', 'fiber', 'sodium'];
  var DECIMALS = { energyKcal: 0, protein: 1, fat: 1, carbohydrate: 1, fiber: 1, sodium: 0 };

  function round(v, d) {
    var f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  /**
   * @param {Array<{food: {id, nutritionPer100g}, grams: number}>} items
   * @param {number} [cookedWeight]
   */
  function computeRecipe(items, cookedWeight) {
    var list = (items || []).filter(function (it) {
      return it && it.food && Number(it.grams) > 0;
    });
    var rawGrams = list.reduce(function (s, it) { return s + Number(it.grams); }, 0);
    var totals = {};
    NUTRIENTS.forEach(function (k) {
      var sum = 0;
      var complete = list.length > 0;
      list.forEach(function (it) {
        var v = it.food.nutritionPer100g ? it.food.nutritionPer100g[k] : null;
        if (v == null || isNaN(Number(v))) complete = false;
        else sum += Number(v) * Number(it.grams) / 100;
      });
      totals[k] = complete ? sum : null;
    });
    var finalGrams = Number(cookedWeight) > 0 ? Number(cookedWeight) : rawGrams;
    var per100g = {};
    NUTRIENTS.forEach(function (k) {
      per100g[k] = totals[k] == null || !finalGrams ? null : round(totals[k] * 100 / finalGrams, DECIMALS[k]);
      totals[k] = totals[k] == null ? null : round(totals[k], DECIMALS[k]);
    });
    return {
      ok: list.length > 0 && totals.energyKcal != null,
      ingredientCount: list.length,
      rawGrams: round(rawGrams, 0),
      finalGrams: round(finalGrams, 0),
      totals: totals,
      per100g: per100g
    };
  }

  /** Stored on the saved food so the dish can be re-opened and audited. */
  function recipeRecord(items, cookedWeight) {
    return {
      ingredients: (items || []).filter(function (it) { return it && it.food && Number(it.grams) > 0; }).map(function (it) {
        return {
          id: it.food.id,
          name: it.food.nameVi || it.food.name || it.food.nameEn || it.food.id,
          grams: Number(it.grams),
          source: it.food.source || null,
          sourceId: it.food.sourceId || null
        };
      }),
      cookedWeight: Number(cookedWeight) > 0 ? Number(cookedWeight) : null
    };
  }

  var api = { computeRecipe: computeRecipe, recipeRecord: recipeRecord, NUTRIENTS: NUTRIENTS };
  root.MaiMaiRecipe = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
