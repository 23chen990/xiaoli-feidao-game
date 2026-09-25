import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import readline from 'node:readline';

const root = new URL('./', import.meta.url);
const outDir = new URL('./r2-natural/bonus-white-column-interactive-v03/', root);
await mkdir(outDir, { recursive: true });
const scriptPath = new URL('./r2-bonus-white-column-interactive-v03.mjs', root);
const scriptSha256 = createHash('sha256').update(await readFile(scriptPath)).digest('hex');
const prefixSchedule = [75, 1108, 2092, 3092, 4092, 5075, 6058, 7058, 8042];
const observationLimit = { maxWaitCommands: 2, maxObservationMs: 700 };
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
  window.__V03_RECEIVED__ = [];
  window.__V03_SEQ__ = 0;
  window.addEventListener('pointerdown', (event) => window.__V03_RECEIVED__.push({ seq: ++window.__V03_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
  window.addEventListener('pointerup', (event) => window.__V03_RECEIVED__.push({ seq: ++window.__V03_SEQ__, type: event.type, epochMs: performance.timeOrigin + performance.now() }), true);
});
await page.screenshot({ path: new URL('ready.png', outDir).pathname });
const startedAt = Date.now();
const inputs = [];
const stateSnapshot = () => page.evaluate(() => window.__GAME_TEST__.getState());
for (let i = 0; i < prefixSchedule.length; i += 1) {
  const wait = prefixSchedule[i] - (Date.now() - startedAt);
  if (wait > 0) await page.waitForTimeout(wait);
  const before = await stateSnapshot();
  const receiptStart = await page.evaluate(() => window.__V03_RECEIVED__.length);
  await page.mouse.click(550, 518.4);
  const receipts = await page.evaluate((start) => window.__V03_RECEIVED__.slice(start), receiptStart);
  const after = await stateSnapshot();
  inputs.push({ inputIndex: i + 1, plannedMs: prefixSchedule[i], receipts, before, after });
}
await page.screenshot({ path: new URL('observation-01-after-prefix.png', outDir).pathname });
console.log(`[v03] prefix complete; screenshot=${new URL('observation-01-after-prefix.png', outDir).pathname}`);
console.log('[v03] commands: wait <visible reason> | release <visible reason> | stop');

const decisions = [];
const observationStartedAt = Date.now();
let waitCount = 0;
let releaseSent = false;
for await (const line of readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })) {
  const [command, ...reasonParts] = line.trim().split(/\s+/);
  const visibleReason = reasonParts.join(' ') || 'operator did not provide a visible reason';
  if (Date.now() - observationStartedAt > observationLimit.maxObservationMs && command !== 'stop') {
    console.log('[v03] observation limit reached; send stop');
    continue;
  }
  if (command === 'wait') {
    if (waitCount >= observationLimit.maxWaitCommands) {
      console.log('[v03] WAIT limit reached; send stop');
      continue;
    }
    waitCount += 1;
    await page.waitForTimeout(350);
    const screenshot = new URL(`observation-${String(waitCount + 1).padStart(2, '0')}-wait.png`, outDir).pathname;
    const screenshotAt = new Date().toISOString();
    await page.screenshot({ path: screenshot });
    decisions.push({ decision: 'WAIT', screenshot, screenshotAt, decisionAt: new Date().toISOString(), visibleReason, hiddenState: await stateSnapshot() });
    console.log(`[v03] WAIT recorded; screenshot=${screenshot}`);
  } else if (command === 'release') {
    if (releaseSent) {
      console.log('[v03] RELEASE already sent; send stop');
      continue;
    }
    const screenshot = new URL('release-before.png', outDir).pathname;
    const screenshotAt = new Date().toISOString();
    await page.screenshot({ path: screenshot });
    const decisionAt = new Date().toISOString();
    const before = await stateSnapshot();
    const receiptStart = await page.evaluate(() => window.__V03_RECEIVED__.length);
    releaseSent = true;
    decisions.push({ decision: 'RELEASE', screenshot, screenshotAt, decisionAt, visibleReason, before, receiptStart });
    await page.mouse.click(550, 518.4);
    const receipts = await page.evaluate((start) => window.__V03_RECEIVED__.slice(start), receiptStart);
    const after = await stateSnapshot();
    await page.screenshot({ path: new URL('release-after.png', outDir).pathname });
    decisions.at(-1).receipts = receipts;
    decisions.at(-1).after = after;
    decisions.at(-1).releaseAfterScreenshot = new URL('release-after.png', outDir).pathname;
    console.log('[v03] RELEASE sent once; screenshot saved; send stop');
  } else if (command === 'stop') {
    break;
  } else {
    console.log('[v03] unknown command; use wait, release, or stop');
  }
}

const finalState = await stateSnapshot();
const report = {
  artifactType: 'B01BonusWhiteColumnInteractiveVisibleRun',
  scriptVersion: 'B01-BONUS-interactive-v0.3-isolated-output',
  scriptSha256, runId, contextId, viewport: '1100x720',
  sourceCommit: 'de6f11d2231398f6c655abbddd40c548d1524126',
  buildSha256: '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d',
  documentResponse, prefixSchedule, prefixInputs: inputs,
  observationLimit, decisions, finalState, errors,
  operatorOutputPolicy: { hiddenStatePrintedBeforeStop: false, hiddenStateReturnedBeforeStop: false, receiptsPrintedBeforeStop: false },
  evidence: ['r2-natural/bonus-white-column-interactive-v03/ready.png', 'r2-natural/bonus-white-column-interactive-v03/observation-01-after-prefix.png', 'r2-natural/bonus-white-column-interactive-v03/observation-02-wait.png', 'r2-natural/bonus-white-column-interactive-v03/observation-03-wait.png', 'r2-natural/bonus-white-column-interactive-v03/release-before.png', 'r2-natural/bonus-white-column-interactive-v03/release-after.png'],
  classification: releaseSent ? 'LOCAL_VISIBLE_STRATEGY_EVIDENCE' : 'NOT_RUN_VISIBLE_RELEASE',
};
await writeFile(new URL('./r2-bonus-white-column-interactive-v03.json', root), `${JSON.stringify(report, null, 2)}\n`);
await context.close(); await browser.close();
console.log(`[v03] stopped; audit report written=${new URL('./r2-bonus-white-column-interactive-v03.json', root).pathname}`);
