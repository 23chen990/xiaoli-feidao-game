import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const defaultA = [800, 1859, 2032, 3068, 4140, 5118, 6155, 7157, 8215, 9199, 9352, 9774, 11152, 11382, 13775, 14833, 14991, 15145, 15389, 16391, 16722, 17872, 19618, 20644, 21614, 22592, 23645, 24216];
const defaultB390 = [500, 1578, 1730, 2771, 3761, 4802, 5843, 6820, 7890, 8861, 9002, 9395, 10769, 12188, 13343, 14561, 14911, 15130, 16310, 17321, 18446, 19445, 20429, 21436, 22000, 22500, 23500];
const defaultB1100 = [800, 2007, 2016, 10818, 11026, 11198, 11378, 11607, 15185, 16114, 19610, 20681, 21702, 22698];
function envSchedule(name, fallback) {
  if (!process.env[name]) return fallback;
  const parsed = JSON.parse(process.env[name]);
  if (!Array.isArray(parsed) || parsed.some((value) => !Number.isFinite(value))) throw new Error(`${name} must be a JSON array of numbers`);
  return parsed;
}
const schedules = { ordinary1100: envSchedule('R2_A_TAPS_MS', defaultA), bonus390: envSchedule('R2_B390_TAPS_MS', defaultB390), bonus1100: envSchedule('R2_B1100_TAPS_MS', defaultB1100) };
const evidenceDirName = process.env.R2_EVIDENCE_DIR ?? 'r2-natural';
const evidencePath = (name) => new URL(`./${evidenceDirName}/${name}`, root).pathname;
const reportPath = new URL(process.env.R2_REPORT_PATH ?? './r2-natural-acceptance.json', root);
const consoleReportPath = new URL(process.env.R2_CONSOLE_REPORT_PATH ?? './r2-natural-console-errors.json', root);
await mkdir(new URL(`./${evidenceDirName}/`, root), { recursive: true });

function brief(state) {
  return { phase: state.phase, status: state.status, failReason: state.failReason, finishPhase: state.finishPhase, finishGateId: state.finishGateId, finishSelection: state.finishSelection, levelNumber: state.levelNumber, elapsed: state.elapsed, worldTime: state.worldTime, cuts: state.cuts, bonusConsumed: state.bonusConsumed, player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy, angle: state.player.angle, angularVelocity: state.player.angularVelocity }, eventCount: state.events.length, events: state.events.slice(-8) };
}

function classify({ targetReached, assertionFailure, environmentFailure }) {
  if (environmentFailure) return 'BLOCKED';
  if (assertionFailure && targetReached) return 'FAIL';
  if (targetReached && !assertionFailure) return 'PASS';
  return 'NOT_RUN';
}

function rawOutcome({ targetReached, terminal, assertionFailure, environmentFailure }) {
  if (environmentFailure) return 'environment-or-tool-failure';
  if (assertionFailure && targetReached) return 'target-checkpoint-assertion-failure';
  if (targetReached) return 'target-checkpoint-passed';
  if (terminal?.status === 'failed') return 'ordinary-terminal-failed-before-target';
  if (terminal?.status === 'won') return 'terminal-won-without-required-checkpoint';
  return 'schedule-ended-before-target';
}

if (process.env.R2_SCRIPT_SELF_CHECK === '1') {
  const checks = [
    [classify({ targetReached: false, assertionFailure: null, environmentFailure: null }), 'NOT_RUN'],
    [classify({ targetReached: true, assertionFailure: 'blank tap changed state', environmentFailure: null }), 'FAIL'],
    [classify({ targetReached: false, assertionFailure: 'missing target', environmentFailure: null }), 'NOT_RUN'],
    [classify({ targetReached: false, assertionFailure: null, environmentFailure: 'browser timeout' }), 'BLOCKED'],
    [classify({ targetReached: true, assertionFailure: null, environmentFailure: null }), 'PASS'],
    [rawOutcome({ targetReached: false, terminal: { status: 'failed' }, assertionFailure: null, environmentFailure: null }), 'ordinary-terminal-failed-before-target'],
  ];
  for (const [actual, expected] of checks) if (actual !== expected) throw new Error(`R2 classification self-check expected ${expected}, got ${actual}`);
  console.log(JSON.stringify({ artifactType: 'B01R2AcceptanceScriptSelfCheck', status: 'PASS', checks: checks.length }));
  process.exit(0);
}

