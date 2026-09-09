/**
 * COPY-ONLY: harden calendar dates to Asia/Tokyo + safe YYYY-MM-DD parsing.
 * Never touches WellnessApp_Store.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'www', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

if (html.includes('MAIMAI_TZ_ASIA_TOKYO')) {
  console.log('Timezone patch already applied');
  process.exit(0);
}

const oldGetLocal = `const getLocalDateStr = (d) => { const tzOffset = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - tzOffset).toISOString().split('T')[0]; };`;

const newGetLocal = `/* MAIMAI_TZ_ASIA_TOKYO: calendar dates use Asia/Tokyo; YYYY-MM-DD never UTC-shifted */
        const MAIMAI_APP_TIMEZONE = 'Asia/Tokyo';
        function pad2(n) { return String(n).padStart(2, '0'); }
        function getLocalDateStr(d) {
            const date = (d instanceof Date) ? d : new Date(d);
            try {
                return new Intl.DateTimeFormat('en-CA', {
                    timeZone: MAIMAI_APP_TIMEZONE,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).format(date);
            } catch (e) {
                const y = date.getFullYear();
                const m = pad2(date.getMonth() + 1);
                const day = pad2(date.getDate());
                return y + '-' + m + '-' + day;
            }
        }`;

if (!html.includes(oldGetLocal)) {
  console.error('Could not find getLocalDateStr — abort (no silent wrong patch)');
  process.exit(1);
}
html = html.replace(oldGetLocal, newGetLocal);

const oldParse = `function parseDateOnly(dateStr) {
            const p = (dateStr || '').split('-').map(Number);
            if (p.length !== 3 || !p[0]) return null;
            return new Date(p[0], p[1] - 1, p[2]);
        }`;

const newParse = `function parseDateOnly(dateStr) {
            const p = (dateStr || '').split('-').map(Number);
            if (p.length !== 3 || !p[0]) return null;
            // Noon local avoids DST edge; calendar Y-M-D components only
            return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
        }`;

if (html.includes(oldParse)) {
  html = html.replace(oldParse, newParse);
} else {
  // tolerant match
  html = html.replace(
    /function parseDateOnly\(dateStr\) \{[\s\S]*?return new Date\(p\[0\], p\[1\] - 1, p\[2\]\);\s*\}/,
    newParse.trim()
  );
}

const oldChange = `function changeDietDateFromCalendar(dateStr) { dietViewDate = new Date(dateStr); updateDietAndHealthDisplay(); }`;
const newChange = `function changeDietDateFromCalendar(dateStr) { dietViewDate = parseDateOnly(dateStr) || new Date(); updateDietAndHealthDisplay(); }`;
if (html.includes(oldChange)) {
  html = html.replace(oldChange, newChange);
} else {
  html = html.replace(
    /function changeDietDateFromCalendar\(dateStr\) \{ dietViewDate = new Date\(dateStr\); updateDietAndHealthDisplay\(\); \}/,
    newChange
  );
}

// Weight log sort: compare YYYY-MM-DD strings lexicographically (calendar-safe)
html = html.replace(
  /appData\.weightLogs\.sort\(\(a,b\) => new Date\(a\.date\) - new Date\(b\.date\)\);/g,
  'appData.weightLogs.sort((a,b) => String(a.date).localeCompare(String(b.date)));'
);
html = html.replace(
  /\[\.\.\.appData\.weightLogs\]\.sort\(\(a,b\) => new Date\(a\.date\) - new Date\(b\.date\)\)/g,
  '[...appData.weightLogs].sort((a,b) => String(a.date).localeCompare(String(b.date)))'
);

fs.writeFileSync(htmlPath, html);
console.log('Applied Asia/Tokyo calendar-date hardening to www/index.html COPY only');
