/**
 * User data tools: backup export, restore and "delete all data".
 * Backup format: { kind: 'maimai-backup', formatVersion: 1, storeKey, exportedAt, appVersion, data: appData }.
 * Restore writes the backup's appData to maimai_app_store_v2 and reloads; loadState() then runs the
 * normal sanitize/migration path, so older backups upgrade the same way as old local data.
 */
(function (root) {
  'use strict';

  var STORE_KEY = 'maimai_app_store_v2';
  var BACKUP_KIND = 'maimai-backup';
  var FORMAT_VERSION = 1;

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function localStamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function buildBackup(appData, opts) {
    var now = (opts && opts.now) || new Date();
    return {
      kind: BACKUP_KIND,
      formatVersion: FORMAT_VERSION,
      storeKey: STORE_KEY,
      exportedAt: now.toISOString(),
      appVersion: (opts && opts.appVersion) || null,
      data: JSON.parse(JSON.stringify(appData || {}))
    };
  }

  function backupFileName(now) {
    return 'maimai-backup_' + localStamp(now || new Date()) + '.json';
  }

  /** Accepts a MaiMai backup file, or a raw appData object (older manual exports). */
  function parseBackup(text) {
    var obj;
    try {
      obj = JSON.parse(String(text || ''));
    } catch (e) {
      return { ok: false, reason: 'not_json' };
    }
    var data = null;
    var exportedAt = null;
    if (isPlainObject(obj) && obj.kind === BACKUP_KIND) {
      if (Number(obj.formatVersion) > FORMAT_VERSION) return { ok: false, reason: 'newer_format' };
      data = obj.data;
      exportedAt = obj.exportedAt || null;
    } else {
      data = obj;
    }
    if (!isPlainObject(data) || !isPlainObject(data.profile)) return { ok: false, reason: 'no_profile' };
    if (data.dailyRecords != null && !isPlainObject(data.dailyRecords)) return { ok: false, reason: 'bad_daily_records' };
    var lists = ['weightLogs', 'periodRecords', 'favorites', 'myFoods'];
    for (var i = 0; i < lists.length; i++) {
      if (data[lists[i]] != null && !Array.isArray(data[lists[i]])) return { ok: false, reason: 'bad_' + lists[i] };
    }
    return {
      ok: true,
      data: data,
      exportedAt: exportedAt,
      days: data.dailyRecords ? Object.keys(data.dailyRecords).length : 0
    };
  }

  function nativePlugins() {
    var cap = root.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    var p = cap.Plugins || {};
    return { Filesystem: p.Filesystem || null, Share: p.Share || null };
  }

  /** Saves the backup: native share sheet on Android (Filesystem + Share plugins), file download on the web. */
  async function exportBackup(appData, opts) {
    var now = new Date();
    var json = JSON.stringify(buildBackup(appData, { now: now, appVersion: opts && opts.appVersion }), null, 2);
    var name = backupFileName(now);
    var native = nativePlugins();
    if (native) {
      if (!native.Filesystem || !native.Share) return { ok: false, reason: 'plugins_missing' };
      var written = await native.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await native.Share.share({ title: name, files: [written.uri] });
      return { ok: true, fileName: name, via: 'share' };
    }
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return { ok: true, fileName: name, via: 'download' };
  }

  function restoreBackupData(data) {
    root.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  /**
   * Deletes cloud data first; local data is cleared only when the cloud step succeeded or there was
   * nothing in the cloud, so a failed network call never leaves orphaned server data without a session.
   */
  async function deleteAllData() {
    var cloud = { ok: true, skipped: 'not_loaded' };
    if (root.MaiMaiSupabaseSync && typeof root.MaiMaiSupabaseSync.deleteMyCloudData === 'function') {
      cloud = await root.MaiMaiSupabaseSync.deleteMyCloudData();
    }
    if (!cloud.ok) return { ok: false, stage: 'cloud', error: cloud.error };
    try {
      root.localStorage.clear();
    } catch (e) {
      return { ok: false, stage: 'local', error: String(e && e.message ? e.message : e) };
    }
    try {
      if (root.caches && root.caches.keys) {
        var keys = await root.caches.keys();
        await Promise.all(keys.map(function (k) { return root.caches.delete(k); }));
      }
    } catch (e2) { /* cached app files hold no personal data */ }
    return { ok: true, cloud: cloud };
  }

  var api = {
    STORE_KEY: STORE_KEY,
    buildBackup: buildBackup,
    backupFileName: backupFileName,
    parseBackup: parseBackup,
    exportBackup: exportBackup,
    restoreBackupData: restoreBackupData,
    deleteAllData: deleteAllData
  };
  root.MaiMaiDataTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
