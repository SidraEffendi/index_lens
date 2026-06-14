const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles('/tmp/test_data.csv');
    await page.waitForSelector('svg circle', { timeout: 10000 });

    // Read initial state
    const initialBadge = await page.locator('.info-badge').first().textContent();
    console.log('✅ Initial graph:', initialBadge.trim());

    const checkedCols = await page.locator('.col-chip.checked .col-name').allTextContents();
    console.log('✅ Auto-selected columns:', checkedCols);

    await page.screenshot({ path: '/tmp/sel_01_initial.png', fullPage: true });
    console.log('📸 sel_01_initial.png');

    // Uncheck Department and Role, keep only City
    const chips = page.locator('.col-chip');
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      const name = await chips.nth(i).locator('.col-name').textContent();
      const isChecked = await chips.nth(i).locator('input').isChecked();
      if (isChecked && name !== 'City') {
        await chips.nth(i).locator('input').click();
        console.log(`  unchecked: ${name}`);
      }
    }

    // Rebuild
    await page.locator('.rebuild-btn').click();
    await page.waitForFunction(() => !document.querySelector('.loading-badge'), { timeout: 8000 });

    const cityBadge = await page.locator('.info-badge').first().textContent();
    console.log('✅ City-only graph:', cityBadge.trim());

    await page.screenshot({ path: '/tmp/sel_02_city_only.png', fullPage: true });
    console.log('📸 sel_02_city_only.png');

    // Now check only Department
    for (let i = 0; i < count; i++) {
      const name = await chips.nth(i).locator('.col-name').textContent();
      const isChecked = await chips.nth(i).locator('input').isChecked();
      if (name === 'City' && isChecked) await chips.nth(i).locator('input').click();
      if (name === 'Department' && !isChecked) await chips.nth(i).locator('input').click();
    }
    await page.locator('.rebuild-btn').click();
    await page.waitForFunction(() => !document.querySelector('.loading-badge'), { timeout: 8000 });

    const deptBadge = await page.locator('.info-badge').first().textContent();
    console.log('✅ Department-only graph:', deptBadge.trim());

    // Probe: Rebuild button disabled when nothing checked
    for (let i = 0; i < count; i++) {
      const isChecked = await chips.nth(i).locator('input').isChecked();
      if (isChecked) await chips.nth(i).locator('input').click();
    }
    const rebuildDisabled = await page.locator('.rebuild-btn').isDisabled();
    console.log(`🔍 Rebuild disabled when no columns selected: ${rebuildDisabled}`);

    await page.screenshot({ path: '/tmp/sel_03_final.png', fullPage: true });
    console.log('📸 sel_03_final.png');

  } catch (e) {
    console.error('❌', e.message);
    await page.screenshot({ path: '/tmp/sel_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