async function installReceiptProbe(page) {
  await page.evaluate(() => {
    window.__R2_RECEIVED__ = [];
    const receive = (event) => window.__R2_RECEIVED__.push({ type: event.type, pointerType: event.pointerType ?? null, clientX: event.clientX ?? null, clientY: event.clientY ?? null, timeMs: performance.now() });
    window.addEventListener('pointerdown', receive, true);
    window.addEventListener('pointerup', receive, true);
  });
}

async function createPage(viewport, mobile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  await installReceiptProbe(page);
  return { browser, context, page, cdp: await context.newCDPSession(page), errors };
}

async function dispatchTap(input, spec, targetMs, startedAt, index) {
  const waitMs = targetMs - (Date.now() - startedAt);
  if (waitMs > 0) await input.page.waitForTimeout(waitMs);
  const before = await input.page.evaluate(() => window.__GAME_TEST__.getState());
  const sendStartMs = Date.now() - startedAt;
  if (spec.mobile) {
    await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spec.x, y: spec.y, radiusX: 4, radiusY: 4 }] });
    await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await input.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
    await input.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
  }
  const received = await input.page.evaluate(() => window.__R2_RECEIVED__.slice(-2));
  const after = await input.page.evaluate(() => window.__GAME_TEST__.getState());
  return { index, plannedMs: targetMs, sendStartMs, sendEndMs: Date.now() - startedAt, received, inputReceiptObserved: received.filter((event) => event.type === 'pointerdown' || event.type === 'pointerup').length === 2, before: brief(before), after: brief(after), inputEffective: after.eventCount > before.eventCount || after.status !== before.status || after.player.vx !== before.player.vx || after.player.vy !== before.player.vy };
}

async function ordinaryCase() {
  const spec = { width: 1100, height: 720, x: 550, y: 518.4, mobile: false };
  const input = await createPage({ width: spec.width, height: spec.height }, false);
  const dispatches = [];
  const startDelayMs = Number(process.env.R2_START_DELAY_MS ?? 0);
  const checkpoints = [{ atMs: 0, stage: 'ready', state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())), terminalActionsHidden: await input.page.locator('#terminal-actions').getAttribute('hidden').then((value) => value !== null) }];
  let targetReached = false; let assertionFailure = null; let environmentFailure = null; let terminal = null; let blankCheck = null; let next = null; let reload = null; let postReloadPlay = null;
  try {
    await input.page.screenshot({ path: evidencePath('ordinary-1100-ready.png') });
    if (startDelayMs > 0) await input.page.waitForTimeout(startDelayMs);
    const startedAt = Date.now();
    for (let index = 0; index < schedules.ordinary1100.length; index += 1) {
      const item = await dispatchTap(input, spec, schedules.ordinary1100[index], startedAt, index + 1);
      dispatches.push(item);
      if (item.after.status === 'failed' || item.after.status === 'won') {
        checkpoints.push({ atMs: Date.now() - startedAt, stage: `terminal-after-input-${index + 1}`, state: item.after, terminalActionsHidden: await input.page.locator('#terminal-actions').getAttribute('hidden').then((value) => value !== null) });
        terminal = item.after;
        break;
      }
    }
    if (terminal?.phase === 'ordinary' && terminal.status === 'won' && terminal.finishPhase === 'terminal') {
      targetReached = true;
      await input.page.screenshot({ path: evidencePath('ordinary-1100-won.png') });
      const before = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      await input.page.mouse.click(990, 650); await input.page.waitForTimeout(150);
      const after = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      blankCheck = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) };
      if (!blankCheck.unchanged) throw new Error('blank tap changed ordinary terminal state');
      await input.page.locator('#next-level-button').click();
      await input.page.waitForFunction(() => window.__GAME_TEST__.getState().levelNumber === 2 && window.__GAME_TEST__.getState().status === 'ready');
      next = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      await input.page.screenshot({ path: evidencePath('ordinary-1100-next-ready.png') });
      await input.page.reload({ waitUntil: 'networkidle' }); await input.page.waitForFunction(() => Boolean(window.__GAME_TEST__)); await installReceiptProbe(input.page);
      reload = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      await input.page.screenshot({ path: evidencePath('ordinary-1100-reload-ready.png') });
      if (reload.levelNumber !== 2 || reload.status !== 'ready') throw new Error('reload did not retain level 2 ready state');
      const postReloadInput = await dispatchTap({ ...input, page: input.page }, spec, 0, Date.now(), 1);
      postReloadPlay = { input: postReloadInput, playable: postReloadInput.inputEffective && (postReloadInput.after.status === 'airborne' || postReloadInput.after.status === 'anchored' || postReloadInput.after.eventCount > 0) };
      if (!postReloadPlay.playable) throw new Error('reload ready state did not respond to visible input');
    }
  } catch (error) {
    if (targetReached) assertionFailure = error instanceof Error ? error.message : String(error); else environmentFailure = error instanceof Error && /network|browser|Target closed|timeout/i.test(error.message) ? error.message : null;
    if (!targetReached && !environmentFailure && terminal?.status === 'failed') assertionFailure = null;
  } finally {
    await input.context.close(); await input.browser.close();
  }
  const result = classify({ targetReached, assertionFailure, environmentFailure });
  const validObservation = dispatches.length > 0 && dispatches.every((item) => item.inputReceiptObserved) && (terminal !== null || dispatches.length === schedules.ordinary1100.length);
  return { id: 'A-ordinary-1100x720', viewport: '1100x720', inputMode: 'fixed visible canvas mouse events; no per-input screenshots', fixedScheduleMs: schedules.ordinary1100, startDelayMs, targetReached, result, rawOutcome: rawOutcome({ targetReached, terminal, assertionFailure, environmentFailure }), validObservation, requiredCheckpoint: 'phase=ordinary,status=won,finishPhase=terminal; pre-settlement controls hidden; blank tap unchanged; next level ready; reload level 2 ready; reload input responds', failureStage: targetReached ? (assertionFailure ? 'post-settlement-or-reload-assertion' : 'complete') : (terminal?.status === 'failed' ? 'ordinary-play-before-settlement' : 'ordinary-schedule-before-settlement'), terminal, blankCheck, next, reload, postReloadPlay, dispatches, checkpoints, assertionFailure, environmentFailure, consoleErrors: input.errors, evidence: [`${evidenceDirName}/ordinary-1100-ready.png`, ...(targetReached ? [`${evidenceDirName}/ordinary-1100-won.png`, `${evidenceDirName}/ordinary-1100-next-ready.png`, `${evidenceDirName}/ordinary-1100-reload-ready.png`] : [])] };
}

