/**
 * Run every regression test. `npm test`
 * Older suites pin Japan-time expectations, so they run with TZ=Asia/Tokyo;
 * test_device_timezone.js spawns its own zones (Vietnam, Japan, US).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter((f) => /^test_.*\.js$/.test(f)).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    env: Object.assign({}, process.env, { TZ: process.env.TZ || 'Asia/Tokyo' }),
    encoding: 'utf8'
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const result = (out.match(/RESULT.*|=== RESULT.*/g) || ['(no RESULT line)']).pop();
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + f.padEnd(36) + result);
  if (!ok) console.log(out.split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 10).map((l) => '     ' + l).join('\n'));
}
console.log(bad ? '\n' + bad + ' test file(s) failed' : '\nall test files passed');
process.exit(bad ? 1 : 0);
