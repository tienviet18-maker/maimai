/**
 * In-app browser notice (same as vimai.jp and every ViMai app).
 * Inside Messenger / Facebook / Zalo / LINE / Instagram / TikTok the page
 * cannot be added to the home screen and its storage is often wiped, so a
 * closable card on top says to open it in Safari / Chrome, with "copy link".
 */
(function (root) {
  'use strict';

  var DISMISS_KEY = 'vimai:inapp-notice-dismissed';

  function appName(ua) {
    if (/messenger/i.test(ua)) return 'Messenger';
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook';
    if (/Instagram/.test(ua)) return 'Instagram';
    if (/Zalo/i.test(ua)) return 'Zalo';
    if (/Line\//.test(ua)) return 'LINE';
    if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'TikTok';
    if (/Threads/.test(ua)) return 'Threads';
    return null;
  }

  var COPY = {
    vi: {
      title: function (app) { return 'Bạn đang mở trong ứng dụng ' + app; },
      body: 'Bấm nút ⋯ rồi chọn “Mở bằng trình duyệt” (Safari/Chrome) để thêm MaiMai ra màn hình chính và giữ dữ liệu không bị mất.',
      copy: 'Sao chép link', copied: 'Đã chép link', close: 'Đóng'
    },
    en: {
      title: function (app) { return 'You are inside the ' + app + ' app'; },
      body: 'Tap ⋯ and choose “Open in browser” (Safari/Chrome) to add MaiMai to your home screen and keep your data safe.',
      copy: 'Copy link', copied: 'Link copied', close: 'Close'
    },
    ja: {
      title: function (app) { return app + 'のアプリ内ブラウザで開いています'; },
      body: '「⋯」をタップして「ブラウザで開く」（Safari/Chrome）を選ぶと、MaiMaiをホーム画面に追加でき、データも消えにくくなります。',
      copy: 'リンクをコピー', copied: 'コピーしました', close: '閉じる'
    }
  };

  function lang() {
    try {
      // index.html keeps the chosen language in a top-level `currentLang`.
      /* global currentLang */
      if (typeof currentLang === 'string' && COPY[currentLang]) return currentLang;
    } catch (e) { /* not defined yet */ }
    return 'vi';
  }

  function dismissed() {
    try { return root.sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function copyLink(done) {
    var href = root.location.href;
    function fallback() {
      var input = document.createElement('input');
      input.value = href;
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); } catch (e) { /* ignore */ }
      input.remove();
      done();
    }
    if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(href).then(done, fallback);
    } else {
      fallback();
    }
  }

  function show() {
    var native = root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform();
    var app = appName(root.navigator.userAgent || '');
    if (native || !app || dismissed()) return;
    var t = COPY[lang()];

    var box = document.createElement('div');
    box.id = 'inapp-browser-notice';
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top, 0px) + 12px);' +
      'z-index:2147483000;max-width:560px;margin:0 auto;padding:14px 40px 14px 16px;border-radius:14px;' +
      'border:1px solid #f2c94c;background:#fff8db;color:#1f2937;font-size:14px;line-height:1.45;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.15);font-family:inherit;';

    var title = document.createElement('p');
    title.style.cssText = 'margin:0;font-weight:700;';
    title.textContent = t.title(app);

    var body = document.createElement('p');
    body.style.cssText = 'margin:4px 0 0;';
    body.textContent = t.body;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'margin-top:10px;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid #f2c94c;' +
      'background:#fff;color:#1f2937;font-weight:600;font-size:14px;';
    btn.textContent = t.copy;
    btn.addEventListener('click', function () {
      copyLink(function () { btn.textContent = '✓ ' + t.copied; });
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', t.close);
    close.style.cssText = 'position:absolute;top:6px;right:6px;width:32px;height:32px;border:0;border-radius:8px;' +
      'background:transparent;color:#4b5563;font-size:20px;line-height:32px;';
    close.textContent = '×';
    close.addEventListener('click', function () {
      box.remove();
      try { root.sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* storage may be blocked */ }
    });

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  root.ViMaiInAppNotice = { appName: appName };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})(typeof window !== 'undefined' ? window : this);
