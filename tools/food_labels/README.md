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
