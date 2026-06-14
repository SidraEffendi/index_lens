const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Upload CSV
    await page.locator('input[type="file"]').setInputFiles('/tmp/test_data.csv');
    await page.waitForSelector('svg circle', { timeout: 10000 });
    console.log('✅ Graph ready');

    const sendChat = async (msg) => {
      await page.locator('.chat-form input').fill(msg);
      await page.locator('.chat-form button').click();
      await page.waitForFunction(() => {
        const msgs = document.querySelectorAll('.message.assistant');
        const last = msgs[msgs.length - 1];
        return last && !last.querySelector('.typing');
      }, { timeout: 8000 });
      const msgs = await page.locator('.message.assistant').all();
      const last = msgs[msgs.length - 1];
      return (await last.textContent()).trim();
    };

    const q1 = await sendChat('Which nodes are most connected');
    console.log('✅ Q1 (hubs):', q1.slice(0, 80));

    const q2 = await sendChat('Who is connected to Alice');
    console.log('✅ Q2 (neighbours):', q2.slice(0, 80));

    const q3 = await sendChat('How many nodes are in Engineering');
    console.log('✅ Q3 (filter):', q3.slice(0, 80));

    const q4 = await sendChat('Shortest path between Grace and Frank');
    console.log('✅ Q4 (path):', q4.slice(0, 80));

    await page.screenshot({ path: '/tmp/indexlens_chat.png', fullPage: true });
    console.log('📸 /tmp/indexlens_chat.png');

  } catch (e) {
    console.error('❌', e.message);
    await page.screenshot({ path: '/tmp/indexlens_chat_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
