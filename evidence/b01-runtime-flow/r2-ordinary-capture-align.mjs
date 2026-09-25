import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const viewport = { width: 1100, height: 720 };
const input = { x: 550, y: 518.4 };
const FIXED_STEP_HZ = 120;
const POST_CHECKPOINT_DELTA_STEPS = 120;
const outputDirName = process.env.R2_ALIGN_OUTPUT_DIR ?? 'r2-ordinary-capture-align-r2';
const reportPath = new URL(process.env.R2_ALIGN_REPORT_PATH ?? './r2-ordinary-capture-align-r2.json', root);
const screenshotPath = (name) => new URL(`./${outputDirName}/screenshots/${name}`, root).pathname;
const alignPhysicalSteps = process.env.R2_ALIGN_PHYSICAL_STEPS !== '0';
const captureOrder = process.env.R2_CAPTURE_ORDER === 'without-first'
  ? ['without-screenshots', 'with-screenshots']
  : ['with-screenshots', 'without-screenshots'];
// This prefix is the R1 first-failed trajectory. The run stops at the first
// terminal state, so no post-failure taps can obscure the causal timeline.
const tapsMs = [800, 1859, 2032, 3068, 4140, 5118, 6155, 7157, 8215, 9199];

function brief(state) {
  return {
    phase: state.phase,
    status: state.status,
    seed: state.seed,
    levelId: state.levelId,
    failReason: state.failReason,
    finishPhase: state.finishPhase,
    finishGateId: state.finishGateId,
    levelNumber: state.levelNumber,
    elapsed: state.elapsed,
    worldTime: state.worldTime,
    cuts: state.cuts,
    bonusAvailable: state.bonusAvailable,
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
    physicalStep: Math.round(state.worldTime * FIXED_STEP_HZ),
  };
}

