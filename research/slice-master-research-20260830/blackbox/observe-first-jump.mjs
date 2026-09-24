import playwright from '../../../node_modules/@playwright/test/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const out = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/slice-master-research-20260830/blackbox';
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  await page.goto('https://poki.com/zh/g/slice-master', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(10_000);
  await page.mouse.click(535, 230);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/first-ready.png` });
  await page.mouse.click(535, 230);
  for (const [index, wait] of [100, 250, 500, 800, 1200].entries()) {
    await page.waitForTimeout(wait - (index === 0 ? 0 : [100, 250, 500, 800, 1200][index - 1]));
    await page.screenshot({ path: `${out}/first-jump-${wait}ms.png` });
  }
} finally {
  await browser.close();
}
