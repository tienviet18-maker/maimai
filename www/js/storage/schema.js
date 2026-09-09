/**
 * Storage schema markers for MaiMai canonical appData (maimai_app_store_v2).
 * Single write path remains saveState() in index.html.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MaiMaiStorageSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    STORE_KEY: 'maimai_app_store_v2',
    LEGACY_KEYS: ['maimai_app_store_v1', 'yenmai_pro_data'],
    /** Cycle V2 / Women's Health */
    SCHEMA_VERSION_CYCLE_V2: 4,
    ensureShape: function (data) {
      if (!data || typeof data !== 'object') return data;
      if (!Array.isArray(data.periodRecords)) data.periodRecords = [];
      if (!data.dailyRecords) data.dailyRecords = {};
      return data;
    }
  };
});
