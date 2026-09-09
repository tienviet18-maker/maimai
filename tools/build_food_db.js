/**
 * MaiMai Food DB builder — imports ONLY verified nutrition from:
 * - MEXT 日本食品標準成分表（八訂）増補2023年
 * - USDA FoodData Central SR Legacy (2018)
 * - USDA FNDDS Survey (2021-2023 / 2024-10 release)
 *
 * Never invents nutrition values.
 * Run: node tools/build_food_db.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'foods');
const REPORT_PATH = path.join(OUT_DIR, 'import_report.json');

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function parseMextNum(v) {
  if (v == null || v === '' || v === '-' || v === '－' || v === '―') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s === '-' || s === 'Tr' || s === 'tr') return null;
  // MEXT estimated values often wrapped in parentheses / brackets
  s = s.replace(/[()（）\[\]【】]/g, '').replace(/,/g, '').trim();
  if (!s || s === '-' || s === '－') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Curated multilingual aliases for SEARCH only — never changes nutrition. */
const ALIAS_RULES = [
  // Rice / staples
  { test: /精白米.*めし|精白米.*うるち|ご飯|ごはん|めし/, aliases: ['gohan', 'ご飯', 'ごはん', 'rice', 'com', 'cơm', 'cơm trắng', 'white rice'], nameVi: 'Cơm trắng', nameEn: 'White rice, cooked' },
  { test: /玄米.*めし/, aliases: ['brown rice', 'genmai', 'cơm gạo lứt', 'com gao lut'], nameVi: 'Cơm gạo lứt', nameEn: 'Brown rice, cooked' },
  { test: /もち米|もちめし|赤飯/, aliases: ['mochi rice', 'xôi', 'sticky rice', 'glutinous rice'], nameVi: 'Gạo nếp / xôi', nameEn: 'Glutinous rice' },
  { test: /おかゆ|粥/, aliases: ['okayu', 'cháo', 'chao', 'congee', 'rice porridge'], nameVi: 'Cháo', nameEn: 'Rice porridge' },
  // Noodles
  { test: /うどん/, aliases: ['udon', 'mì udon'], nameVi: 'Mì udon', nameEn: 'Udon noodles' },
  { test: /そば(?!ろ)/, aliases: ['soba', 'mì soba', 'buckwheat noodles'], nameVi: 'Mì soba', nameEn: 'Soba noodles' },
  { test: /ラーメン|らーめん/, aliases: ['ramen', 'mì ramen'], nameVi: 'Mì ramen', nameEn: 'Ramen' },
  { test: /そうめん|素麺/, aliases: ['somen', 'somén'], nameVi: 'Mì sōmen', nameEn: 'Somen noodles' },
  { test: /ビーフン|米粉/, aliases: ['bifun', 'rice vermicelli', 'bún gạo', 'bun gao', 'miến gạo'], nameVi: 'Bún gạo / miến gạo', nameEn: 'Rice vermicelli' },
  // Proteins
  { test: /鶏肉|若どり|とり肉|鶏むね|むね.*皮なし|ささみ|にわとり/, aliases: ['chicken', '鶏肉', 'とりにく', 'にく', '肉', 'thịt', 'thit', 'thịt gà', 'thit ga', 'tori'], nameVi: 'Thịt gà', nameEn: 'Chicken' },
  { test: /豚肉|ぶた肉|ぶた\s|豚もも|豚ロース|豚ばら|ぶた\s*［/, aliases: ['pork', '豚肉', 'ぶたにく', 'にく', '肉', 'thịt', 'thit', 'thịt heo', 'thit heo', 'thịt lợn', 'thit lon'], nameVi: 'Thịt heo', nameEn: 'Pork' },
  { test: /牛肉|ぎゅう肉|牛もも|牛ロース|牛ひき|ぎゅう/, aliases: ['beef', '牛肉', 'ぎゅうにく', 'にく', '肉', 'thịt', 'thit', 'thịt bò', 'thit bo'], nameVi: 'Thịt bò', nameEn: 'Beef' },
  { test: /卵|たまご|鶏卵/, aliases: ['egg', '卵', 'たまご', 'trứng', 'trung'], nameVi: 'Trứng', nameEn: 'Egg' },
  { test: /豆腐/, aliases: ['tofu', '豆腐', 'đậu phụ', 'dau phu', 'đậu hũ'], nameVi: 'Đậu phụ', nameEn: 'Tofu' },
  { test: /納豆/, aliases: ['natto', '納豆', 'nattō'], nameVi: 'Nattō', nameEn: 'Natto' },
  { test: /みそ(?!汁)|味噌/, aliases: ['miso'], nameVi: 'Miso', nameEn: 'Miso' },
  // Fish
  { test: /さけ|サケ|鮭|シロサケ/, aliases: ['salmon', 'sake', 'cá hồi', 'ca hoi'], nameVi: 'Cá hồi', nameEn: 'Salmon' },
  { test: /まぐろ|マグロ|鮪/, aliases: ['tuna', 'maguro', 'cá ngừ', 'ca ngu'], nameVi: 'Cá ngừ', nameEn: 'Tuna' },
  { test: /さば|サバ|鯖/, aliases: ['mackerel', 'saba', 'cá thu', 'ca thu'], nameVi: 'Cá thu', nameEn: 'Mackerel' },
  { test: /えび|エビ|海老/, aliases: ['shrimp', 'ebi', 'tôm', 'tom'], nameVi: 'Tôm', nameEn: 'Shrimp' },
  { test: /いか|イカ|烏賊/, aliases: ['squid', 'ika', 'mực', 'muc'], nameVi: 'Mực', nameEn: 'Squid' },
  // Vegetables / fruits
  { test: /にんじん|ニンジン|人参/, aliases: ['carrot', 'cà rốt', 'ca rot'], nameVi: 'Cà rốt', nameEn: 'Carrot' },
  { test: /たまねぎ|タマネギ|玉ねぎ/, aliases: ['onion', 'hành tây', 'hanh tay'], nameVi: 'Hành tây', nameEn: 'Onion' },
  { test: /トマト/, aliases: ['tomato', 'cà chua', 'ca chua'], nameVi: 'Cà chua', nameEn: 'Tomato' },
  { test: /キャベツ/, aliases: ['cabbage', 'bắp cải', 'bap cai'], nameVi: 'Bắp cải', nameEn: 'Cabbage' },
  { test: /きゅうり|キュウリ/, aliases: ['cucumber', 'dưa leo', 'dua leo'], nameVi: 'Dưa leo', nameEn: 'Cucumber' },
  { test: /ほうれんそう|ホウレンソウ|ほうれん草/, aliases: ['spinach', 'rau chân vịt'], nameVi: 'Rau chân vịt', nameEn: 'Spinach' },
  { test: /バナナ/, aliases: ['banana', 'chuối', 'chuoi'], nameVi: 'Chuối', nameEn: 'Banana' },
  { test: /りんご|リンゴ|林檎/, aliases: ['apple', 'táo', 'tao'], nameVi: 'Táo', nameEn: 'Apple' },
  // Seasonings / oils
  { test: /しょうゆ|醤油/, aliases: ['soy sauce', 'nước tương', 'nuoc tuong', 'shoyu'], nameVi: 'Nước tương', nameEn: 'Soy sauce' },
  { test: /砂糖|上白糖|グラニュー糖/, aliases: ['sugar', 'đường', 'duong'], nameVi: 'Đường', nameEn: 'Sugar' },
  { test: /食塩|塩(?!酸)/, aliases: ['salt', 'muối', 'muoi'], nameVi: 'Muối', nameEn: 'Salt' },
  { test: /こしょう|コショウ|胡椒/, aliases: ['pepper', 'tiêu', 'tieu'], nameVi: 'Tiêu', nameEn: 'Pepper' },
  { test: /サラダ油|菜種油|オリーブ油|ごま油/, aliases: ['oil', 'dầu ăn', 'dau an'], nameVi: 'Dầu ăn', nameEn: 'Cooking oil' },
  { test: /牛乳|ミルク/, aliases: ['milk', 'sữa', 'sua'], nameVi: 'Sữa', nameEn: 'Milk' },
  { test: /ヨーグルト/, aliases: ['yogurt', 'sữa chua', 'sua chua'], nameVi: 'Sữa chua', nameEn: 'Yogurt' },
  { test: /パン(?!ダ)/, aliases: ['bread', 'パン', 'bánh mì âu', 'banh mi au'], nameVi: 'Bánh mì (kiểu Âu/Nhật)', nameEn: 'Bread' },
];

