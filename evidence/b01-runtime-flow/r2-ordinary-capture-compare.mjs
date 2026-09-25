import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const viewport = { width: 1100, height: 720 };
const input = { x: 550, y: 518.4 };
// This prefix is the R1 first-failed trajectory. The run stops at the first
// terminal state, so no post-failure taps can obscure the causal timeline.
const tapsMs = [800, 1859, 2032, 3068, 4140, 5118, 6155, 7157, 8215, 9199];

function brief(state) {
  return {
    phase: state.phase,
    status: state.status,
    failReason: state.failReason,
    finishPhase: state.finishPhase,
    finishGateId: state.finishGateId,
    levelNumber: state.levelNumber,
    elapsed: state.elapsed,
    worldTime: state.worldTime,
    cuts: state.cuts,
    anchorId: state.anchorId,
    player: {
      x: state.player.x,
      y: state.player.y,
      vx: state.player.vx,
      vy: state.player.vy,
      angle: state.player.angle,
      angularVelocity: state.player.angularVelocity,
    },
    eventCount: state.events.length,
    events: state.events.slice(-8),
  };
}

async function run(mode) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ type: 'console', message: message.text() });
  });
  page.on('pageerror', (error) => consoleErrors.push({ type: 'pageerror', message: error.message }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));

  // Capture browser-side receipt at the DOM boundary. This is instrumentation
  // only; it does not call the game bridge and cannot drive the run.
  await page.evaluate(() => {
    const target = window;
    const diagnostics = { received: [], samples: [] };
    window.__R2_DIAG__ = diagnostics;
    const receive = (event) => {
      diagnostics.received.push({
        kind: event.type,
        code: event.code ?? null,
        timeMs: performance.now(),
        clientX: event.clientX ?? null,
        clientY: event.clientY ?? null,
      });
    };
    target.addEventListener('pointerdown', receive, true);
    target.addEventListener('pointerup', receive, true);
    target.addEventListener('keydown', receive, true);
    target.addEventListener('keyup', receive, true);
    diagnostics.timer = window.setInterval(() => {
      const s = window.__GAME_TEST__.getState();
      diagnostics.samples.push({
        timeMs: performance.now(),
        phase: s.phase,
        status: s.status,
        failReason: s.failReason,
        elapsed: s.elapsed,
        worldTime: s.worldTime,
        player: { ...s.player },
        eventCount: s.events.length,
        events: s.events.slice(-4),
      });
    }, 50);
  });

  const cdp = await context.newCDPSession(page);
  const startedAt = performance.now();
  const checkpoints = [{ atMs: 0, stage: 'ready', state: brief(await page.evaluate(() => window.__GAME_TEST__.getState())) }];
  const dispatches = [];
  if (mode === 'with-screenshots') {
    await mkdir(new URL('./r2-ordinary-with-screenshots/', root), { recursive: true });
    await page.screenshot({ path: new URL('./r2-ordinary-with-screenshots/ready.png', root).pathname });
  }

  for (let index = 0; index < tapsMs.length; index += 1) {
    const targetMs = tapsMs[index];
    const waitMs = targetMs - (performance.now() - startedAt);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const before = await page.evaluate(() => window.__GAME_TEST__.getState());
    const receivedBeforeCount = await page.evaluate(() => window.__R2_DIAG__.received.length);
    const sendStartMs = performance.now() - startedAt;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: input.x, y: input.y, button: 'left', clickCount: 1 });
    const pressSentMs = performance.now() - startedAt;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: input.x, y: input.y, button: 'left', clickCount: 1 });
    const releaseSentMs = performance.now() - startedAt;
    const afterDispatch = await page.evaluate(() => window.__GAME_TEST__.getState());
    const receivedAfter = await page.evaluate(() => window.__R2_DIAG__.received);
    const received = receivedAfter.slice(receivedBeforeCount);
    const inputReceiptObserved = received.filter((event) => event.kind === 'pointerdown' || event.kind === 'pointerup').length === 2;
    const inputEffective = inputReceiptObserved && (afterDispatch.eventCount > before.events.length
      || afterDispatch.status !== before.status
      || afterDispatch.player.vx !== before.player.vx
      || afterDispatch.player.vy !== before.player.vy);
    const record = {
      index: index + 1,
      targetMs,
      sendStartMs,
      pressSentMs,
      releaseSentMs,
      received,
      receivedBeforeCount,
      receivedAfterCount: receivedAfter.length,
      inputReceiptObserved,
      before: brief(before),
      afterDispatch: brief(afterDispatch),
      inputEffective,
    };
    dispatches.push(record);
    if (mode === 'with-screenshots') {
      await page.screenshot({ path: new URL(`./r2-ordinary-with-screenshots/tap-${String(index + 1).padStart(2, '0')}.png`, root).pathname });
    }
    const stateAfterCapture = await page.evaluate(() => window.__GAME_TEST__.getState());
    if (stateAfterCapture.status === 'failed' || stateAfterCapture.status === 'won') {
      checkpoints.push({ atMs: performance.now() - startedAt, stage: `terminal-after-tap-${index + 1}`, state: brief(stateAfterCapture) });
      break;
    }
  }
  await page.waitForTimeout(250);
  const final = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
  const diagnostics = await page.evaluate(() => ({ received: window.__R2_DIAG__.received, samples: window.__R2_DIAG__.samples }));
  const result = {
    mode,
    viewport: '1100x720',
    inputMode: 'CDP mouse events at fixed visible canvas coordinate',
    targetCoordinate: input,
    fixedScheduleMs: tapsMs,
    attemptedInputs: dispatches.length,
    firstTerminalInput: null,
    dispatches,
    checkpoints,
    final,
    firstTrajectoryDivergence: null,
    diagnostics,
    consoleErrors,
    screenshots: mode === 'with-screenshots' ? ['r2-ordinary-with-screenshots/ready.png', ...dispatches.map((item) => `r2-ordinary-with-screenshots/tap-${String(item.index).padStart(2, '0')}.png`)] : [],
  };
  await context.close();
  await browser.close();
  return result;
}

