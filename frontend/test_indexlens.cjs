const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const shots = [];

  const shot = async (name) => {
    const p = `/tmp/indexlens_${name}.png`;
    await page.screenshot({ path: p, fullPage: true });
    shots.push(p);
    console.log(`📸 ${name}: ${p}`);
  };

  try {
    // 1. Load homepage
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    console.log('✅ Page loaded:', await page.title());
    await shot('01_homepage');

    // 2. Upload the CSV via the file input
    await page.locator('input[type="file"]').setInputFiles('/tmp/test_data.csv');
    console.log('✅ File selected');

    // Wait for upload + auto graph build (both are async)
    await page.waitForSelector('.workspace', { timeout: 10000 });
    console.log('✅ Workspace appeared after upload');
    await shot('02_after_upload');

    // 3. Wait for graph SVG to render
    await page.waitForSelector('svg circle', { timeout: 10000 });
    const nodeCount = await page.locator('svg circle').count();
    console.log(`✅ Graph rendered with ${nodeCount} nodes`);
    await shot('03_graph_rendered');

    // 4. Check graph stats badge
    const badge = await page.locator('.info-badge').first().textContent();
    console.log('✅ Graph stats badge:', badge);

    // 5. Check rel-cols line
    const relCols = await page.locator('.rel-cols').textContent();
    console.log('✅ Rel columns:', relCols);

    // 6. Check data preview table appeared
    const thCount = await page.locator('.preview-table th').count();
    console.log(`✅ Preview table: ${thCount} column headers`);

    // 7. Click a node to open inspector
    const firstCircle = page.locator('svg circle').first();
    await firstCircle.click({ force: true });
    await page.waitForTimeout(500);
    const inspectorVisible = await page.locator('.node-inspector').isVisible().catch(() => false);
    console.log(`${inspectorVisible ? '✅' : '⚠️'} Node inspector: ${inspectorVisible ? 'opened' : 'not visible'}`);
    if (inspectorVisible) await shot('04_node_inspector');

    // 8. Close inspector
    if (inspectorVisible) {
      await page.locator('.close-btn').click();
      await page.waitForTimeout(300);
      console.log('✅ Inspector closed');
    }

    // 9. Check chat panel disabled state before graph
    const chatInput = page.locator('.chat-form input');
    const chatDisabled = await chatInput.isDisabled();
    console.log(`${!chatDisabled ? '✅' : '⚠️'} Chat input enabled (graph is ready): ${!chatDisabled}`);

    // 10. PROBE: try uploading a non-CSV file (should show error)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'bad.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello world')
    });
    await page.waitForTimeout(2000);
    const errorVisible = await page.locator('.upload-error').isVisible().catch(() => false);
    console.log(`🔍 Bad file type → error shown: ${errorVisible}`);
    await shot('05_bad_file_error');

    // 11. Re-upload valid CSV to recover
    await page.locator('input[type="file"]').setInputFiles('/tmp/test_data.csv');
    await page.waitForSelector('svg circle', { timeout: 10000 });
    console.log('✅ Re-upload of CSV recovered correctly');

    // 12. Check chat placeholder text
    const placeholder = await chatInput.getAttribute('placeholder');
    console.log('✅ Chat input placeholder:', placeholder);

    await shot('06_final_state');
    console.log('\n📸 Screenshots saved to:', shots.join(', '));
  } catch (e) {
    console.error('❌ Error:', e.message);
    await shot('error_state');
  } finally {
    await browser.close();
  }
})();
