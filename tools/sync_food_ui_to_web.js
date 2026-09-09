/**
 * Sync food search/display helpers from Android www/index.html → Web index.html
 * and copy food_repository.js. Preserves Web scrub/PWA/AdMob.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AND = path.join(__dirname, '..', 'www', 'index.html');
const WEB = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'index.html');
const REPO_SRC = path.join(__dirname, '..', 'www', 'js', 'food', 'food_repository.js');
const REPO_DST = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY', 'js', 'food', 'food_repository.js');

function extractFn(src, name) {
  const token = 'function ' + name + '(';
  const abs = src.indexOf(token);
  if (abs < 0) throw new Error('missing ' + name);
  let i = abs;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) { j++; break; }
    }
  }
  return src.slice(abs, j);
}

function removeAllFns(src, name) {
  const token = 'function ' + name + '(';
  while (src.includes(token)) {
    const abs = src.indexOf(token);
    let i = abs;
    while (i < src.length && src[i] !== '{') i++;
    let depth = 0, j = i;
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

let android = fs.readFileSync(AND, 'utf8').replace(/\r\n/g, '\n');
let web = fs.readFileSync(WEB, 'utf8');
const crlf = web.includes('\r\n');
web = web.replace(/\r\n/g, '\n');

const names = [
  'buildFoodSearchIndex', 'getFoodRepo', 'foodDisplayName', 'foodResultSubtitle',
  'searchFoods', 'onSearchFood', 'selectFoodItem', 'addFoodToDailyLog'
];

// Extract helpers that are not only function decls — getFoodRepo etc.
function extractBetween(src, startTok, endTok) {
  const a = src.indexOf(startTok);
  const b = src.indexOf(endTok, a);
  if (a < 0 || b < 0) throw new Error('block missing ' + startTok);
  return src.slice(a, b);
}

const helperBlock = extractBetween(
  android,
  'function buildFoodSearchIndex() {',
  'function refreshTodayBoundary(opts) {'
);

for (const n of names) web = removeAllFns(web, n);
// Also remove leftover buildFoodSearchIndex(); call duplicates carefully later

const insertAt = web.indexOf('function refreshTodayBoundary(opts) {');
if (insertAt < 0) {
  // fallback before searchFoods remnants
  const alt = web.indexOf('// ================= GLOBALS =================');
  if (alt < 0) throw new Error('insert point missing');
  web = web.slice(0, alt) + helperBlock + '\n' +
    extractFn(android, 'searchFoods') + '\n\n' +
    extractFn(android, 'addFoodToDailyLog') + '\n\n' +
    extractFn(android, 'onSearchFood') + '\n\n' +
    extractFn(android, 'selectFoodItem') + '\n\n' +
    web.slice(alt);
} else {
  web = web.slice(0, insertAt) + helperBlock + '\n' +
    extractFn(android, 'searchFoods') + '\n\n' +
    extractFn(android, 'addFoodToDailyLog') + '\n\n' +
    web.slice(insertAt);
  // onSearchFood / selectFoodItem near diet UI
  web = removeAllFns(web, 'onSearchFood');
  web = removeAllFns(web, 'selectFoodItem');
  const dietAnchor = web.indexOf('function onGramChange(grams) {');
  if (dietAnchor < 0) throw new Error('onGramChange missing');
  web = web.slice(0, dietAnchor) +
    extractFn(android, 'onSearchFood') + '\n\n' +
    extractFn(android, 'selectFoodItem') + '\n\n' +
    web.slice(dietAnchor);
}

fs.copyFileSync(REPO_SRC, REPO_DST);
const out = crlf ? web.replace(/\n/g, '\r\n') : web;
fs.writeFileSync(WEB, out);
console.log({
  ok: true,
  searchFoods: (out.match(/function searchFoods\(/g) || []).length,
  onSearchFood: (out.match(/function onSearchFood\(/g) || []).length,
  foodDisplayName: out.includes('function foodDisplayName'),
  scrub: out.includes('scrubToUnsetKeepingPrefs')
});
