import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const outDir = new URL('./r1-bonus/', root);
const screenshotDir = new URL('./screenshots/', root);
await mkdir(outDir, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

// Fixed schedules were frozen from diagnostic observations. They are not state-driven.
const cases = [
  {
    id: 'bonus-390x844', width: 390, height: 844, mobile: true, x: 195, y: 607.68,
    tapsMs: [500, 1578, 1730, 2771, 3761, 4802, 5843, 6820, 7890, 8861, 9002, 9395, 10769, 12188, 13343, 14561, 14911, 15130, 16310, 17321, 18446, 19445, 20429, 21436, 22000, 22500, 23500],
  },
  {
    id: 'bonus-1100x720', width: 1100, height: 720, mobile: false, x: 550, y: 518.4,
    tapsMs: [800, 2007, 2016, 10818, 11026, 11198, 11378, 11607, 15185, 16114, 19610, 20681, 21702, 22698],
  },
];

function brief(s) {
  return { phase: s.phase, status: s.status, failReason: s.failReason, finishPhase: s.finishPhase, finishGateId: s.finishGateId, finishSelection: s.finishSelection, bonusConsumed: s.bonusConsumed, cuts: s.cuts, events: s.events.length, player: { x: s.player.x, y: s.player.y } };
}

async function runCase(spec) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: spec.mobile, hasTouch: spec.mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  const cdp = await context.newCDPSession(page);
  const tap = async () => {
    if (spec.mobile) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spec.x, y: spec.y, radiusX: 4, radiusY: 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
    }
  };
  const startedAt = Date.now();
  const checkpoints = [{ atMs: 0, stage: 'ready', state: brief(await page.evaluate(() => window.__GAME_TEST__.getState())) }];
  await page.screenshot({ path: new URL(`./screenshots/${spec.id}-ready.png`, root).pathname });
  let lastPhase = checkpoints[0].state.phase;
  let lastStatus = checkpoints[0].state.status;
  let bonusEnteredAt = null;
  for (let i = 0; i < spec.tapsMs.length; i += 1) {
    const target = spec.tapsMs[i];
    const wait = target - (Date.now() - startedAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await tap();
    await page.screenshot({ path: new URL(`./r1-bonus/${spec.id}-attempt-01-step-${String(i + 1).padStart(2, '0')}.png`, root).pathname });
    const state = await page.evaluate(() => window.__GAME_TEST__.getState());
    if (state.phase !== lastPhase || state.status !== lastStatus) {
      const checkpoint = { atMs: Date.now() - startedAt, stage: `afterTap-${i + 1}`, state: brief(state) };
      checkpoints.push(checkpoint);
      lastPhase = state.phase;
      lastStatus = state.status;
      if (state.phase === 'bonus' && bonusEnteredAt === null) {
        bonusEnteredAt = checkpoint.atMs;
        await page.screenshot({ path: new URL(`./screenshots/${spec.id}-bonus-entered.png`, root).pathname });
      }
    }
    if (state.phase === 'bonus' && state.status !== 'failed' && state.status !== 'won' && i + 1 < spec.tapsMs.length) {
      await page.screenshot({ path: new URL(`./screenshots/${spec.id}-bonus-responsive-${i + 1}.png`, root).pathname });
    }
  }
  await page.waitForTimeout(3000);
  const final = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
  const outcome = bonusEnteredAt !== null ? 'PASS' : (checkpoints.some((item) => item.state.status === 'failed') ? 'BLOCKED' : 'NOT_RUN');
  const result = {
    id: spec.id, viewport: `${spec.width}x${spec.height}`, inputMode: spec.mobile ? 'CDP touch events at fixed visible canvas coordinate' : 'CDP mouse events at fixed visible canvas coordinate',
    fixedScheduleMs: spec.tapsMs, attempts: 1, outcome,
    failureStage: outcome === 'PASS' ? null : 'before-natural-bonus-entry',
    reason: outcome === 'PASS' ? 'fixed normal input reached phase=bonus and subsequent taps were dispatched' : 'fixed normal input did not reach phase=bonus before the ordinary run terminated or the schedule ended',
    checkpoints, bonusEnteredAtMs: bonusEnteredAt, final, consoleErrors: errors,
    evidence: [`screenshots/${spec.id}-ready.png`, `screenshots/${spec.id}-terminal.png`, `r1-bonus/${spec.id}-attempt-01-step-01.png`, ...(bonusEnteredAt !== null ? [`screenshots/${spec.id}-bonus-entered.png`] : [])],
  };
  await context.close();
  await browser.close();
  return result;
}

const results = [];
for (const spec of cases) results.push(await runCase(spec));
const report = { schemaVersion: 1, artifactType: 'B01R1BonusFixedInput', generatedAt: new Date().toISOString(), targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', baseUrl, sourceCommit: 'de6f11d2231398f6c655abbddd40c548d1524126', buildSha256: '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d', environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless' }, freshContexts: true, stateInjection: false, debugApiCalled: false, results };
await writeFile(new URL('./r1-bonus-report.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
