# MaiMai V1 — Production Package Guide
# Generated for Store packaging. Does NOT change runtime behavior.
# App runtime only needs the files listed under INCLUDE.

## INCLUDE (minimum Store / production package)

- index.html
- data/foods/foods_db.js

Optional (not loaded by app at runtime, but useful for audits / future offline tooling):

- data/foods/foods.json
- data/foods/food_catalog_pending.json
- data/foods/import_report.json

## EXCLUDE (do NOT ship in Store package)

### Backups / patches
- index.html.bak_oneshot
- index.html.bak_pre_patch
- _oneshot_patch.js

### QA / test harness / reports
- tools/login_open_qa.js
- tools/login_open_qa_report.json
- tools/playwright_v3_regression.js
- tools/_browser_food_smoke.js
- tools/validate_food_db.js
- tools/.qa_user_data_persistent/ (if present)

### Build-only / source nutrition imports
- tools/build_food_db.js
- data/raw/** (MEXT xlsx, USDA zips/CSVs, ASEAN PDF, samples)

### Dev dependencies
- node_modules/**
- package-lock.json / package.json (if added later for tooling only)

## Runtime notes

- Entry: index.html
- Food DB loader: `<script src="data/foods/foods_db.js"></script>`
- State: localStorage key `maimai_app_store_v2`
- External CDN at runtime (must remain reachable OR be vendored in a later V1.1):
  - https://cdn.tailwindcss.com
  - https://cdn.jsdelivr.net/npm/chart.js
  - https://fonts.googleapis.com (Quicksand)

## Freeze

See MAIMAI_V1_PRODUCTION_FREEZE.md