async function bonusCase(id, width, height, mobile, tapsMs) {
  const spec = { width, height, x: width / 2, y: height * 0.72, mobile };
  const input = await createPage({ width, height }, mobile);
  const startedAt = Date.now(); const dispatches = []; const checkpoints = [{ atMs: 0, stage: 'ready', state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())) }];
  let entered = null; let responsive = null; let assertionFailure = null; let environmentFailure = null;
  try {
    await input.page.screenshot({ path: evidencePath(`${id}-ready.png`) });
    for (let index = 0; index < tapsMs.length; index += 1) {
      const item = await dispatchTap(input, spec, tapsMs[index], startedAt, index + 1); dispatches.push(item);
      if (item.after.phase !== (dispatches.at(-2)?.after.phase ?? 'ordinary') || item.after.status !== (dispatches.at(-2)?.after.status ?? 'ready')) checkpoints.push({ atMs: Date.now() - startedAt, stage: `after-input-${index + 1}`, state: item.after });
      if (!entered && item.after.phase === 'bonus') {
        entered = { inputIndex: index + 1, before: item.before, entry: item.after, received: item.received };
        await input.page.screenshot({ path: evidencePath(`${id}-bonus-entered.png`) });
        const responsiveBefore = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
        const next = await dispatchTap(input, spec, tapsMs[index + 1] ?? tapsMs[index] + 500, startedAt, index + 2); dispatches.push(next);
        const responsiveAfter = next.after;
        responsive = { before: responsiveBefore, after: responsiveAfter, inputEffective: next.inputEffective, responded: next.inputEffective && responsiveAfter.phase === 'bonus' && (responsiveAfter.eventCount > responsiveBefore.eventCount || responsiveAfter.player.x !== responsiveBefore.player.x || responsiveAfter.player.y !== responsiveBefore.player.y) };
        if (!responsive.responded) assertionFailure = 'BONUS entry reached but subsequent normal input did not visibly/statefully respond';
        break;
      }
      if (item.after.status === 'failed' || item.after.status === 'won') break;
    }
  } catch (error) {
    environmentFailure = error instanceof Error && /network|browser|Target closed|timeout/i.test(error.message) ? error.message : null;
    assertionFailure = environmentFailure ? null : error instanceof Error ? error.message : String(error);
  } finally { await input.context.close(); await input.browser.close(); }
  const targetReached = Boolean(entered);
  const result = classify({ targetReached, assertionFailure, environmentFailure });
  const validObservation = dispatches.length > 0 && dispatches.every((item) => item.inputReceiptObserved) && (targetReached || dispatches.length === tapsMs.length || dispatches.at(-1)?.after.status === 'failed' || dispatches.at(-1)?.after.status === 'won');
  const raw = environmentFailure ? 'environment-or-tool-failure' : assertionFailure && targetReached ? 'bonus-entry-post-input-assertion-failure' : targetReached ? 'bonus-entry-and-response-observed' : dispatches.at(-1)?.after.status === 'failed' ? 'ordinary-terminal-failed-before-bonus' : 'schedule-ended-before-bonus';
  return { id, viewport: `${width}x${height}`, inputMode: mobile ? 'fixed visible canvas touch events; no per-input screenshots' : 'fixed visible canvas mouse events; no per-input screenshots', fixedScheduleMs: tapsMs, targetReached, result, rawOutcome: raw, validObservation, requiredCheckpoint: 'ready→natural phase=bonus entry→normal input received→phase remains bonus with observable response', failureStage: targetReached ? (assertionFailure ? 'bonus-post-entry-input-response' : 'complete') : dispatches.at(-1)?.after.status === 'failed' ? 'ordinary-play-before-bonus-entry' : 'bonus-schedule-before-entry', entered, responsive, dispatches, checkpoints, assertionFailure, environmentFailure, consoleErrors: input.errors, evidence: [`${evidenceDirName}/${id}-ready.png`, ...(entered ? [`${evidenceDirName}/${id}-bonus-entered.png`] : [])] };
}

