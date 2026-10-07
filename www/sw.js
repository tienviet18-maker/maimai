/* MaiMai Service Worker — cache shell + show notifications */
var CACHE = 'maimai-shell-v2'; // tools/build_web.js stamps a build id here when building dist/
// App shell + local libraries, so the PWA opens offline. Large data (foods_db.js) is cached on first use.
var PRECACHE = [
  './',
  './index.html',
  './privacy.html',
  './manifest.webmanifest',
  './css/tailwind.css',
  './css/fonts.css',
  './fonts/quicksand-vietnamese-wght-normal.woff2',
  './fonts/quicksand-latin-ext-wght-normal.woff2',
  './fonts/quicksand-latin-wght-normal.woff2',
  './vendor/chart.umd.min.js',
  './vendor/supabase.js',
  './energy_engine.js',
  './admob.config.js',
  './js/core/architecture.js',
  './js/storage/schema.js',
  './js/storage/data_tools.js',
  './js/cycle/cycle_engine.js',
  './js/food/food_repository.js',
  './js/food/recipe_builder.js',
  './js/nutrition/nutrition_bridge.js',
  './js/notifications/notificationEngine.js',
  './js/supabase/supabaseClient.js',
  './js/supabase/supabaseService.js',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // One by one: a single missing file must not drop the whole shell.
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { /* ignore */ });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function sameVersion(a, b) {
  if (!a || !b) return false;
  var ea = a.headers.get('etag'), eb = b.headers.get('etag');
  if (ea && eb) return ea === eb;
  var la = a.headers.get('last-modified'), lb = b.headers.get('last-modified');
  return !!(la && lb && la === lb);
}

function putInCache(req, res, cached) {
  // Skip rewriting an unchanged copy (foods_db.js is ~13 MB).
  if (res && res.ok && res.type === 'basic' && !sameVersion(cached, res)) {
    var copy = res.clone();
    caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
  }
  return res;
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, ads: always network
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname)) {
    // Network first so a new release shows up; cached shell when offline.
    event.respondWith(
      fetch(req).then(function (res) { return putInCache(req, res); }).catch(function () {
        return caches.match(req).then(function (c) { return c || caches.match('./index.html'); });
      })
    );
    return;
  }
  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) { return putInCache(req, res, cached); });
      if (cached) { net.catch(function () {}); return cached; }
      return net;
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('push', function (event) {
  // Optional server push payload support (JSON { title, body })
  var title = 'MaiMai';
  var body = '';
  try {
    if (event.data) {
      var data = event.data.json();
      title = data.title || title;
      body = data.body || '';
    }
  } catch (e) {
    try {
      body = event.data ? event.data.text() : '';
    } catch (e2) { /* ignore */ }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      tag: 'maimai-push',
      data: { url: './' }
    })
  );
});
