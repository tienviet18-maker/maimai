/** Timezone / calendar-date audit for MaiMai (simulation + COPY helpers). */
function getLocalDateStrLegacy(d, offsetMinutes) {
  const shifted = new Date(d.getTime() - offsetMinutes * 60000);
  return shifted.toISOString().split('T')[0];
}
function getCalendarDateTokyo(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}
function parseDateOnly(dateStr) {
  const p = String(dateStr).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
}
function formatYmdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

const report = { cases: [], fail: [] };
const utcMidnight = new Date('2026-08-28T00:00:00.000Z');
const offsets = { JST: -540, EST: 300, PST: 480, UTC: 0 };
for (const [name, off] of Object.entries(offsets)) {
  const legacy = getLocalDateStrLegacy(utcMidnight, off);
  const row = { case: 'ISO-parse YYYY-MM-DD under ' + name, legacy, expectedSafe: '2026-08-28' };
  report.cases.push(row);
  if (name !== 'JST' && name !== 'UTC' && legacy !== '2026-08-28') {
    report.fail.push('UTC shift risk under ' + name + ': got ' + legacy);
  }
}

const midnights = [
  ['2026-08-28T14:59:00Z', '2026-08-28'],
  ['2026-08-28T15:00:00Z', '2026-08-29'],
  ['2026-08-28T15:01:00Z', '2026-08-29'],
  ['2026-08-31T14:59:00Z', '2026-08-31'],
  ['2026-08-31T15:00:00Z', '2026-09-01']
];
for (const [iso, expect] of midnights) {
  const d = new Date(iso);
  const tokyo = getCalendarDateTokyo(d);
  const ok = tokyo === expect;
  report.cases.push({ case: 'JST midnight ' + iso, tokyo, expect, ok });
  if (!ok) report.fail.push('Midnight fail ' + iso);
}

// parseDateOnly roundtrip
for (const s of ['2026-08-28', '2026-08-29', '2026-09-01']) {
  const d = parseDateOnly(s);
  const back = formatYmdLocal(d);
  const ok = back === s;
  report.cases.push({ case: 'parseDateOnly ' + s, back, ok });
  if (!ok) report.fail.push('parseDateOnly roundtrip ' + s);
}

// Safe Tokyo formatter should keep calendar key for "now" instants when forced
report.summary = {
  TIMEZONE_AUDIT: report.fail.length ? 'FAIL' : 'PASS',
  notes: [
    'Frozen getLocalDateStr uses toISOString offset trick (device-local).',
    'new Date(\"YYYY-MM-DD\") is UTC midnight — shifts calendar day on negative-offset devices.',
    'COPY will force Asia/Tokyo calendar keys + safe parse for YYYY-MM-DD.'
  ],
  fails: report.fail
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.fail.some(f => f.startsWith('Midnight') || f.startsWith('parseDateOnly')) ? 1 : 0);
