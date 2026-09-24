import playwright from '../../../node_modules/@playwright/test/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const out = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/slice-master-research-20260830/blackbox';
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, isMobile: true, hasTouch: true });
  await page.goto('https://poki.com/zh/g/slice-master', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(10_000);
  const cdp = await page.context().newCDPSession(page);
  const touch = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 535, y: 230, radiusX: 5, radiusY: 5 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await touch(); await page.waitForTimeout(12_000);
  for (let i = 0; i < 8; i += 1) { await touch(); await page.waitForTimeout(1250); }
  for (let i = 0; i < 10; i += 1) { await touch(); await page.waitForTimeout(240); }
  await page.waitForTimeout(700);
  for (let i = 0; i < 2; i += 1) { await touch(); await page.waitForTimeout(1150); }
  await page.screenshot({ path: `${out}/spike-approach.png` });
  for (let i = 1; i <= 6; i += 1) { await touch(); await page.waitForTimeout(240); if (i === 3 || i === 6) await page.screenshot({ path: `${out}/spike-jump-${i}.png` }); }
  await page.waitForTimeout(700);
  for (let i = 1; i <= 14; i += 1) { await touch(); await page.waitForTimeout(1100); await page.screenshot({ path: `${out}/after-spike-${String(i).padStart(2, '0')}.png` }); }
} finally {
  await browser.close();
}