/** English description → Vietnamese / Japanese search aliases for verified USDA/FNDDS foods. */
const EN_ALIAS_MAP = [
  { test: /^Soup, pho, with meat/i, nameVi: 'Phở bò (có thịt)', nameJa: 'フォー（肉入り）', aliases: ['pho', 'phở', 'phở bò', 'pho bo', 'フォー', 'beef pho', 'soup pho'], vn: true },
  { test: /^Soup, pho, no meat/i, nameVi: 'Phở (không thịt)', nameJa: 'フォー（肉なし）', aliases: ['pho', 'phở', 'フォー', 'vegetarian pho'], vn: true },
  { test: /^Fish sauce/i, nameVi: 'Nước mắm', nameJa: '魚醤（ヌクマム）', aliases: ['nuoc mam', 'nước mắm', 'fish sauce', 'ヌクマム'], vn: true },
  { test: /Sauce, fish|Fish sauce/i, nameVi: 'Nước mắm', nameJa: '魚醤（ヌクマム）', aliases: ['nuoc mam', 'nước mắm', 'fish sauce', 'ヌクマム'], vn: true },
  { test: /^Soy sauce(?!, reduced)/i, nameVi: 'Nước tương', nameJa: 'しょうゆ', aliases: ['nuoc tuong', 'nước tương', 'shoyu', 'soy sauce'] },
  { test: /^Natto/i, nameVi: 'Nattō', nameJa: '納豆', aliases: ['natto', '納豆', 'nattō'] },
  { test: /^Miso(?! sauce)/i, nameVi: 'Miso', nameJa: 'みそ', aliases: ['miso', '味噌'] },
  { test: /^Egg roll, with beef and\/or pork/i, nameVi: 'Chả giò / nem rán (thịt)', nameJa: '揚げ春巻き（肉）', aliases: ['cha gio', 'chả giò', 'nem ran', 'nem rán', 'spring roll fried', 'egg roll'], vn: true },
  { test: /^Egg roll, meatless/i, nameVi: 'Chả giò chay', nameJa: '揚げ春巻き（野菜）', aliases: ['cha gio chay', 'egg roll vegetarian'], vn: true },
  { test: /^Egg roll, with shrimp/i, nameVi: 'Chả giò tôm', nameJa: '揚げ春巻き（海老）', aliases: ['cha gio tom', 'shrimp egg roll'], vn: true },
  { test: /^Egg roll, with chicken/i, nameVi: 'Chả giò gà', nameJa: '揚げ春巻き（鶏）', aliases: ['cha gio ga', 'chicken egg roll'], vn: true },
  { test: /^Rice noodles, cooked/i, nameVi: 'Bún / bánh phở (chín)', nameJa: '米麺（ゆで）', aliases: ['bun', 'bún', 'pho noodles', 'rice noodles', 'bánh phở', 'bánh ướt'], vn: true },
  { test: /^Long rice noodles, made from mung beans/i, nameVi: 'Miến (đậu xanh)', nameJa: '春雨（緑豆）', aliases: ['mien', 'miến', 'cellophane noodles', 'bean thread'], vn: true },
  { test: /^Vermicelli, made from soybeans/i, nameVi: 'Miến đậu nành', nameJa: '大豆春雨', aliases: ['soy vermicelli'], vn: true },
  { test: /^Coconut water, unsweetened/i, nameVi: 'Nước dừa', nameJa: 'ココナッツウォーター', aliases: ['nuoc dua', 'nước dừa', 'coconut water'], vn: true },
  { test: /^Dragon fruit/i, nameVi: 'Thanh long', nameJa: 'ドラゴンフルーツ', aliases: ['thanh long', 'pitaya', 'dragon fruit'], vn: true },
  { test: /^Lychee/i, nameVi: 'Vải', nameJa: 'ライチ', aliases: ['vai', 'vải', 'lychee', 'litchi'], vn: true },
  { test: /^Papaya, raw/i, nameVi: 'Đu đủ', nameJa: 'パパイヤ', aliases: ['du du', 'đu đủ', 'papaya'], vn: true },
  { test: /^Mango, raw/i, nameVi: 'Xoài', nameJa: 'マンゴー', aliases: ['xoai', 'xoài', 'mango'], vn: true },
  { test: /^Durian/i, nameVi: 'Sầu riêng', nameJa: 'ドリアン', aliases: ['sau rieng', 'sầu riêng', 'durian'], vn: true },
  { test: /^Guava, raw/i, nameVi: 'Ổi', nameJa: 'グアバ', aliases: ['oi', 'ổi', 'guava'], vn: true },
  { test: /^Jackfruit/i, nameVi: 'Mít', nameJa: 'ジャックフルーツ', aliases: ['mit', 'mít', 'jackfruit'], vn: true },
  { test: /^Rambutan/i, nameVi: 'Chôm chôm', nameJa: 'ランブータン', aliases: ['chom chom', 'chôm chôm', 'rambutan'], vn: true },
  { test: /^Longan/i, nameVi: 'Nhãn', nameJa: 'リュウガン', aliases: ['nhan', 'nhãn', 'longan'], vn: true },
  { test: /^Banana, raw/i, nameVi: 'Chuối', nameJa: 'バナナ', aliases: ['chuoi', 'chuối', 'banana'], vn: true },
  { test: /white rice.*cooked|Rice, white, cooked(?!,)/i, nameVi: 'Cơm trắng', nameJa: '白米ごはん', aliases: ['com', 'cơm', 'cơm trắng', 'rice', 'gohan', 'ご飯'], vn: true },
  { test: /brown rice.*cooked|Rice, brown, cooked/i, nameVi: 'Cơm gạo lứt', nameJa: '玄米ごはん', aliases: ['com gao lut', 'cơm gạo lứt', 'brown rice'], vn: true },
  { test: /Rice, white, cooked, glutinous|glutinous rice.*cooked/i, nameVi: 'Xôi / cơm nếp', nameJa: 'もち米ごはん', aliases: ['xoi', 'xôi', 'sticky rice', 'glutinous rice', 'com nep'], vn: true },
  { test: /^Eggplant, raw/i, nameVi: 'Cà tím (sống)', nameJa: 'なす（生）', aliases: ['ca tim', 'cà tím', 'eggplant'], vn: true },
  { test: /^Eggplant, cooked/i, nameVi: 'Cà tím (chín)', nameJa: 'なす（加熱）', aliases: ['ca tim', 'cà tím', 'eggplant cooked'], vn: true },
  { test: /bean sprouts|soybean sprouts/i, nameVi: 'Giá đỗ', nameJa: 'もやし', aliases: ['gia do', 'giá đỗ', 'bean sprouts'], vn: true },
  { test: /^Shrimp, steamed or boiled/i, nameVi: 'Tôm luộc', nameJa: 'エビ（ゆで）', aliases: ['tom', 'tôm', 'tôm luộc', 'shrimp'], vn: true },
  { test: /^Shrimp, grilled/i, nameVi: 'Tôm nướng', nameJa: 'エビ（焼き）', aliases: ['tom nuong', 'tôm nướng', 'shrimp grilled'], vn: true },
  { test: /^Shrimp, fried/i, nameVi: 'Tôm chiên', nameJa: 'エビ（揚げ）', aliases: ['tom chien', 'tôm chiên', 'shrimp fried'], vn: true },
  { test: /^Shrimp, NFS$/i, nameVi: 'Tôm', nameJa: 'エビ', aliases: ['tom', 'tôm', 'shrimp'], vn: true },
  { test: /^Squid, /i, nameVi: 'Mực', nameJa: 'イカ', aliases: ['muc', 'mực', 'squid'], vn: true },
  { test: /^Clams, steamed or boiled/i, nameVi: 'Nghêu luộc', nameJa: 'アサリ（ゆで）', aliases: ['ngheu', 'nghêu', 'clams'], vn: true },
  { test: /^Crab$/i, nameVi: 'Cua', nameJa: 'カニ', aliases: ['cua', 'crab'], vn: true },
  { test: /^Coffee, brewed/i, nameVi: 'Cà phê đen (pha)', nameJa: 'コーヒー（ドリップ）', aliases: ['ca phe', 'cà phê', 'cà phê đen', 'coffee'], vn: true },
  { test: /^Coffee, instant/i, nameVi: 'Cà phê hòa tan', nameJa: 'インスタントコーヒー', aliases: ['ca phe', 'cà phê', 'instant coffee'], vn: true },
  { test: /^Coffee, NS as to type/i, nameVi: 'Cà phê', nameJa: 'コーヒー', aliases: ['ca phe', 'cà phê', 'coffee'], vn: true },
  { test: /^Kimchi/i, nameVi: 'Kimchi', nameJa: 'キムチ', aliases: ['kimchi', 'キムチ'] },
  { test: /^Tofu\b/i, nameVi: 'Đậu phụ', nameJa: '豆腐', aliases: ['tofu', 'đậu phụ', 'dau phu', '豆腐'], vn: true },
  { test: /^Bok choy/i, nameVi: 'Cải thìa / cải xanh', nameJa: 'チンゲン菜', aliases: ['cai thia', 'cải thìa', 'cải xanh', 'bok choy'], vn: true },
  { test: /^Mustard greens/i, nameVi: 'Cải xanh (mustard)', nameJa: 'カラシナ', aliases: ['cai xanh', 'cải xanh', 'mustard greens'], vn: true },
  { test: /Sweet potato.*cooked|Sweet potato, cooked/i, nameVi: 'Khoai lang (chín)', nameJa: 'さつまいも（加熱）', aliases: ['khoai lang', 'sweet potato'], vn: true },
  { test: /^Taro, cooked/i, nameVi: 'Khoai môn / khoai sọ', nameJa: '里芋（加熱）', aliases: ['khoai mon', 'taro'], vn: true },
  { test: /^Chicken, broilers or fryers, breast/i, nameVi: 'Ức gà', nameJa: '鶏むね', aliases: ['uc ga', 'ức gà', 'chicken breast', 'thịt gà', '鶏肉'] },
  { test: /Pork, fresh.*loin|Pork loin/i, nameVi: 'Thịt heo thăn', nameJa: '豚ロース', aliases: ['thit heo', 'thịt heo', 'pork', '豚肉'] },
  { test: /Pork, fresh, belly/i, nameVi: 'Thịt ba chỉ heo', nameJa: '豚ばら', aliases: ['ba chi', 'thịt ba chỉ', 'pork belly'], vn: true },
  { test: /Beef, .*loin|Beef, ground/i, nameVi: 'Thịt bò', nameJa: '牛肉', aliases: ['thit bo', 'thịt bò', 'beef', '牛肉'] },
  { test: /^Egg, whole, raw/i, nameVi: 'Trứng gà (sống)', nameJa: '鶏卵（生）', aliases: ['trung', 'trứng', 'egg'], vn: true },
  { test: /^Egg, whole, cooked, hard-boiled/i, nameVi: 'Trứng gà luộc', nameJa: 'ゆで卵', aliases: ['trung luoc', 'trứng luộc', 'boiled egg'], vn: true },
  { test: /^Egg, whole, cooked, fried/i, nameVi: 'Trứng chiên', nameJa: '目玉焼き', aliases: ['trung chien', 'trứng chiên', 'fried egg'], vn: true },
  { test: /Fish, .*raw/i, nameVi: 'Cá (sống)', nameJa: '魚（生）', aliases: ['ca', 'cá', 'fish'] },
  { test: /^Bread, french|French bread|baguette/i, nameVi: 'Bánh mì que (kiểu Pháp)', nameJa: 'フランスパン', aliases: ['banh mi que', 'french bread', 'baguette', 'パン'] },
  { test: /^Bread, |^Rolls, /i, nameVi: 'Bánh mì (kiểu Âu)', nameJa: 'パン', aliases: ['bread', 'パン', 'banh mi au'] },
  { test: /Spring roll/i, nameVi: 'Chả giò / gỏi cuốn (tùy loại — kiểm tra mô tả nguồn)', nameJa: '春巻き', aliases: ['spring roll', 'goi cuon', 'gỏi cuốn', 'cha gio', 'chả giò'], vn: true },
  { test: /Peanuts, boiled/i, nameVi: 'Đậu phộng luộc', nameJa: 'ゆで落花生', aliases: ['dau phong', 'đậu phộng', 'peanuts'], vn: true },
  { test: /^Coconut meat, raw/i, nameVi: 'Cơm dừa', nameJa: 'ココナッツ果肉', aliases: ['com dua', 'cơm dừa', 'coconut'], vn: true },
  { test: /Tomato, raw/i, nameVi: 'Cà chua', nameJa: 'トマト', aliases: ['ca chua', 'cà chua', 'tomato'] },
  { test: /Carrots, raw/i, nameVi: 'Cà rốt', nameJa: 'にんじん', aliases: ['ca rot', 'cà rốt', 'carrot'] },
  { test: /Cucumber, raw/i, nameVi: 'Dưa leo', nameJa: 'きゅうり', aliases: ['dua leo', 'dưa leo', 'cucumber'] },
  { test: /Cabbage, raw/i, nameVi: 'Bắp cải', nameJa: 'キャベツ', aliases: ['bap cai', 'bắp cải', 'cabbage'] },
  { test: /Spinach, raw/i, nameVi: 'Rau chân vịt', nameJa: 'ほうれん草', aliases: ['rau chan vit', 'spinach'] },
  { test: /Pumpkin, cooked|Squash, winter.*cooked/i, nameVi: 'Bí đỏ (chín)', nameJa: 'かぼちゃ（加熱）', aliases: ['bi do', 'bí đỏ', 'pumpkin'], vn: true },
  { test: /Garlic, raw/i, nameVi: 'Tỏi', nameJa: 'にんにく', aliases: ['toi', 'tỏi', 'garlic'], vn: true },
  { test: /Ginger root, raw/i, nameVi: 'Gừng', nameJa: 'しょうが', aliases: ['gung', 'gừng', 'ginger'], vn: true },
  { test: /Onions, raw/i, nameVi: 'Hành tây', nameJa: 'たまねぎ', aliases: ['hanh tay', 'hành tây', 'onion'] },
  { test: /Milk, whole/i, nameVi: 'Sữa tươi nguyên kem', nameJa: '牛乳', aliases: ['sua', 'sữa', 'milk'] },
  { test: /Yogurt, plain/i, nameVi: 'Sữa chua', nameJa: 'ヨーグルト', aliases: ['sua chua', 'sữa chua', 'yogurt'] },
];