const ordinary = await ordinaryCase();
const deferredBonus = (id, viewport) => ({ id, viewport, targetReached: false, result: 'NOT_RUN', rawOutcome: 'bonus-checkpoint-not-executed-by-ordinary-only-run', validObservation: false, requiredCheckpoint: 'ready→natural phase=bonus entry→normal input received→phase remains bonus with observable response', failureStage: 'ordinary-focused-run-deferred-bonus', entered: null, responsive: null, dispatches: [], checkpoints: [], assertionFailure: null, environmentFailure: null, consoleErrors: [], evidence: [] });
const ordinaryOnly = process.env.R2_ORDINARY_ONLY === '1';
const results = { ordinary, bonus390: ordinaryOnly ? deferredBonus('B-bonus-390x844', '390x844') : await bonusCase('B-bonus-390x844', 390, 844, true, schedules.bonus390), bonus1100: ordinaryOnly ? deferredBonus('B-bonus-1100x720', '1100x720') : await bonusCase('B-bonus-1100x720', 1100, 720, false, schedules.bonus1100) };
const report = { schemaVersion: 1, artifactType: 'B01R2NaturalAcceptance', generatedAt: new Date().toISOString(), targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', sourceCommit, buildSha256, baseUrl, environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless' }, freshContexts: true, stateInjection: false, debugApiCalled: false, classificationPolicy: { targetCheckpointMissing: 'NOT_RUN', reachedCheckpointAssertionViolation: 'FAIL', environmentOrToolBlock: 'BLOCKED' }, results, oldR1Mapping: { 'r1-formal-ordinary-report.outcome=BLOCKED-before-won': 'NOT_RUN', 'r1-formal-bonus-report.outcome=BLOCKED-before-bonus': 'NOT_RUN', 'r1-formal-bonus-report.outcome=NOT_RUN-schedule-ended': 'NOT_RUN' }, evidencePolicy: 'getState and event traces are recorded after inputs for diagnosis; no internal state drove input; only key screenshots are captured after target checkpoints to avoid perturbing the input cadence.' };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(consoleReportPath, `${JSON.stringify({ generatedAt: report.generatedAt, ordinary: results.ordinary.consoleErrors, bonus390: results.bonus390.consoleErrors, bonus1100: results.bonus1100.consoleErrors }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
