/**
 * MaiMai 2.0 release settings: one version everywhere, Play's API 36 target, Capacitor 8 manifest fix.
 * Run: node tools/test_release_v2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0;
function assert(c, m) { if (c) { passed++; console.log('PASS', m); } else { failed++; console.error('FAIL', m); } }

const pkg = JSON.parse(read('package.json'));
const gradle = read('android/app/build.gradle');
const vars = read('android/variables.gradle');
const html = read('www/index.html');
const versionName = (gradle.match(/versionName "([^"]+)"/) || [])[1];
const appVersion = (html.match(/version: "([^"]+)"/) || [])[1];
assert(pkg.version === '2.0.0', 'package.json version 2.0.0');
assert(versionName === pkg.version, 'Android versionName matches package.json (' + versionName + ')');
assert(appVersion === pkg.version, 'in-app About version matches package.json (' + appVersion + ')');
assert(Number((gradle.match(/versionCode (\d+)/) || [])[1]) >= 20000, 'versionCode raised for 2.0');
assert(/applicationId "com\.vimai\.maimai"/.test(gradle), 'applicationId unchanged');
assert(Number((vars.match(/targetSdkVersion = (\d+)/) || [])[1]) >= 36, 'targetSdk >= 36 (Google Play requirement since 31 Aug 2026)');
assert(Number((vars.match(/compileSdkVersion = (\d+)/) || [])[1]) >= 36, 'compileSdk >= 36');
assert(/^\^?8\./.test(pkg.dependencies['@capacitor/android']), 'Capacitor Android 8');
const plugins = Object.keys(pkg.dependencies).filter((k) => k.startsWith('@capacitor'));
assert(plugins.every((k) => /^\^?8\./.test(pkg.dependencies[k])), 'every Capacitor plugin on major 8');
const cap = JSON.parse(read('capacitor.config.json'));
assert(cap.appId === 'com.vimai.maimai', 'capacitor appId unchanged');
assert(!('adjustMarginsForEdgeToEdge' in (cap.android || {})), 'removed Capacitor 7 adjustMarginsForEdgeToEdge');
assert(cap.plugins.SystemBars && cap.plugins.SystemBars.insetsHandling === 'native', 'SystemBars handles insets');
assert(/viewport-fit=cover/.test(html), 'viewport-fit=cover kept for edge-to-edge insets');

const { addDensity } = require('./android_v2_prepare');
const before = '<activity android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation" android:name=".MainActivity">';
const once = addDensity(before);
assert(/\|navigation\|density"/.test(once), 'manifest helper appends density');
assert(addDensity(once) === once, 'manifest helper is idempotent');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