function applyAliasRules(nameJa, base) {
  const aliases = new Set(base.aliases || []);
  let nameVi = base.nameVi || null;
  let nameEn = base.nameEn || null;
  for (const rule of ALIAS_RULES) {
    if (rule.test.test(nameJa)) {
      rule.aliases.forEach(a => aliases.add(a));
      if (!nameVi && rule.nameVi) nameVi = rule.nameVi;
      if (!nameEn && rule.nameEn) nameEn = rule.nameEn;
    }
  }
  return { aliases: [...aliases], nameVi, nameEn };
}

function applyEnAliasMap(description, base) {
  const aliases = new Set(base.aliases || []);
  let nameVi = base.nameVi || null;
  let nameJa = base.nameJa || null;
  let vn = false;
  for (const rule of EN_ALIAS_MAP) {
    if (rule.test.test(description)) {
      (rule.aliases || []).forEach(a => aliases.add(a));
      if (rule.nameVi) nameVi = rule.nameVi;
      if (rule.nameJa) nameJa = rule.nameJa;
      if (rule.vn) vn = true;
      break;
    }
  }
  return { aliases: [...aliases], nameVi, nameJa, vn };
}

function isValidNutrition(n) {
  if (!n || n.energyKcal == null) return false;
  if (n.energyKcal < 0 || n.energyKcal > 950) return false;
  for (const k of ['protein', 'fat', 'carbohydrate', 'fiber', 'sodium']) {
    if (n[k] != null && n[k] < 0) return false;
  }
  return true;
}

