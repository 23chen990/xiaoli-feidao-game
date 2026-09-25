import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import readline from 'node:readline';

const root = new URL('./', import.meta.url);
const outDir = new URL('./r2-natural/bonus-white-column-interactive-v02/', root);
await mkdir(outDir, { recursive: true });
const scriptSha256 = createHash('sha256').update(await readFile(new URL('./r2-bonus-white-column-interactive-v02.mjs', root))).digest('hex');
const prefixSchedule = [75, 1108, 2092, 3092, 4092, 5075, 6058, 7058, 8042];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
const contextId = randomUUID();
const runId = randomUUID();
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
const navigation = await page.goto(process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
const body = await navigation.body();
const documentResponse = { url: navigation.url(), status: navigation.status(), sha256: createHash('sha256').update(body).digest('hex') };
await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
await page.evaluate(() => {
  window.__V02_RECEIVED__ = [];
  window.__V02_SEQ__ = 0;
  window.addEventListener('pointerdown', (event) => window.__V02_RECEIVED__.push({ seq: ++window.__V02_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
  window.addEventListener('pointerup', (event) => window.__V02_RECEIVED__.push({ seq: ++window.__V02_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
});
await page.screenshot({ path: new URL('ready.png', outDir).pathname });
const startedAt = Date.now();
const inputs = [];
for (let i = 0; i < prefixSchedule.length; i += 1) {
  const wait = prefixSchedule[i] - (Date.now() - startedAt);
  if (wait > 0) await page.waitForTimeout(wait);
  const before = await page.evaluate(() => window.__GAME_TEST__.getState());
  const receiptStart = await page.evaluate(() => window.__V02_RECEIVED__.length);
  await page.mouse.click(550, 518.4);
  const receipts = await page.evaluate((start) => window.__V02_RECEIVED__.slice(start), receiptStart);
  const after = await page.evaluate(() => window.__GAME_TEST__.getState());
  inputs.push({ inputIndex: i + 1, plannedMs: prefixSchedule[i], receipts, before: { phase: before.phase, status: before.status, player: { x: before.player.x, y: before.player.y, vx: before.player.vx, vy: before.player.vy }, anchorId: before.anchorId }, after: { phase: after.phase, status: after.status, player: { x: after.player.x, y: after.player.y, vx: after.player.vx, vy: after.player.vy }, anchorId: after.anchorId } });
}
await page.screenshot({ path: new URL('observation-01-after-prefix.png', outDir).pathname });
console.log(JSON.stringify({ ready: new URL('ready.png', outDir).pathname, observation: new URL('observation-01-after-prefix.png', outDir).pathname, runId, contextId, documentResponse, prefixInputs: inputs.length }, null, 2));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const decisions = [];
for await (const line of rl) {
  const command = line.trim();
  if (command === 'wait') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: new URL(`observation-${String(decisions.length + 2).padStart(2, '0')}-wait.png`, outDir).pathname });
    const state = await page.evaluate(() => window.__GAME_TEST__.getState());
    decisions.push({ decision: 'WAIT', evidence: { phase: state.phase, status: state.status, player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy }, anchorId: state.anchorId } });
    console.log(JSON.stringify(decisions.at(-1)));
  } else if (command === 'release') {
    const before = await page.evaluate(() => window.__GAME_TEST__.getState());
    const receiptStart = await page.evaluate(() => window.__V02_RECEIVED__.length);
    await page.mouse.click(550, 518.4);
    const receipts = await page.evaluate((start) => window.__V02_RECEIVED__.slice(start), receiptStart);
    const after = await page.evaluate(() => window.__GAME_TEST__.getState());
    await page.screenshot({ path: new URL('release-after.png', outDir).pathname });
    decisions.push({ decision: 'RELEASE', receipts, before: { phase: before.phase, status: before.status, player: { x: before.player.x, y: before.player.y, vx: before.player.vx, vy: before.player.vy }, anchorId: before.anchorId }, after: { phase: after.phase, status: after.status, player: { x: after.player.x, y: after.player.y, vx: after.player.vx, vy: after.player.vy }, anchorId: after.anchorId } });
    console.log(JSON.stringify(decisions.at(-1)));
  } else if (command === 'stop') break;
}
rl.close();
const finalState = await page.evaluate(() => window.__GAME_TEST__.getState());
const report = { artifactType: 'B01BonusWhiteColumnInteractiveVisibleRun', scriptVersion: 'B01-BONUS-interactive-v0.2', scriptSha256, runId, contextId, viewport: '1100x720', sourceCommit: 'de6f11d2231398f6c655abbddd40c548d1524126', buildSha256: '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d', documentResponse, prefixSchedule, prefixInputs: inputs, decisions, finalState: { phase: finalState.phase, status: finalState.status, player: { x: finalState.player.x, y: finalState.player.y, vx: finalState.player.vx, vy: finalState.player.vy }, anchorId: finalState.anchorId }, errors, evidence: ['r2-natural/bonus-white-column-interactive-v02/ready.png', 'r2-natural/bonus-white-column-interactive-v02/observation-01-after-prefix.png', 'r2-natural/bonus-white-column-interactive-v02/observation-02-wait.png', 'r2-natural/bonus-white-column-interactive-v02/observation-03-wait.png', 'r2-natural/bonus-white-column-interactive-v02/release-after.png'] };
await writeFile(new URL('./r2-bonus-white-column-interactive-v02.json', root), `${JSON.stringify(report, null, 2)}\n`);
await context.close(); await browser.close();
console.log(JSON.stringify({ report: new URL('./r2-bonus-white-column-interactive-v02.json', root).pathname, decisions: decisions.length }, null, 2));
