import playwright from '../../../node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
const { chromium } = playwright;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
await page.goto('http://127.0.0.1:4182/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
const state = () => page.evaluate(() => window.__PROTOTYPE_TEST__.getState());
const reset = (seed) => page.evaluate((s) => window.__PROTOTYPE_TEST__.resetGame(s), seed);
const tap = async () => {
  const box = await page.locator('[data-action="flip"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

let cutAtMs = null;
let cutState = null;
for (const delay of [425, 500, 650]) {
  await reset(91);
  const startedAt = Date.now();
  await tap();
  await page.waitForTimeout(delay);
  await tap();
  try {
    await page.waitForFunction(() => window.__PROTOTYPE_TEST__.getState().events.some((e) => e.type === 'cut'), undefined, { timeout: 2500 });
    cutAtMs = Date.now() - startedAt;
    cutState = await state();
    break;
  } catch {}
}
if (!cutState) throw new Error('first cut could not be reproduced in three bounded attempts');
await page.screenshot({ path: '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/feel-first-cut.png' });
await page.waitForFunction(() => window.__PROTOTYPE_TEST__.getState().status === 'failed', undefined, { timeout: 6000 });
const failed = await state();
await page.screenshot({ path: '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/feel-abyss.png' });
await tap();
await page.waitForTimeout(100);
const restarted = await state();
await page.screenshot({ path: '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/feel-restart.png' });

await reset(72);
const fiveInputs = [];
for (const delay of [0, 500, 900, 350, 1050, 600]) {
  if (delay) await page.waitForTimeout(delay);
  const before = await state();
  await tap();
  await page.waitForTimeout(90);
  const after = await state();
  fiveInputs.push({ delay, beforeStatus: before.status, afterStatus: after.status, x: after.player.x, y: after.player.y, angle: after.player.angle, events: after.events.map((e) => e.type), seed: after.seed });
}

const report = { cutAtMs, cutState, failed, restarted, fiveInputs, errors };
await writeFile('/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2/feel-followup.log', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ cutAtMs, cutEvents: cutState.events.map((e) => e.type), failReason: failed.failReason, restart: { oldSeed: failed.seed, newSeed: restarted.seed, status: restarted.status }, fiveInputs, errors }));
await browser.close();