function compactFood(f) {
  return {
    id: f.id,
    type: 'master',
    nameVi: f.nameVi || f.nameEn || f.nameJa,
    nameJa: f.nameJa || f.nameEn || f.nameVi,
    nameEn: f.nameEn || f.nameJa || f.nameVi,
    aliases: f.aliases || [],
    category: f.category || '',
    cuisine: f.cuisine || '',
    source: f.source,
    sourceId: f.sourceId,
    sourceVersion: f.sourceVersion,
    nutritionPer100g: f.nutritionPer100g
  };
}

// ---------- MEXT ----------
function importMext() {
  const file = path.join(ROOT, 'data', 'raw', 'mext_2023.xlsx');
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['表全体'], { header: 1, defval: null, raw: true });
  const foods = [];
  const invalid = [];
  for (let i = 12; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1] || !r[3]) continue;
    const sourceId = String(r[1]).trim();
    if (!/^\d{5}$/.test(sourceId)) continue;
    const nameJa = cleanName(r[3]);
    if (!nameJa || nameJa === '単位' || nameJa === '成分識別子') continue;
    const nutritionPer100g = {
      energyKcal: parseMextNum(r[6]),
      protein: parseMextNum(r[9]),
      fat: parseMextNum(r[12]),
      carbohydrate: parseMextNum(r[20]),
      fiber: parseMextNum(r[18]),
      sodium: parseMextNum(r[23])
    };
    if (!isValidNutrition(nutritionPer100g)) {
      invalid.push({ sourceId, nameJa, reason: 'invalid nutrition', nutritionPer100g });
      continue;
    }
    const group = cleanName(r[0] || '');
    const labeled = applyAliasRules(nameJa, { aliases: [nameJa, sourceId] });
    foods.push(compactFood({
      id: 'mext_' + sourceId,
      nameJa,
      nameVi: labeled.nameVi || nameJa,
      nameEn: labeled.nameEn || nameJa,
      aliases: labeled.aliases,
      category: group || 'MEXT',
      cuisine: 'japanese',
      source: 'MEXT',
      sourceId,
      sourceVersion: '日本食品標準成分表（八訂）増補2023年',
      nutritionPer100g
    }));
  }
  return { foods, invalid };
}

