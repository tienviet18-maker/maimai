/**
 * MaiMai Supabase hybrid sync (offline-first).
 * LocalStorage remains UI source of truth; this module pushes to Supabase in background.
 * Failures never break the UI, but are surfaced via console.warn + return payloads
 * (so queue stalls are diagnosable). Use window.forceSyncToSupabase() from DevTools.
 */
(function (root) {
  'use strict';

  var SYNC_QUEUE_KEY = 'maimai_supabase_sync_queue_v1';
  var pendingDates = Object.create(null);
  var syncTimer = null;
  var authPromise = null;
  var lastUserId = null;
  var lastFlushResult = null;
  var flushing = false;
  var fallbackLocalMode = false;
  var lastAuthDebug = null;

  function debug() {
    try {
      if (root.console && console.debug) {
        console.debug.apply(console, ['[MaiMaiSupabaseSync]'].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  function warn() {
    try {
      if (root.console && console.warn) {
        console.warn.apply(console, ['[MaiMaiSupabaseSync]'].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  function info() {
    try {
      if (root.console && console.info) {
        console.info.apply(console, ['[MaiMaiSupabaseSync]'].concat([].slice.call(arguments)));
      }
    } catch (e) { /* ignore */ }
  }

  function errMsg(e) {
    if (!e) return 'unknown';
    if (typeof e === 'string') return e;
    return e.message || e.error_description || e.msg || JSON.stringify(e);
  }

  function isJwt(token) {
    if (root.MaiMaiSupabase && typeof root.MaiMaiSupabase.isLikelyJwt === 'function') {
      return root.MaiMaiSupabase.isLikelyJwt(token);
    }
    return typeof token === 'string' && token.split('.').length === 3;
  }

  function decodeJwtPayload(token) {
    try {
      if (!isJwt(token)) return null;
      var part = token.split('.')[1];
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = root.atob(b64);
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function maskToken(token) {
    if (!token || typeof token !== 'string') return null;
    if (token.length <= 24) return token.slice(0, 6) + '…';
    return token.slice(0, 16) + '…' + token.slice(-12) + ' (len=' + token.length + ')';
  }

  function isUnauthorizedOrNetwork(error) {
    if (!error) return false;
    var status = error.status || error.statusCode || error.code;
    if (status === 401 || status === 403 || status === '401' || status === '403') return true;
    if (status === 'PGRST301') return true;
    var msg = String(error.message || error.details || error || '');
    if (/401|unauthorized|invalid jwt|jwt/i.test(msg)) return true;
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) return true;
    if (error.name === 'TypeError' && /fetch/i.test(msg)) return true;
    return false;
  }

  function activateLocalFallback(reason, error, extra) {
    fallbackLocalMode = true;
    var payload = {
      fallbackLocal: true,
      reason: reason,
      error: serializeError(error),
      extra: extra || null,
      tip: 'App keeps using localStorage (maimai_app_store_v2). Sync will retry later.'
    };
    warn('LOCAL FALLBACK active — cloud sync deferred', payload);
    try {
      console.warn('[MaiMaiSupabaseSync] LOCAL FALLBACK JSON =', JSON.stringify(payload, null, 2));
    } catch (e) { /* ignore */ }
    return payload;
  }

  /** Full Supabase / PostgREST error dump for Console (not just message). */
  function dumpError(label, error, extra) {
    var full = serializeError(error);
    try {
      console.warn('[MaiMaiSupabaseSync]', label, full, extra || null);
      console.warn('[MaiMaiSupabaseSync]', label + ' JSON =', JSON.stringify(full, null, 2));
    } catch (e) {
      console.warn('[MaiMaiSupabaseSync]', label, error, extra || null);
    }
    return full;
  }

  function serializeError(error) {
    if (error == null) return null;
    if (typeof error === 'string') return { message: error };
    var out = {
      message: error.message || null,
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      status: error.status || error.statusCode || null,
      name: error.name || null
    };
    try {
      Object.keys(error).forEach(function (k) {
        if (!(k in out)) {
          try {
            out[k] = error[k];
          } catch (e) {
            out[k] = '[unreadable]';
          }
        }
      });
    } catch (e2) { /* ignore */ }
    try {
      out.__stringTag = String(error);
    } catch (e3) { /* ignore */ }
    return out;
  }

  /** Columns the app sends to daily_metrics (must match SQL schema). */
  var DAILY_METRICS_PAYLOAD_COLUMNS = ['user_id', 'date', 'weight', 'water_ml', 'sleep_hours'];

  function getClient() {
    try {
      return root.MaiMaiSupabase && root.MaiMaiSupabase.isReady()
        ? root.MaiMaiSupabase.getClient()
        : null;
    } catch (e) {
      return null;
    }
  }

  function loadQueue() {
    try {
      var raw = root.localStorage.getItem(SYNC_QUEUE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return;
      arr.forEach(function (d) {
        if (d) pendingDates[String(d)] = true;
      });
    } catch (e) {
      warn('load_queue_failed', errMsg(e));
    }
  }

  function saveQueue() {
    try {
      root.localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(Object.keys(pendingDates)));
    } catch (e) {
      warn('save_queue_failed', errMsg(e));
    }
  }

  function getPendingDates() {
    return Object.keys(pendingDates);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toYmdDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoTodayYmd() {
    return new Date().toISOString().split('T')[0];
  }

  function isBadDateInput(v) {
    if (v == null) return true;
    var s = String(v).trim();
    return !s || s === 'null' || s === 'undefined' || s === 'Invalid Date';
  }

  /**
   * Resolve local app date in YYYY-MM-DD without relying on root.TODAY_STR.
   * Prefer app global helpers when available to preserve existing date semantics.
   */
  function resolveDateStr(dateStr) {
    if (!isBadDateInput(dateStr)) return String(dateStr).trim();
    try {
      if (typeof root.getLocalDateStr === 'function') {
        var localDate = String(root.getLocalDateStr());
        if (!isBadDateInput(localDate)) return localDate.trim();
      }
    } catch (e) { /* ignore */ }
    try {
      if (!isBadDateInput(root.TODAY_STR)) return String(root.TODAY_STR).trim();
    } catch (e2) { /* ignore */ }
    // Explicit fallback requested: new Date().toISOString().split('T')[0]
    return isoTodayYmd();
  }

  async function resolveUserId(explicitUserId) {
    if (explicitUserId && String(explicitUserId).trim()) return String(explicitUserId).trim();
    var user = await ensureAnonymousSession();
    if (user && user.id) return String(user.id);
    if (lastUserId) return String(lastUserId);
    return null;
  }

  function enqueueDate(dateStr, opts) {
    opts = opts || {};
    var normalizedDate = resolveDateStr(dateStr);
    if (!normalizedDate) return;
    pendingDates[String(normalizedDate)] = true;
    saveQueue();
    if (opts.immediate) {
      return flushQueue();
    }
    scheduleFlush(opts.delayMs != null ? opts.delayMs : 400);
    return Promise.resolve({ ok: true, queued: true, date: String(normalizedDate) });
  }

  function scheduleFlush(delayMs) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncTimer = null;
      flushQueue().then(function (res) {
        if (res && !res.ok) warn('scheduled_flush_failed', res);
        else if (res && res.failed && res.failed.length) warn('scheduled_flush_partial', res);
        else debug('scheduled_flush_ok', res);
      }).catch(function (e) {
        warn('scheduled_flush_exception', errMsg(e));
      });
    }, delayMs == null ? 500 : delayMs);
  }

  function dayCalories(appData, dateStr) {
    try {
      var rec = (appData.dailyRecords && appData.dailyRecords[dateStr]) || {};
      var logs = rec.foodLogs || [];
      return logs.reduce(function (sum, l) {
        return sum + ((l.nutritionSnapshot && l.nutritionSnapshot.energyKcal) || 0);
      }, 0);
    } catch (e) {
      return 0;
    }
  }

  function dayMacro(appData, dateStr, key) {
    try {
      var rec = (appData.dailyRecords && appData.dailyRecords[dateStr]) || {};
      var logs = rec.foodLogs || [];
      var total = logs.reduce(function (sum, l) {
        var n = (l && l.nutritionSnapshot) || {};
        var v = n[key];
        return sum + (v != null && !isNaN(Number(v)) ? Number(v) : 0);
      }, 0);
      return Math.round(total * 10) / 10;
    } catch (e) {
      return null;
    }
  }

  function weightForDate(appData, dateStr) {
    try {
      var logs = (appData && appData.weightLogs) || [];
      for (var i = 0; i < logs.length; i++) {
        if (String(logs[i].date) === String(dateStr) && logs[i].weight != null) {
          return Number(logs[i].weight);
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  async function getAuthTokenDebug() {
    var client = getClient();
    var cfg =
      root.MaiMaiSupabase && root.MaiMaiSupabase.getConfig
        ? root.MaiMaiSupabase.getConfig()
        : root.__MAIMAI_SUPABASE__ || {};
    var cached =
      root.MaiMaiSupabase && root.MaiMaiSupabase.getCachedAccessToken
        ? root.MaiMaiSupabase.getCachedAccessToken()
        : null;
    var session = null;
    var sessionErr = null;
    if (client) {
      try {
        var res = await client.auth.getSession();
        sessionErr = res && res.error ? serializeError(res.error) : null;
        session = res && res.data && res.data.session;
      } catch (e) {
        sessionErr = serializeError(e);
      }
    }
    var accessToken = (session && session.access_token) || cached || null;
    var payload = decodeJwtPayload(accessToken);
    var apiKey = cfg.anonKey || cfg.anon_key || '';
    var debugInfo = {
      hasClient: !!client,
      apiKeyKind: apiKey
        ? isJwt(apiKey)
          ? 'legacy_anon_jwt'
          : apiKey.indexOf('sb_publishable_') === 0
            ? 'publishable_non_jwt'
            : 'other'
        : 'missing',
      apiKeyMasked: maskToken(apiKey),
      apiKeyIsJwt: isJwt(apiKey),
      hasSession: !!session,
      userId: (session && session.user && session.user.id) || lastUserId,
      isAnonymous: !!(session && session.user && (session.user.is_anonymous || session.user.isAnonymous)),
      accessTokenPresent: !!accessToken,
      accessTokenIsJwt: isJwt(accessToken),
      accessTokenMasked: maskToken(accessToken),
      /** Full token for Console diagnosis (do not share publicly). */
      accessTokenFull: accessToken || null,
      accessTokenClaims: payload
        ? {
            sub: payload.sub || null,
            role: payload.role || null,
            aal: payload.aal || null,
            session_id: payload.session_id || null,
            is_anonymous: payload.is_anonymous != null ? payload.is_anonymous : null,
            exp: payload.exp || null,
            iss: payload.iss || null
          }
        : null,
      authorizationHeaderWouldBe: accessToken && isJwt(accessToken)
        ? 'Bearer <access_token JWT>'
        : apiKey && isJwt(apiKey)
          ? 'Bearer <legacy anon JWT>'
          : '(none — publishable key must NOT be used as Bearer)',
      apikeyHeaderWouldBe: maskToken(apiKey),
      sessionError: sessionErr,
      warning401:
        apiKey && !isJwt(apiKey) && !(accessToken && isJwt(accessToken))
          ? 'Publishable key is not a JWT. REST will 401 until anonymous session access_token exists.'
          : null
    };
    lastAuthDebug = debugInfo;
    return debugInfo;
  }

  async function ensureAnonymousSession() {
    var client = getClient();
    if (!client) return null;
    if (authPromise) return authPromise;

    authPromise = (async function () {
      try {
        var sessionRes = await client.auth.getSession();
        if (sessionRes && sessionRes.error) {
          dumpError('get_session_error FULL', sessionRes.error);
        }
        var session = sessionRes && sessionRes.data && sessionRes.data.session;
        if (session && session.user && session.access_token && isJwt(session.access_token)) {
          lastUserId = session.user.id;
          if (root.MaiMaiSupabase && root.MaiMaiSupabase.setCachedAccessToken) {
            root.MaiMaiSupabase.setCachedAccessToken(session.access_token);
          }
          debug('session_restored', lastUserId);
          return session.user;
        }

        info('No valid JWT session — calling signInAnonymously()…');
        var signed = await client.auth.signInAnonymously();
        if (signed.error) {
          dumpError(
            'anonymous_sign_in_failed FULL error — enable Anonymous in Auth → Providers',
            signed.error
          );
          activateLocalFallback('anonymous_sign_in_failed', signed.error);
          return null;
        }

        session = signed.data && signed.data.session;
        var user = signed.data && signed.data.user;

        // Explicitly persist session so subsequent REST calls attach Authorization JWT
        if (session && session.access_token && session.refresh_token) {
          try {
            var setRes = await client.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token
            });
            if (setRes.error) {
              dumpError('setSession_failed FULL', setRes.error);
            } else if (setRes.data && setRes.data.session) {
              session = setRes.data.session;
              user = setRes.data.user || user;
            }
          } catch (setErr) {
            dumpError('setSession_exception FULL', setErr);
          }
        }

        if (session && session.access_token && isJwt(session.access_token)) {
          if (root.MaiMaiSupabase && root.MaiMaiSupabase.setCachedAccessToken) {
            root.MaiMaiSupabase.setCachedAccessToken(session.access_token);
          }
        } else {
          warn('anonymous_sign_in produced user without JWT access_token', {
            hasSession: !!session,
            hasUser: !!user,
            tokenMasked: maskToken(session && session.access_token)
          });
          activateLocalFallback('no_access_token_after_anonymous', {
            message: 'signInAnonymously returned no JWT access_token'
          });
        }

        if (user) {
          lastUserId = user.id;
          info('anonymous_signed_in', lastUserId, {
            accessTokenIsJwt: !!(session && isJwt(session.access_token)),
            accessTokenMasked: maskToken(session && session.access_token)
          });
        } else {
          warn('anonymous_sign_in_empty_user');
        }
        return user || null;
      } catch (e) {
        dumpError('anonymous_sign_in_exception FULL', e);
        activateLocalFallback('anonymous_sign_in_exception', e);
        return null;
      } finally {
        if (!lastUserId) authPromise = null;
      }
    })();

    return authPromise;
  }

  async function ensureUserProfile(user, appData) {
    var client = getClient();
    if (!client || !user) return { ok: false, error: 'no_client_or_user' };
    try {
      var display =
        (appData && appData.profile && appData.profile.userName) || null;
      var target =
        appData && appData.profile && appData.profile.targetWeight != null
          ? Number(appData.profile.targetWeight)
          : null;
      var res = await client.from('users').upsert(
        {
          id: user.id,
          display_name: display,
          target_weight: target != null && !isNaN(target) ? target : null
        },
        { onConflict: 'id' }
      );
      if (res.error) {
        var fullUser = dumpError('users_upsert_failed FULL error', res.error, {
          userId: user.id
        });
        if (isUnauthorizedOrNetwork(res.error)) {
          activateLocalFallback('users_upsert_401_or_network', res.error);
        }
        return {
          ok: false,
          error: errMsg(res.error),
          errorFull: fullUser,
          fallbackLocal: isUnauthorizedOrNetwork(res.error)
        };
      }
      return { ok: true };
    } catch (e) {
      var fullUserEx = dumpError('users_upsert_exception FULL error', e);
      if (isUnauthorizedOrNetwork(e)) activateLocalFallback('users_upsert_exception', e);
      return {
        ok: false,
        error: errMsg(e),
        errorFull: fullUserEx,
        fallbackLocal: isUnauthorizedOrNetwork(e)
      };
    }
  }

  async function upsertDailyMetrics(userId, appData, dateStr) {
    var client = getClient();
    var resolvedUserId = await resolveUserId(userId);
    var resolvedDateStr = resolveDateStr(dateStr);
    if (isBadDateInput(resolvedDateStr)) {
      resolvedDateStr = isoTodayYmd();
    }
    if (!client || !resolvedUserId || !resolvedDateStr) {
      return {
        ok: false,
        error: 'missing_client_user_or_date',
        debug: {
          hasClient: !!client,
          userId: resolvedUserId,
          dateStr: resolvedDateStr
        }
      };
    }
    try {
      // Re-assert JWT is cached before REST
      await ensureAnonymousSession();
      var tokenDbg = await getAuthTokenDebug();
      if (!tokenDbg.accessTokenIsJwt) {
        var noJwt = activateLocalFallback('upsert_blocked_no_jwt', {
          message: 'No access_token JWT — refusing REST call to avoid 401',
          authDebug: tokenDbg
        });
        return {
          ok: false,
          error: 'no_access_token_jwt',
          errorFull: noJwt,
          fallbackLocal: true,
          authDebug: tokenDbg
        };
      }

      var safeAppData = appData || {};
      var day = (safeAppData.dailyRecords && safeAppData.dailyRecords[resolvedDateStr]) || {};
      var water = Math.max(0, Math.round(Number(day.waterMl) || 0));
      var sleepMin = day.sleepMinutes;
      var sleepHoursRaw =
        sleepMin != null && sleepMin !== ''
          ? Math.round((Number(sleepMin) / 60) * 100) / 100
          : null;
      var sleepHours = Number.isFinite(sleepHoursRaw) ? sleepHoursRaw : null;
      var wLog = weightForDate(safeAppData, resolvedDateStr);
      if (wLog == null && safeAppData.profile && String(resolvedDateStr) === String(resolveDateStr())) {
        var cw = safeAppData.profile.currentWeight;
        if (cw != null && !isNaN(Number(cw))) wLog = Number(cw);
      }
      var safeWeight = Number.isFinite(Number(wLog)) ? Number(wLog) : null;

      var row = {
        user_id: resolvedUserId,
        date: resolvedDateStr,
        water_ml: water,
        sleep_hours: sleepHours,
        weight: safeWeight
      };

      console.info('[MaiMaiSupabaseSync] daily_metrics UPSERT payload', {
        expectedColumns: DAILY_METRICS_PAYLOAD_COLUMNS,
        row: row,
        auth: {
          accessTokenMasked: tokenDbg.accessTokenMasked,
          accessTokenIsJwt: tokenDbg.accessTokenIsJwt,
          apiKeyKind: tokenDbg.apiKeyKind
        }
      });

      var res = await client
        .from('daily_metrics')
        .upsert(row, { onConflict: 'user_id,date' })
        .select('*')
        .maybeSingle();

      if (res.error) {
        var full = dumpError('daily_metrics_upsert_failed FULL error', res.error, {
          dateStr: resolvedDateStr,
          row: row,
          expectedColumns: DAILY_METRICS_PAYLOAD_COLUMNS,
          authDebug: tokenDbg,
          tip:
            'PGRST204=column mismatch | 23503=FK users | 401/PGRST301=JWT/apikey | network=offline'
        });
        if (isUnauthorizedOrNetwork(res.error)) {
          activateLocalFallback('daily_metrics_401_or_network', res.error, { dateStr: dateStr, row: row });
        }
        return {
          ok: false,
          error: errMsg(res.error),
          errorFull: full,
          row: row,
          fallbackLocal: isUnauthorizedOrNetwork(res.error)
        };
      }

      fallbackLocalMode = false;
      console.info('[MaiMaiSupabaseSync] daily_metrics UPSERT OK — returned row', res.data);
      return { ok: true, row: row, saved: res.data };
    } catch (e) {
      var fullEx = dumpError('daily_metrics_exception FULL error', e, { dateStr: resolvedDateStr });
      if (isUnauthorizedOrNetwork(e)) {
        activateLocalFallback('daily_metrics_exception', e, { dateStr: resolvedDateStr });
      }
      return {
        ok: false,
        error: errMsg(e),
        errorFull: fullEx,
        fallbackLocal: isUnauthorizedOrNetwork(e)
      };
    }
  }

  async function upsertNutrition(userId, appData, dateStr) {
    var client = getClient();
    var resolvedUserId = await resolveUserId(userId);
    var resolvedDateStr = resolveDateStr(dateStr);
    if (!client || !resolvedUserId || !resolvedDateStr) {
      return {
        ok: false,
        error: 'missing_client_user_or_date',
        debug: {
          hasClient: !!client,
          userId: resolvedUserId,
          dateStr: resolvedDateStr
        }
      };
    }
    try {
      var row = {
        user_id: resolvedUserId,
        date: resolvedDateStr,
        total_calories: dayCalories(appData, resolvedDateStr),
        protein: dayMacro(appData, resolvedDateStr, 'protein'),
        carb: dayMacro(appData, resolvedDateStr, 'carbohydrate'),
        fat: dayMacro(appData, resolvedDateStr, 'fat'),
        fiber: dayMacro(appData, resolvedDateStr, 'fiber'),
        sodium: dayMacro(appData, resolvedDateStr, 'sodium')
      };
      var res = await client
        .from('nutrition_logs')
        .upsert(row, { onConflict: 'user_id,date' })
        .select('*')
        .maybeSingle();
      if (res.error) {
        var fullN = dumpError('nutrition_upsert_failed FULL error', res.error, {
          dateStr: resolvedDateStr,
          row: row
        });
        if (isUnauthorizedOrNetwork(res.error)) {
          activateLocalFallback('nutrition_401_or_network', res.error, { dateStr: resolvedDateStr });
        }
        return {
          ok: false,
          error: errMsg(res.error),
          errorFull: fullN,
          row: row,
          fallbackLocal: isUnauthorizedOrNetwork(res.error)
        };
      }
      debug('nutrition_upsert_ok', resolvedDateStr, res.data);
      return { ok: true, row: row, saved: res.data };
    } catch (e) {
      var fullNEx = dumpError('nutrition_exception FULL error', e, { dateStr: resolvedDateStr });
      if (isUnauthorizedOrNetwork(e)) activateLocalFallback('nutrition_exception', e);
      return {
        ok: false,
        error: errMsg(e),
        errorFull: fullNEx,
        fallbackLocal: isUnauthorizedOrNetwork(e)
      };
    }
  }

  async function syncDate(appData, dateStr) {
    if (!getClient()) return { ok: false, reason: 'no_client' };
    var user = await ensureAnonymousSession();
    if (!user) return { ok: false, reason: 'no_auth' };
    var targetDate = resolveDateStr(dateStr);
    await ensureUserProfile(user, appData);
    var metrics = await upsertDailyMetrics(user.id, appData, targetDate);
    var nutri = await upsertNutrition(user.id, appData, targetDate);
    return {
      ok: !!metrics.ok,
      metricsOk: !!metrics.ok,
      nutritionOk: !!nutri.ok,
      metricsError: metrics.error || null,
      nutritionError: nutri.error || null
    };
  }

  async function flushQueue() {
    if (flushing) {
      return { ok: false, reason: 'already_flushing', pending: getPendingDates() };
    }
    flushing = true;
    var result = {
      ok: false,
      synced: 0,
      failed: [],
      errors: [],
      pendingBefore: [],
      pendingAfter: [],
      userId: null,
      reason: null
    };

    try {
      if (!getClient()) {
        result.reason = 'no_client';
        var status =
          root.MaiMaiSupabase && root.MaiMaiSupabase.getConfigStatus
            ? root.MaiMaiSupabase.getConfigStatus()
            : null;
        warn('flush_aborted_no_client', status);
        lastFlushResult = result;
        return result;
      }

      var appData = root.appData;
      if (!appData) {
        result.reason = 'no_app_data';
        warn('flush_aborted_no_app_data');
        lastFlushResult = result;
        return result;
      }

      result.pendingBefore = getPendingDates();
      if (!result.pendingBefore.length) {
        result.ok = true;
        result.reason = 'empty_queue';
        lastFlushResult = result;
        return result;
      }

      var user = await ensureAnonymousSession();
      if (!user) {
        result.reason = 'no_auth';
        result.errors.push('Anonymous auth failed — enable Anonymous provider in Supabase.');
        result.fallbackLocal = true;
        activateLocalFallback('flush_no_auth', { message: result.errors[0] });
        warn('flush_aborted_no_auth', result.errors[0]);
        lastFlushResult = result;
        return result;
      }
      result.userId = user.id;

      var profileRes = await ensureUserProfile(user, appData);
      if (!profileRes.ok) {
        result.errors.push('users_upsert: ' + (profileRes.error || 'failed'));
        // Continue — trigger may already have created the row
      }

      for (var i = 0; i < result.pendingBefore.length; i++) {
        var d = result.pendingBefore[i];
        try {
          var metrics = await upsertDailyMetrics(user.id, appData, d);
          var nutri = await upsertNutrition(user.id, appData, d);

          // daily_metrics is the critical path; do not block dequeue on nutrition
          if (metrics.ok) {
            delete pendingDates[d];
            result.synced++;
            if (!nutri.ok) {
              result.errors.push(d + ' nutrition: ' + (nutri.error || 'failed'));
              if (nutri.errorFull) result.errors.push({ date: d, nutritionErrorFull: nutri.errorFull });
              if (nutri.fallbackLocal) result.fallbackLocal = true;
            }
          } else {
            result.failed.push(d);
            result.errors.push(d + ' daily_metrics: ' + (metrics.error || 'failed'));
            if (metrics.errorFull) {
              result.errors.push({ date: d, dailyMetricsErrorFull: metrics.errorFull });
              dumpError('flush daily_metrics failure for ' + d, metrics.errorFull, metrics.row);
            }
            if (metrics.fallbackLocal) result.fallbackLocal = true;
          }
        } catch (e) {
          result.failed.push(d);
          result.errors.push(d + ' exception: ' + errMsg(e));
          warn('flush_date_failed', d, errMsg(e));
        }
      }

      saveQueue();
      result.pendingAfter = getPendingDates();
      result.ok = result.failed.length === 0;
      result.reason = result.ok ? 'flushed' : 'partial_or_failed';

      if (!result.ok) warn('flush_incomplete', result);
      else debug('flush_complete', result);

      lastFlushResult = result;
      return result;
    } catch (e) {
      result.reason = 'exception';
      result.errors.push(errMsg(e));
      warn('flush_exception', errMsg(e));
      lastFlushResult = result;
      return result;
    } finally {
      flushing = false;
    }
  }

  async function fetchMetrics(dateStr) {
    var client = getClient();
    if (!client) return null;
    try {
      var user = await ensureAnonymousSession();
      if (!user) return null;
      var res = await client
        .from('daily_metrics')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .maybeSingle();
      if (res.error) {
        warn('fetch_metrics_failed', errMsg(res.error));
        return null;
      }
      return res.data || null;
    } catch (e) {
      warn('fetch_metrics_exception', errMsg(e));
      return null;
    }
  }

  /**
   * Manual / automatic full push: enqueue today (and optional dates), auth, flush now.
   */
  async function waitWhileFlushing(maxMs) {
    var waited = 0;
    var step = 50;
    while (flushing && waited < (maxMs || 8000)) {
      await new Promise(function (r) { setTimeout(r, step); });
      waited += step;
    }
  }

  async function forceSyncToSupabase(opts) {
    opts = opts || {};
    loadQueue();

    var today = resolveDateStr(opts.dateStr || root.TODAY_STR);
    if (today) pendingDates[String(today)] = true;

    if (opts.dates && Array.isArray(opts.dates)) {
      opts.dates.forEach(function (d) {
        if (d) pendingDates[String(d)] = true;
      });
    }
    saveQueue();

    await waitWhileFlushing(8000);

    if (!getClient()) {
      var cfg =
        root.MaiMaiSupabase && root.MaiMaiSupabase.getConfigStatus
          ? root.MaiMaiSupabase.getConfigStatus()
          : null;
      var blocked = {
        ok: false,
        reason: 'no_client',
        config: cfg,
        tip: 'Check config.local.js / __MAIMAI_SUPABASE__ and hard-refresh.'
      };
      warn('forceSyncToSupabase blocked', blocked);
      lastFlushResult = blocked;
      return blocked;
    }

    var user = await ensureAnonymousSession();
    if (!user) {
      var authFail = {
        ok: false,
        reason: 'no_auth',
        tip: 'Enable Authentication → Providers → Anonymous in Supabase Dashboard.'
      };
      warn('forceSyncToSupabase auth failed', authFail);
      lastFlushResult = authFail;
      return authFail;
    }

    if (root.appData) await ensureUserProfile(user, root.appData);

    var flushRes = await flushQueue();
    var out = Object.assign({ forced: true, userId: user.id }, flushRes);

    if (out.ok) {
      try {
        if (root.console && console.info) {
          console.info('[MaiMaiSupabaseSync] forceSyncToSupabase OK', out);
        }
      } catch (e) { /* ignore */ }
    } else {
      warn('forceSyncToSupabase finished with issues', out);
    }

    lastFlushResult = out;
    return out;
  }

  async function init(opts) {
    opts = opts || {};
    loadQueue();
    if (!getClient()) {
      var st =
        root.MaiMaiSupabase && root.MaiMaiSupabase.getConfigStatus
          ? root.MaiMaiSupabase.getConfigStatus()
          : 'client_missing';
      warn('init_skipped', st);
      return { ok: false, reason: 'not_configured', config: st };
    }
    try {
      var user = await ensureAnonymousSession();
      if (!user) {
        warn('init_auth_failed — continuing in local-only fallback');
        activateLocalFallback('init_auth_failed', {
          message: 'Anonymous sign-in failed at init'
        });
        return { ok: false, reason: 'auth_failed', fallbackLocal: true };
      }
      if (root.appData) await ensureUserProfile(user, root.appData);

      if (opts.todayStr) {
        pendingDates[String(resolveDateStr(opts.todayStr))] = true;
        saveQueue();
      }

      // Flush immediately on boot (do not only schedule)
      var flushRes = await flushQueue();
      if (!flushRes.ok && flushRes.reason !== 'empty_queue') {
        warn('init_flush_issues (app continues on localStorage)', flushRes);
        scheduleFlush(1500);
      } else {
        debug('init_flush_ok', flushRes);
      }

      return {
        ok: true,
        userId: user.id,
        flush: flushRes,
        fallbackLocal: !!flushRes.fallbackLocal || fallbackLocalMode
      };
    } catch (e) {
      activateLocalFallback('init_exception', e);
      warn('init_exception (app continues locally)', errMsg(e));
      return { ok: false, reason: 'exception', error: errMsg(e), fallbackLocal: true };
    }
  }

  /** Optimistic UI hook: call after local saveState for water/weight/sleep/nutrition. */
  function notifyLocalChange(dateStr) {
    try {
      if (!getClient()) {
        warn('notifyLocalChange skipped — Supabase client not ready');
        return;
      }
      enqueueDate(resolveDateStr(dateStr || root.TODAY_STR), { delayMs: 350 });
    } catch (e) {
      warn('notifyLocalChange exception', errMsg(e));
    }
  }

  /**
   * Step-by-step Console diagnostic for daily_metrics sync + auth tokens.
   * Usage: await debugSupabaseDailyMetrics()
   */
  async function debugSupabaseDailyMetrics(opts) {
    opts = opts || {};
    var report = {
      step: 'start',
      config: null,
      tokenDebug: null,
      auth: null,
      usersUpsert: null,
      tableProbe: null,
      payload: null,
      upsert: null,
      selectBack: null,
      fallbackLocalMode: fallbackLocalMode,
      analysis: []
    };

    function note(msg) {
      report.analysis.push(msg);
      console.info('[MaiMaiDebug]', msg);
    }

    console.group('[MaiMaiDebug] debugSupabaseDailyMetrics');
    try {
      report.config =
        root.MaiMaiSupabase && root.MaiMaiSupabase.getConfigStatus
          ? root.MaiMaiSupabase.getConfigStatus()
          : null;
      console.info('1) Config', report.config);
      if (!report.config || !report.config.ready) {
        note('FAIL: client not ready — check config.local.js / CDN.');
        console.groupEnd();
        return report;
      }

      if (report.config.anonKeyKind === 'publishable') {
        note(
          'API key is sb_publishable_ (NOT a JWT). REST requires anonymous access_token as Authorization Bearer.'
        );
      }

      var client = getClient();
      var user = await ensureAnonymousSession();

      report.tokenDebug = await getAuthTokenDebug();
      console.info('2a) Token debug (masked + claims)', {
        apiKeyKind: report.tokenDebug.apiKeyKind,
        apiKeyMasked: report.tokenDebug.apiKeyMasked,
        accessTokenIsJwt: report.tokenDebug.accessTokenIsJwt,
        accessTokenMasked: report.tokenDebug.accessTokenMasked,
        authorizationHeaderWouldBe: report.tokenDebug.authorizationHeaderWouldBe,
        accessTokenClaims: report.tokenDebug.accessTokenClaims,
        warning401: report.tokenDebug.warning401
      });
      console.info(
        '2b) FULL access_token currently used (copy carefully — do not share):',
        report.tokenDebug.accessTokenFull
      );
      if (report.tokenDebug.warning401) note(report.tokenDebug.warning401);

      report.auth = user
        ? {
            ok: true,
            userId: user.id,
            isAnonymous: !!(user.is_anonymous || user.isAnonymous),
            hasJwt: !!report.tokenDebug.accessTokenIsJwt
          }
        : { ok: false };
      console.info('2c) Auth user', report.auth);
      if (!user || !report.tokenDebug.accessTokenIsJwt) {
        note('FAIL: missing anonymous user JWT — table REST calls need session Bearer, not publishable-as-JWT.');
        note('LOCAL FALLBACK: app keeps localStorage; cloud sync skipped until JWT exists.');
        console.groupEnd();
        return report;
      }

      report.usersUpsert = await ensureUserProfile(user, root.appData || {});
      console.info('3) users upsert', report.usersUpsert);
      if (!report.usersUpsert.ok) {
        note('WARN/FAIL: public.users upsert failed — daily_metrics FK may fail (23503).');
        if (report.usersUpsert.fallbackLocal) {
          note('401/network on users — staying on localStorage fallback (app not interrupted).');
        }
      }

      // Step 4: probe table access with anon/publishable + session JWT (NOT GET /rest/v1/ OpenAPI)
      try {
        console.info('4) Probe daily_metrics READ via .select("id").limit(1)…');
        var probe = await client.from('daily_metrics').select('id').limit(1);
        report.tableProbe = {
          ok: !probe.error,
          status: probe.error && (probe.error.status || probe.error.code) || 200,
          rowCount: Array.isArray(probe.data) ? probe.data.length : 0,
          sampleIds: Array.isArray(probe.data)
            ? probe.data.map(function (r) { return r && r.id; })
            : [],
          errorFull: probe.error ? serializeError(probe.error) : null
        };
        console.info('4a) daily_metrics select probe', report.tableProbe);
        if (probe.error) {
          dumpError('daily_metrics_select_probe FULL error', probe.error);
          if (isUnauthorizedOrNetwork(probe.error)) {
            activateLocalFallback('daily_metrics_select_probe_401_or_network', probe.error);
            note('READ probe 401/network — LOCAL FALLBACK (app continues on localStorage).');
          } else {
            note('READ probe failed: ' + errMsg(probe.error) + ' (app continues; will still try upsert).');
          }
        } else {
          note(
            'READ probe OK (anon/publishable + session). rows returned: ' +
              report.tableProbe.rowCount
          );
        }
      } catch (probeErr) {
        dumpError('daily_metrics_select_probe exception FULL', probeErr);
        report.tableProbe = {
          ok: false,
          errorFull: serializeError(probeErr)
        };
        if (isUnauthorizedOrNetwork(probeErr)) {
          activateLocalFallback('daily_metrics_select_probe_exception', probeErr);
        }
        note('READ probe exception: ' + errMsg(probeErr) + ' (app continues locally)');
      }

      var dateStr = resolveDateStr(opts.dateStr || root.TODAY_STR);
      report.upsert = await upsertDailyMetrics(
        user.id,
        root.appData || { dailyRecords: {}, profile: {}, weightLogs: [] },
        dateStr
      );
      report.payload = report.upsert && report.upsert.row;
      console.info('5) Upsert result', report.upsert);

      if (report.upsert && report.upsert.ok) {
        var sel = await client
          .from('daily_metrics')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .maybeSingle();
        if (sel.error) {
          report.selectBack = { ok: false, errorFull: dumpError('select_back FULL error', sel.error) };
          if (isUnauthorizedOrNetwork(sel.error)) {
            activateLocalFallback('select_back_401', sel.error);
            note('SELECT 401/network — local fallback; app not interrupted.');
          } else {
            note('Upsert OK but SELECT failed — check RLS SELECT policy.');
          }
        } else {
          report.selectBack = { ok: true, data: sel.data };
          console.info('6) SELECT back', sel.data);
          note(sel.data ? 'SUCCESS: row visible after upsert.' : 'Upsert OK but SELECT returned null (RLS?).');
        }
      } else {
        var code = report.upsert && report.upsert.errorFull && report.upsert.errorFull.code;
        var status = report.upsert && report.upsert.errorFull && report.upsert.errorFull.status;
        if (report.upsert && report.upsert.fallbackLocal) {
          note('Upsert hit 401/network — LOCAL FALLBACK (queue kept, UI continues).');
        } else if (status === 401 || code === 'PGRST301') {
          note('Root cause: 401/JWT — check access_token above vs Dashboard Anonymous provider.');
        } else if (code === 'PGRST204' || (report.upsert && /column/i.test(report.upsert.error || ''))) {
          note('Root cause likely COLUMN NAME mismatch.');
        } else if (code === '23503') {
          note('Root cause likely FK: public.users row missing.');
        } else {
          note('See FULL error dump above.');
        }
      }

      report.fallbackLocalMode = fallbackLocalMode;
      console.info('Analysis', report.analysis);
      console.groupEnd();
      return report;
    } catch (e) {
      dumpError('debugSupabaseDailyMetrics FULL exception', e);
      if (isUnauthorizedOrNetwork(e)) activateLocalFallback('debug_exception', e);
      report.step = 'exception';
      report.analysis.push(errMsg(e));
      console.groupEnd();
      return report;
    }
  }

  root.MaiMaiSupabaseSync = {
    init: init,
    notifyLocalChange: notifyLocalChange,
    flushQueue: flushQueue,
    forceSyncToSupabase: forceSyncToSupabase,
    syncDate: syncDate,
    fetchMetrics: fetchMetrics,
    ensureAnonymousSession: ensureAnonymousSession,
    debugSupabaseDailyMetrics: debugSupabaseDailyMetrics,
    getAuthTokenDebug: getAuthTokenDebug,
    getUserId: function () { return lastUserId; },
    getPendingDates: getPendingDates,
    getLastFlushResult: function () { return lastFlushResult; },
    getLastAuthDebug: function () { return lastAuthDebug; },
    isFallbackLocalMode: function () { return fallbackLocalMode; },
    getExpectedDailyMetricsColumns: function () { return DAILY_METRICS_PAYLOAD_COLUMNS.slice(); },
    isConfigured: function () { return !!getClient(); }
  };

  // Global console helper for manual cloud push tests
  root.forceSyncToSupabase = function (opts) {
    return forceSyncToSupabase(opts)
      .then(function (res) {
        return res;
      })
      .catch(function (e) {
        var fail = {
          ok: false,
          reason: 'exception',
          error: errMsg(e),
          errorFull: serializeError(e),
          fallbackLocal: true
        };
        activateLocalFallback('forceSync_threw', e);
        dumpError('forceSyncToSupabase threw FULL error', e, fail);
        return fail;
      });
  };

  root.debugSupabaseDailyMetrics = function (opts) {
    return debugSupabaseDailyMetrics(opts);
  };

  root.getSupabaseAuthTokenDebug = function () {
    return getAuthTokenDebug();
  };
})(typeof window !== 'undefined' ? window : globalThis);
