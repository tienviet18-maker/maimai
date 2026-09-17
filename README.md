# MaiMai — ViMai Ecosystem

Health, nutrition & calorie companion in the **ViMai Education & Technology Ecosystem**.

- **Canonical URL:** https://maimai.vimai.jp  
- **Portal:** https://vimai.jp  
- **Stack:** Vanilla Capacitor SPA (`www/`) + Supabase + Cloudflare Pages

## Cloudflare Pages (production)

| Setting | Value |
|---------|--------|
| Framework preset | None (static) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18+ |
| Custom domain | `maimai.vimai.jp` |

### Environment variables (Cloudflare Dashboard)

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

`tools/build_web.js` injects these into `window.__MAIMAI_SUPABASE__` at build time. Never set `service_role` in Pages.

### Local web build

```bash
npm ci
npm run build
npm run preview
```

### wrangler (optional CLI deploy)

```bash
npx wrangler pages deploy dist --project-name=maimai
```

## Android (Capacitor)

```bash
npm install
node tools/patch_www_bridge.js
npx cap sync android
```

## Legal

```
© 2026 ViMai Ecosystem. All rights reserved.
Hệ sinh thái Giáo dục & Công nghệ ViMai
```

See `supabase_schema.sql` for backend tables / RLS.
