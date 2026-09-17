/**
 * Build static web bundle for Cloudflare Pages.
 * Copies www/ → dist/ and optionally injects Supabase config from env.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'www');
const OUT = path.join(ROOT, 'dist');

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function injectSupabaseConfig(html) {
  const url = (process.env.SUPABASE_URL || process.env.MAIMAI_SUPABASE_URL || '').trim();
  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.MAIMAI_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url || !anonKey) return html;

  const snippet =
    '<script>window.__MAIMAI_SUPABASE__=' +
    JSON.stringify({ url: url, anonKey: anonKey }) +
    ';</script>';

  if (html.includes('window.__MAIMAI_SUPABASE__')) return html;
  return html.replace(
    /<script src="js\/supabase\/config\.local\.js"><\/script>/,
    snippet + '\n    <script src="js/supabase/config.local.js"></script>'
  );
}

function ensureCanonical(html) {
  const canonical = 'https://maimai.vimai.jp/';
  if (html.includes('rel="canonical"')) return html;
  return html.replace(
    /<link rel="manifest" href="manifest\.webmanifest">/,
    '<link rel="canonical" href="' +
      canonical +
      '">\n    <link rel="manifest" href="manifest.webmanifest">'
  );
}

rmDir(OUT);
copyDir(SRC, OUT);

// Never ship local secrets
const localCfg = path.join(OUT, 'js', 'supabase', 'config.local.js');
if (fs.existsSync(localCfg)) fs.unlinkSync(localCfg);

const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = ensureCanonical(html);
html = injectSupabaseConfig(html);
fs.writeFileSync(indexPath, html, 'utf8');

// Cloudflare Pages SPA fallback
fs.writeFileSync(
  path.join(OUT, '_redirects'),
  '/*    /index.html   200\n',
  'utf8'
);

console.log('[build_web] dist ready →', OUT);
console.log(
  '[build_web] supabase inject:',
  process.env.SUPABASE_URL || process.env.MAIMAI_SUPABASE_URL ? 'yes' : 'no (set env on Cloudflare)'
);
