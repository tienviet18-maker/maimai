/**
 * Calendar day follows the DEVICE time zone (index.html getLocalDateStr + cycle engine defaults).
 * Each zone runs in a child process with TZ set, because Intl reads the zone at startup.
 * Run: node tools/test_device_timezone.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; console.log('PASS', m); }
  else { failed++; console.error('FAIL', m); }
}

if (process.argv[2] === '--child') {
  const vm = require('vm');
  const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
  const slice = html.slice(html.indexOf('const MAIMAI_APP_TIMEZONE'), html.indexOf('function toHiragana'));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(slice + '\nthis.tz = MAIMAI_APP_TIMEZONE; this.getLocalDateStr = getLocalDateStr;', sb);
  global.window = undefined;
  const cycle = require(path.join(ROOT, 'www', 'js', 'cycle', 'cycle_engine.js'));
  const instants = JSON.parse(process.argv[3]);
  const out = { tz: sb.tz, keys: instants.map((i) => sb.getLocalDateStr(new Date(i))) };
  const helpers = cycle && cycle._defaultDateHelpers ? cycle._defaultDateHelpers() : null;
  out.cycleKeys = helpers ? instants.map((i) => helpers.getLocalDateStr(new Date(i))) : null;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function runIn(tz, instants) {
  const res = execFileSync(process.execPath, [__filename, '--child', JSON.stringify(instants)], {
    env: Object.assign({}, process.env, { TZ: tz })
  });
  return JSON.parse(String(res));
}

// 23:30 in Hanoi on 2 Oct = 01:30 on 3 Oct in Tokyo: the old fixed-JST rule filed this under 3 Oct.
const LATE_VN = '2026-10-02T23:30:00+07:00';
const EARLY_VN = '2026-10-03T00:15:00+07:00';
const LATE_JP = '2026-10-02T23:30:00+09:00';
const LA_EVENING = '2026-10-02T20:00:00-07:00';

const vn = runIn('Asia/Ho_Chi_Minh', [LATE_VN, EARLY_VN]);
assert(/^Asia\/(Ho_Chi_Minh|Saigon)$/.test(vn.tz), 'Vietnam device resolves its own zone (' + vn.tz + ')');
assert(vn.keys[0] === '2026-10-02', 'VN 23:30 stays on 2 Oct (fixed JST gave 3 Oct)');
assert(vn.keys[1] === '2026-10-03', 'VN 00:15 rolls to 3 Oct');

const jp = runIn('Asia/Tokyo', [LATE_JP, LATE_VN]);
assert(jp.keys[0] === '2026-10-02', 'JP 23:30 stays on 2 Oct');
assert(jp.keys[1] === '2026-10-03', 'JP device: same instant as VN 23:30 is 3 Oct in Tokyo');

const la = runIn('America/Los_Angeles', [LA_EVENING]);
assert(la.keys[0] === '2026-10-02', 'US evening not shifted to UTC next day');

if (vn.cycleKeys) {
  assert(vn.cycleKeys[0] === '2026-10-02', 'cycle engine default helpers use device zone');
} else {
  const src = fs.readFileSync(path.join(ROOT, 'www', 'js', 'cycle', 'cycle_engine.js'), 'utf8');
  assert(/timeZone: deviceTimeZone\(\)/.test(src) && !/timeZone: 'Asia\/Tokyo'/.test(src), 'cycle engine default helpers use device zone');
}

const svc = fs.readFileSync(path.join(ROOT, 'www', 'js', 'supabase', 'supabaseService.js'), 'utf8');
assert(!/toISOString\(\)\.split\('T'\)\[0\]/.test(svc.replace(/\/\/.*$/gm, '')), 'Supabase date fallback no longer uses UTC toISOString');

console.log('\nRESULT passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
