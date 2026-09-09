# MaiMai Android Wrapper — Copied Assets

Source of truth (FROZEN, never modified by this wrapper):
`C:\Users\tienv\OneDrive\Desktop\WellnessApp_Store`

## Exact files copied into `www/`

| Source | Destination |
|--------|-------------|
| WellnessApp_Store/index.html | www/index.html (then COPY-only bridge patch) |
| WellnessApp_Store/data/foods/foods_db.js | www/data/foods/foods_db.js |
| WellnessApp_Store/data/foods/foods.json | www/data/foods/foods.json |
| WellnessApp_Store/data/foods/food_catalog_pending.json | www/data/foods/food_catalog_pending.json |
| WellnessApp_Store/data/foods/import_report.json | www/data/foods/import_report.json |

## COPY-only additions (NOT in frozen source)

| File | Purpose |
|------|---------|
| www/admob.config.js | Test AdMob IDs + PLACEHOLDER production slots |
| www/index.html bridge CSS/JS | Android back button, body ad safe-area, AdMob banner init |

## Not copied (excluded)

- tools/
- node_modules/
- backups (*.bak_*)
- data/raw/
- QA reports
- patch scripts from WellnessApp_Store

## SHA256 at copy time (frozen originals)

- index.html: 458CEA238EB8C11FD16D760BBCB5B0468E958ACFC332B0C8B8405BA3BB2391BB
- foods_db.js: 08D53F619BB66F44D50B9CF6B829B674509D273A014C39806C68441E585A432D
