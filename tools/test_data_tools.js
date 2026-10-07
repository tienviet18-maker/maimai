/**
 * Backup / restore / delete-all (www/js/storage/data_tools.js) and offline packaging checks.
 * Run: node tools/test_data_tools.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

function memoryStorage(init) {
  const m = Object.assign({}, init || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { Object.keys(m).forEach((k) => delete m[k]); },
    _dump: () => m
  };
}

global.localStorage = memoryStorage();
const tools = require(path.join(ROOT, 'www', 'js', 'storage', 'data_tools.js'));

const sample = {
  schemaVersion: 4,
  profile: { userName: 'Lan', lang: 'vi', currentWeight: 52 },
  weightLogs: [{ date: '2026-10-01', weight: 52 }],
  dailyRecords: {
    '2026-10-01': { waterMl: 1500, sleepMinutes: 420, period: false, note: 'ổn', symptoms: [], foodLogs: [{ id: 'mext_01088', grams: 150 }] },
    '2026-10-02': { waterMl: 2000, sleepMinutes: 0, period: true, note: '', symptoms: ['cramps'], foodLogs: [] }
  },
  favorites: ['mext_01088'],
  myFoods: [],
  periodRecords: [{ start: '2026-10-02' }]
};

// --- backup round trip
const backup = tools.buildBackup(sample, { now: new Date('2026-10-07T09:30:00Z'), appVersion: '1.1.0' });
assert(backup.kind === 'maimai-backup' && backup.formatVersion === 1, 'backup carries kind + format version');
assert(backup.storeKey === 'maimai_app_store_v2', 'backup names the store key');
const parsed = tools.parseBackup(JSON.stringify(backup));
assert(parsed.ok && parsed.days === 2, 'backup parses back with 2 days');
assert(JSON.stringify(parsed.data) === JSON.stringify(sample), 'round trip is lossless');
assert(backup.data !== sample, 'backup is a copy, not the live object');

// --- accepted / rejected inputs
assert(tools.parseBackup(JSON.stringify(sample)).ok, 'raw appData (older manual export) accepted');
assert(tools.parseBackup('not json').reason === 'not_json', 'garbage rejected');
assert(tools.parseBackup('{"a":1}').reason === 'no_profile', 'object without profile rejected');
assert(tools.parseBackup(JSON.stringify({ kind: 'maimai-backup', formatVersion: 2, data: sample })).reason === 'newer_format', 'newer backup format rejected');
assert(tools.parseBackup(JSON.stringify(Object.assign({}, sample, { weightLogs: {} }))).reason === 'bad_weightLogs', 'malformed list rejected');
assert(tools.parseBackup(JSON.stringify(Object.assign({}, sample, { dailyRecords: [] }))).reason === 'bad_daily_records', 'malformed dailyRecords rejected');
assert(/^maimai-backup_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(tools.backupFileName(new Date())), 'file name has local date stamp');

// --- restore writes the store key
tools.restoreBackupData(sample);
assert(JSON.parse(global.localStorage.getItem('maimai_app_store_v2')).profile.userName === 'Lan', 'restore writes maimai_app_store_v2');

(async () => {
  // --- delete: cloud failure leaves local data untouched
  global.localStorage = memoryStorage({ maimai_app_store_v2: '{"profile":{}}', maimai_notif_pref: '1' });
  global.MaiMaiSupabaseSync = { deleteMyCloudData: async () => ({ ok: false, error: 'offline' }) };
  let res = await tools.deleteAllData();
  assert(!res.ok && res.stage === 'cloud', 'cloud failure reported');
  assert(global.localStorage.getItem('maimai_app_store_v2') !== null, 'cloud failure keeps local data');

  // --- delete: success clears everything
  let cloudCalled = 0;
  global.MaiMaiSupabaseSync = { deleteMyCloudData: async () => { cloudCalled++; return { ok: true, accountDeleted: true }; } };
  res = await tools.deleteAllData();
  assert(res.ok && cloudCalled === 1, 'cloud deletion runs first');
  assert(Object.keys(global.localStorage._dump()).length === 0, 'all local keys cleared');

  // --- delete without Supabase loaded (offline-only install)
  global.MaiMaiSupabaseSync = undefined;
  global.localStorage = memoryStorage({ maimai_app_store_v2: '{}' });
  res = await tools.deleteAllData();
  assert(res.ok && global.localStorage.getItem('maimai_app_store_v2') === null, 'local-only delete works');

  // --- offline packaging: no CDN scripts or styles in the app shell
  const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
  const external = (html.match(/<(script|link)[^>]+(src|href)="https?:\/\/[^"]+"/g) || [])
    .filter((t) => !/rel="canonical"/.test(t));
  assert(external.length === 0, 'index.html loads no external scripts/styles (' + external.join(', ') + ')');
  ['css/tailwind.css', 'css/fonts.css', 'vendor/chart.umd.min.js', 'vendor/supabase.js', 'js/storage/data_tools.js', 'privacy.html']
    .forEach((f) => assert(fs.existsSync(path.join(ROOT, 'www', f)), 'www/' + f + ' exists'));

  const sw = fs.readFileSync(path.join(ROOT, 'www', 'sw.js'), 'utf8');
  const pre = sw.slice(sw.indexOf('var PRECACHE'), sw.indexOf('];', sw.indexOf('var PRECACHE')));
  const missing = (pre.match(/'\.\/[^']*'/g) || []).map((q) => q.slice(3, -1)).filter((f) => f && !fs.existsSync(path.join(ROOT, 'www', f)));
  assert(missing.length === 0, 'every service-worker precache file exists (' + missing.join(', ') + ')');

  // --- every new i18n key exists in vi / en / ja
  const keys = ['dataPrivacyTitle', 'importBtn', 'deleteDataBtn', 'privacyPolicyLink', 'deleteConfirm', 'deleteWord', 'importConfirm', 'medicalDisclaimer', 'closeBtn'];
  keys.forEach((k) => {
    const n = (html.match(new RegExp('^\\s+' + k + ': "', 'gm')) || []).length;
    assert(n === 3, 'i18n key ' + k + ' in all 3 languages');
  });

  const privacy = fs.readFileSync(path.join(ROOT, 'www', 'privacy.html'), 'utf8');
  ['vi', 'en', 'ja'].forEach((l) => assert(privacy.includes('data-lang="' + l + '"'), 'privacy policy has ' + l + ' section'));

  console.log('\nRESULT passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
})();
