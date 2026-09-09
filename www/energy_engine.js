/**
 * MaiMai V2 — Personalized Energy / TDEE / Weight Goal Engine
 * Canonical source of truth for daily calorie targets + BMI.
 *
 * Units: kg, cm, years, kcal/day
 * BMR: Mifflin–St Jeor
 * TDEE: BMR × activityFactor (activity already included — do NOT also add
 *        exercise kcal into the daily target pipeline; food diary subtracts
 *        from dailyTarget only).
 *
 * Incomplete profile → ok:false, dailyTarget:null. No silent demo anthropometrics.
 *
 * Exposed as window.MaiMaiEnergyEngine (browser) and module.exports (Node tests).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MaiMaiEnergyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ACTIVITY = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    HIGH: 1.725,
    VERY_HIGH: 1.9
  };

  var GOAL = {
    LOSE: 'LOSE',
    MAINTAIN: 'MAINTAIN',
    GAIN: 'GAIN'
  };

  /** Conservative defaults (kg/week). Not aggressive. */
  var DEFAULT_RATE = {
    LOSE: 0.35,
    GAIN: 0.25
  };

  /** ~7700 kcal ≈ 1 kg body mass (planning heuristic, not medical law). */
  var KCAL_PER_KG = 7700;

  var AGE_MIN = 10;
  var AGE_MAX = 120;
  var ACTIVITY_EPS = 0.0001;

  function round(n) {
    return Math.round(Number(n) || 0);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /**
   * Parse sex. Returns 'male' | 'female' | null (never invents a default).
   */
  function parseSex(sex) {
    if (sex == null || sex === '') return null;
    var s = String(sex).toLowerCase().trim();
    if (s === 'male' || s === 'm' || s === 'nam') return 'male';
    if (s === 'female' || s === 'f' || s === 'nu' || s === 'nữ' || s === 'nữ') return 'female';
    return null;
  }

  /** @deprecated use parseSex — kept for callers; returns null when invalid (no female default). */
  function normalizeSex(sex) {
    return parseSex(sex);
  }

  function isKnownActivityFactor(value) {
    var v = Number(value);
    if (!isFinite(v) || v <= 0) return false;
    var keys = Object.keys(ACTIVITY);
    for (var i = 0; i < keys.length; i++) {
      if (Math.abs(ACTIVITY[keys[i]] - v) <= ACTIVITY_EPS) return true;
    }
    return false;
  }

  /**
   * Snap a known-or-near activity number to the canonical table.
   * Missing/invalid → null (does NOT invent LIGHT for incomplete profiles).
   */
  function resolveActivityFactor(value) {
    if (value == null || value === '') return null;
    var v = Number(value);
    if (!isFinite(v) || v <= 0) return null;
    var keys = Object.keys(ACTIVITY);
    var best = null;
    var bestDiff = Infinity;
    for (var i = 0; i < keys.length; i++) {
      var f = ACTIVITY[keys[i]];
      var d = Math.abs(f - v);
      if (d < bestDiff) {
        bestDiff = d;
        best = f;
      }
    }
    // Accept only if reasonably close to a known factor (typo/float safe).
    if (best == null || bestDiff > 0.05) return null;
    return best;
  }

  function nearestActivityFactor(value) {
    var resolved = resolveActivityFactor(value);
    return resolved != null ? resolved : null;
  }

  function activityKeyFromFactor(factor) {
    var f = Number(factor);
    if (!isFinite(f)) return null;
    var keys = Object.keys(ACTIVITY);
    for (var i = 0; i < keys.length; i++) {
      if (Math.abs(ACTIVITY[keys[i]] - f) <= ACTIVITY_EPS) return keys[i];
    }
    var resolved = resolveActivityFactor(f);
    if (resolved == null) return null;
    for (var j = 0; j < keys.length; j++) {
      if (Math.abs(ACTIVITY[keys[j]] - resolved) <= ACTIVITY_EPS) return keys[j];
    }
    return null;
  }

  function parseAge(ageYears) {
    if (ageYears == null || ageYears === '') return null;
    var a = Number(ageYears);
    if (!isFinite(a) || a <= 0) return null;
    if (a < AGE_MIN || a > AGE_MAX) return null;
    return a;
  }

  function parsePositive(n) {
    if (n == null || n === '') return null;
    var v = Number(n);
    if (!isFinite(v) || !(v > 0)) return null;
    return v;
  }

  function parseGoalType(goal) {
    if (goal === GOAL.LOSE || goal === GOAL.MAINTAIN || goal === GOAL.GAIN) return goal;
    return null;
  }

  /**
   * Mifflin–St Jeor BMR (kcal/day). Requires valid sex — never assumes female.
   * Male:   10w + 6.25h − 5a + 5
   * Female: 10w + 6.25h − 5a − 161
   */
  function computeBmr(weightKg, heightCm, ageYears, sex) {
    var w = parsePositive(weightKg);
    var h = parsePositive(heightCm);
    var a = parseAge(ageYears);
    var sx = parseSex(sex);
    if (w == null || h == null || a == null || sx == null) return null;
    var base = 10 * w + 6.25 * h - 5 * a;
    return sx === 'male' ? base + 5 : base - 161;
  }

  function computeBmi(weightKg, heightCm) {
    var w = parsePositive(weightKg);
    var h = parsePositive(heightCm);
    if (w == null || h == null) return null;
    var m = h / 100;
    return w / (m * m);
  }

  /** Asian-Pacific style bands used by MaiMai product UI. */
  function classifyBmi(bmi) {
    if (bmi == null || !isFinite(Number(bmi))) return null;
    var v = Number(bmi);
    if (v < 18.5) return 'UNDER';
    if (v <= 22.9) return 'NORMAL';
    if (v <= 27.4) return 'OVER';
    return 'OBESE';
  }

  function inferGoalType(currentWeight, targetWeight, explicitGoal) {
    var parsed = parseGoalType(explicitGoal);
    if (parsed) return parsed;
    var c = parsePositive(currentWeight);
    var t = parsePositive(targetWeight);
    if (c == null || t == null) return null;
    if (t < c - 0.05) return GOAL.LOSE;
    if (t > c + 0.05) return GOAL.GAIN;
    return GOAL.MAINTAIN;
  }

  /**
   * Direction check — does not change the user's goal.
   * Returns { ok, code, messageKey } where ok=false means contradictory.
   */
  function validateGoalDirection(goalType, currentWeight, targetWeight) {
    var g = parseGoalType(goalType);
    var c = parsePositive(currentWeight);
    var t = parsePositive(targetWeight);
    if (!g || c == null || t == null) {
      return { ok: false, code: 'INCOMPLETE_GOAL_WEIGHTS', messageKey: 'goalDirectionIncomplete' };
    }
    if (g === GOAL.LOSE && !(t < c - 0.05)) {
      return { ok: false, code: 'LOSE_TARGET_NOT_BELOW', messageKey: 'goalDirectionLoseMismatch' };
    }
    if (g === GOAL.GAIN && !(t > c + 0.05)) {
      return { ok: false, code: 'GAIN_TARGET_NOT_ABOVE', messageKey: 'goalDirectionGainMismatch' };
    }
    if (g === GOAL.MAINTAIN && Math.abs(t - c) > 2) {
      return { ok: false, code: 'MAINTAIN_TARGET_FAR', messageKey: 'goalDirectionMaintainMismatch' };
    }
    return { ok: true, code: null, messageKey: null };
  }

  function validateProfileForEnergy(profile) {
    var p = profile || {};
    var errors = [];
    var weight = parsePositive(p.currentWeight);
    var height = parsePositive(p.height);
    var age = parseAge(p.age);
    var sex = parseSex(p.sex);
    var activityFactor = resolveActivityFactor(p.activityLevel);
    var goalType = parseGoalType(p.goalType);
    var targetWeight = parsePositive(p.targetWeight);

    if (sex == null) errors.push('MISSING_SEX');
    if (age == null) errors.push('MISSING_OR_INVALID_AGE');
    if (height == null) errors.push('MISSING_OR_INVALID_HEIGHT');
    if (weight == null) errors.push('MISSING_OR_INVALID_WEIGHT');
    if (goalType == null) errors.push('MISSING_OR_INVALID_GOAL');
    if (targetWeight == null) errors.push('MISSING_OR_INVALID_TARGET_WEIGHT');
    if (activityFactor == null) errors.push('MISSING_OR_INVALID_ACTIVITY');

    return {
      ok: errors.length === 0,
      errors: errors,
      weight: weight,
      height: height,
      age: age,
      sex: sex,
      activityFactor: activityFactor,
      goalType: goalType,
      targetWeight: targetWeight
    };
  }

  function invalidPlan(errors, partial) {
    partial = partial || {};
    return {
      ok: false,
      error: errors && errors.length ? errors[0] : 'INVALID_PROFILE',
      errors: errors || ['INVALID_PROFILE'],
      warnings: errors || ['INVALID_PROFILE'],
      bmr: null,
      tdee: null,
      dailyTarget: null,
      goalType: partial.goalType || null,
      activityFactor: partial.activityFactor != null ? partial.activityFactor : null,
      activityKey: partial.activityFactor != null ? activityKeyFromFactor(partial.activityFactor) : null,
      bmi: partial.bmi != null ? partial.bmi : null,
      bmiClass: partial.bmi != null ? classifyBmi(partial.bmi) : null,
      adjustment: 0,
      macros: null,
      exercisePolicy: 'ACTIVITY_IN_TDEE_NO_DOUBLE_COUNT',
      goalDirection: partial.goalDirection || null
    };
  }

  function adjustmentFromRate(goalType, desiredRateKgPerWeek) {
    if (goalType === GOAL.MAINTAIN) return 0;
    var rate = Number(desiredRateKgPerWeek);
    if (!(rate > 0)) {
      rate = goalType === GOAL.GAIN ? DEFAULT_RATE.GAIN : DEFAULT_RATE.LOSE;
    }
    rate = clamp(rate, 0.1, 0.7);
    var daily = (rate * KCAL_PER_KG) / 7;
    return goalType === GOAL.GAIN ? daily : -daily;
  }

  /**
   * Build full personalized energy plan from a user profile-like object.
   * Incomplete / invalid inputs → ok:false (no invented defaults).
   */
  function computeEnergyPlan(profile) {
    var v = validateProfileForEnergy(profile);
    var bmiRaw = (v.weight != null && v.height != null) ? computeBmi(v.weight, v.height) : null;
    var bmiRounded = bmiRaw != null ? Math.round(bmiRaw * 10) / 10 : null;

    if (!v.ok) {
      return invalidPlan(v.errors, {
        goalType: v.goalType,
        activityFactor: v.activityFactor,
        bmi: bmiRounded
      });
    }

    var weight = v.weight;
    var height = v.height;
    var age = v.age;
    var sex = v.sex;
    var activityFactor = v.activityFactor;
    var goalType = v.goalType;
    var desiredRate = profile && profile.desiredRateKgPerWeek;
    var warnings = [];
    var goalDirection = validateGoalDirection(goalType, weight, v.targetWeight);
    if (!goalDirection.ok) {
      warnings.push(goalDirection.code);
    }

    var bmr = computeBmr(weight, height, age, sex);
    if (bmr == null) {
      return invalidPlan(['INVALID_ANTHROPOMETRICS'], { goalType: goalType, activityFactor: activityFactor, bmi: bmiRounded, goalDirection: goalDirection });
    }

    if (age < 18) {
      warnings.push('UNDERAGE_ADULT_FORMULA');
    }

    var tdee = bmr * activityFactor;
    var rawAdj = adjustmentFromRate(goalType, desiredRate);

    var maxDeficit = Math.min(tdee * 0.2, 500);
    var maxSurplus = Math.min(tdee * 0.15, 400);
    var floor = Math.max(bmr * 1.1, tdee * 0.75);

    if (bmiRaw != null && bmiRaw < 18.5 && goalType === GOAL.LOSE) {
      warnings.push('UNDERWEIGHT_LOSE_NOT_RECOMMENDED');
      rawAdj = Math.max(rawAdj, -150);
    }

    var adjustment = rawAdj;
    if (adjustment < 0) adjustment = Math.max(adjustment, -maxDeficit);
    if (adjustment > 0) adjustment = Math.min(adjustment, maxSurplus);

    var dailyTarget = tdee + adjustment;
    if (goalType === GOAL.LOSE && dailyTarget < floor) {
      warnings.push('LOW_CALORIE_CLAMPED');
      dailyTarget = floor;
      adjustment = dailyTarget - tdee;
    }

    dailyTarget = round(dailyTarget);
    return {
      ok: true,
      error: null,
      errors: [],
      bmr: round(bmr),
      tdee: round(tdee),
      activityFactor: activityFactor,
      activityKey: activityKeyFromFactor(activityFactor),
      goalType: goalType,
      adjustment: round(adjustment),
      dailyTarget: dailyTarget,
      bmi: bmiRounded,
      bmiClass: classifyBmi(bmiRounded),
      desiredRateKgPerWeek: desiredRate != null && desiredRate > 0
        ? Number(desiredRate)
        : (goalType === GOAL.MAINTAIN ? 0 : (goalType === GOAL.GAIN ? DEFAULT_RATE.GAIN : DEFAULT_RATE.LOSE)),
      warnings: warnings,
      exercisePolicy: 'ACTIVITY_IN_TDEE_NO_DOUBLE_COUNT',
      macros: computeMacroTargets(dailyTarget, goalType),
      goalDirection: goalDirection
    };
  }

  function computeMacroTargets(dailyTargetKcal, goalType) {
    var kcal = Number(dailyTargetKcal);
    if (!(kcal > 0)) return null;
    var splits =
      goalType === GOAL.LOSE ? { p: 0.3, f: 0.3, c: 0.4 } :
      goalType === GOAL.GAIN ? { p: 0.25, f: 0.25, c: 0.5 } :
      { p: 0.25, f: 0.3, c: 0.45 };

    var pKcal = Math.round(kcal * splits.p);
    var fKcal = Math.round(kcal * splits.f);
    var cKcal = kcal - pKcal - fKcal;
    return {
      proteinG: Math.round(pKcal / 4),
      fatG: Math.round(fKcal / 9),
      carbG: Math.round(cKcal / 4),
      proteinKcal: pKcal,
      fatKcal: fKcal,
      carbKcal: cKcal,
      totalKcal: pKcal + fKcal + cKcal
    };
  }

  /**
   * Migrate legacy profile fields → V2 derived snapshot.
   * Does NOT invent anthropometrics. Incomplete profiles are left without fake targets.
   */
  function migrateProfile(profile) {
    var p = Object.assign({}, profile || {});
    var changed = false;

    if (!parseGoalType(p.goalType)) {
      var inferred = inferGoalType(p.currentWeight, p.targetWeight, null);
      if (inferred) {
        p.goalType = inferred;
        changed = true;
      }
    }

    if (p.activityLevel != null && p.activityLevel !== '') {
      var resolvedAct = resolveActivityFactor(p.activityLevel);
      if (resolvedAct != null && resolvedAct !== Number(p.activityLevel)) {
        p.activityLevel = resolvedAct;
        changed = true;
      }
    }

    if (p.desiredRateKgPerWeek == null && parseGoalType(p.goalType)) {
      p.desiredRateKgPerWeek = p.goalType === GOAL.MAINTAIN ? 0 :
        (p.goalType === GOAL.GAIN ? DEFAULT_RATE.GAIN : DEFAULT_RATE.LOSE);
      changed = true;
    }

    var plan = computeEnergyPlan(p);
    if (plan.ok) {
      if (p.targetCalo !== plan.dailyTarget) {
        p.targetCalo = plan.dailyTarget;
        changed = true;
      }
      p.lastEnergyPlan = {
        bmr: plan.bmr,
        tdee: plan.tdee,
        adjustment: plan.adjustment,
        dailyTarget: plan.dailyTarget,
        goalType: plan.goalType,
        activityKey: plan.activityKey,
        bmi: plan.bmi,
        warnings: plan.warnings,
        computedAt: new Date().toISOString()
      };
    } else if (p.targetCalo != null && !plan.ok) {
      // Do not keep inventing targets; clear derived cache when profile cannot plan.
      // Only clear if profile looks incomplete (isSetup false handled by caller).
    }

    return { profile: p, plan: plan, changed: changed };
  }

  /** Canonical daily target — null when profile cannot produce a valid plan. Never demo bodies. */
  function getCanonicalDailyTarget(profile) {
    var plan = computeEnergyPlan(profile);
    if (plan.ok) return plan.dailyTarget;
    return null;
  }

  return {
    ACTIVITY: ACTIVITY,
    GOAL: GOAL,
    DEFAULT_RATE: DEFAULT_RATE,
    KCAL_PER_KG: KCAL_PER_KG,
    AGE_MIN: AGE_MIN,
    AGE_MAX: AGE_MAX,
    computeBmr: computeBmr,
    computeBmi: computeBmi,
    classifyBmi: classifyBmi,
    computeEnergyPlan: computeEnergyPlan,
    computeMacroTargets: computeMacroTargets,
    migrateProfile: migrateProfile,
    getCanonicalDailyTarget: getCanonicalDailyTarget,
    nearestActivityFactor: nearestActivityFactor,
    resolveActivityFactor: resolveActivityFactor,
    activityKeyFromFactor: activityKeyFromFactor,
    inferGoalType: inferGoalType,
    normalizeSex: normalizeSex,
    parseSex: parseSex,
    parseAge: parseAge,
    validateProfileForEnergy: validateProfileForEnergy,
    validateGoalDirection: validateGoalDirection,
    isKnownActivityFactor: isKnownActivityFactor
  };
});