function newEvents(before, after) {
  const beforeIds = new Set(before.events.map((event) => event.id));
  return after.events.filter((event) => !beforeIds.has(event.id));
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
  const startup = await page.evaluate(() => ({ state: window.__GAME_TEST__.getState(), progress: window.__GAME_TEST__.getProgress() }));

  if (mode === 'with-screenshots') {
    await mkdir(new URL(`./${outputDirName}/screenshots/`, root), { recursive: true });
    await page.screenshot({ path: screenshotPath('with-screenshots-ready.png') });
  }

  // Reset after the optional ready capture. This keeps the comparison's
  // physical starting point at worldTime=0 in both capture modes and prevents
  // the ready screenshot from becoming an unreported startup confounder.
  const resetAtEpochMs = Date.now();
  const reset = await page.evaluate(() => ({ state: window.__GAME_TEST__.resetGame(), progress: window.__GAME_TEST__.getProgress() }));

  // Capture browser-side receipt at the DOM boundary. This is instrumentation
  // only; it does not call the game bridge and cannot drive the run.
  await page.evaluate(() => {
    const target = window;
    const diagnostics = { received: [], dispatches: [], pendingPointerDown: null };
    window.__R2_DIAG__ = diagnostics;
    const compact = () => {
      const state = window.__GAME_TEST__.getState();
      return {
        phase: state.phase,
        status: state.status,
        failReason: state.failReason,
        worldTime: state.worldTime,
        physicalStep: Math.round(state.worldTime * 120),
        anchorId: state.anchorId,
        cuts: state.cuts,
        player: { ...state.player },
        eventCount: state.events.length,
        events: state.events.slice(-8),
      };
    };
    const receive = (event) => {
      diagnostics.received.push({
        kind: event.type,
        code: event.code ?? null,
        timeMs: performance.now(),
        epochMs: performance.timeOrigin + performance.now(),
        clientX: event.clientX ?? null,
        clientY: event.clientY ?? null,
      });
    };
    target.addEventListener('pointerdown', receive, true);
    target.addEventListener('pointerup', receive, true);
    target.addEventListener('keydown', receive, true);
    target.addEventListener('keyup', receive, true);
    target.addEventListener('pointerdown', (event) => {
      diagnostics.pendingPointerDown = { timeMs: performance.now(), epochMs: performance.timeOrigin + performance.now(), before: compact(), clientX: event.clientX ?? null, clientY: event.clientY ?? null };
    }, true);
    target.addEventListener('pointerdown', () => {
      const before = diagnostics.pendingPointerDown;
      diagnostics.dispatches.push({
        receiptEpochMs: performance.timeOrigin + performance.now(),
        before: before?.before ?? null,
        after: compact(),
      });
      diagnostics.pendingPointerDown = null;
    }, false);
  });

  const cdp = await context.newCDPSession(page);
  const startedAt = performance.now();
  const checkpoints = [{ atMs: 0, stage: 'ready-after-reset', state: brief(reset.state) }];
  const dispatches = [];

  for (let index = 0; index < tapsMs.length; index += 1) {
    const targetMs = tapsMs[index];
    const targetPhysicalStep = Math.round((targetMs / 1000) * FIXED_STEP_HZ);
    if (process.env.R2_TRACE) console.error(JSON.stringify({ mode, index: index + 1, targetPhysicalStep, state: brief(await page.evaluate(() => window.__GAME_TEST__.getState())) }));
    const beforeWait = await page.evaluate(() => window.__GAME_TEST__.getState());
    if (beforeWait.status === 'failed' || beforeWait.status === 'won') {
      checkpoints.push({ atMs: performance.now() - startedAt, stage: `terminal-before-tap-${index + 1}`, state: brief(beforeWait) });
      break;
    }
    if (alignPhysicalSteps) {
      await page.waitForFunction((targetStep) => {
        const state = window.__GAME_TEST__.getState();
        return state.status === 'failed' || state.status === 'won' || Math.round(state.worldTime * 120) >= targetStep;
      }, targetPhysicalStep, { polling: 16, timeout: 15000 });
    } else {
      const waitMs = targetMs - (performance.now() - startedAt);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
    }
    const afterWait = await page.evaluate(() => window.__GAME_TEST__.getState());
    if (afterWait.status === 'failed' || afterWait.status === 'won') {
      checkpoints.push({ atMs: performance.now() - startedAt, stage: `terminal-before-tap-${index + 1}`, state: brief(afterWait) });
      break;
    }
    if (process.env.R2_TRACE) console.error(JSON.stringify({ mode, index: index + 1, stage: 'target-reached', state: brief(await page.evaluate(() => window.__GAME_TEST__.getState())) }));
    const before = await page.evaluate(() => window.__GAME_TEST__.getState());
    const receivedBeforeCount = await page.evaluate(() => window.__R2_DIAG__.received.length);
    const sendStartMs = performance.now() - startedAt;
    const sendStartEpochMs = Date.now();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: input.x, y: input.y, button: 'left', clickCount: 1 });
    const pressSentMs = performance.now() - startedAt;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: input.x, y: input.y, button: 'left', clickCount: 1 });
    const releaseSentMs = performance.now() - startedAt;
    const sendEndEpochMs = Date.now();
    const afterDispatch = await page.evaluate(() => window.__GAME_TEST__.getState());
    const receivedAfter = await page.evaluate(() => window.__R2_DIAG__.received);
    const eventBoundary = await page.evaluate(() => window.__R2_DIAG__.dispatches.at(-1) ?? null);
    const received = receivedAfter.slice(receivedBeforeCount);
    const inputReceiptObserved = received.filter((event) => event.kind === 'pointerdown' || event.kind === 'pointerup').length === 2;
    const inputEffective = inputReceiptObserved && (afterDispatch.eventCount > before.eventCount
      || afterDispatch.status !== before.status
      || afterDispatch.player.vx !== before.player.vx
      || afterDispatch.player.vy !== before.player.vy);
    const eventsAfterInput = newEvents(before, afterDispatch);
    const immediateTypes = new Set(['launch', 'flip', 'cut']);
    const immediateInputTransition = eventsAfterInput.some((event) => immediateTypes.has(event.type)) || afterDispatch.status !== before.status;
    const inputDisposition = immediateInputTransition
      ? 'immediate-visible-transition'
      : 'no-immediate-visible-transition-buffered-or-ignored';
    const record = {
      index: index + 1,
      targetMs,
      targetPhysicalStep,
      sendStartMs,
      sendStartEpochMs,
      pressSentMs,
      releaseSentMs,
      sendEndEpochMs,
      received,
      receivedBeforeCount,
      receivedAfterCount: receivedAfter.length,
      inputReceiptObserved,
      receiptTiming: received.map((event) => ({ type: event.kind, epochMs: event.epochMs, delayFromSendStartMs: event.epochMs - sendStartEpochMs })),
      eventBoundary,
      before: brief(before),
      afterDispatch: brief(afterDispatch),
      eventsAfterInput,
      inputDisposition,
      inputEffective,
    };
    if (mode === 'with-screenshots') {
      await page.screenshot({ path: screenshotPath(`with-screenshots-tap-${String(index + 1).padStart(2, '0')}.png`) });
    }
    const postCheckpointTargetStep = targetPhysicalStep + POST_CHECKPOINT_DELTA_STEPS;
    let postCheckpointExecuted = false;
    if (alignPhysicalSteps) {
      await page.waitForFunction((targetStep) => {
        const state = window.__GAME_TEST__.getState();
        return state.status === 'failed' || state.status === 'won' || Math.round(state.worldTime * 120) >= targetStep;
      }, postCheckpointTargetStep, { polling: 16, timeout: 15000 });
      postCheckpointExecuted = true;
    }
    const stateAfterCaptureRaw = await page.evaluate(() => window.__GAME_TEST__.getState());
    const postOnlyEvents = newEvents(afterDispatch, stateAfterCaptureRaw);
    const postDelayedTransition = !immediateInputTransition && postOnlyEvents.some((event) => immediateTypes.has(event.type));
    record.postCheckpointTargetStep = postCheckpointTargetStep;
    record.postCheckpointExecuted = postCheckpointExecuted;
    record.postCheckpoint = brief(stateAfterCaptureRaw);
    record.postOnlyEvents = postOnlyEvents;
    record.inputProcessing = immediateInputTransition ? 'immediate-visible-transition' : postDelayedTransition ? 'buffered-or-delayed-visible-transition' : 'ignored-or-no-visible-transition';
    dispatches.push(record);
    const stateAfterCapture = stateAfterCaptureRaw;
    if (stateAfterCapture.status === 'failed' || stateAfterCapture.status === 'won') {
      checkpoints.push({ atMs: performance.now() - startedAt, stage: `terminal-after-tap-${index + 1}`, state: brief(stateAfterCapture) });
      break;
    }
  }
  await page.waitForTimeout(250);
  const final = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
  const diagnostics = await page.evaluate(() => ({ received: window.__R2_DIAG__.received }));
  const result = {
    mode,
    viewport: '1100x720',
    inputMode: 'CDP mouse events at fixed visible canvas coordinate',
    targetCoordinate: input,
    fixedScheduleMs: tapsMs,
    attemptedInputs: dispatches.length,
    firstTerminalInput: null,
    startup: { state: brief(startup.state), progress: startup.progress },
    reset: { atEpochMs: resetAtEpochMs, bridgeCall: 'window.__GAME_TEST__.resetGame()', state: brief(reset.state), progress: reset.progress },
    diagnosticBridgeCalls: ['window.__GAME_TEST__.resetGame()', 'window.__GAME_TEST__.getProgress()', 'window.__GAME_TEST__.getState()'],
    dispatches,
    checkpoints,
    final,
    diagnostics,
    consoleErrors,
    screenshots: mode === 'with-screenshots' ? [`${outputDirName}/screenshots/with-screenshots-ready.png`, ...dispatches.map((item) => `${outputDirName}/screenshots/with-screenshots-tap-${String(item.index).padStart(2, '0')}.png`)] : [],
  };
  await context.close();
  await browser.close();
  return result;
}

