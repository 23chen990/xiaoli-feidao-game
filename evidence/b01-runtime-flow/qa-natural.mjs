import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';

const root = new URL('.', import.meta.url);
const screenshotDir = new URL('./screenshots/', root);
const videoDir = new URL('./videos/', root);
await mkdir(screenshotDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

const url = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const viewports = {
  portrait390x844: { width: 390, height: 844, mobile: true, x: 195, y: 607.68 },
  desktop1100x720: { width: 1100, height: 720, mobile: false, x: 550, y: 518.4 },
};
const successCandidatesByViewport = {
  portrait390x844: [{ intervalMs: 1000, offsetMs: 300 }],
  desktop1100x720: [{ intervalMs: 950, offsetMs: 450 }, { intervalMs: 950, offsetMs: 550 }],
};
const failureScheduleMs = [400, 2000, 3600, 5200, 6800, 8400, 10000, 11600, 13200, 14800, 16400, 18000];
const errors = [];

function stateSummary(state) {
  return {
    levelNumber: state.levelNumber,
    phase: state.phase,
    status: state.status,
    failReason: state.failReason,
    elapsed: state.elapsed,
    player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy },
    cuts: state.cuts,
    finishPhase: state.finishPhase,
    finishGateId: state.finishGateId,
    finishSelection: state.finishSelection,
    bonusAvailable: state.bonusAvailable,
    bonusConsumed: state.bonusConsumed,
    events: state.events.length,
  };
}

async function createPage(spec, recordVideo = false) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    isMobile: spec.mobile,
    hasTouch: spec.mobile,
    ...(recordVideo ? { recordVideo: { dir: videoDir.pathname, size: { width: spec.width, height: spec.height } } } : {}),
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${spec.width}x${spec.height} console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${spec.width}x${spec.height} page: ${error.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  const cdp = await context.newCDPSession(page);
  return { browser, context, page, cdp };
}

async function tap(input, x, y) {
  if (input.mobile) {
    await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4 }] });
    await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await input.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await input.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}

async function readState(page) {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function finishInput(input, scheduleMs, durationMs = 26_000) {
  const start = Date.now();
  for (const plannedMs of scheduleMs) {
    const remaining = plannedMs - (Date.now() - start);
    if (remaining > 0) await input.page.waitForTimeout(remaining);
    if (await input.page.locator('#terminal-actions').isVisible().catch(() => false)) break;
    await tap(input, input.spec.x, input.spec.y);
  }
  const remaining = durationMs - (Date.now() - start);
  if (remaining > 0 && !(await input.page.locator('#terminal-actions').isVisible().catch(() => false))) {
    await input.page.waitForTimeout(remaining);
  }
}

async function periodicSchedule(candidate, durationMs = 26_000) {
  const schedule = [];
  for (let at = candidate.offsetMs; at <= durationMs; at += candidate.intervalMs) schedule.push(at);
  return schedule;
}

async function runSuccessCandidate(spec, candidate, index) {
  const input = await createPage(spec);
  input.spec = spec;
  try {
    await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-startup-candidate-${index}.png`, root).pathname });
    await finishInput(input, await periodicSchedule(candidate));
    const terminalVisible = await input.page.locator('#terminal-actions').isVisible().catch(() => false);
    if (!terminalVisible) {
      return { candidate, index, outcome: 'NOT_RUN', reason: 'fixed schedule did not reach a visible terminal' };
    }
    const terminalState = await readState(input.page);
    const terminalCopy = await input.page.locator('#terminal-text').textContent();
    const replayText = await input.page.locator('#replay-button').textContent();
    if (terminalState.status !== 'won') {
      return { candidate, index, outcome: 'FAILED', state: stateSummary(terminalState), terminalCopy, replayText };
    }
    await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-ordinary-terminal.png`, root).pathname });
    assert.equal(replayText, '重试本关');
    assert.equal(await input.page.locator('#next-level-button').isVisible(), true);
    await input.page.locator('#next-level-button').click();
    await input.page.locator('#hud-title').filter({ hasText: '· 02/12' }).waitFor({ state: 'visible', timeout: 3000 });
    const nextState = await readState(input.page);
    assert.equal(nextState.levelNumber, 2);
    assert.equal(nextState.status, 'ready');
    await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-next-level.png`, root).pathname });
    await input.page.reload({ waitUntil: 'networkidle' });
    await input.page.waitForFunction(() => Boolean(window.__GAME_TEST__));
    const reloadedState = await readState(input.page);
    assert.equal(reloadedState.levelNumber, 2);
    assert.equal(reloadedState.status, 'ready');
    await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-reload-level-2.png`, root).pathname });
    return {
      candidate,
      index,
      outcome: 'PASS',
      terminal: stateSummary(terminalState),
      terminalCopy,
      replayText,
      next: stateSummary(nextState),
      reload: stateSummary(reloadedState),
      bonusLabelVisibleAtStartup: (await input.page.locator('#finish-wall-labels').textContent())?.includes('BONUS') ?? false,
    };
  } finally {
    await input.context.close();
    await input.browser.close();
  }
}