// ---------- USDA CSV helpers ----------
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.length);
  const header = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = (cols[c] || '').replace(/^"|"$/g, '');
    rows.push(obj);
  }
  return rows;
}

// SR Legacy food_nutrient.nutrient_id uses FDC nutrient IDs (1008=Energy kcal, ...)
const NUTRIENT_MAP_SR = {
  '1008': 'energyKcal',
  '1003': 'protein',
  '1004': 'fat',
  '1005': 'carbohydrate',
  '1079': 'fiber',
  '1093': 'sodium'
};
// FNDDS survey food_nutrient.nutrient_id column stores nutrient NUMBER (208=Energy kcal, ...)
const NUTRIENT_MAP_FNDDS = {
  '208': 'energyKcal',
  '203': 'protein',
  '204': 'fat',
  '205': 'carbohydrate',
  '291': 'fiber',
  '307': 'sodium'
};

function importUsdaCsv(foodCsv, nutrientCsv, opts) {
  const foodsRaw = loadCsv(foodCsv);
  const nutsRaw = loadCsv(nutrientCsv);
  const nutrientMap = opts.nutrientMap || NUTRIENT_MAP_SR;
  const byFdc = new Map();
  for (const n of nutsRaw) {
    const key = nutrientMap[n.nutrient_id];
    if (!key) continue;
    const fdc = n.fdc_id;
    if (!byFdc.has(fdc)) byFdc.set(fdc, {});
    const amount = Number(n.amount);
    if (Number.isFinite(amount)) byFdc.get(fdc)[key] = amount;
  }

  const foods = [];
  const invalid = [];
  let skippedFilter = 0;
  for (const f of foodsRaw) {
    const desc = cleanName(f.description);
    if (!desc) continue;
    if (opts.filter && !opts.filter(desc, f)) { skippedFilter++; continue; }
    const nutritionPer100g = byFdc.get(f.fdc_id) || {};
    // require at least energy
    if (nutritionPer100g.energyKcal == null) {
      invalid.push({ fdc: f.fdc_id, desc, reason: 'missing energy' });
      continue;
    }
    if (!isValidNutrition(nutritionPer100g)) {
      invalid.push({ fdc: f.fdc_id, desc, reason: 'invalid nutrition', nutritionPer100g });
      continue;
    }
    const labeled = applyEnAliasMap(desc, { aliases: [desc, f.fdc_id] });
    const cuisine = opts.cuisineFor ? opts.cuisineFor(desc, labeled) : (opts.cuisine || 'international');
    foods.push(compactFood({
      id: opts.idPrefix + f.fdc_id,
      nameEn: desc,
      nameVi: labeled.nameVi || desc,
      nameJa: labeled.nameJa || desc,
      aliases: labeled.aliases,
      category: f.food_category_id || opts.category || 'USDA',
      cuisine,
      source: opts.source,
      sourceId: String(f.fdc_id),
      sourceVersion: opts.sourceVersion,
      nutritionPer100g
    }));
  }
  return { foods, invalid, skippedFilter };
}