const results = [];
for (const mode of captureOrder) results.push(await run(mode));

// Compare groups by their explicit result.mode. Capture order is diagnostic metadata,
// never a positional contract.
const resultsByMode = Object.fromEntries(results.map((result) => [result.mode, result]));
const withShots = resultsByMode['with-screenshots'];
const withoutShots = resultsByMode['without-screenshots'];
if (!withShots || !withoutShots) throw new Error('capture comparison requires both result.mode groups');
const compareLength = Math.min(withShots.dispatches.length, withoutShots.dispatches.length);
const comparisonFields = ['physicalStep', 'worldTime', 'status', 'anchorId', 'cuts', 'player.x', 'player.y', 'player.vx', 'player.vy', 'eventCount'];
const unobservedFields = ['ActionInput held/repeat internals', 'SliceSimulation inputBuffer value', 'renderer frame scheduling internals', 'OS/browser compositor timing'];
function readField(state, field) {
  return field.split('.').reduce((value, key) => value?.[key], state);
}
function fieldDifference(a, b) {
  const differences = [];
  for (const field of comparisonFields) {
    const left = readField(a, field); const right = readField(b, field);
    const tolerance = field === 'worldTime' ? 1 / FIXED_STEP_HZ : 0;
    if (typeof left === 'number' && typeof right === 'number' ? Math.abs(left - right) > tolerance : left !== right) differences.push({ field, screenshot: left, withoutScreenshots: right });
  }
  return differences;
}
function boundaryState(result, index) {
  return result.dispatches[index]?.eventBoundary?.after ?? result.dispatches[index]?.afterDispatch ?? null;
}
function inputTiming(result, index) {
  const dispatch = result.dispatches[index];
  const boundary = dispatch?.eventBoundary;
  return { physicalStep: boundary?.after?.physicalStep ?? dispatch?.afterDispatch?.physicalStep ?? null, sendStartMs: dispatch?.sendStartMs ?? null, receiptEpochMs: boundary?.receiptEpochMs ?? null };
}
let earliestObservedDifference = null;
let firstVisibleThresholdDifference = null;
for (let i = 0; i < compareLength; i += 1) {
  const a = boundaryState(withShots, i); const b = boundaryState(withoutShots, i);
  if (!a || !b) continue;
  const differences = fieldDifference(a, b);
  const screenshotTiming = inputTiming(withShots, i); const withoutTiming = inputTiming(withoutShots, i);
  const timingDifference = screenshotTiming.physicalStep !== withoutTiming.physicalStep;
  if (!earliestObservedDifference && (differences.length || timingDifference)) earliestObservedDifference = { inputIndex: i + 1, timingDifference, timing: { screenshot: screenshotTiming, withoutScreenshots: withoutTiming }, fields: differences, comparisonFields, unobservedFields };
  const positionDistance = Math.hypot(a.player.x - b.player.x, a.player.y - b.player.y);
  const speedDistance = Math.hypot(a.player.vx - b.player.vx, a.player.vy - b.player.vy);
  if (!firstVisibleThresholdDifference && (positionDistance > 20 || speedDistance > 50 || a.status !== b.status)) firstVisibleThresholdDifference = { inputIndex: i + 1, screenshot: { state: a, timing: screenshotTiming }, withoutScreenshots: { state: b, timing: withoutTiming }, positionDistance, speedDistance, threshold: { positionDistance: 20, speedDistance: 50, status: 'must match' }, comparisonFields, unobservedFields };
}
for (const result of results) {
  result.firstObservedDifference = earliestObservedDifference;
  result.firstVisibleThresholdDifference = firstVisibleThresholdDifference;
  result.firstTerminalInput = result.checkpoints.find((item) => item.stage.startsWith('terminal-after-tap-'))?.stage.match(/(\d+)$/)?.[1] ? Number(result.checkpoints.find((item) => item.stage.startsWith('terminal-after-tap-')).stage.match(/(\d+)$/)[1]) : null;
  result.postCheckpointSampling = { requested: alignPhysicalSteps, executed: result.dispatches.some((item) => item.postCheckpointExecuted), deltaSteps: POST_CHECKPOINT_DELTA_STEPS, note: alignPhysicalSteps ? 'fixed-step wait executed unless terminal arrived first' : 'not executed; wall-time comparison only' };
}
const comparisonSummary = {
  sameBuild: true,
  sameViewport: true,
  sameInputPlan: true,
  onlyCaptureModeChanged: true,
  captureOrder,
  comparisonFields,
  unobservedFields,
  earliestObservedDifference,
  firstVisibleThresholdDifference,
  comparisonWindow: {
    comparedInputs: compareLength,
    lastInputBeforeVisibleThreshold: firstVisibleThresholdDifference ? Math.max(0, firstVisibleThresholdDifference.inputIndex - 1) : null,
    note: 'This is a window boundary only; it is not named or interpreted as complete state confirmation.'
  },
  physicalStepAlignedInputPlan: alignPhysicalSteps,
  postCheckpointSampling: { requested: alignPhysicalSteps, executed: results.some((result) => result.dispatches.some((item) => item.postCheckpointExecuted)), deltaSteps: POST_CHECKPOINT_DELTA_STEPS },
  conclusion: earliestObservedDifference
    ? 'An action-timing or observed-state difference exists at the earliest recorded input above. A later visible-threshold divergence is reported separately; capture, remote-read, event-handler and frame-scheduling costs are not independently isolated.'
    : 'No difference was observed in the compared fields before the compared terminal point.'
};

