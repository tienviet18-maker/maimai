'use strict';
const fs = require('fs');
const WEB = 'C:/Users/tienv/OneDrive/Desktop/MAIMAI_WEB_NETLIFY/index.html';
let w = fs.readFileSync(WEB, 'utf8');
const crlf = w.includes('\r\n');
w = w.replace(/\r\n/g, '\n');

function removeFirstFn(src, name) {
  const token = 'function ' + name + '(';
  const abs = src.indexOf(token);
  if (abs < 0) return src;
  const second = src.indexOf(token, abs + 1);
  if (second < 0) return src;
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
  return src.slice(0, abs) + src.slice(j);
}

const names = [
  'setLanguage', 'renderHealthAndHome', 'renderHealthScreen',
  'openWaterModal', 'closeWaterModal', 'openSleepModal', 'closeSleepModal',
  'saveCustomWater', 'saveCustomSleep', 'handleBackdropClick',
  'saveWeight', 'renderWeightBadge'
];
for (const n of names) {
  const before = w.split('function ' + n + '(').length - 1;
  w = removeFirstFn(w, n);
  const after = w.split('function ' + n + '(').length - 1;
  if (before !== after) console.log('deduped', n, before, '->', after);
}

const out = crlf ? w.replace(/\n/g, '\r\n') : w;
fs.writeFileSync(WEB, out);
let d = 0;
const s = out.replace(/\r/g, '').split('<script>').slice(1).join('').split('</script>')[0];
for (const ch of s) {
  if (ch === '{') d++;
  else if (ch === '}') d--;
}
console.log({
  brace: d,
  setLanguage: out.split('function setLanguage(').length - 1,
  scrub: out.includes('scrubToUnsetKeepingPrefs'),
  whDash: out.includes('wh-dashboard'),
  setLangHasWh: (() => {
    const i = out.indexOf('function setLanguage(');
    return out.slice(i, i + 2500).includes('renderCycleHistory');
  })()
});