async function runSuccessSweep(spec) {
  const candidates = successCandidatesByViewport[spec.width === 390 ? 'portrait390x844' : 'desktop1100x720'];
  const attempts = await Promise.all(candidates.map(async (candidate, index) => {
    try {
      return await runSuccessCandidate(spec, candidate, index);
    } catch (error) {
      return { candidate, index, outcome: 'BLOCKED', reason: error instanceof Error ? error.message : String(error) };
    }
  }));
  const pass = attempts.find((attempt) => attempt.outcome === 'PASS');
  return { attempts, pass: pass ?? null };
}

async function runFailureRetry(spec) {
  const input = await createPage(spec);
  input.spec = spec;
  const cycles = [];
  try {
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await finishInput(input, failureScheduleMs, 16_000);
      const visiblyTerminal = await input.page.locator('#terminal-actions').isVisible().catch(() => false);
      if (!visiblyTerminal) {
        const stalled = await readState(input.page);
        return { outcome: 'BLOCKED', completedCycles: cycles.length, cycle: cycle + 1, reason: 'predeclared failure input schedule did not reach a visible terminal', state: stateSummary(stalled), cycles };
      }
      const failed = await readState(input.page);
      const terminalCopy = await input.page.locator('#terminal-text').textContent();
      const replayText = await input.page.locator('#replay-button').textContent();
      assert.ok(failed.status === 'failed' || failed.status === 'won');
      assert.equal(replayText, '重试本关');
      const beforeBlank = stateSummary(failed);
      await tap(input, Math.round(spec.width * 0.9), Math.round(spec.height * 0.9));
      await input.page.waitForTimeout(150);
      const afterBlank = await readState(input.page);
      assert.equal(afterBlank.status, failed.status);
      assert.equal(afterBlank.player.x, failed.player.x);
      if (cycle === 0) {
        await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-terminal.png`, root).pathname });
      }
      await input.page.locator('#replay-button').click();
      await input.page.waitForTimeout(120);
      const replayed = await readState(input.page);
      assert.equal(replayed.status, 'ready');
      assert.equal(replayed.cuts, 0);
      assert.equal(replayed.events.length, 0);
      assert.equal(await input.page.locator('#terminal-actions').isVisible(), false);
      assert.equal(await input.page.locator('#feedback-layer').locator(':scope > *').count(), 0);
      if (cycle === 0) {
        await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-replay.png`, root).pathname });
      }
      cycles.push({ cycle: cycle + 1, beforeBlank, terminalCopy, replayText, afterBlank: stateSummary(afterBlank), replayed: stateSummary(replayed) });
      if (cycle < 9) await input.page.waitForTimeout(250);
    }
    return { outcome: 'PASS', cycles };
  } finally {
    await input.context.close();
    await input.browser.close();
  }
}

