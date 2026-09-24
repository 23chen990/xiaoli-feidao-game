import playwright from '../../../node_modules/@playwright/test/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const out = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/slice-master-research-20260830/blackbox';
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, recordVideo: { dir: out, size: { width: 1180, height: 720 } } });
  await page.goto('https://poki.com/zh/g/slice-master', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(10_000);
  await page.mouse.click(535, 230);
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: `${out}/tutorial.png` });
  await page.mouse.click(535, 230);
  for (let index = 1; index <= 44; index += 1) {
    await page.waitForTimeout(800);
    await page.mouse.click(535, 230);
    if (index % 3 === 0) await page.screenshot({ path: `${out}/cadence-${String(index).padStart(2, '0')}.png` });
  }
  await page.screenshot({ path: `${out}/cadence-final.png` });
} finally {
  await browser.close();
}