const report = {
  schemaVersion: 1,
  artifactType: 'B01R2OrdinaryCaptureModeComparison',
  generatedAt: new Date().toISOString(),
  outputDirectory: outputDirName,
  reportPath: reportPath.pathname,
  targetGame: 'Slice Master / 小李飞刀',
  workspace: 'game/prototype-a',
  sourceCommit,
  buildSha256,
  environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless', baseUrl },
  freshContexts: true,
  stateInjection: false,
  debugApiCalled: false,
  diagnosisOnly: true,
  hypothesis: 'wait/screenshot capture may perturb the actual input cadence; this run changes only capture mode and records fixed-step alignment',
  captureOrder,
  timingNormalization: alignPhysicalSteps ? 'inputs wait for the same target 120 Hz physical step derived from the original wall-time plan' : 'original wall-time schedule',
  samplingPolicy: alignPhysicalSteps ? `No periodic state polling; each pointerdown records state at capture/bubble handler boundaries plus a fixed post-input checkpoint (+${POST_CHECKPOINT_DELTA_STEPS} physical steps) or terminal checkpoint.` : 'No periodic state polling; each pointerdown records state at capture/bubble handler boundaries. Fixed post-input checkpoints were not executed in this wall-time run.',
  inputArchitecture: { actionInput: 'game-core ActionInput tracks held/repeat suppression; no held/repeat internals are exposed in this diagnostic.', inputBuffer: 'SliceSimulation owns the inputBuffer used after flip cooldown; no buffer value is exposed in this diagnostic.' },
  diagnosticBridgeCalls: ['window.__GAME_TEST__.resetGame()', 'window.__GAME_TEST__.getProgress()', 'window.__GAME_TEST__.getState()'],
  priorR1Failure: {
    report: 'r1-ordinary-report.json',
    checkpoint: 'afterTap-9',
    condition: 'phase=ordinary,status=failed,failReason=fall before settlement',
    observedState: { x: 1200.6277964664419, y: -127.62846064735574, cuts: 3, eventCount: 14 },
    note: 'The new comparison starts from the same visible coordinate and fixed schedule prefix; it does not reuse or count the R1 terminal as a new pass.',
  },
  inputPlan: { viewport: '1100x720', coordinate: input, tapsMs, origin: 'R1 ordinary first failed trajectory' },
  results,
  comparison: comparisonSummary,
  legacyComparisonFieldsRemoved: ['previous-input confirmation label'],
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