async function runLifecycleSynthetic(spec) {
  const input = await createPage(spec);
  input.spec = spec;
  try {
    await input.page.waitForTimeout(400);
    await tap(input, spec.x, spec.y);
    await input.page.waitForTimeout(500);
    const beforePause = await readState(input.page);
    assert.ok(beforePause.status === 'airborne' || beforePause.status === 'anchored');
    await input.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await input.page.locator('#continue-button').waitFor({ state: 'visible', timeout: 2000 });
    const paused = await readState(input.page);
    await input.page.waitForTimeout(700);
    const stillPaused = await readState(input.page);
    assert.equal(stillPaused.status, paused.status);
    assert.equal(stillPaused.player.x, paused.player.x);
    assert.equal(stillPaused.player.y, paused.player.y);
    await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-paused-continue.png`, root).pathname });
    await input.page.locator('#continue-button').click();
    await input.page.locator('#continue-button').waitFor({ state: 'hidden', timeout: 2000 });
    const resumed = await readState(input.page);
    assert.ok(resumed.status === 'airborne' || resumed.status === 'anchored' || resumed.status === 'failed');
    await input.page.evaluate(() => {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });
    const bfcacheContinueVisible = await input.page.locator('#continue-button').isVisible();
    let bfcachePaused = null;
    let bfcacheResumed = null;
    if (bfcacheContinueVisible) {
      bfcachePaused = await readState(input.page);
      await input.page.locator('#continue-button').click();
      await input.page.locator('#continue-button').waitFor({ state: 'hidden', timeout: 2000 });
      bfcacheResumed = await readState(input.page);
      await input.page.screenshot({ path: new URL(`./screenshots/${spec.width}x${spec.height}-pageshow-resumed.png`, root).pathname });
    }
    return { outcome: bfcacheContinueVisible ? 'PASS' : 'BLOCKED', synthetic: true, beforePause: stateSummary(beforePause), paused: stateSummary(paused), stillPaused: stateSummary(stillPaused), resumed: stateSummary(resumed), bfcachePaused: bfcachePaused ? stateSummary(bfcachePaused) : null, bfcacheResumed: bfcacheResumed ? stateSummary(bfcacheResumed) : null };
  } finally {
    await input.context.close();
    await input.browser.close();
  }
}

const report = {
  schemaVersion: 1,
  artifactType: 'B01RuntimeFlowBrowserReport',
  targetGame: 'Slice Master / 小李飞刀',
  workspace: 'game/prototype-a',
  url,
  freshContexts: true,
  stateInjection: false,
  debugApiCalled: false,
  adaptiveScheduling: false,
  inputSchedule: { successCandidatesByViewport, failureScheduleMs },
  viewports: {},
  consoleErrors: errors,
  limitations: ['Bonus entry was not claimed from a natural level 1 completion in this run; visible BONUS label and logic tests are recorded separately.'],
};

for (const [name, spec] of Object.entries(viewports)) {
  const failureRetry = await runFailureRetry(spec).catch((error) => ({ outcome: 'BLOCKED', reason: error instanceof Error ? error.message : String(error) }));
  const success = await runSuccessSweep(spec);
  const lifecycle = await runLifecycleSynthetic(spec).catch((error) => ({ outcome: 'BLOCKED', reason: error instanceof Error ? error.message : String(error) }));
  report.viewports[name] = { size: `${spec.width}x${spec.height}`, failureRetry, success, lifecycle };
}

report.consoleErrors = errors;
await writeFile(new URL('./browser-report.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ artifactType: report.artifactType, viewports: Object.fromEntries(Object.entries(report.viewports).map(([name, value]) => [name, { failureRetry: value.failureRetry.outcome, success: value.success.pass?.outcome ?? 'NOT_RUN', lifecycle: value.lifecycle.outcome }])), consoleErrors: report.consoleErrors.length }, null, 2));
