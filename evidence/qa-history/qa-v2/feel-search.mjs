import playwright from '../../../node_modules/@playwright/test/index.js';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
await page.goto('http://127.0.0.1:4182/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
const tap = async () => {
  const box = await page.locator('[data-action="flip"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const rows = [];
for (let delay = 300; delay <= 0; delay += 25) {
  await page.evaluate((seed) => window.__PROTOTYPE_TEST__.resetGame(seed), 91);
  await tap();
  await page.waitForTimeout(delay);
  await tap();
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => window.__PROTOTYPE_TEST__.getState());
  rows.push({ delay, status: s.status, cuts: s.cuts, events: s.events.map((e) => e.type), player: s.player });
}
console.log(JSON.stringify(rows.filter((r) => r.cuts || r.events.some((e) => !['launch', 'flip', 'fall'].includes(e))), null, 2));

const followRows = [];
for (let start = 150; start <= 1200; start += 300) {
  const delays = Array.from({ length: 6 }, (_, i) => start + i * 50).filter((d) => d <= 1200);
  const pages = await Promise.all(delays.map(async () => {
    const p = await browser.newPage({ viewport: { width: 1180, height: 720 } });
    await p.goto('http://127.0.0.1:4182/', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
    return p;
  }));
  await Promise.all(pages.map(async (p, i) => {
    const click = async () => {
      const box = await p.locator('[data-action="flip"]').boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    await p.evaluate(() => window.__PROTOTYPE_TEST__.resetGame(91));
    await click(); await p.waitForTimeout(525); await click();
    await p.waitForTimeout(delays[i]); await click();
    await p.waitForTimeout(2200);
    const s = await p.evaluate(() => window.__PROTOTYPE_TEST__.getState());
    followRows.push({ delay: delays[i], status: s.status, cuts: s.cuts, events: s.events.map((e) => e.type), player: s.player });
  }));
  await Promise.all(pages.map((p) => p.close()));
}
console.log('FOLLOW');
console.log(JSON.stringify(followRows.filter((r) => r.cuts > 1 || r.events.some((e) => ['bounce', 'anchor'].includes(e))), null, 2));
await browser.close();