function fnddsVietnameseFilter(desc) {
  const d = desc.toLowerCase();
  const keys = [
    'soup, pho',
    'fish sauce',
    'egg roll,',
    'spring roll',
    'rice noodles, cooked',
    'long rice noodles',
    'vermicelli, made from soybeans',
    'coconut water',
    'dragon fruit',
    'lychee',
    'papaya, raw',
    'mango, raw',
    'durian',
    'guava, raw',
    'jackfruit',
    'rambutan',
    'longan',
    'banana, raw',
    'eggplant, raw',
    'eggplant, cooked',
    'bean sprouts',
    'soybean sprouts',
    'shrimp, steamed or boiled',
    'shrimp, grilled',
    'shrimp, fried',
    'shrimp, nfs',
    'squid,',
    'clams, steamed or boiled',
    'crab',
    'rice, white, cooked',
    'rice, brown, cooked',
    'rice, white, cooked, glutinous',
    'coffee, brewed',
    'coffee, instant',
    'coffee, ns as to type',
    'natto',
    'miso',
    'soy sauce',
    'tofu',
    'kimchi',
    'bok choy',
    'mustard greens',
    'sweet potato, cooked',
    'taro, cooked',
    'peanuts, boiled',
    'coconut meat, raw',
    'pumpkin, cooked',
    'egg, whole, raw',
    'egg, whole, cooked, hard-boiled',
    'egg, whole, cooked, fried',
    'garlic, raw',
    'ginger root, raw'
  ];
  return keys.some(k => d.includes(k));
}

function cuisineForFndds(desc, labeled) {
  const d = desc.toLowerCase();
  if (labeled && labeled.vn) return 'vietnamese';
  if (/pho|fish sauce|egg roll|dragon fruit|lychee|papaya|coconut water|rice noodles|long rice noodles|mango|durian|guava|jackfruit|rambutan|longan|banana, raw|eggplant|bean sprouts|shrimp,|squid,|clams, steamed|crab$|glutinous|bok choy|mustard greens|taro|sweet potato|peanuts, boiled|coconut meat|coffee,|egg, whole/.test(d)) return 'vietnamese';
  if (/natto|miso|sushi|ramen|tempura|wasabi|soy sauce|tofu|kimchi/.test(d)) return 'japanese';
  if (/rice, white, cooked|rice, brown, cooked/.test(d)) return 'vietnamese';
  return 'international';
}

