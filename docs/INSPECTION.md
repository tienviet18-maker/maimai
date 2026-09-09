# Phase 1 — Inspection Report (READ-ONLY)

Date: 2026-08-29  
Source of truth: `C:\Users\tienv\OneDrive\Desktop\WellnessApp_Store`

## Existing mobile tooling

| Tool | Present? |
|------|----------|
| package.json (app) | NO (only tooling under node_modules) |
| Capacitor | NO |
| Cordova | NO |
| Flutter | NO |
| Android project | NO |
| iOS project | NO |

## How `index.html` loads assets

| Resource | Type | Path |
|----------|------|------|
| Tailwind CSS | CDN script | `https://cdn.tailwindcss.com` |
| Chart.js | CDN script | `https://cdn.jsdelivr.net/npm/chart.js` |
| Food DB | Local script | `data/foods/foods_db.js` |
| Quicksand font | CDN CSS | `https://fonts.googleapis.com/...` |
| App logic | Inline `<script>` | inside `index.html` |

## WebView risk assessment

| Risk | Status | Notes |
|------|--------|-------|
| localhost / 127.0.0.1 | NONE in production HTML | OK for packaged WebView |
| Service Worker | NONE | OK |
| IndexedDB | NONE | Uses localStorage `maimai_app_store_v2` |
| `fetch()` / CORS | Not required for core SPA | Food DB is local JS |
| CDN dependency | YES | Needs INTERNET at runtime unless later vendored in COPY only |
| `file://` | Avoid via Capacitor `https://localhost` / capacitor scheme | Capacitor serves from assets |

## Decision

Least-risk architecture:

**Frozen SPA → COPY into Capacitor `www/` → Android project → AdMob (test IDs) → AAB**

Do NOT rewrite UI into Flutter. Do NOT modify WellnessApp_Store frozen files.
