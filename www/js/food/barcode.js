/**
 * Packaged food lookup by barcode (EAN-13 / EAN-8 / UPC-A / GTIN-14) via Open Food Facts.
 * Only the barcode number is sent. Values are the producer's per-100 g label as published on
 * Open Food Facts (ODbL); products without an energy value per 100 g are rejected, never estimated.
 */
(function (root) {
  'use strict';

  var API = 'https://world.openfoodfacts.org/api/v2/product/';
  var FIELDS = 'code,product_name,product_name_vi,product_name_en,product_name_ja,generic_name,brands,quantity,serving_size,serving_quantity,nutriments';

  function cleanCode(raw) {
    return String(raw || '').replace(/[\s-]/g, '');
  }

  /** GTIN check digit (mod 10, weights 3/1 from the right). */
  function isValidBarcode(raw) {
    var code = cleanCode(raw);
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
    var sum = 0;
    for (var i = code.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(code[i]) * w;
    return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
  }

  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : null;
  }

  function round(v, d) {
    if (v == null) return null;
    var f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  /** Open Food Facts JSON -> food fields for createMyFood, or { ok:false, reason }. */
  function mapProduct(json, code, lang) {
    if (!json || json.status !== 1 || !json.product) return { ok: false, reason: 'not_found' };
    var p = json.product;
    var n = p.nutriments || {};
    var kcal = num(n['energy-kcal_100g']);
    if (kcal == null && num(n.energy_100g) != null && (!n.energy_unit || n.energy_unit === 'kJ')) kcal = num(n.energy_100g) / 4.184;
    if (kcal == null) return { ok: false, reason: 'no_nutrition' };
    var sodiumG = num(n.sodium_100g);
    if (sodiumG == null && num(n.salt_100g) != null) sodiumG = num(n.salt_100g) / 2.5;
    var name = (lang && p['product_name_' + lang]) || p.product_name_vi || p.product_name || p.product_name_en || p.generic_name || '';
    name = String(name).trim();
    var brand = String(p.brands || '').split(',')[0].trim();
    if (!name) name = brand || code;
    var display = brand && name.toLowerCase().indexOf(brand.toLowerCase()) < 0 ? name + ' (' + brand + ')' : name;
    var serving = num(p.serving_quantity);
    return {
      ok: true,
      food: {
        name: display,
        barcode: code,
        brand: brand || null,
        quantity: p.quantity || null,
        energyKcal: round(kcal, 0),
        protein: round(num(n.proteins_100g), 1),
        fat: round(num(n.fat_100g), 1),
        carbohydrate: round(num(n.carbohydrates_100g), 1),
        fiber: round(num(n.fiber_100g), 1),
        sodium: sodiumG == null ? null : round(sodiumG * 1000, 0),
        defaultGrams: serving && serving > 0 && serving < 2000 ? serving : 100,
        servingLabel: p.serving_size || null
      }
    };
  }

  function lookup(raw, opts) {
    opts = opts || {};
    var code = cleanCode(raw);
    if (!isValidBarcode(code)) return Promise.resolve({ ok: false, reason: 'invalid_code' });
    var f = opts.fetch || (typeof fetch === 'function' ? fetch.bind(root) : null);
    if (!f) return Promise.resolve({ ok: false, reason: 'offline' });
    return f(API + encodeURIComponent(code) + '.json?fields=' + FIELDS, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 404) return { status: 0 };
        if (!res.ok) throw new Error('http_' + res.status);
        return res.json();
      })
      .then(function (json) { return mapProduct(json, code, opts.lang); })
      .catch(function () { return { ok: false, reason: 'offline' }; });
  }

  /** Camera scanning needs BarcodeDetector (Chrome / Edge; not Safari, Firefox or the Android WebView) and a camera. */
  function canScanWithCamera() {
    return typeof root.BarcodeDetector === 'function' && !!(root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
  }

  var api = { isValidBarcode: isValidBarcode, cleanCode: cleanCode, mapProduct: mapProduct, lookup: lookup, canScanWithCamera: canScanWithCamera, API: API };
  root.MaiMaiBarcode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
