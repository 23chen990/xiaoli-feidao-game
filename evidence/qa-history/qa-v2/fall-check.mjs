import playwright from '../../../node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  await page.goto(process.argv[2], { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
  await page.evaluate(() => window.__PROTOTYPE_TEST__.resetGame(103));
  const box = await page.locator('[data-action="flip"]').boundingBox();
  if (!box) throw new Error('missing surface');
  const tap = () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  for (let index = 0; index < 4; index += 1) {
    await tap();
    await page.waitForFunction(() => window.__PROTOTYPE_TEST__.getState().status !== 'airborne', undefined, { timeout: 4000 });
  }
  const launchOrigin = await page.evaluate(() => window.__PROTOTYPE_TEST__.getState());
  await tap();
  await page.waitForTimeout(200);
  await tap();
  await page.waitForTimeout(200);
  await tap();
  await page.waitForFunction(() => window.__PROTOTYPE_TEST__.getState().status === 'failed', undefined, { timeout: 5000 });
  const snapshot = await page.evaluate(() => window.__PROTOTYPE_TEST__.getState());
  await page.screenshot({ path: '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/failure.png' });
  const result = { launchOrigin, result: snapshot };
  await writeFile('/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/fall.log', `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
