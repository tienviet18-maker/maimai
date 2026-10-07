/**
 * Where the Web/PWA build lives for regression tests.
 * Order: $MAIMAI_WEB_DIR → owner's local MAIMAI_WEB_NETLIFY checkout → this repo's www/
 * (Cloudflare Pages builds dist/ straight from www/, so www/ is the web source in CI).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LOCAL_NETLIFY = path.join('C:', 'Users', 'tienv', 'OneDrive', 'Desktop', 'MAIMAI_WEB_NETLIFY');

function webRoot() {
  if (process.env.MAIMAI_WEB_DIR) return process.env.MAIMAI_WEB_DIR;
  if (fs.existsSync(path.join(LOCAL_NETLIFY, 'index.html'))) return LOCAL_NETLIFY;
  return path.join(__dirname, '..', 'www');
}

// Tests that cover Netlify-only behaviour (favicons, AdMob disabled in browser) call this
// and skip when only the shared www/ is available.
function skipUnlessNetlify(name) {
  const root = webRoot();
  if (process.env.MAIMAI_WEB_DIR || root === LOCAL_NETLIFY) return root;
  console.log('SKIP ' + name + ': MAIMAI_WEB_NETLIFY checkout not found (set MAIMAI_WEB_DIR to run)');
  console.log('\nRESULT passed=0 failed=0 skipped=1');
  process.exit(0);
}

module.exports = { webRoot, skipUnlessNetlify, LOCAL_NETLIFY };
