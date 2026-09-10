/* MaiMai Service Worker — cache shell + show notifications */
var CACHE = 'maimai-shell-v1';
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () { /* ignore partial */ });
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

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then(function (cached) {
      return (
        cached ||
        fetch(req).then(function (res) {
          return res;
        }).catch(function () {
          return caches.match('./index.html');
        })
      );
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
