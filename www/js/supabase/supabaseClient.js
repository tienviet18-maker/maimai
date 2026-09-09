/**
 * MaiMai Supabase client (vanilla Capacitor/Web).
 *
 * Config resolution order (first non-empty wins):
 * 1) window.__MAIMAI_SUPABASE__ = { url, anonKey }
 * 2) js/supabase/config.local.js → window.__MAIMAI_SUPABASE_LOCAL__
 * 3) <meta name="maimai-supabase-url"> / <meta name="maimai-supabase-anon-key">
 *
 * Important (401 fix):
 * - `sb_publishable_…` is NOT a JWT. PostgREST rejects Authorization: Bearer <publishable>.
 * - Client must send: apikey=<publishable|anon> AND Authorization: Bearer <user access_token JWT>
 *   after anonymous (or other) sign-in.
 */
(function (root) {
  'use strict';

  function readMeta(name) {
    try {
      var el = document.querySelector('meta[name="' + name + '"]');
      return el ? String(el.getAttribute('content') || '').trim() : '';
    } catch (e) {
      return '';
    }
  }

  function resolveConfig() {
    var injected = root.__MAIMAI_SUPABASE__ || {};
    var local = root.__MAIMAI_SUPABASE_LOCAL__ || {};
    var url =
      injected.url ||
      injected.SUPABASE_URL ||
      local.url ||
      local.SUPABASE_URL ||
      readMeta('maimai-supabase-url') ||
      '';
    var anonKey =
      injected.anonKey ||
      injected.anon_key ||
      injected.SUPABASE_ANON_KEY ||
      injected.publishableKey ||
      local.anonKey ||
      local.SUPABASE_ANON_KEY ||
      local.publishableKey ||
      readMeta('maimai-supabase-anon-key') ||
      '';
    return {
      url: String(url || '').trim(),
      anonKey: String(anonKey || '').trim()
    };
  }

  function isLikelyJwt(token) {
    return typeof token === 'string' && token.split('.').length === 3;
  }

  var cfg = resolveConfig();
  var client = null;
  var initError = null;
  var latestAccessToken = null;

  function rememberAccessToken(token) {
    latestAccessToken = token && isLikelyJwt(token) ? token : latestAccessToken;
  }

  /**
   * Wrap fetch so Authorization never falls back to the raw publishable key
   * (non-JWT → 401 Invalid JWT). Prefer session JWT; else omit Bearer and let
   * only apikey through (auth endpoints), or use cached session JWT.
   */
  function createAuthedFetch() {
    var baseFetch = root.fetch.bind(root);
    return async function maimaiSupabaseFetch(input, init) {
      init = init ? Object.assign({}, init) : {};
      var headers = new Headers(init.headers || {});
      var url = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
      } catch (e) {
        url = '';
      }
      var isAuthEndpoint = /\/auth\/v1\//i.test(url);

      // Always ensure apikey is the project key (publishable / legacy anon)
      if (cfg.anonKey && !headers.has('apikey')) {
        headers.set('apikey', cfg.anonKey);
      }

      var authHeader = headers.get('Authorization') || headers.get('authorization') || '';
      var bearer = '';
      var m = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (m) bearer = m[1].trim();

      // Publishable key is NOT a JWT. GoTrue auth endpoints may still accept it as Bearer.
      // PostgREST (/rest/v1) rejects it → 401 Invalid JWT. Replace with session JWT there.
      if (bearer && !isLikelyJwt(bearer)) {
        if (isAuthEndpoint) {
          // keep Authorization as supabase-js set it (publishable / anon key)
        } else {
          var jwt = latestAccessToken;
          if (!jwt && client && client.auth && client.auth.getSession) {
            try {
              var sessWrap = await client.auth.getSession();
              jwt =
                sessWrap &&
                sessWrap.data &&
                sessWrap.data.session &&
                sessWrap.data.session.access_token;
              if (jwt) rememberAccessToken(jwt);
            } catch (e) { /* ignore */ }
          }
          if (jwt && isLikelyJwt(jwt)) {
            headers.set('Authorization', 'Bearer ' + jwt);
          } else {
            headers.delete('Authorization');
            headers.delete('authorization');
          }
        }
      } else if (bearer && isLikelyJwt(bearer)) {
        rememberAccessToken(bearer);
      } else if (!bearer && latestAccessToken && !isAuthEndpoint) {
        headers.set('Authorization', 'Bearer ' + latestAccessToken);
      }

      init.headers = headers;
      return baseFetch(input, init);
    };
  }

  if (!root.supabase || typeof root.supabase.createClient !== 'function') {
    initError = new Error('Supabase JS CDN not loaded (window.supabase.createClient missing).');
  } else if (!cfg.url || !cfg.anonKey) {
    initError = new Error(
      'Supabase config missing. Set window.__MAIMAI_SUPABASE__ or js/supabase/config.local.js'
    );
  } else {
    try {
      client = root.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: root.localStorage,
          storageKey: 'maimai-supabase-auth-v1'
        },
        global: {
          fetch: createAuthedFetch(),
          headers: {
            'X-Client-Info': 'maimai-capacitor/supabase'
          }
        }
      });

      // Keep cached JWT in sync for the fetch wrapper
      try {
        client.auth.onAuthStateChange(function (event, session) {
          if (session && session.access_token) {
            rememberAccessToken(session.access_token);
          } else if (event === 'SIGNED_OUT') {
            latestAccessToken = null;
          }
        });
      } catch (e) { /* ignore */ }

      // Warm cache from existing session (async, non-blocking)
      try {
        client.auth.getSession().then(function (res) {
          var t =
            res && res.data && res.data.session && res.data.session.access_token;
          if (t) rememberAccessToken(t);
        });
      } catch (e2) { /* ignore */ }
    } catch (e) {
      initError = e;
      client = null;
    }
  }

  root.MaiMaiSupabase = {
    getClient: function () {
      return client;
    },
    isReady: function () {
      return !!client;
    },
    getInitError: function () {
      return initError;
    },
    getConfig: function () {
      return { url: cfg.url, anonKey: cfg.anonKey };
    },
    getCachedAccessToken: function () {
      return latestAccessToken;
    },
    setCachedAccessToken: rememberAccessToken,
    isLikelyJwt: isLikelyJwt,
    getConfigStatus: function () {
      return {
        hasUrl: !!cfg.url,
        hasAnonKey: !!cfg.anonKey,
        anonKeyKind: cfg.anonKey
          ? isLikelyJwt(cfg.anonKey)
            ? 'legacy_anon_jwt'
            : cfg.anonKey.indexOf('sb_publishable_') === 0
              ? 'publishable'
              : 'other'
          : 'missing',
        anonKeyPrefix: cfg.anonKey ? String(cfg.anonKey).slice(0, 18) + '…' : null,
        ready: !!client,
        hasCachedAccessToken: !!latestAccessToken,
        error: initError ? String(initError.message || initError) : null
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
