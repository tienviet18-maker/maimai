# Food label glossaries (Food DB v2)

`tools/relabel_foods_v2.js` rebuilds every display label in `www/data/foods/foods.json`
from the record's **source name** using these files. Nutrition values and provenance are
never touched (the script aborts if the `nutritionLock` fingerprint changes).

| File | Used for | Key |
|---|---|---|
| `mext_ja_vi_glossary.json` | MEXT 八訂 rows | one token of the official Japanese name (`nameJa`, split on spaces/brackets) |
| `usda_en_vi_glossary.json` | USDA SR Legacy / FNDDS rows | one comma segment (or two joined by `, `) of the USDA description, lower-case |

Rules
- A MEXT name is translated only when **every** token is in the glossary; an empty value drops the token (category words such as `魚類`).
- A USDA name is translated when its first segment is known; unknown detail segments stay in English instead of being guessed. Brand / fast-food / baby-food rows keep the English source name.
- Rows without a reviewed translation show the source name (`nameViStatus: source_en`), never an invented Vietnamese label.

To fix a label: edit the glossary entry, run `npm run relabel:foods`, then `npm test`.

## IFCT 2017 supplement

`ifct2017_map.js` lists the IFCT 2017 (ICMR-National Institute of Nutrition, India) rows added for tropical and
Vietnamese staples (cá tra, nước mía, mồng tơi, chôm chôm…). Each code was matched by **scientific name**, not by
the English label. The source values are kept verbatim in `tools/food_sources/ifct2017/compositions_selected.json`
(copied from the MIT-licensed npm package `@ifct2017/compositions`). `node tools/import_ifct2017.js` writes
`www/data/foods/foods_ifct.json` and `foods_ifct.js`, which the app loads after `foods_db.js`; `foods.json` and its
`nutritionLock` are not touched. Conversions: energy kJ ÷ 4.184, sodium g × 1000.
