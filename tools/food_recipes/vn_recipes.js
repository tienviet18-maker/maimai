/**
 * MaiMai standard Vietnamese recipes: one typical serving each.
 * Nutrition is calculated from the listed database rows (MEXT / USDA / IFCT), never typed in.
 * Porridge = cooked rice + water (MEXT 全かゆ has no sodium value). Aromatics only used to flavour broth (lemongrass, bones) are left out.
 * Prefer cooked ingredient rows (cooked noodles, cooked meat) so the serving weight needs no yield guess.
 * Format: id: { vi, en, ja, serving: {vi, en, ja}, aliases, ingredients: [[foodId, grams], ...] }
 */
'use strict';

const NOODLES = 'usda_sr_168914'; // Rice noodles, cooked
const BEEF_BROTH = 'usda_sr_171538'; // Beef broth, ready-to-serve
const CHICKEN_BROTH = 'usda_sr_174536'; // Chicken broth, ready-to-serve
const FISH_SAUCE = 'usda_fndds_2706457';
const SUGAR = 'usda_sr_169655';
const LIME = 'usda_sr_168156';
const WATER = 'usda_sr_173647';
const OIL = 'usda_sr_171411';
const ONION = 'usda_sr_170000';
const SCALLION = 'usda_sr_170005';
const CILANTRO = 'ifct_g009';
const MINT = 'ifct_g016';
const BASIL = 'usda_sr_172232';
const SPROUTS = 'usda_fndds_2709768';
const CHILI = 'usda_sr_170106';
const GARLIC = 'usda_sr_169230';
const SHALLOT = 'usda_sr_170499';
const LETTUCE = 'usda_sr_169247';
const CARROT = 'usda_sr_170393';
const DAIKON = 'ifct_f010';
const CUCUMBER = 'usda_sr_168409';
const TOMATO = 'usda_sr_170457';
const PORK_ROAST = 'usda_sr_167844'; // Pork shoulder, lean and fat, roasted
const PORK_GROUND = 'usda_sr_167903'; // Pork, ground, cooked
const PORK_LEG_LEAN = 'usda_sr_168229'; // Pork leg shank half, lean, roasted
const BEEF_SHANK = 'usda_sr_169442'; // Beef shank, lean, simmered
const CHICKEN_BREAST = 'usda_sr_171478'; // Chicken breast, meat only, stewed
const SHRIMP = 'ifct_q008'; // Tiger prawn, raw (IFCT; USDA cooked shrimp has no fibre value)
const CA_TRA = 'ifct_s005';

// Nước chấm (dipping sauce) for one serving
const nuocCham = (fish, sugar, lime, water) => [[FISH_SAUCE, fish], [SUGAR, sugar], [LIME, lime], [WATER, water]];

