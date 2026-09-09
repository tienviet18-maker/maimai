/**
 * Web/PWA icon + iOS apple-touch regression for MAIMAI_WEB_NETLIFY.
 * Run: node tools/test_web_pwa_icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY');
const ICONS = path.join(WEB, 'icons');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('PASS', msg);
  } else {
    failed++;
    console.error('FAIL', msg);
  }
}

function isPng(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

/** Read IHDR width/height from PNG */
function pngSize(buf) {
  if (!isPng(buf) || buf.length < 24) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function resolveHref(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href) || /^data:/i.test(href) || /^\/\//.test(href)) return { kind: 'external', href };
  if (/^[A-Za-z]:[\\/]/.test(href) || href.startsWith('file:')) return { kind: 'absolute', href };
  const clean = href.split('?')[0].split('#')[0];
  return { kind: 'relative', href: clean, file: path.join(WEB, clean.replace(/\//g, path.sep)) };
}

const indexPath = path.join(WEB, 'index.html');
assert(fs.existsSync(indexPath), 'index.html exists');
const html = fs.readFileSync(indexPath, 'utf8');

assert(!/localhost|127\.0\.0\.1/i.test(html), 'index.html has no localhost');
assert(!/href=["']data:image\/svg\+xml/i.test(html), 'no data: SVG apple-touch/favicon placeholders');
assert(/rel=["']manifest["'][^>]*href=["']manifest\.webmanifest["']/i.test(html) || /href=["']manifest\.webmanifest["'][^>]*rel=["']manifest["']/i.test(html), 'manifest link present');

const appleLinks = [...html.matchAll(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/gi)];
assert(appleLinks.length >= 1, 'apple-touch-icon link present');

let appleOk = false;
for (const m of appleLinks) {
  const tag = m[0];
  const hrefM = tag.match(/href=["']([^"']+)["']/i);
  assert(!!hrefM, 'apple-touch-icon has href');
  if (!hrefM) continue;
  const resolved = resolveHref(hrefM[1]);
  assert(resolved && resolved.kind === 'relative', 'apple-touch-icon uses relative path (not data/absolute)');
  if (resolved && resolved.kind === 'relative') {
    assert(fs.existsSync(resolved.file), 'apple-touch-icon file exists: ' + hrefM[1]);
    if (fs.existsSync(resolved.file)) {
      const buf = fs.readFileSync(resolved.file);
      assert(isPng(buf), 'apple-touch-icon is valid PNG');
      const sz = pngSize(buf);
      assert(sz && sz.width === 180 && sz.height === 180, 'apple-touch-icon is 180x180 (got ' + (sz ? sz.width + 'x' + sz.height : 'n/a') + ')');
      appleOk = true;
    }
  }
}
assert(appleOk, 'at least one valid apple-touch-icon PNG wired');

const faviconTags = [...html.matchAll(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]*>/gi)];
assert(faviconTags.length >= 1, 'favicon/icon link(s) present');
let favOk = false;
for (const m of faviconTags) {
  const hrefM = m[0].match(/href=["']([^"']+)["']/i);
  if (!hrefM) continue;
  const resolved = resolveHref(hrefM[1]);
  assert(resolved && resolved.kind === 'relative', 'favicon href relative: ' + hrefM[1]);
  if (resolved && resolved.kind === 'relative') {
    assert(fs.existsSync(resolved.file), 'favicon file exists: ' + hrefM[1]);
    if (fs.existsSync(resolved.file)) favOk = true;
  }
}
assert(favOk, 'at least one favicon file resolves');

const requiredIcons = [
  { name: 'apple-touch-icon.png', w: 180, h: 180 },
  { name: 'icon-192.png', w: 192, h: 192 },
  { name: 'icon-512.png', w: 512, h: 512 },
  { name: 'favicon-16x16.png', w: 16, h: 16 },
  { name: 'favicon-32x32.png', w: 32, h: 32 },
  { name: 'maimai-icon-1024.png', w: 1024, h: 1024 }
];
for (const icon of requiredIcons) {
  const p = path.join(ICONS, icon.name);
  assert(fs.existsSync(p), 'icons/' + icon.name + ' exists');
  if (!fs.existsSync(p)) continue;
  const buf = fs.readFileSync(p);
  assert(isPng(buf), icon.name + ' valid PNG magic');
  const sz = pngSize(buf);
  assert(sz && sz.width === icon.w && sz.height === icon.h, icon.name + ' size ' + icon.w + 'x' + icon.h);
}

const icoPath = path.join(ICONS, 'favicon.ico');
assert(fs.existsSync(icoPath) && fs.statSync(icoPath).size > 0, 'favicon.ico exists');

const manPath = path.join(WEB, 'manifest.webmanifest');
assert(fs.existsSync(manPath), 'manifest.webmanifest exists');
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
assert(!!man.name && !!man.short_name, 'manifest name/short_name');
assert(!!man.start_url, 'manifest start_url');
assert(!!man.display, 'manifest display');
assert(!!man.background_color && !!man.theme_color, 'manifest colors');
assert(Array.isArray(man.icons) && man.icons.length >= 2, 'manifest icons array');

let has192 = false;
let has512 = false;
for (const ic of man.icons) {
  assert(!!ic.src && !/^data:/i.test(ic.src) && !/^https?:/i.test(ic.src) && !/^[A-Za-z]:/.test(ic.src), 'manifest icon relative: ' + ic.src);
  const file = path.join(WEB, String(ic.src).replace(/\//g, path.sep));
  assert(fs.existsSync(file), 'manifest icon file exists: ' + ic.src);
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    assert(isPng(buf), 'manifest icon PNG: ' + ic.src);
  }
  if (ic.sizes === '192x192') has192 = true;
  if (ic.sizes === '512x512') has512 = true;
}
assert(has192, 'manifest includes 192x192');
assert(has512, 'manifest includes 512x512');

const foodsHash = require('crypto')
  .createHash('sha256')
  .update(fs.readFileSync(path.join(WEB, 'data', 'foods', 'foods.json')))
  .digest('hex')
  .toUpperCase();
assert(foodsHash === '277E958FBC296F5F852D2389BCD5D056B02CABB48A431185873E06F2EA548D32', 'foods hash matches enriched catalog');

const admob = fs.readFileSync(path.join(WEB, 'admob.config.js'), 'utf8');
assert(/enabled:\s*false/.test(admob), 'browser AdMob remains disabled');
assert(/8757683722/.test(admob), 'AdMob app id intact');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
