# MaiMai

Capacitor wellness app (ViMai) with offline-first storage and Supabase cloud sync.

## Web deploy (Netlify)

- **Publish directory:** `www`
- **Branch:** `main`
- Set Netlify environment variables for Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY` (publishable key)

Inject at build/runtime via `window.__MAIMAI_SUPABASE__` or meta tags — see `www/js/supabase/config.local.example.js`.

## Android build

```bash
npm install
node tools/patch_www_bridge.js
npx cap sync android
```

See `docs/` and `supabase_schema.sql` for backend setup.