const results = [];
for (const mode of ['with-screenshots', 'without-screenshots']) results.push(await run(mode));

// Determine the earliest stable divergence using the same target input index.
const [withShots, withoutShots] = results;
const compareLength = Math.min(withShots.dispatches.length, withoutShots.dispatches.length);
let firstTrajectoryDivergence = null;
let firstEventStreamDivergence = null;
for (let i = 0; i < compareLength; i += 1) {
  const a = withShots.dispatches[i].afterDispatch;
  const b = withoutShots.dispatches[i].afterDispatch;
  const distance = Math.hypot(a.player.x - b.player.x, a.player.y - b.player.y);
  const speedDistance = Math.hypot(a.player.vx - b.player.vx, a.player.vy - b.player.vy);
  // Ignore the small fixed-step sampling difference that can occur when the
  // two fresh contexts reach the first tap a few milliseconds apart. Treat a
  // materially different position/speed, state, or event stream as the first
  // trajectory divergence.
  if (!firstEventStreamDivergence && a.eventCount !== b.eventCount) {
    firstEventStreamDivergence = {
      inputIndex: i + 1,
      screenshotEventCount: a.eventCount,
      noScreenshotEventCount: b.eventCount,
      screenshotAtMs: withShots.dispatches[i].sendStartMs,
      noScreenshotAtMs: withoutShots.dispatches[i].sendStartMs,
    };
  }
  if (distance > 20 || speedDistance > 50 || a.status !== b.status) {
    firstTrajectoryDivergence = {
      inputIndex: i + 1,
      screenshot: { atMs: withShots.dispatches[i].sendStartMs, state: a },
      noScreenshot: { atMs: withoutShots.dispatches[i].sendStartMs, state: b },
      positionDistance: distance,
      speedDistance,
      causeHypothesis: 'unresolved: capture overhead may shift wall-clock dispatch, but this comparison does not establish causality',
    };
    break;
  }
}
for (const result of results) {
  result.firstTrajectoryDivergence = firstTrajectoryDivergence;
  result.firstEventStreamDivergence = firstEventStreamDivergence;
}
for (const result of results) {
  result.firstTerminalInput = result.checkpoints.find((item) => item.stage.startsWith('terminal-after-tap-'))?.stage.match(/(\d+)$/)?.[1] ? Number(result.checkpoints.find((item) => item.stage.startsWith('terminal-after-tap-')).stage.match(/(\d+)$/)[1]) : null;
}

const report = {
  schemaVersion: 1,
  artifactType: 'B01R2OrdinaryCaptureModeComparison',
  generatedAt: new Date().toISOString(),
  targetGame: 'Slice Master / 小李飞刀',
  workspace: 'game/prototype-a',
  sourceCommit,
  buildSha256,
  environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless', baseUrl },
  freshContexts: true,
  stateInjection: false,
  debugApiCalled: false,
  diagnosisOnly: true,
  hypothesis: 'wait/screenshot capture may perturb the actual input cadence; this run changes only capture mode',
  priorR1Failure: {
    report: 'r1-ordinary-report.json',
    checkpoint: 'afterTap-9',
    condition: 'phase=ordinary,status=failed,failReason=fall before settlement',
    observedState: { x: 1200.6277964664419, y: -127.62846064735574, cuts: 3, eventCount: 14 },
    note: 'The new comparison starts from the same visible coordinate and fixed schedule prefix; it does not reuse or count the R1 terminal as a new pass.',
  },
  inputPlan: { viewport: '1100x720', coordinate: input, tapsMs, origin: 'R1 ordinary first failed trajectory' },
  results,
  comparison: {
    sameBuild: true,
    sameViewport: true,
    sameInputPlan: true,
    onlyCaptureModeChanged: true,
    firstTrajectoryDivergence,
    firstEventStreamDivergence,
    conclusion: firstTrajectoryDivergence
      ? 'capture mode and wall-clock timing diverged before terminal; no root cause assigned without a timing-normalized follow-up'
      : 'no observed trajectory divergence before the compared terminal point',
  },
};
await writeFile(new URL('./r2-ordinary-capture-compare.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
