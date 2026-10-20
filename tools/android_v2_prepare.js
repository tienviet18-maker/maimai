/**
 * One-time Android preparation for MaiMai 2.0 (Capacitor 8, Android 16 / API 36).
 * Run on the machine that has the Android project files: npm run android:v2
 * Idempotent: running it again changes nothing.
 *  - AndroidManifest.xml: adds "density" to the main activity's configChanges (Capacitor 8 requirement,
 *    stops the WebView reloading when the screen size changes).
 *  - Reports anything the release build still needs (manifest, resources, signing).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'android', 'app', 'src', 'main');
const MANIFEST = path.join(MAIN, 'AndroidManifest.xml');

function addDensity(xml) {
  return xml.replace(/android:configChanges="([^"]*)"/g, (m, value) => {
    const parts = value.split('|').filter(Boolean);
    if (parts.indexOf('density') >= 0) return m;
    parts.push('density');
    return 'android:configChanges="' + parts.join('|') + '"';
  });
}

function main() {
  const problems = [];
  if (!fs.existsSync(MANIFEST)) {
    problems.push('Missing android/app/src/main/AndroidManifest.xml. Copy it from your working Android project.');
  } else {
    const xml = fs.readFileSync(MANIFEST, 'utf8');
    const next = addDensity(xml);
    if (!/android:configChanges=/.test(xml)) {
      problems.push('AndroidManifest.xml has no android:configChanges on the activity; add "...|navigation|density".');
    } else if (next !== xml) {
      fs.writeFileSync(MANIFEST, next, 'utf8');
      console.log('AndroidManifest.xml: added "density" to configChanges');
    } else {
      console.log('AndroidManifest.xml: configChanges already include "density"');
    }
    if (!/com\.google\.android\.gms\.ads\.APPLICATION_ID/.test(xml)) {
      problems.push('AndroidManifest.xml has no AdMob APPLICATION_ID meta-data; ads will crash the app on start.');
    }
  }
  ['res/values/strings.xml', 'res/values/styles.xml', 'res/xml/file_paths.xml'].forEach((f) => {
    if (!fs.existsSync(path.join(MAIN, f))) problems.push('Missing android/app/src/main/' + f);
  });
  if (!fs.existsSync(path.join(ROOT, 'android', 'key.properties'))) {
    problems.push('android/key.properties not found: the release AAB will be unsigned (debug builds still work).');
  }

  const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const vars = fs.readFileSync(path.join(ROOT, 'android', 'variables.gradle'), 'utf8');
  const pick = (re, s) => ((s.match(re) || [])[1] || '?');
  console.log('versionName ' + pick(/versionName "([^"]+)"/, gradle) + ', versionCode ' + pick(/versionCode (\d+)/, gradle) +
    ', targetSdk ' + pick(/targetSdkVersion = (\d+)/, vars) + ', compileSdk ' + pick(/compileSdkVersion = (\d+)/, vars));

  if (problems.length) {
    console.log('\nStill needed:');
    problems.forEach((p) => console.log(' - ' + p));
    process.exitCode = 1;
  } else {
    console.log('\nAndroid project is ready. Next: npx cap sync android, then build the release AAB in Android Studio.');
  }
}

if (require.main === module) main();
module.exports = { addDensity };
