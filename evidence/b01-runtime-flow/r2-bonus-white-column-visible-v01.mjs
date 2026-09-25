import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';

const root = new URL('./', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const outDir = new URL('./r2-natural/bonus-white-column-visible-v01/', root);
await mkdir(outDir, { recursive: true });
const viewport = { width: 1100, height: 720 };
const plan = [75, 1108, 2092, 3092, 4092, 5075, 6058, 7058, 8042, 9042, 9808];
const planNotes = [
  'ready画布中央：开始起跳', '看见刀具回落到可操作中线：一次普通翻转', '继续观察可见回落节奏后翻转', '中线回落后翻转', '中线回落后翻转', '中线回落后翻转', '中线回落后翻转', '中线回落后翻转', '接近白柱区域，等待画面中的锚定/停住反馈', '看到白柱接触并刀具停住后等待稳定', '只在白柱上看见刀具已锚定后点击一次释放',
];
const scriptSha256 = createHash('sha256').update(await readFile(new URL('./r2-bonus-white-column-visible-v01.mjs', root))).digest('hex');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport });
const contextId = randomUUID();
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
const navigation = await page.goto(baseUrl, { waitUntil: 'networkidle' });
const navigationBody = await navigation.body();
const documentResponse = { url: navigation.url(), status: navigation.status(), sha256: createHash('sha256').update(navigationBody).digest('hex') };
await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
await page.evaluate(() => {
  window.__R2_RECEIVED__ = [];
  window.__R2_RECEIPT_SEQ__ = 0;
  window.addEventListener('pointerdown', (event) => window.__R2_RECEIVED__.push({ seq: ++window.__R2_RECEIPT_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
  window.addEventListener('pointerup', (event) => window.__R2_RECEIVED__.push({ seq: ++window.__R2_RECEIPT_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
  window.__R2_CAUSAL_RESULTS__ = [];
  window.__R2_CAUSAL_ARMED__ = null;
  const summary = () => { const s = window.__GAME_TEST__.getState(); return { phase: s.phase, status: s.status, finishPhase: s.finishPhase, player: { x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy }, anchorId: s.anchorId, events: s.events.slice(-8), eventCount: s.events.length }; };
  window.addEventListener('pointerdown', () => { if (window.__R2_CAUSAL_ARMED__) window.__R2_PENDING__ = { inputId: window.__R2_CAUSAL_ARMED__, before: summary(), epochMs: performance.timeOrigin + performance.now() }; }, true);
  window.addEventListener('pointerdown', () => { if (window.__R2_PENDING__) { window.__R2_CAUSAL_RESULTS__.push({ ...window.__R2_PENDING__, after: summary(), handlerEpochMs: performance.timeOrigin + performance.now() }); window.__R2_PENDING__ = null; } });
});
await page.screenshot({ path: new URL('ready.png', outDir).pathname });
const startedAt = Date.now();
const inputs = [];
for (let index = 0; index < plan.length; index += 1) {
  const wait = plan[index] - (Date.now() - startedAt);
  if (wait > 0) await page.waitForTimeout(wait);
  const inputId = `white-column-input-${index + 1}`;
  const before = await page.evaluate(() => window.__GAME_TEST__.getState());
  const receiptStart = await page.evaluate(() => window.__R2_RECEIVED__.length);
  if (index === plan.length - 1) await page.evaluate((id) => { window.__R2_CAUSAL_ARMED__ = id; }, inputId);
  await page.mouse.click(550, 518.4);
  const receipts = await page.evaluate((start) => window.__R2_RECEIVED__.slice(start), receiptStart);
  const after = await page.evaluate(() => window.__GAME_TEST__.getState());
  const causal = index === plan.length - 1 ? await page.evaluate((id) => window.__R2_CAUSAL_RESULTS__.find((item) => item.inputId === id) ?? null, inputId) : null;
  inputs.push({ inputIndex: index + 1, plannedMs: plan[index], note: planNotes[index], inputId, receipts, before: { phase: before.phase, status: before.status, player: { x: before.player.x, y: before.player.y, vx: before.player.vx, vy: before.player.vy }, anchorId: before.anchorId, events: before.events.slice(-4) }, after: { phase: after.phase, status: after.status, player: { x: after.player.x, y: after.player.y, vx: after.player.vx, vy: after.player.vy }, anchorId: after.anchorId, events: after.events.slice(-6) }, causal });
}
await page.screenshot({ path: new URL('after-white-column-release.png', outDir).pathname });
await page.waitForTimeout(750);
const observedAfterWait = await page.evaluate(() => window.__GAME_TEST__.getState());
await page.screenshot({ path: new URL('after-release-observation.png', outDir).pathname });
const report = { artifactType: 'B01BonusWhiteColumnVisibleStrategyRun', scriptVersion: 'B01-BONUS-visible-v0.1', scriptSha256, runId: randomUUID(), contextId, viewport: '1100x720', sourceCommit: 'de6f11d2231398f6c655abbddd40c548d1524126', buildSha256: '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d', documentResponse, plan, planNotes, stopPoint: 'after input 11 and 750ms passive observation; no full BONUS completion attempted', inputs, observedAfterWait: { phase: observedAfterWait.phase, status: observedAfterWait.status, player: { x: observedAfterWait.player.x, y: observedAfterWait.player.y, vx: observedAfterWait.player.vx, vy: observedAfterWait.player.vy }, anchorId: observedAfterWait.anchorId, events: observedAfterWait.events.slice(-8) }, errors, evidence: ['r2-natural/bonus-white-column-visible-v01/ready.png', 'r2-natural/bonus-white-column-visible-v01/after-white-column-release.png', 'r2-natural/bonus-white-column-visible-v01/after-release-observation.png'] };
await writeFile(new URL('./r2-bonus-white-column-visible-v01.json', root), `${JSON.stringify(report, null, 2)}\n`);
await context.close(); await browser.close();
console.log(JSON.stringify(report, null, 2));
