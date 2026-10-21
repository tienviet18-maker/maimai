/**
 * Cycle-aware eating tips for the Diet tab. General nutrition guidance only (no diagnosis, no "safe days"):
 *  - period: iron-rich foods + vitamin C to absorb non-haem iron (WHO / NIH ODS iron fact sheet)
 *  - luteal: fibre / magnesium foods, less salt and caffeine when bloated (ACOG PMS guidance)
 * Uses pickMaiCycleContext(); phases other than a recorded period are estimates and are labelled as such.
 */
(function (root) {
  'use strict';

  var TIPS = {
    menstrual: { key: 'cycleTipMenstrual', foods: ['ifct_o053', 'usda_sr_168634', 'ifct_r002', 'ifct_c002', 'ifct_e028'] },
    follicular: { key: 'cycleTipFollicular', foods: ['usda_sr_173424', 'usda_sr_175168', 'ifct_a013', 'ifct_b025'] },
    estimated_fertile_window: { key: 'cycleTipFertile', foods: ['ifct_c002', 'ifct_c026', 'ifct_b011', 'ifct_e007'] },
    luteal: { key: 'cycleTipLuteal', foods: ['ifct_f014', 'ifct_h005', 'ifct_h012', 'usda_sr_173944'] }
  };

  /**
   * @param {object} ctx  result of MaiMaiCycleEngine.pickMaiCycleContext
   * @param {object} profile appData.profile
   * @returns {null | {phase, textKey, foods: string[], estimated: boolean}}
   */
  function pickCycleFoodTip(ctx, profile) {
    if (!ctx || (profile && profile.sex && profile.sex !== 'female')) return null;
    var phase = ctx.onPeriod ? 'menstrual' : ctx.phase;
    if (!ctx.onPeriod && !ctx.hasHistory) return null;
    var tip = TIPS[phase];
    if (!tip) return null;
    return { phase: phase, textKey: tip.key, foods: tip.foods.slice(), estimated: !ctx.onPeriod };
  }

  var api = { pickCycleFoodTip: pickCycleFoodTip, TIPS: TIPS };
  root.MaiMaiCycleFoodTips = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
