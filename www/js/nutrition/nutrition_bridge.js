/**
 * Nutrition bridge — read-only accessors for Cycle Intelligence (Phase 2).
 * Does NOT alter Energy Engine formulas.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MaiMaiNutritionBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getEnergyEngine() {
    return (typeof window !== 'undefined' && window.MaiMaiEnergyEngine) ||
      (typeof globalThis !== 'undefined' && globalThis.MaiMaiEnergyEngine) ||
      null;
  }

  function dayEnergyKcal(appData, dateStr) {
    var rec = (appData.dailyRecords || {})[dateStr];
    var logs = (rec && rec.foodLogs) || [];
    return logs.reduce(function (s, l) {
      return s + ((l.nutritionSnapshot && l.nutritionSnapshot.energyKcal) || 0);
    }, 0);
  }

  return {
    getEnergyEngine: getEnergyEngine,
    dayEnergyKcal: dayEnergyKcal,
    /** Boundary only — cycle engine owns getNutritionAroundCycle */
    getNutritionAroundCycle: function (appData, cycleStart, windowDays, deps) {
      var eng = (typeof window !== 'undefined' && window.MaiMaiCycleEngine) || null;
      if (eng && eng.getNutritionAroundCycle) return eng.getNutritionAroundCycle(appData, cycleStart, windowDays, deps);
      return [];
    }
  };
});