module.exports = {
  pho_bo_tai: {
    vi: 'Phở bò tái', en: 'Beef pho, rare beef', ja: 'フォー・ボー（レア牛肉）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['phở bò', 'pho bo', 'pho tai', 'beef pho'],
    ingredients: [[NOODLES, 200], ['usda_sr_171762', 70], [BEEF_BROTH, 400], [ONION, 15], [SCALLION, 10], [CILANTRO, 5], [BASIL, 5], [SPROUTS, 30], [LIME, 5], [CHILI, 2]]
  },
  pho_bo_chin: {
    vi: 'Phở bò chín', en: 'Beef pho, well-done brisket/shank', ja: 'フォー・ボー（煮込み牛肉）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['phở bò', 'pho bo', 'pho chin'],
    ingredients: [[NOODLES, 200], [BEEF_SHANK, 70], [BEEF_BROTH, 400], [ONION, 15], [SCALLION, 10], [CILANTRO, 5], [BASIL, 5], [SPROUTS, 30], [LIME, 5]]
  },
  pho_ga: {
    vi: 'Phở gà', en: 'Chicken pho', ja: 'フォー・ガー（鶏肉のフォー）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['pho ga', 'chicken pho'],
    ingredients: [[NOODLES, 200], [CHICKEN_BREAST, 80], [CHICKEN_BROTH, 400], [ONION, 15], [SCALLION, 10], [CILANTRO, 5], [LIME, 5], [CHILI, 2]]
  },
  bun_cha: {
    vi: 'Bún chả Hà Nội', en: 'Bun cha (grilled pork with rice vermicelli)', ja: 'ブンチャー',
    serving: { vi: '1 phần', en: '1 serving', ja: '1人前' }, aliases: ['bún chả', 'bun cha'],
    ingredients: [[NOODLES, 200], [PORK_GROUND, 80], [PORK_ROAST, 60], ...nuocCham(20, 15, 10, 80), [GARLIC, 3], [CHILI, 2], [LETTUCE, 40], [MINT, 10], [BASIL, 5], [CARROT, 15], [DAIKON, 15]]
  },
  bun_bo_hue: {
    vi: 'Bún bò Huế', en: 'Bun bo Hue (spicy beef noodle soup)', ja: 'ブン・ボー・フエ',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['bun bo hue', 'bún bò'],
    ingredients: [[NOODLES, 220], [BEEF_SHANK, 60], ['usda_sr_168227', 60], [BEEF_BROTH, 450], [OIL, 10], [ONION, 15], [SCALLION, 10], [SPROUTS, 30], [BASIL, 5], [LIME, 5]]
  },
  bun_thit_nuong: {
    vi: 'Bún thịt nướng', en: 'Rice vermicelli with grilled pork', ja: 'ブン・ティット・ヌン（焼き豚のせ米麺）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['bun thit nuong', 'grilled pork vermicelli'],
    ingredients: [[NOODLES, 200], [PORK_ROAST, 100], [LETTUCE, 40], [CUCUMBER, 30], [SPROUTS, 30], [MINT, 10], ['usda_sr_173806', 10], [OIL, 5], [SCALLION, 5], ...nuocCham(15, 12, 8, 60), [CARROT, 15], [DAIKON, 15]]
  },
  com_tam_suon: {
    vi: 'Cơm tấm sườn trứng', en: 'Broken rice with grilled pork chop and fried egg', ja: 'コム・タム（豚スペアリブのせご飯）',
    serving: { vi: '1 đĩa', en: '1 plate', ja: '1皿' }, aliases: ['com tam', 'cơm tấm', 'cơm sườn', 'com suon'],
    ingredients: [['mext_01168', 200], ['usda_sr_167827', 120], ['usda_sr_173423', 46], [CUCUMBER, 30], [TOMATO, 20], [CARROT, 10], [DAIKON, 10], [OIL, 5], [SCALLION, 5], ...nuocCham(15, 10, 5, 30)]
  },
  goi_cuon: {
    vi: 'Gỏi cuốn tôm thịt (2 cuốn) kèm nước chấm', en: 'Fresh spring rolls with shrimp and pork (2 rolls) and sauce', ja: 'ゴイクン（生春巻き2本・たれ付き）',
    serving: { vi: '2 cuốn', en: '2 rolls', ja: '2本' }, aliases: ['goi cuon', 'gỏi cuốn', 'fresh spring roll', 'summer roll', '生春巻き'],
    ingredients: [['mext_01169', 20], [NOODLES, 60], [SHRIMP, 40], [PORK_LEG_LEAN, 30], [LETTUCE, 20], [MINT, 5], [BASIL, 3], ['usda_sr_169994', 3], ['usda_sr_172886', 15], ['usda_sr_172470', 8], [WATER, 10], ['usda_sr_173806', 3]]
  },
  banh_mi_thit: {
    vi: 'Bánh mì thịt (pate, giăm bông)', en: 'Banh mi with pâté and ham', ja: 'バインミー（パテ・ハム）',
    serving: { vi: '1 ổ', en: '1 sandwich', ja: '1個' }, aliases: ['banh mi', 'bánh mì', 'banh mi thit', 'バインミー'],
    ingredients: [['usda_sr_172675', 90], ['usda_sr_173864', 30], ['usda_sr_172930', 20], ['mext_17042', 10], [CUCUMBER, 20], [CARROT, 10], [DAIKON, 10], [CILANTRO, 3], [CHILI, 2], ['usda_sr_174277', 3]]
  },
  banh_cuon: {
    vi: 'Bánh cuốn nhân thịt', en: 'Banh cuon (steamed rice rolls with pork)', ja: 'バインクォン（蒸し米粉ロール）',
    serving: { vi: '1 đĩa', en: '1 plate', ja: '1皿' }, aliases: ['banh cuon', 'bánh cuốn'],
    ingredients: [['usda_sr_169714', 45], [WATER, 135], [PORK_GROUND, 40], ['usda_sr_168581', 2], [WATER, 8], [SHALLOT, 10], [OIL, 5], ...nuocCham(15, 10, 5, 60), [SPROUTS, 20], [MINT, 3]]
  },
  chao_ga: {
    vi: 'Cháo gà', en: 'Chicken rice porridge', ja: 'チャオ・ガー（鶏がゆ）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['chao ga', 'chicken congee'],
    ingredients: [['mext_01088', 145], [WATER, 205], [CHICKEN_BREAST, 60], ['ifct_g014', 3], [SCALLION, 5], [SHALLOT, 5], [OIL, 3], [FISH_SAUCE, 5]]
  },
  thit_kho_trung: {
    vi: 'Thịt kho trứng', en: 'Caramelised pork belly with egg', ja: 'ティット・コー・チュン（豚角煮と卵）',
    serving: { vi: '1 phần (1 trứng)', en: '1 serving (1 egg)', ja: '1人前（卵1個）' }, aliases: ['thit kho', 'thịt kho', 'thit kho tau'],
    ingredients: [['usda_sr_167812', 120], ['usda_sr_173424', 50], [FISH_SAUCE, 15], [SUGAR, 8], ['ifct_k002', 100], [SHALLOT, 10], [GARLIC, 5]]
  },
  ca_kho_to: {
    vi: 'Cá kho tộ', en: 'Caramelised braised fish in clay pot', ja: 'カー・コー・ト（魚の土鍋煮）',
    serving: { vi: '1 phần', en: '1 serving', ja: '1人前' }, aliases: ['ca kho', 'cá kho'],
    ingredients: [[CA_TRA, 150], [FISH_SAUCE, 15], [SUGAR, 10], [OIL, 5], [SHALLOT, 10], [GARLIC, 5], [CHILI, 2], [WATER, 50]]
  },
  canh_chua_ca: {
    vi: 'Canh chua cá', en: 'Vietnamese sour fish soup', ja: 'カイン・チュア（魚の甘酸っぱいスープ）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['canh chua', 'sour soup'],
    ingredients: [['usda_sr_175165', 80], [TOMATO, 50], ['usda_sr_169124', 40], [SPROUTS, 30], ['usda_sr_169260', 30], ['usda_sr_167763', 10], [SUGAR, 8], [FISH_SAUCE, 10], [WATER, 300], [OIL, 3], [GARLIC, 3], [CILANTRO, 3]]
  },
  rau_muong_xao_toi: {
    vi: 'Rau muống xào tỏi', en: 'Stir-fried water spinach with garlic', ja: '空芯菜のにんにく炒め',
    serving: { vi: '1 đĩa', en: '1 plate', ja: '1皿' }, aliases: ['rau muong xao', 'morning glory stir fry'],
    ingredients: [['mext_06298', 200], [GARLIC, 10], [OIL, 10], [FISH_SAUCE, 5]]
  },
  bo_luc_lac: {
    vi: 'Bò lúc lắc', en: 'Shaking beef', ja: 'ボー・ルック・ラック（サイコロステーキ炒め）',
    serving: { vi: '1 đĩa', en: '1 plate', ja: '1皿' }, aliases: ['bo luc lac', 'shaking beef'],
    ingredients: [['usda_sr_168634', 120], [ONION, 40], ['usda_sr_170427', 30], ['usda_sr_173410', 5], [OIL, 5], ['usda_sr_174277', 10], [SUGAR, 3], [GARLIC, 5], [LETTUCE, 30], [TOMATO, 30]]
  },
  hu_tieu_nam_vang: {
    vi: 'Hủ tiếu Nam Vang', en: 'Hu tieu Nam Vang (pork and shrimp noodle soup)', ja: 'フーティウ・ナムヴァン',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['hu tieu', 'hủ tiếu', 'hủ tíu', 'hu tiu'],
    ingredients: [[NOODLES, 200], [PORK_LEG_LEAN, 50], [SHRIMP, 30], ['usda_sr_167863', 20], [CHICKEN_BROTH, 400], [SPROUTS, 30], ['usda_sr_169994', 10], [LETTUCE, 10], [GARLIC, 3], [OIL, 3], [SCALLION, 5]]
  },
  bun_rieu_cua: {
    vi: 'Bún riêu cua', en: 'Crab and tomato noodle soup', ja: 'ブン・リュウ（カニとトマトの麺）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['bun rieu', 'bún riêu'],
    ingredients: [[NOODLES, 200], ['ifct_q005', 50], [TOMATO, 60], ['usda_sr_172451', 40], [CHICKEN_BROTH, 400], [OIL, 5], [SCALLION, 5], [SPROUTS, 20], [MINT, 5]]
  },
  xoi_dau_xanh: {
    vi: 'Xôi đậu xanh', en: 'Sticky rice with mung beans', ja: 'ソイ・ダウ・サイン（緑豆おこわ）',
    serving: { vi: '1 gói', en: '1 pack', ja: '1包み' }, aliases: ['xoi', 'xôi', 'sticky rice'],
    ingredients: [['mext_01154', 150], ['usda_sr_174257', 50], [SHALLOT, 5], [OIL, 5]]
  },
  banh_mi_trung: {
    vi: 'Bánh mì trứng ốp la', en: 'Banh mi with fried eggs', ja: 'バインミー（目玉焼き）',
    serving: { vi: '1 ổ (2 trứng)', en: '1 sandwich (2 eggs)', ja: '1個（卵2個）' }, aliases: ['banh mi trung', 'bánh mì ốp la', 'banh mi op la'],
    ingredients: [['usda_sr_172675', 90], ['usda_sr_173423', 92], ['usda_sr_174277', 3], [CUCUMBER, 20], [CILANTRO, 3], [CHILI, 2]]
  },
  bo_kho: {
    vi: 'Bò kho (không kèm bánh mì)', en: 'Vietnamese beef stew (without bread)', ja: 'ボー・コー（牛肉の煮込み）',
    serving: { vi: '1 tô', en: '1 bowl', ja: '1杯' }, aliases: ['bo kho', 'beef stew'],
    ingredients: [[BEEF_SHANK, 120], [CARROT, 60], [BEEF_BROTH, 200], ['ifct_k002', 50], [ONION, 15], [OIL, 5], [SUGAR, 5], [FISH_SAUCE, 10], [GARLIC, 5], [CILANTRO, 3]]
  },
  ca_phe_sua_da: {
    vi: 'Cà phê sữa đá', en: 'Vietnamese iced coffee with condensed milk', ja: 'カフェ・スア・ダー（練乳入りアイスコーヒー）',
    serving: { vi: '1 ly', en: '1 glass', ja: '1杯' }, aliases: ['ca phe sua', 'cafe sua da', 'cà phê sữa', 'bạc xỉu'],
    ingredients: [['usda_sr_171890', 60], ['usda_sr_171275', 30], [WATER, 150]]
  },
  tra_sua_tran_chau: {
    vi: 'Trà sữa trân châu', en: 'Bubble milk tea', ja: 'タピオカミルクティー',
    serving: { vi: '1 ly (~500 ml)', en: '1 cup (~500 ml)', ja: '1杯（約500ml）' }, aliases: ['tra sua', 'trà sữa', 'bubble tea', 'milk tea', 'タピオカ'],
    ingredients: [['usda_sr_173227', 300], ['usda_sr_171263', 25], [SUGAR, 25], ['usda_sr_169717', 25], [WATER, 170]]
  }
};
