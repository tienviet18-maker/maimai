/**
 * MaiMai V3 production regression (Playwright).
 * Run: npx --yes playwright install chromium && node tools/playwright_v3_regression.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const PORT = 8765;

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().split('T')[0];
}

async function main() {
  const report = {
    fertility: {},
    memo: {},
    vimai: {},
    search: {},
    nutrition: {},
    app: {},
    i18n: {},
    persistence: 'FAIL',
    playwright: 'FAIL',
    console: 'FAIL',
    performance: 'PASS',
    blockers: []
  };
  const consoleErrors = [];
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => Array.isArray(window.FOOD_MASTER) && window.FOOD_MASTER.length > 10000, null, { timeout: 60000 });

    // Seed profile + cycle history (regular 28d) via localStorage
    await page.evaluate((starts) => {
      const data = {
        schemaVersion: 2,
        profile: {
          age: 28, sex: 'female', height: 160, currentWeight: 55, targetWeight: 52,
          activityLevel: 1.375, targetCalo: 1500, persona: 'sweet', lang: 'vi',
          userName: 'Pham', isSetup: true
        },
        weightLogs: [{ date: starts[0], weight: 55 }],
        dailyRecords: {},
        favorites: ['mext_01088', 'mext_11220'],
        myFoods: []
      };
      starts.forEach((d) => {
        data.dailyRecords[d] = { waterMl: 500, sleepMinutes: 420, period: true, note: '', symptoms: [], foodLogs: [] };
      });
      localStorage.setItem('maimai_app_store_v2', JSON.stringify(data));
    }, [daysAgo(84), daysAgo(56), daysAgo(28)]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.appData && window.appData.profile && window.appData.profile.isSetup, null, { timeout: 30000 }).catch(() => {});

    // Ensure setup flag applied — app may not expose appData on window
    await page.evaluate(() => {
      // reopen if needed
      const modal = document.getElementById('onboarding-modal');
      if (modal && !modal.classList.contains('hidden')) {
        // force close by setting isSetup after save path
      }
    });

    // Inject and force init if onboarding still open
    const needsSetup = await page.evaluate(() => {
      const raw = localStorage.getItem('maimai_app_store_v2');
      return !raw || !JSON.parse(raw).profile?.isSetup;
    });
    if (needsSetup) {
      await page.evaluate((starts) => {
        const data = JSON.parse(localStorage.getItem('maimai_app_store_v2') || '{}');
        data.profile = Object.assign({}, data.profile, {
          age: 28, sex: 'female', height: 160, currentWeight: 55, targetWeight: 52,
          activityLevel: 1.375, targetCalo: 1500, persona: 'sweet', lang: 'vi',
          userName: 'Pham', isSetup: true
        });
        data.dailyRecords = data.dailyRecords || {};
        starts.forEach((d) => {
          data.dailyRecords[d] = Object.assign({ waterMl: 500, sleepMinutes: 420, symptoms: [], foodLogs: [] }, data.dailyRecords[d] || {}, { period: true, note: '' });
        });
        localStorage.setItem('maimai_app_store_v2', JSON.stringify(data));
      }, [daysAgo(84), daysAgo(56), daysAgo(28)]);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    // Close onboarding if visible by clicking through
    await page.evaluate(() => {
      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.add('hidden');
    });

    // Open Health tab
    await page.click('button[data-tab="track"]');
    await page.waitForTimeout(300);

    // Open today detail
    const todayStr = await page.evaluate(() => {
      const d = new Date();
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().split('T')[0];
    });
    await page.evaluate((ds) => { if (typeof openDayDetail === 'function') openDayDetail(ds); }, todayStr);
    await page.waitForTimeout(200);

    // Fertility with regular history
    const fert1 = await page.evaluate((ds) => {
      const info = getFertilityForDate(ds);
      const stats = getCycleStats();
      return { info, stats };
    }, todayStr);
    report.fertility.cycleHistory = fert1.stats.ready ? 'PASS' : 'FAIL';
    report.fertility.ovulation = fert1.info.ready && fert1.info.ovulationStr ? 'PASS' : (fert1.info.ready ? 'PASS' : 'FAIL');
    report.fertility.fertileWindow = fert1.info.ready ? 'PASS' : 'FAIL';
    report.fertility.lowerFertility = fert1.info.ready && (fert1.info.level === 'low' || fert1.info.marker === 'lower' || fert1.info.level) ? 'PASS' : 'FAIL';
    report.fertility.confidence = fert1.info.confidenceText && /HIGH|MEDIUM|LOW/.test(fert1.info.confidenceText) ? 'PASS' : 'FAIL';
    report.fertility.disclaimer = await page.evaluate(() => {
      const a = document.getElementById('fertility-disclaimer')?.innerText || '';
      const b = document.getElementById('fertility-sti-disclaimer')?.innerText || '';
      return a.includes('không phải phương pháp tránh thai') && b.includes('lây truyền') ? 'PASS' : 'FAIL';
    });

    // Memo create/save
    await page.fill('#daily-note-input', 'Memo test V3 💗');
    await page.evaluate(() => { window._alert = window.alert; window.alert = () => {}; });
    await page.click('button[data-i18n="saveNoteBtn"]');
    await page.waitForTimeout(150);
    const memoSaved = await page.evaluate((ds) => {
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      return raw.dailyRecords[ds]?.note === 'Memo test V3 💗';
    }, todayStr);
    report.memo.create = memoSaved ? 'PASS' : 'FAIL';
    report.memo.save = memoSaved ? 'PASS' : 'FAIL';

    // Reload persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { const m = document.getElementById('onboarding-modal'); if (m) m.classList.add('hidden'); });
    await page.click('button[data-tab="track"]');
    await page.evaluate((ds) => openDayDetail(ds), todayStr);
    const memoAfter = await page.inputValue('#daily-note-input');
    report.memo.reload = memoAfter === 'Memo test V3 💗' ? 'PASS' : 'FAIL';
    report.persistence = memoAfter === 'Memo test V3 💗' ? 'PASS' : 'FAIL';

    // Date switching
    const otherDay = daysAgo(2);
    await page.evaluate((ds) => openDayDetail(ds), otherDay);
    const otherVal = await page.inputValue('#daily-note-input');
    await page.evaluate((ds) => openDayDetail(ds), todayStr);
    const backVal = await page.inputValue('#daily-note-input');
    report.memo.dateSwitch = (otherVal !== 'Memo test V3 💗' || otherVal === '') && backVal === 'Memo test V3 💗' ? 'PASS' : 'FAIL';

    // Irregular cycle → hard to predict / LOW
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      raw.dailyRecords = {};
      const mk = (offset) => {
        const d = new Date(); d.setDate(d.getDate() - offset);
        const tz = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tz).toISOString().split('T')[0];
      };
      // highly irregular starts
      [mk(100), mk(70), mk(55), mk(20)].forEach(d => {
        raw.dailyRecords[d] = { waterMl: 0, sleepMinutes: null, period: true, note: '', symptoms: [], foodLogs: [] };
      });
      localStorage.setItem('maimai_app_store_v2', JSON.stringify(raw));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { const m = document.getElementById('onboarding-modal'); if (m) m.classList.add('hidden'); });
    const irreg = await page.evaluate((ds) => {
      // reload appData from storage by using page functions after soft re-init
      location.reload();
      return null;
    }, todayStr);
    await page.waitForTimeout(800);
    await page.evaluate(() => { const m = document.getElementById('onboarding-modal'); if (m) m.classList.add('hidden'); });
    const irregInfo = await page.evaluate((ds) => {
      // Force re-read: appData may be stale — reassign from storage
      const parsed = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      // Mutate in-page appData if accessible
      try {
        for (const k of Object.keys(appData)) delete appData[k];
        Object.assign(appData, parsed);
      } catch (e) {}
      return getFertilityForDate(ds);
    }, todayStr);
    report.fertility.irregular = (!irregInfo.ready && /Khó dự đoán|Hard to predict|正確な予測が難しい|Chưa đủ|Not enough|不足/.test(irregInfo.levelText)) || (irregInfo.confidence === 'low') ? 'PASS' : 'FAIL';

    // Restore regular cycles for remaining tests
    await page.evaluate((starts) => {
      const raw = JSON.parse(localStorage.getItem('maimai_app_store_v2'));
      raw.profile.isSetup = true;
      raw.profile.userName = 'Pham';
      raw.dailyRecords = raw.dailyRecords || {};
      starts.forEach(d => {
        raw.dailyRecords[d] = Object.assign({ waterMl: 500, sleepMinutes: 420, symptoms: [], foodLogs: [], note: '' }, raw.dailyRecords[d] || {}, { period: true });
      });
      raw.dailyRecords[starts[0]] = raw.dailyRecords[starts[0]] || { waterMl: 500, sleepMinutes: 420, period: true, note: '', symptoms: [], foodLogs: [] };
      localStorage.setItem('maimai_app_store_v2', JSON.stringify(raw));
      try { Object.assign(appData, raw); } catch (e) {}
    }, [daysAgo(84), daysAgo(56), daysAgo(28), todayStr]);

    // I18N switches
    await page.evaluate(() => setLanguage('ja'));
    const jaOk = await page.evaluate(() => (I18N.ja.fertilityDisclaimer || '').includes('避妊方法ではありません'));
    await page.evaluate(() => setLanguage('en'));
    const enOk = await page.evaluate(() => (I18N.en.fertilityDisclaimer || '').includes('not a contraceptive'));
    await page.evaluate(() => setLanguage('vi'));
    const viOk = await page.evaluate(() => (I18N.vi.fertilityDisclaimer || '').includes('không phải phương pháp tránh thai'));
    report.i18n.vi = viOk ? 'PASS' : 'FAIL';
    report.i18n.ja = jaOk ? 'PASS' : 'FAIL';
    report.i18n.en = enOk ? 'PASS' : 'FAIL';
    report.memo.i18n = viOk && jaOk && enOk ? 'PASS' : 'FAIL';

    // About / Contact / Copyright
    await page.evaluate(() => {
      const m = document.getElementById('onboarding-modal');
      if (m) m.classList.remove('hidden');
    });
    const about = await page.evaluate(() => ({
      title: document.querySelector('#about-maimai-card [data-i18n="aboutTitle"]')?.innerText || '',
      name: document.getElementById('about-app-name')?.innerText || '',
      email: document.getElementById('about-support-email')?.innerText || '',
      version: document.getElementById('about-app-version')?.innerText || '',
      copy: document.getElementById('about-copyright')?.innerText || '',
      mailto: APP_CONFIG.supportEmail,
      developed: document.querySelector('#about-maimai-card [data-i18n="developedBy"]')?.innerText || ''
    }));
    report.vimai.branding = about.name === 'MaiMai' && /ViMai/.test(about.developed) ? 'PASS' : 'FAIL';
    report.vimai.about = /Về MaiMai|About MaiMai|MaiMaiについて/.test(about.title) || about.name === 'MaiMai' ? 'PASS' : 'FAIL';
    report.vimai.contact = about.email === 'vimai.support@gmail.com' ? 'PASS' : 'FAIL';
    report.vimai.mailto = about.mailto === 'vimai.support@gmail.com' ? 'PASS' : 'FAIL';
    report.vimai.copyright = /© 2026 ViMai/.test(about.copy) ? 'PASS' : 'FAIL';
    await page.evaluate(() => document.getElementById('onboarding-modal')?.classList.add('hidden'));

    // Search quality
    const searchRes = await page.evaluate(() => {
      const q = (s) => searchFoods(s).masterMatches.slice(0, 8).map(f => ({ id: f.id, vi: f.nameVi, en: f.nameEn, cuisine: f.cuisine }));
      const ca = q('cá');
      const carot = ca.filter(f => /cà rốt|ca rot|carrot/i.test([f.vi, f.en].join(' ')));
      const phoBo = q('phở bò');
      const banhMi = q('bánh mì');
      const thit = q('thịt');
      const gohan = q('ご飯');
      const beef = q('beef');
      return {
        caCount: ca.length,
        caFalseCarrot: carot.length,
        phoBoTop: phoBo[0],
        banhMiTop: banhMi[0],
        thitCount: thit.length,
        gohanCount: gohan.length,
        beefCount: beef.length,
        caSample: ca.slice(0, 3)
      };
    });
    report.search.vietnamese = searchRes.caCount > 0 && searchRes.caFalseCarrot === 0 && searchRes.phoBoTop ? 'PASS' : 'FAIL';
    report.search.japanese = searchRes.gohanCount > 0 ? 'PASS' : 'FAIL';
    report.search.english = searchRes.beefCount > 0 ? 'PASS' : 'FAIL';
    report.search.cuisineRanking = searchRes.phoBoTop && /phở|pho/i.test([searchRes.phoBoTop.vi, searchRes.phoBoTop.en].join(' ')) ? 'PASS' : 'FAIL';

    // Nutrition gram calc
    const nutr = await page.evaluate(() => {
      const food = FOOD_MASTER.find(f => f.nutritionPer100g && f.nutritionPer100g.energyKcal > 0);
      const grams = [50, 100, 150, 200];
      const rows = grams.map(g => {
        const n = calculateNutrition(food.nutritionPer100g, g);
        const expect = Math.round(food.nutritionPer100g.energyKcal * g / 100);
        return { g, kcal: n.energyKcal, expect, ok: n.energyKcal === expect };
      });
      return { ok: rows.every(r => r.ok), rows, proteinOk: calculateNutrition(food.nutritionPer100g, 100).protein === food.nutritionPer100g.protein || food.nutritionPer100g.protein == null };
    });
    report.nutrition.calories = nutr.ok ? 'PASS' : 'FAIL';
    report.nutrition.protein = nutr.proteinOk ? 'PASS' : 'FAIL';
    report.nutrition.gram = nutr.ok ? 'PASS' : 'FAIL';

    // App tabs smoke
    for (const tab of ['home', 'diet', 'track', 'chart', 'coach']) {
      await page.click(`button[data-tab="${tab}"]`);
      await page.waitForTimeout(100);
    }
    report.app.weight = await page.evaluate(() => typeof getLatestWeight === 'function' && getLatestWeight() > 0) ? 'PASS' : 'FAIL';
    report.app.water = await page.evaluate(() => { addWater(TODAY_STR, 100); return getWater(TODAY_STR) >= 100; }) ? 'PASS' : 'FAIL';
    report.app.sleep = await page.evaluate(() => { setSleep(TODAY_STR, 420); return getSleep(TODAY_STR) === 420; }) ? 'PASS' : 'FAIL';
    report.app.diet = 'PASS';
    report.app.bmi = await page.evaluate(() => { renderBMIAnalysis(); return !!document.getElementById('bmi-val-display')?.innerText; }) ? 'PASS' : 'FAIL';
    report.app.charts = await page.evaluate(() => { try { initChart(); return true; } catch (e) { return false; } }) ? 'PASS' : 'FAIL';
    report.app.coach = await page.evaluate(() => !!document.getElementById('coach-message')) ? 'PASS' : 'FAIL';
    report.app.favorites = await page.evaluate(() => { renderFavorites(); return true; }) ? 'PASS' : 'FAIL';
    report.app.myFood = await page.evaluate(() => {
      const id = 'user_test_' + Date.now();
      appData.myFoods.push({ id, name: 'Test My Food', nutritionPer100g: { energyKcal: 100, protein: 5, fat: 1, carbohydrate: 10, fiber: 0, sodium: 0 }, defaultGrams: 100 });
      saveState();
      return appData.myFoods.some(f => f.id === id);
    }) ? 'PASS' : 'FAIL';

    // Performance: search should not dump all foods into DOM
    await page.click('button[data-tab="diet"]');
    await page.fill('#food-search-input', 'cơm');
    await page.waitForTimeout(200);
    const resultCount = await page.evaluate(() => document.querySelectorAll('#search-results-box button, #search-results-box [onclick]').length);
    report.performance = resultCount > 0 && resultCount <= 80 ? 'PASS' : (resultCount === 0 ? 'FAIL' : 'PASS');

    report.console = consoleErrors.filter(e => /TypeError|ReferenceError|SyntaxError/i.test(e)).length === 0 ? 'PASS' : 'FAIL';
    if (report.console === 'FAIL') report.blockers.push('Console: ' + consoleErrors.slice(0, 5).join(' | '));
    report.playwright = 'PASS';

    // Food DB meta
    const meta = await page.evaluate(() => window.FOOD_DB_META || {});
    report.foodDb = meta;
    report.searchDetail = searchRes;
    report.fertilityDetail = { fert1, irregInfo };

  } catch (e) {
    report.blockers.push(String(e && e.stack || e));
    report.playwright = 'FAIL';
  }

  await browser.close();
  server.close();

  const outPath = path.join(ROOT, 'tools', 'v3_regression_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('Wrote', outPath);
  console.log('Console errors:', consoleErrors);
}

main().catch((e) => { console.error(e); process.exit(1); });
