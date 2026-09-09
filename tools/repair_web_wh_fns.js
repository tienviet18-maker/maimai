/**
 * Repair Web index: force Android Women's Health function bodies for key APIs.
 * Run after port_wh_to_web.js when keep-last left older Web openDayDetail/renderHome.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ANDROID = path.join(__dirname, '..', 'www', 'index.html');
const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'index.html');

function extractFn(src, name) {
  const token = 'function ' + name + '(';
  const abs = src.indexOf(token);
  if (abs < 0) throw new Error('missing fn ' + name);
  let i = abs;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { j++; break; }
    }
  }
  return src.slice(abs, j);
}

function replaceFn(src, name, body) {
  const token = 'function ' + name + '(';
  const abs = src.indexOf(token);
  if (abs < 0) throw new Error('web missing ' + name);
  let i = abs;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  let j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { j++; break; }
    }
  }
  return src.slice(0, abs) + body + src.slice(j);
}

function removeAllFns(src, name) {
  const token = 'function ' + name + '(';
  while (src.includes(token)) {
    const abs = src.indexOf(token);
    let i = abs;
    while (i < src.length && src[i] !== '{') i++;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    while (j < src.length && /\s/.test(src[j])) j++;
    src = src.slice(0, abs) + src.slice(j);
  }
  return src;
}

let android = fs.readFileSync(ANDROID, 'utf8').replace(/\r\n/g, '\n');
let web = fs.readFileSync(WEB, 'utf8');
const crlf = web.includes('\r\n');
web = web.replace(/\r\n/g, '\n');

const force = [
  'openDayDetail',
  'togglePeriodForSelectedDay',
  'toggleSymptom',
  'saveDailyNote',
  'renderHome',
  'updateMultiPersonaCoach',
  'formatInsightLine',
  'renderHomeCycleCard',
  'renderWhDashboard',
  'renderCycleHistory',
  'renderQuickLogSymptoms',
  'renderDaySymptomButtons',
  'phaseLabel',
  'persistWhAndRefresh',
  'quickStartPeriod',
  'quickMarkOnPeriod',
  'quickEndPeriod',
  'quickSetMood',
  'quickSetEnergy',
  'quickSetPain',
  'quickSetFlow',
  'quickToggleSymptom',
  'getPredictedPeriodDates',
  'getCycleStats',
  'getPeriodStartDates',
  'getDayEnergyKcal',
  'getCycleEngine',
  'getCycleDateDeps',
  'runCycleMigration'
];

// Remove all existing copies, then insert Android bodies before renderCalendar
for (const name of force) {
  web = removeAllFns(web, name);
}

const bundle = force.map((n) => extractFn(android, n)).join('\n\n');
const anchor = web.indexOf('function renderCalendar() {');
if (anchor < 0) throw new Error('renderCalendar missing');
web = web.slice(0, anchor) + bundle + '\n\n' + web.slice(anchor);

// Ensure renderHome ends with renderHomeCycleCard call
if (!extractFn(web, 'renderHome').includes('renderHomeCycleCard')) {
  web = replaceFn(web, 'renderHome', extractFn(android, 'renderHome'));
}

const out = crlf ? web.replace(/\n/g, '\r\n') : web;
fs.writeFileSync(WEB, out, 'utf8');

const check = (n) => ((out.match(new RegExp('function ' + n + '\\\\(', 'g')) || []).length);
console.log('REPAIR_OK');
console.log({
  openDayDetail: check('openDayDetail'),
  lifestyle: out.includes('day-lifestyle-text'),
  cycleDay: out.includes('getCurrentCycleDay'),
  renderHomeCard: extractFn(out.replace(/\r\n/g, '\n'), 'renderHome').includes('renderHomeCycleCard'),
  predictedEng: out.includes('eng.getPredictedPeriodDates'),
  pickMai: out.includes('pickMaiCycleContext'),
  scrub: out.includes('scrubToUnsetKeepingPrefs')
});
