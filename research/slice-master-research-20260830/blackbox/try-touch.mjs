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
  await touch();
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: `${out}/touch-ready.png` });
  await touch();
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/touch-100ms.png` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/touch-600ms.png` });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/touch-1300ms.png` });
} finally {
  await browser.close();
}