function cuisineForSr(desc, labeled) {
  const d = desc.toLowerCase();
  if (labeled && labeled.vn) return 'vietnamese';
  if (/fish sauce|pho\b|spring roll|egg rolls?/.test(d)) return 'vietnamese';
  if (/natto|miso|tofu|sushi|ramen|udon|soy sauce,|nori|wakame|sake\b|matcha/.test(d)) return 'japanese';
  if (labeled && labeled.nameVi && /^(Phở|Nước mắm|Chả giò|Miến|Bún|Nước dừa|Thanh long|Vải|Đu đủ|Xoài|Sầu riêng|Ổi|Mít|Chôm chôm|Nhãn|Chuối|Cơm|Xôi|Cà tím|Giá đỗ|Tôm|Mực|Nghêu|Cua|Cà phê|Đậu phụ|Cải|Khoai|Trứng|Bí đỏ|Tỏi|Gừng|Đậu phộng|Cơm dừa)/i.test(labeled.nameVi)) return 'vietnamese';
  return 'international';
}

/** Foods requested for VN coverage but lacking a verified source nutrition row. */
function buildPendingCatalog() {
  const pending = [
    { nameVi: 'Phở gà', nameEn: 'Chicken pho', nameJa: 'フォー・ガー', reason: 'No exact verified FNDDS/MEXT row for chicken pho (only Soup, pho, with meat)' },
    { nameVi: 'Bún bò Huế', nameEn: 'Bun bo Hue', nameJa: 'ブン・ボー', reason: 'No verified nutrition source in MEXT/USDA downloads' },
    { nameVi: 'Bún chả', nameEn: 'Bun cha', nameJa: 'ブンチャー', reason: 'No verified nutrition source found' },
    { nameVi: 'Bún riêu', nameEn: 'Bun rieu', reason: 'No verified nutrition source found' },
    { nameVi: 'Bún thịt nướng', nameEn: 'Vermicelli with grilled pork', reason: 'No verified nutrition source found' },
    { nameVi: 'Hủ tiếu', nameEn: 'Hu tieu noodle soup', reason: 'No verified nutrition source found' },
    { nameVi: 'Mì Quảng', nameEn: 'Mi Quang', reason: 'No verified nutrition source found' },
    { nameVi: 'Cao lầu', nameEn: 'Cao lau', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh canh', nameEn: 'Banh canh', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh mì thịt', nameEn: 'Vietnamese baguette sandwich with meat', nameJa: 'バインミー', reason: 'No verified USDA/FNDDS sandwich row matching bánh mì thịt' },
    { nameVi: 'Bánh mì trứng', nameEn: 'Vietnamese egg baguette', reason: 'No verified nutrition source found' },
    { nameVi: 'Gỏi cuốn', nameEn: 'Fresh spring roll (goi cuon)', nameJa: '生春巻き', reason: 'USDA has fried egg rolls; fresh goi cuon not in downloaded verified sets' },
    { nameVi: 'Bánh xèo', nameEn: 'Vietnamese savory crepe', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh cuốn', nameEn: 'Steamed rice rolls', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh bèo', nameEn: 'Banh beo', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh khọt', nameEn: 'Banh khot', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh ít', nameEn: 'Banh it', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh tét', nameEn: 'Banh tet', reason: 'No verified nutrition source found' },
    { nameVi: 'Bánh chưng', nameEn: 'Banh chung', reason: 'No verified nutrition source found' },
    { nameVi: 'Cơm tấm', nameEn: 'Broken rice plate', reason: 'No verified nutrition source found' },
    { nameVi: 'Cháo gà', nameEn: 'Chicken congee', reason: 'Generic congee exists; chicken cháo not verified as separate row' },
    { nameVi: 'Cháo lòng', nameEn: 'Offal congee', reason: 'No verified nutrition source found' },
    { nameVi: 'Thịt kho trứng', nameEn: 'Caramelized pork and egg', reason: 'No verified nutrition source found' },
    { nameVi: 'Thịt heo quay', nameEn: 'Roast pork (VN style)', reason: 'No verified VN-style roast pork row' },
    { nameVi: 'Bò kho', nameEn: 'Vietnamese beef stew', reason: 'No verified nutrition source found' },
    { nameVi: 'Bò lúc lắc', nameEn: 'Shaking beef', reason: 'No verified nutrition source found' },
    { nameVi: 'Cá kho tộ', nameEn: 'Clay-pot caramelized fish', reason: 'No verified nutrition source found' },
    { nameVi: 'Rau muống', nameEn: 'Water spinach / morning glory', reason: 'Not found as named item in downloaded USDA/MEXT sets' },
    { nameVi: 'Mồng tơi', nameEn: 'Malabar spinach', reason: 'No verified nutrition source found' },
    { nameVi: 'Rau dền', nameEn: 'Amaranth greens', reason: 'No verified nutrition source found' },
    { nameVi: 'Cà phê sữa đá', nameEn: 'Vietnamese iced milk coffee', reason: 'No verified nutrition source found' },
    { nameVi: 'Nước mía', nameEn: 'Sugarcane juice', reason: 'No verified nutrition source found' },
    { nameVi: 'Mắm tôm', nameEn: 'Shrimp paste (mam tom)', reason: 'No verified nutrition source found' }
  ];
  return pending.map((p, i) => ({ id: 'pending_vn_' + String(i + 1).padStart(3, '0'), status: 'pending_source', ...p }));
}

function dedupeById(foods) {
  const seen = new Map();
  const removed = [];
  for (const f of foods) {
    if (seen.has(f.id)) removed.push(f.id);
    else seen.set(f.id, f);
  }
  return { foods: [...seen.values()], removed };
}

function main() {
  ensureDir(OUT_DIR);
  console.log('Importing MEXT...');
  const mext = importMext();
  console.log('MEXT foods:', mext.foods.length, 'invalid:', mext.invalid.length);

  const srDir = path.join(ROOT, 'data', 'raw', 'usda_sr_legacy', 'FoodData_Central_sr_legacy_food_csv_2018-04');
  console.log('Importing USDA SR Legacy...');
  const usda = importUsdaCsv(
    path.join(srDir, 'food.csv'),
    path.join(srDir, 'food_nutrient.csv'),
    {
      idPrefix: 'usda_sr_',
      source: 'USDA_SR_Legacy',
      sourceVersion: 'FoodData Central SR Legacy April 2018',
      nutrientMap: NUTRIENT_MAP_SR,
      cuisineFor: cuisineForSr
    }
  );
  console.log('USDA SR foods:', usda.foods.length, 'invalid:', usda.invalid.length);

  const fnddsDir = path.join(ROOT, 'data', 'raw', 'usda_fndds', 'FoodData_Central_survey_food_csv_2024-10-31');
  console.log('Importing FNDDS (Vietnamese/Asian subset)...');
  const fndds = importUsdaCsv(
    path.join(fnddsDir, 'food.csv'),
    path.join(fnddsDir, 'food_nutrient.csv'),
    {
      idPrefix: 'usda_fndds_',
      source: 'USDA_FNDDS',
      sourceVersion: 'FoodData Central Survey FNDDS 2021-2023 (CSV 2024-10-31)',
      nutrientMap: NUTRIENT_MAP_FNDDS,
      filter: fnddsVietnameseFilter,
      cuisineFor: cuisineForFndds
    }
  );
  console.log('FNDDS subset foods:', fndds.foods.length, 'invalid:', fndds.invalid.length);

  let all = [...mext.foods, ...usda.foods, ...fndds.foods];
  const dedup = dedupeById(all);
  all = dedup.foods;

  // Classification counts
  const japanese = all.filter(f => f.cuisine === 'japanese' || f.source === 'MEXT');
  const vietnamese = all.filter(f => f.cuisine === 'vietnamese');
  const international = all.filter(f => f.cuisine === 'international' || f.source === 'USDA_SR_Legacy');
  // Avoid double-count: report by cuisine primary
  const byCuisine = {
    japanese: all.filter(f => f.cuisine === 'japanese').length,
    vietnamese: all.filter(f => f.cuisine === 'vietnamese').length,
    international: all.filter(f => f.cuisine === 'international').length
  };

  const pending = buildPendingCatalog();

  const report = {
    generatedAt: new Date().toISOString(),
    totalVerified: all.length,
    japanese: byCuisine.japanese,
    vietnamese: byCuisine.vietnamese,
    international: byCuisine.international,
    mext: all.filter(f => f.source === 'MEXT').length,
    usdaSrLegacy: all.filter(f => f.source === 'USDA_SR_Legacy').length,
    usdaFndds: all.filter(f => f.source === 'USDA_FNDDS').length,
    otherVerified: 0,
    vietnameseVerified: byCuisine.vietnamese,
    vietnamesePending: pending.length,
    foodsWithCalories: all.filter(f => f.nutritionPer100g.energyKcal != null).length,
    foodsWithProtein: all.filter(f => f.nutritionPer100g.protein != null).length,
    foodsWithFat: all.filter(f => f.nutritionPer100g.fat != null).length,
    foodsWithCarbs: all.filter(f => f.nutritionPer100g.carbohydrate != null).length,
    duplicatesRemoved: dedup.removed.length,
    invalidRemoved: mext.invalid.length + usda.invalid.length + fndds.invalid.length,
    sources: [
      '日本食品標準成分表（八訂）増補2023年 — https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html',
      'USDA FoodData Central SR Legacy — https://fdc.nal.usda.gov/download-datasets/',
      'USDA FoodData Central FNDDS Survey — https://fdc.nal.usda.gov/download-datasets/'
    ],
    notes: [
      'Vietnamese Food Composition Table 2017 (FAO) is print-only; not digitally importable here.',
      'Vietnamese verified foods come from USDA FNDDS/SR rows that match Vietnamese dishes/ingredients.',
      'Multilingual nameVi/nameJa/aliases are search labels only; nutrition always from source.'
    ]
  };

  fs.writeFileSync(path.join(OUT_DIR, 'foods.json'), JSON.stringify(all));
  fs.writeFileSync(path.join(OUT_DIR, 'food_catalog_pending.json'), JSON.stringify(pending, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  // JS loader for file:// / static hosting without fetch CORS issues
  const js = '/* AUTO-GENERATED — do not edit. Sources: MEXT 2023, USDA SR Legacy, USDA FNDDS. */\n' +
    'window.FOOD_MASTER = ' + JSON.stringify(all) + ';\n' +
    'window.FOOD_CATALOG_PENDING = ' + JSON.stringify(pending) + ';\n' +
    'window.FOOD_DB_META = ' + JSON.stringify(report) + ';\n';
  fs.writeFileSync(path.join(OUT_DIR, 'foods_db.js'), js);

  console.log('\nDONE');
  console.log(JSON.stringify(report, null, 2));
  console.log('Wrote', path.join(OUT_DIR, 'foods_db.js'), 'bytes', js.length);
}

main();
