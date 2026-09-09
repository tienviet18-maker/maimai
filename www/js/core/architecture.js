/**
 * Phase 0 architecture map — documentation boundary (no runtime rewrite).
 * Modules:
 *  js/core/     — shared helpers (date keys remain primary in index for now)
 *  js/cycle/    — MaiMaiCycleEngine (Phase 1)
 *  js/nutrition/— Energy Engine bridge (read-only)
 *  js/food/     — FoodRepository over FOOD_MASTER
 *  js/analytics/— reserved for Phase 2 Cycle Intelligence
 *  js/storage/  — schema markers; saveState stays single-writer in index
 *  js/ui/       — reserved; UI still owned by index.html
 */
(function (root) {
  root.MaiMaiArchitecture = {
    phase: 1,
    sourceOfTruth: 'MAIMAI_ANDROID/www',
    storeKey: 'maimai_app_store_v2',
    modules: ['core', 'cycle', 'nutrition', 'food', 'analytics', 'storage', 'ui']
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
