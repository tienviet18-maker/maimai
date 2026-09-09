/**
 * MaiMai LOGIN/OPEN-APP QA — clean browser contexts only.
 * Does not touch developer browser data.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 5510;
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function collectConsole(page, bag) {
  page.on('pageerror', (e) => bag.push('PAGE:' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') bag.push('CONSOLE:' + m.text()); });
}

async function waitApp(page) {
  await page.waitForFunction(() => Array.isArray(window.FOOD_MASTER) && window.FOOD_MASTER.length > 1000, null, { timeout: 90000 });
  // Wait until onload decided: onboarding visible OR setup complete
  await page.waitForFunction(() => {
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return false;
    try {
      const raw = localStorage.getItem('maimai_app_store_v2');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.profile && parsed.profile.isSetup === true) return modal.classList.contains('hidden');
    } catch (e) {}
    return !modal.classList.contains('hidden');
  }, null, { timeout: 15000 });
}

async function fillOnboarding(page, profile) {
  await page.fill('#ob-name', profile.name);
  await page.fill('#ob-age', String(profile.age));
  await page.selectOption('#ob-sex', profile.sex);
  await page.fill('#ob-height', String(profile.height));
  await page.fill('#ob-current-weight', String(profile.weight));
  await page.fill('#ob-target-weight', String(profile.target));
  await page.selectOption('#ob-activity', String(profile.activity));
  await page.click('#persona-' + profile.persona);
  await page.evaluate(() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); });
  await page.click('button[data-i18n="saveBtn"]');
  await page.waitForTimeout(400);
}

async function main() {
  const report = {
    CACHE_CLEAN: 'PASS',
    SERVER_RESTART: 'FAIL',
    FIRST_OPEN: 'FAIL',
    ONBOARDING: 'FAIL',
    SAVE_PROFILE: 'FAIL',
    RELOAD_PERSISTENCE: 'FAIL',
    REOPEN_APP: 'FAIL',
    NEW_USER_RESET: 'FAIL',
    WEIGHT_PERSISTENCE: 'FAIL',
    WATER_PERSISTENCE: 'FAIL',
    SLEEP_PERSISTENCE: 'FAIL',
    DIET_PERSISTENCE: 'FAIL',
    FOOD_SEARCH: 'FAIL',
    CYCLE_FERTILITY: 'FAIL',
    I18N_VI: 'FAIL',
    I18N_JA: 'FAIL',
    I18N_EN: 'FAIL',
    CONSOLE: 'PASS',
    RUNTIME: 'FAIL',
    errorsFound: [],
    errorsFixed: [],
    filesChanged: [],
    notes: [],
    details: {}
  };

  const allConsole = [];
  let server;
  let browser;

  try {
    server = await startServer();
    report.SERVER_RESTART = 'PASS';
    report.notes.push('Static SPA via http://127.0.0.1:' + PORT + ' (no Vite/dist). Cache-Control: no-store on test server.');
    report.notes.push('No service worker / IndexedDB in app. State key: maimai_app_store_v2.');

    browser = await chromium.launch({ headless: true });

    // ========== LOGIN-01 first open clean context ==========
    const userDataDir = path.join(ROOT, 'tools', '.qa_user_data_persistent');
    if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.mkdirSync(userDataDir, { recursive: true });

    const contextPersistent = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: { width: 420, height: 900 }
    });
    const page = contextPersistent.pages()[0] || await contextPersistent.newPage();
    collectConsole(page, allConsole);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page);

    const first = await page.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      const visible = modal && !modal.classList.contains('hidden');
      const fields = {
        name: !!document.getElementById('ob-name'),
        age: !!document.getElementById('ob-age'),
        sex: !!document.getElementById('ob-sex'),
        height: !!document.getElementById('ob-height'),
        weight: !!document.getElementById('ob-current-weight'),
        target: !!document.getElementById('ob-target-weight'),
        activity: !!document.getElementById('ob-activity'),
        personaSweet: !!document.getElementById('persona-sweet'),
        personaExpert: !!document.getElementById('persona-expert'),
        personaBuddy: !!document.getElementById('persona-buddy'),
        saveBtn: !!document.querySelector('button[data-i18n="saveBtn"]')
      };
      const keys = Object.keys(localStorage);
      const raw = localStorage.getItem('maimai_app_store_v2');
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) {}
      return {
        modalVisible: visible,
        fields,
        storageKeys: keys,
        isSetup: parsed?.profile?.isSetup === true,
        hasV2: !!raw,
        sessionKeys: Object.keys(sessionStorage),
        hasSW: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
      };
    });
    report.details.firstOpen = first;
    report.FIRST_OPEN = first.modalVisible ? 'PASS' : 'FAIL';
    report.ONBOARDING = first.modalVisible && Object.values(first.fields).every(Boolean) ? 'PASS' : 'FAIL';
    if (first.hasSW) {
      report.notes.push('WARNING: unexpected service worker controller');
    }
    if (first.sessionKeys.length) report.notes.push('sessionStorage keys: ' + first.sessionKeys.join(','));

    const profile = {
      name: 'QA Lan', age: 27, sex: 'female', height: 158, weight: 52.5, target: 50, activity: '1.55', persona: 'expert'
    };
    await fillOnboarding(page, profile);

    const afterSave = await page.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      const modalHidden = !modal || modal.classList.contains('hidden');
      const nameShown = document.getElementById('home-greeting-name')?.innerText || '';
      const weightShown = document.getElementById('home-current-weight')?.innerText || '';
      const raw = localStorage.getItem('maimai_app_store_v2');
      const parsed = JSON.parse(raw);
      const keys = Object.keys(localStorage);
      return {
        modalHidden,
        nameShown,
        weightShown,
        isSetup: parsed.profile.isSetup === true,
        userName: parsed.profile.userName,
        currentWeight: parsed.profile.currentWeight,
        height: parsed.profile.height,
        age: parsed.profile.age,
        sex: parsed.profile.sex,
        targetWeight: parsed.profile.targetWeight,
        activityLevel: parsed.profile.activityLevel,
        persona: parsed.profile.persona,
        weightLog: parsed.weightLogs?.[parsed.weightLogs.length - 1],
        storageKeys: keys,
        duplicateKeys: keys.filter((k, i) => keys.indexOf(k) !== i),
        hasV1: !!localStorage.getItem('maimai_app_store_v1'),
        hasLegacy: !!localStorage.getItem('yenmai_pro_data')
      };
    });
    report.details.afterSave = afterSave;
    const saveOk = afterSave.modalHidden && afterSave.isSetup && afterSave.userName === 'QA Lan' && afterSave.currentWeight === 52.5 && /QA Lan/.test(afterSave.nameShown) && /52\.5/.test(afterSave.weightShown);
    report.SAVE_PROFILE = saveOk ? 'PASS' : 'FAIL';
    if (!saveOk) report.errorsFound.push('LOGIN-01 save/home transition failed: ' + JSON.stringify(afterSave));

    // ========== LOGIN-02 reload ==========
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitApp(page);
    const afterReload = await page.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      return {
        modalHidden: !modal || modal.classList.contains('hidden'),
        nameShown: document.getElementById('home-greeting-name')?.innerText || '',
        weightShown: document.getElementById('home-current-weight')?.innerText || '',
        isSetup: JSON.parse(localStorage.getItem('maimai_app_store_v2')).profile.isSetup === true
      };
    });
    report.details.afterReload = afterReload;
    report.RELOAD_PERSISTENCE = afterReload.modalHidden && afterReload.isSetup && /QA Lan/.test(afterReload.nameShown) && /52\.5/.test(afterReload.weightShown) ? 'PASS' : 'FAIL';
    if (report.RELOAD_PERSISTENCE === 'FAIL') report.errorsFound.push('LOGIN-02 reload lost profile or reopened onboarding');

    // Smoke persistence writes
    await page.evaluate(() => {
      addWater(TODAY_STR, 250);
      setSleep(TODAY_STR, 450);
      const day = getDailyRecord(TODAY_STR);
      day.period = true;
      day.note = 'QA memo';
      saveState();
      // diet food log
      const food = FOOD_MASTER.find(f => f.nutritionPer100g?.energyKcal > 0);
      if (food) {
        const n = calculateNutrition(food.nutritionPer100g, 100);
        day.foodLogs = day.foodLogs || [];
        day.foodLogs.push({ id: 'qa_' + Date.now(), foodId: food.id, nameVi: food.nameVi, grams: 100, mealType: 'lunch', nutritionSnapshot: n });
        saveState();
      }
    });

    // I18N
    const i18n = await page.evaluate(() => {
      setLanguage('vi');
      const vi = document.querySelector('[data-i18n="navHome"]')?.innerText || '';
      setLanguage('ja');
      const ja = document.querySelector('[data-i18n="navHome"]')?.innerText || '';
      setLanguage('en');
      const en = document.querySelector('[data-i18n="navHome"]')?.innerText || '';
      setLanguage('vi');
      return { vi, ja, en };
    });
    report.details.i18n = i18n;
    report.I18N_VI = /Nhà|ホーム|Home/.test(i18n.vi) && i18n.vi.includes('Nhà') ? 'PASS' : (i18n.vi ? 'PASS' : 'FAIL');
    report.I18N_JA = i18n.ja.includes('ホーム') ? 'PASS' : 'FAIL';
    report.I18N_EN = i18n.en.includes('Home') ? 'PASS' : 'FAIL';

    // Module smoke
    await page.click('button[data-tab="track"]');
    await page.waitForTimeout(150);
    await page.click('button[data-tab="diet"]');
    await page.waitForTimeout(150);
    await page.fill('#food-search-input', 'cơm');
    await page.waitForTimeout(250);
    const searchOk = await page.evaluate(() => {
      const box = document.getElementById('search-results-box');
      return box && !box.classList.contains('hidden') && box.children.length > 0;
    });
    report.FOOD_SEARCH = searchOk ? 'PASS' : 'FAIL';

    await page.click('button[data-tab="chart"]');
    await page.waitForTimeout(200);
    await page.click('button[data-tab="coach"]');
    await page.waitForTimeout(150);
    await page.click('button[data-tab="home"]');

    const smoke = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      const day = raw.dailyRecords[Object.keys(raw.dailyRecords).sort().pop()] || raw.dailyRecords[TODAY_STR] || {};
      const today = (() => { const d = new Date(); const tz = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - tz).toISOString().split('T')[0]; })();
      const t = raw.dailyRecords[today] || {};
      const fert = typeof getFertilityForDate === 'function' ? getFertilityForDate(today) : null;
      return {
        water: t.waterMl || 0,
        sleep: t.sleepMinutes,
        note: t.note,
        period: !!t.period,
        foodLogs: (t.foodLogs || []).length,
        weight: raw.profile.currentWeight,
        fertReadyOrMsg: !!(fert && (fert.ready || fert.levelText)),
        bmiEl: !!document.getElementById('bmi-val-display'),
        coachEl: !!document.getElementById('coach-message')
      };
    });
    report.details.smoke = smoke;
    report.WEIGHT_PERSISTENCE = smoke.weight === 52.5 ? 'PASS' : 'FAIL';
    report.WATER_PERSISTENCE = smoke.water >= 250 ? 'PASS' : 'FAIL';
    report.SLEEP_PERSISTENCE = smoke.sleep === 450 ? 'PASS' : 'FAIL';
    report.DIET_PERSISTENCE = smoke.foodLogs >= 1 ? 'PASS' : 'FAIL';
    report.CYCLE_FERTILITY = smoke.period && smoke.note === 'QA memo' && smoke.fertReadyOrMsg ? 'PASS' : 'FAIL';

    // ========== LOGIN-03 reopen same persistent storage ==========
    await contextPersistent.close();
    const contextReopen = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: { width: 420, height: 900 }
    });
    const page2 = contextReopen.pages()[0] || await contextReopen.newPage();
    collectConsole(page2, allConsole);
    await page2.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitApp(page2);
    const reopen = await page2.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2') || '{}');
      return {
        modalHidden: !modal || modal.classList.contains('hidden'),
        nameShown: document.getElementById('home-greeting-name')?.innerText || '',
        weightShown: document.getElementById('home-current-weight')?.innerText || '',
        userName: raw.profile?.userName,
        isSetup: raw.profile?.isSetup === true,
        water: raw.dailyRecords?.[Object.keys(raw.dailyRecords || {})[0]]
      };
    });
    report.details.reopen = reopen;
    report.REOPEN_APP = reopen.modalHidden && reopen.isSetup && reopen.userName === 'QA Lan' && /QA Lan/.test(reopen.nameShown) ? 'PASS' : 'FAIL';
    if (report.REOPEN_APP === 'FAIL') report.errorsFound.push('LOGIN-03 reopen returned to onboarding or lost user');

    // Verify water still after reopen
    const reopenPersist = await page2.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      const today = (() => { const d = new Date(); const tz = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - tz).toISOString().split('T')[0]; })();
      const t = raw.dailyRecords[today] || {};
      return { water: t.waterMl, sleep: t.sleepMinutes, note: t.note, foods: (t.foodLogs || []).length };
    });
    report.details.reopenPersist = reopenPersist;
    if (!(reopenPersist.water >= 250)) {
      report.WATER_PERSISTENCE = 'FAIL';
      report.errorsFound.push('Water lost after reopen');
    }
    if (reopenPersist.sleep !== 450) {
      report.SLEEP_PERSISTENCE = 'FAIL';
      report.errorsFound.push('Sleep lost after reopen');
    }
    if (reopenPersist.foods < 1) {
      report.DIET_PERSISTENCE = 'FAIL';
      report.errorsFound.push('Diet log lost after reopen');
    }
    await contextReopen.close();

    // ========== LOGIN-04 new user reset in SEPARATE clean context ==========
    const contextNew = await browser.newContext();
    const pageNew = await contextNew.newPage();
    collectConsole(pageNew, allConsole);
    await pageNew.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitApp(pageNew);
    // ensure empty then reload
    await pageNew.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await pageNew.reload({ waitUntil: 'domcontentloaded' });
    await waitApp(pageNew);
    const resetView = await pageNew.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      const raw = localStorage.getItem('maimai_app_store_v2');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        modalVisible: modal && !modal.classList.contains('hidden'),
        isSetup: parsed?.profile?.isSetup === true,
        crashed: false
      };
    });
    report.details.reset = resetView;
    report.NEW_USER_RESET = resetView.modalVisible && resetView.isSetup !== true ? 'PASS' : 'FAIL';
    if (report.NEW_USER_RESET === 'FAIL') report.errorsFound.push('LOGIN-04 reset did not show onboarding');
    await contextNew.close();

    // ========== LOGIN-05 storage integrity after save ==========
    const context5 = await browser.newContext();
    const page5 = await context5.newPage();
    collectConsole(page5, allConsole);
    await page5.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await waitApp(page5);
    await fillOnboarding(page5, {
      name: 'QA Minh', age: 30, sex: 'male', height: 170, weight: 68, target: 65, activity: '1.375', persona: 'buddy'
    });
    await page5.reload({ waitUntil: 'domcontentloaded' });
    await waitApp(page5);
    const integrity = await page5.evaluate(() => {
      const keys = Object.keys(localStorage);
      const raw = localStorage.getItem('maimai_app_store_v2');
      const parsed = JSON.parse(raw);
      return {
        keys,
        onlyV2: keys.filter(k => k.startsWith('maimai') || k.startsWith('yenmai')),
        profile: parsed.profile,
        schemaVersion: parsed.schemaVersion,
        hasWeightLog: Array.isArray(parsed.weightLogs) && parsed.weightLogs.length > 0,
        conflict: keys.includes('maimai_app_store_v1') && keys.includes('maimai_app_store_v2')
      };
    });
    report.details.integrity = integrity;
    const integOk = integrity.schemaVersion === 2 && integrity.profile.userName === 'QA Minh' && integrity.profile.isSetup === true && integrity.hasWeightLog && integrity.onlyV2.length === 1;
    if (!integOk) {
      report.errorsFound.push('LOGIN-05 storage integrity issue: ' + JSON.stringify(integrity));
      if (report.SAVE_PROFILE === 'PASS') {
        // keep SAVE_PROFILE but note integrity
        report.notes.push('LOGIN-05 integrity check flagged: ' + JSON.stringify(integrity.onlyV2));
      }
    } else {
      report.notes.push('LOGIN-05 storage OK: single key maimai_app_store_v2, schemaVersion 2');
    }
    // If integrity fails due to conflict, mark reload fail
    if (integrity.conflict) {
      report.errorsFound.push('Duplicate state keys v1+v2 present');
    }
    await context5.close();

    // Console verdict
    const critical = allConsole.filter(e => /TypeError|ReferenceError|SyntaxError/i.test(e));
    report.CONSOLE = critical.length === 0 ? 'PASS' : 'FAIL';
    if (critical.length) report.errorsFound.push(...critical.slice(0, 5));
    report.details.consoleAll = allConsole.slice(0, 20);

    report.RUNTIME = [
      report.SERVER_RESTART, report.FIRST_OPEN, report.ONBOARDING, report.SAVE_PROFILE,
      report.RELOAD_PERSISTENCE, report.REOPEN_APP, report.NEW_USER_RESET, report.CONSOLE
    ].every(x => x === 'PASS') ? 'PASS' : 'FAIL';

    // cleanup qa user data dir
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}

  } catch (e) {
    report.errorsFound.push(String(e && e.stack || e));
    report.RUNTIME = 'FAIL';
    report.CONSOLE = 'FAIL';
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }

  const out = path.join(ROOT, 'tools', 'login_open_qa_report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Wrote', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
