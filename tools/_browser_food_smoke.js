const { chromium } = require('playwright');
const path = require('path');
const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const report = [];
  const errors = [];
  const log = (name, pass, detail) => {
    report.push({ name, pass, detail });
    console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('dialog', async d => { try { await d.accept(); } catch (_) {} });

  await page.addInitScript(() => {
    if (sessionStorage.getItem('seed') === '1') return;
    sessionStorage.setItem('seed', '1');
    localStorage.clear();
    const today = new Date();
    const tz = today.getTimezoneOffset() * 60000;
    const TODAY_STR = new Date(today.getTime() - tz).toISOString().split('T')[0];
    localStorage.setItem('maimai_app_store_v2', JSON.stringify({
      schemaVersion: 2,
      profile: { age: 25, sex: 'female', height: 160, currentWeight: 55, targetWeight: 52, activityLevel: 1.375, targetCalo: 1500, persona: 'sweet', lang: 'vi', userName: 'Pham', isSetup: true },
      weightLogs: [{ date: TODAY_STR, weight: 55 }],
      dailyRecords: {},
      favorites: ['mext_01088', 'mext_11220'],
      myFoods: []
    }));
  });

  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => Array.isArray(window.FOOD_MASTER) && window.FOOD_MASTER.length > 1000, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('onboarding-modal')?.classList.add('hidden'));

  const meta = await page.evaluate(() => ({
    n: FOOD_MASTER.length,
    pending: (FOOD_CATALOG_PENDING || []).length,
    mext: FOOD_MASTER.filter(f => f.source === 'MEXT').length,
    usda: FOOD_MASTER.filter(f => String(f.source).startsWith('USDA')).length
  }));
  log('db-loaded', meta.n > 10000, JSON.stringify(meta));

  await page.evaluate(() => switchTab('diet'));

  // Search tests
  for (const q of ['thịt gà', 'cơm', 'phở', 'natto', '豆腐', 'nước mắm']) {
    const hits = await page.evaluate((query) => {
      const r = searchFoods(query);
      return { n: r.masterMatches.length, first: r.masterMatches[0] && (r.masterMatches[0].nameVi || r.masterMatches[0].nameEn) };
    }, q);
    log('search-' + q, hits.n > 0, JSON.stringify(hits));
  }

  // Select Japanese food + gram calc
  await page.evaluate(() => selectFoodItem('mext_01088', 'master'));
  const calc100 = await page.evaluate(() => {
    document.getElementById('calc-gram-input').value = '100';
    onGramChange(100);
    return document.getElementById('calc-result-energy').innerText;
  });
  const calc150 = await page.evaluate(() => {
    document.getElementById('calc-gram-input').value = '150';
    onGramChange(150);
    return document.getElementById('calc-result-energy').innerText;
  });
  log('gram-rice-100', Number(calc100) === 156, calc100);
  log('gram-rice-150', Number(calc150) === Math.round(156 * 1.5), calc150);

  await page.evaluate(() => addSelectedFoodToMeal());
  const diary = await page.locator('#meal-breakdown-list').innerText();
  log('add-food-diary', /Cơm|rice|精白/i.test(diary), diary.slice(0, 80));

  // Vietnamese pho
  const phoId = await page.evaluate(() => (searchFoods('phở bò').masterMatches[0] || {}).id);
  log('pho-id', !!phoId, phoId);
  if (phoId) {
    await page.evaluate((id) => selectFoodItem(id, 'master'), phoId);
    const e = await page.evaluate(() => { onGramChange(200); return document.getElementById('calc-result-energy').innerText; });
    log('gram-pho-200', Number(e) > 0, e);
  }

  // My Food still separate
  await page.evaluate(() => {
    switchSubDietTab('custom');
    document.getElementById('custom-food-name').value = 'My Test Food';
    document.getElementById('custom-food-kcal').value = '99';
    handleCreateCustomFood(false);
  });
  await page.evaluate(() => switchSubDietTab('myfoods'));
  const my = await page.locator('#my-foods-container').innerText();
  log('my-food-separate', my.includes('My Test Food'), my);
  const stillMaster = await page.evaluate(() => FOOD_MASTER.some(f => f.nameVi === 'My Test Food' || f.nameEn === 'My Test Food'));
  log('my-food-not-in-standard', stillMaster === false);

  // Favorites
  await page.evaluate(() => switchSubDietTab('search'));
  const fav = await page.locator('#favorites-bar button').count();
  log('favorites', fav >= 1, 'count=' + fav);

  // Regression other modules
  await page.evaluate(() => { switchTab('home'); quickAddWaterHome(200); });
  log('water', (await page.locator('#home-water-display').innerText()).includes('200'));
  await page.evaluate(() => { openSleepModal('HOME'); document.getElementById('custom-sleep-input').value = '8'; saveCustomSleep(); });
  log('sleep', (await page.locator('#home-sleep-display').innerText()).includes('8'));
  await page.evaluate(() => { switchTab('track'); document.getElementById('input-weight-track').value = '54'; saveWeight(); });
  log('weight', (await page.locator('#home-current-weight').innerText()).includes('54'));
  await page.evaluate(() => switchTab('chart'));
  await page.waitForTimeout(300);
  log('bmi', (await page.locator('#bmi-val-display').innerText()) !== '--');
  await page.evaluate(() => switchTab('coach'));
  log('coach', (await page.locator('#author-brand-title').innerText()) === 'MaiMai');
  await page.evaluate(() => { switchTab('track'); openDayDetail(TODAY_STR); });
  log('cycle-panel', await page.locator('#day-detail-panel').isVisible());
  log('fertility', !!(await page.locator('#fertility-level-text').innerText()));
  log('memo', await page.locator('#daily-note-input').count() === 1);

  const bad = errors.filter(e => /TypeError|ReferenceError|SyntaxError/i.test(e));
  log('console', bad.length === 0, bad.join(' | ') || 'clean');

  await browser.close();
  const failed = report.filter(r => !r.pass);
  console.log('\n==== BROWSER FOOD ====');
  console.log('passed', report.filter(r => r.pass).length, 'failed', failed.length);
  if (failed.length) failed.forEach(f => console.log(' -', f.name, f.detail));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
