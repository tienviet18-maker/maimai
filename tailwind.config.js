/** Tailwind build for MaiMai (replaces the cdn.tailwindcss.com runtime so the app works offline).
 * Rebuild after changing classes in www/: npm run build:css */
module.exports = {
  content: ['./www/index.html', './www/privacy.html', './www/js/**/*.js', './www/*.js'],
  theme: { extend: {} },
  plugins: []
};
