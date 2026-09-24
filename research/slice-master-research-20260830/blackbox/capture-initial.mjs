import playwright from '../../../node_modules/@playwright/test/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  await page.goto('https://poki.com/zh/g/slice-master', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/slice-master-research-20260830/blackbox/initial-page.png' });
} finally {
  await browser.close();
}
