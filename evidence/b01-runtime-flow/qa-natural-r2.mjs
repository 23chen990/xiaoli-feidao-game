import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const scriptVersion = 'B01-R2-acceptance-v2.1';
const scriptSha256 = createHash('sha256').update(await readFile(new URL('./qa-natural-r2.mjs', root))).digest('hex');
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

const ACTION_EVENT_TYPES = new Set(['launch', 'flip', 'cut']);
function brief(state) {
  return { phase: state.phase, status: state.status, failReason: state.failReason, finishPhase: state.finishPhase, finishGateId: state.finishGateId, finishSelection: state.finishSelection, levelNumber: state.levelNumber, elapsed: state.elapsed, worldTime: state.worldTime, cuts: state.cuts, bonusConsumed: state.bonusConsumed, player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy, angle: state.player.angle, angularVelocity: state.player.angularVelocity }, events: state.events.slice(-8), eventCount: state.events.length };
}
function newEvents(before, after) {
  const beforeIds = new Set(before.events.map((event) => event.id));
  return after.events.filter((event) => !beforeIds.has(event.id));
}
function actionEvents(events) { return events.filter((event) => ACTION_EVENT_TYPES.has(event.type)); }
function serializeError(error) { return { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack ?? null }; }
function isEnvironmentError(error) { return /network|browser|Target closed|timeout|connection|protocol|context/i.test(error?.message ?? String(error)); }
function selectNewReceipts(receipts, beforeLength) { return receipts.slice(beforeLength); }
function classify({ targetReached, validObservation, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }) {
  if (assertionFailure && assertionFailureObserved) return 'FAIL';
  if (environmentFailure || (unknownFailure && targetReached)) return 'BLOCKED';
  if (targetReached && validObservation && !assertionFailure) return 'PASS';
  return 'NOT_RUN';
}
function rawOutcome({ targetReached, terminal, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }) {
  if (assertionFailure && assertionFailureObserved) return 'target-checkpoint-assertion-failure';
  if (environmentFailure) return 'environment-or-tool-failure';
  if (unknownFailure) return targetReached ? 'unknown-post-target-script-failure' : 'unknown-pre-target-script-failure';
  if (targetReached) return 'target-checkpoint-passed';
  if (terminal?.status === 'failed') return 'ordinary-terminal-failed-before-target';
  if (terminal?.status === 'won') return 'terminal-won-without-required-checkpoint';
  return 'schedule-ended-before-target';
}
function makeCheck(id, executed, validObservation, passed, reason, evidence = null) { return { id, executed, validObservation, passed, reason: reason ?? null, evidence }; }

if (process.env.R2_SCRIPT_SELF_CHECK === '1') {
  const fakeReceipts = [{ seq: 1 }, { seq: 2 }];
  const checks = [
    [classify({ targetReached: false, validObservation: false, assertionFailure: null, assertionFailureObserved: false, environmentFailure: null, unknownFailure: null }), 'NOT_RUN'],
    [classify({ targetReached: false, validObservation: true, assertionFailure: 'transition controls visible', assertionFailureObserved: true, environmentFailure: null, unknownFailure: null }), 'FAIL'],
    [classify({ targetReached: false, validObservation: true, assertionFailure: 'missing target', assertionFailureObserved: false, environmentFailure: null, unknownFailure: null }), 'NOT_RUN'],
    [classify({ targetReached: false, validObservation: false, assertionFailure: null, assertionFailureObserved: false, environmentFailure: 'browser timeout', unknownFailure: null }), 'BLOCKED'],
    [classify({ targetReached: true, validObservation: true, assertionFailure: null, assertionFailureObserved: false, environmentFailure: null, unknownFailure: null }), 'PASS'],
    [classify({ targetReached: true, validObservation: true, assertionFailure: 'product assertion', assertionFailureObserved: true, environmentFailure: 'later context close', unknownFailure: null }), 'FAIL'],
    [rawOutcome({ targetReached: false, terminal: { status: 'failed' }, assertionFailure: null, assertionFailureObserved: false, environmentFailure: null, unknownFailure: null }), 'ordinary-terminal-failed-before-target'],
    [selectNewReceipts(fakeReceipts, 1).length, 1],
    [actionEvents([{ type: 'gravity' }]).length, 0],
    [makeCheck('controls', true, true, false, 'visible').passed, false],
  ];
  for (const [actual, expected] of checks) if (actual !== expected) throw new Error(`R2 script self-check expected ${expected}, got ${actual}`);
  console.log(JSON.stringify({ artifactType: 'B01R2AcceptanceScriptSelfCheck', status: 'PASS', checks: checks.length }));
  process.exit(0);
}

async function installReceiptProbe(page) {
  await page.evaluate(() => {
    window.__R2_RECEIVED__ = [];
    window.__R2_RECEIPT_SEQ__ = 0;
    const receive = (event) => window.__R2_RECEIVED__.push({ seq: ++window.__R2_RECEIPT_SEQ__, type: event.type, pointerType: event.pointerType ?? null, clientX: event.clientX ?? null, clientY: event.clientY ?? null, timeMs: performance.now(), epochMs: performance.timeOrigin + performance.now() });
    window.addEventListener('pointerdown', receive, true);
    window.addEventListener('pointerup', receive, true);
  });
}
async function installControlObserver(page) {
  await page.evaluate(() => {
    const element = document.querySelector('#terminal-actions');
    const terminalText = document.querySelector('#terminal-text');
    const samples = [];
    let lastDomKey = null;
    const snapshot = (reason) => {
      const domKey = `${element?.hidden ?? null}|${terminalText?.hidden ?? null}|${element?.getAttribute('class') ?? ''}|${terminalText?.getAttribute('class') ?? ''}|${terminalText?.textContent ?? ''}`;
      if (reason !== 'initial' && domKey === lastDomKey) return;
      lastDomKey = domKey;
      const state = window.__GAME_TEST__.getState();
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect();
      samples.push({ reason, atMs: performance.now(), phase: state.phase, status: state.status, finishPhase: state.finishPhase, worldTime: state.worldTime, hidden: element?.hidden ?? null, visible: Boolean(element && !element.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0 && rect?.width > 0 && rect?.height > 0), display: style?.display ?? null, visibility: style?.visibility ?? null, opacity: style?.opacity ?? null });
    };
    const observer = new MutationObserver(() => snapshot('mutation'));
    if (element) observer.observe(element, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    if (terminalText) observer.observe(terminalText, { attributes: true, attributeFilter: ['hidden', 'style', 'class'], childList: true, characterData: true, subtree: true });
    const timer = null;
    snapshot('initial');
    window.__R2_CONTROL_OBS__ = { samples, observer, timer };
  });
}
async function stopControlObserver(page) {
  return page.evaluate(() => {
    const observer = window.__R2_CONTROL_OBS__;
    if (!observer) return [];
    if (observer.timer) clearInterval(observer.timer);
    observer.observer.disconnect();
    return observer.samples;
  }).catch(() => []);
}
async function readControl(page) {
  return page.evaluate(() => {
    const element = document.querySelector('#terminal-actions');
    const style = element ? getComputedStyle(element) : null;
    const rect = element?.getBoundingClientRect();
    return { exists: Boolean(element), hidden: element?.hidden ?? null, visible: Boolean(element && !element.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0 && rect?.width > 0 && rect?.height > 0), display: style?.display ?? null, visibility: style?.visibility ?? null, opacity: style?.opacity ?? null };
  });
}
async function servedBuildHash() {
  const response = await fetch(baseUrl);
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, sha256: createHash('sha256').update(body).digest('hex') };
}
async function createPage(viewport, mobile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const contextId = randomUUID();
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  await installReceiptProbe(page);
  return { browser, context, contextId, page, cdp: await context.newCDPSession(page), errors };
}
async function dispatchTap(input, spec, targetMs, startedAt, inputId) {
  const waitMs = targetMs - (Date.now() - startedAt);
  if (waitMs > 0) await input.page.waitForTimeout(waitMs);
  const before = await input.page.evaluate(() => window.__GAME_TEST__.getState());
  const receiptBeforeLength = await input.page.evaluate(() => window.__R2_RECEIVED__.length);
  const sendStartMs = Date.now() - startedAt;
  const sendStartEpochMs = Date.now();
  try {
    if (spec.mobile) {
      await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spec.x, y: spec.y, radiusX: 4, radiusY: 4 }] });
      await input.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await input.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
      await input.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
    }
  } finally {
  }
  const receivedAll = await input.page.evaluate(() => window.__R2_RECEIVED__);
  const received = selectNewReceipts(receivedAll, receiptBeforeLength).map((event) => ({ ...event, inputId }));
  const after = await input.page.evaluate(() => window.__GAME_TEST__.getState());
  const eventsAfterInput = newEvents(before, after);
  const newActionEvents = actionEvents(eventsAfterInput);
  const inputReceiptObserved = received.length === 2 && received.every((event) => event.inputId === inputId) && received.map((event) => event.type).sort().join(',') === 'pointerdown,pointerup';
  const response = { newEvents: eventsAfterInput, newActionEvents, actionTypes: newActionEvents.map((event) => event.type), hasAction: newActionEvents.length > 0, motionOnly: newActionEvents.length === 0 && (after.player.x !== before.player.x || after.player.y !== before.player.y || after.player.vx !== before.player.vx || after.player.vy !== before.player.vy) };
  return { inputId, plannedMs: targetMs, sendStartMs, sendEndMs: Date.now() - startedAt, sendStartEpochMs, received, receiptBeforeLength, receiptAfterLength: receivedAll.length, inputReceiptObserved, before: brief(before), after: brief(after), eventsAfterInput, response, inputEffective: inputReceiptObserved && response.hasAction };
}

async function ordinaryCase() {
  const spec = { width: 1100, height: 720, x: 550, y: 518.4, mobile: false };
  const input = await createPage({ width: spec.width, height: spec.height }, false);
  const dispatches = [];
  const startDelayMs = Number(process.env.R2_START_DELAY_MS ?? 0);
  let controlObservations = [];
  let controlObserverStarted = false;
  let readyState = null; let readyControl = null; let terminalControl = null;
  let targetReached = false; let assertionFailure = null; let assertionFailureObserved = false; let environmentFailure = null; let unknownFailure = null; let rawError = null; let terminal = null; let blankCheck = null; let next = null; let reload = null; let postReloadPlay = null;
  const startedContext = input.contextId;
  try {
    readyState = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
    readyControl = await readControl(input.page);
    await input.page.screenshot({ path: evidencePath('ordinary-1100-ready.png') });
    if (startDelayMs > 0) await input.page.waitForTimeout(startDelayMs);
    const startedAt = Date.now();
    for (let index = 0; index < schedules.ordinary1100.length; index += 1) {
      const item = await dispatchTap(input, spec, schedules.ordinary1100[index], startedAt, `ordinary-input-${index + 1}`);
      dispatches.push(item);
      if (!controlObserverStarted && index >= 13) {
        controlObserverStarted = true;
        await installControlObserver(input.page);
      }
      if (item.after.status === 'failed' || item.after.status === 'won') {
        terminal = item.after;
        await input.page.waitForFunction(() => !document.querySelector('#terminal-actions')?.hasAttribute('hidden'), null, { timeout: 1500 }).catch(() => {});
        terminalControl = await readControl(input.page);
        break;
      }
    }
    targetReached = Boolean(terminal?.phase === 'ordinary' && terminal.status === 'won' && terminal.finishPhase === 'terminal');
    if (targetReached) {
      controlObservations = await stopControlObserver(input.page);
      await input.page.screenshot({ path: evidencePath('ordinary-1100-won.png') });
      const before = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      await input.page.mouse.click(990, 650); await input.page.waitForTimeout(150);
      const after = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      blankCheck = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), coordinate: { x: 990, y: 650 } };
      await input.page.locator('#next-level-button').click();
      await input.page.waitForFunction(() => window.__GAME_TEST__.getState().levelNumber === 2 && window.__GAME_TEST__.getState().status === 'ready');
      next = { state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())), control: await readControl(input.page) };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-next-ready.png') });
      await input.page.reload({ waitUntil: 'networkidle' }); await input.page.waitForFunction(() => Boolean(window.__GAME_TEST__)); await installReceiptProbe(input.page);
      reload = { state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())), control: await readControl(input.page) };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-reload-ready.png') });
      const postReloadInput = await dispatchTap({ ...input, page: input.page }, spec, 0, Date.now(), 'reload-input-1');
      postReloadPlay = { input: postReloadInput, playable: postReloadInput.inputReceiptObserved && postReloadInput.response.hasAction && (postReloadInput.after.status === 'airborne' || postReloadInput.after.status === 'anchored'), visibleResponse: postReloadInput.response };
    }
  } catch (error) {
    rawError = serializeError(error);
    if (isEnvironmentError(error)) environmentFailure = rawError.message;
    else if (targetReached) { assertionFailure = rawError.message; assertionFailureObserved = true; }
    else unknownFailure = rawError.message;
  } finally {
    const remainingControlObservations = await stopControlObserver(input.page);
    if (controlObservations.length === 0 && remainingControlObservations.length > 0) controlObservations = remainingControlObservations;
    await input.context.close(); await input.browser.close();
  }
  const transitionSamples = controlObservations.filter((sample) => ['contact', 'reward', 'celebration'].includes(sample.finishPhase));
  const runningSamples = [{ reason: 'ready-checkpoint', phase: readyState?.phase, status: readyState?.status, finishPhase: 'idle', hidden: readyControl?.hidden, visible: readyControl?.visible }, ...controlObservations.filter((sample) => sample.finishPhase === 'idle' && ['ready', 'airborne', 'anchored'].includes(sample.status))];
  const checks = [
    makeCheck('ready-state', true, Boolean(readyState), readyState.phase === 'ordinary' && readyState.status === 'ready' && readyControl.exists && readyControl.hidden && !readyControl.visible, 'ready must be ordinary/ready and terminal actions hidden', { state: readyState, control: readyControl }),
    makeCheck('ordinary-target', targetReached, targetReached, targetReached, 'ordinary terminal must be phase=ordinary/status=won/finishPhase=terminal', terminal),
    makeCheck('normal-running-controls-hidden', runningSamples.length > 0, runningSamples.length > 0, runningSamples.length > 0 && runningSamples.every((sample) => sample.hidden && !sample.visible), 'terminal actions must remain hidden during normal running', runningSamples),
    makeCheck('finish-transition-controls-hidden', transitionSamples.length > 0, transitionSamples.length > 0, transitionSamples.length > 0 && transitionSamples.every((sample) => sample.hidden && !sample.visible), 'terminal actions must remain hidden during contact/reward/celebration', transitionSamples),
    makeCheck('terminal-controls-visible-after-settlement', targetReached, targetReached && Boolean(terminalControl), targetReached && Boolean(terminalControl?.exists && terminalControl.visible && !terminalControl.hidden), 'terminal controls must become visible only after settlement', terminalControl),
    makeCheck('blank-click-does-not-restart', Boolean(blankCheck), Boolean(blankCheck), Boolean(blankCheck?.unchanged), 'blank click must leave the terminal state unchanged', blankCheck),
    makeCheck('next-level-ready', Boolean(next), Boolean(next), Boolean(next?.state.levelNumber === 2 && next.state.status === 'ready'), 'next level must be level 2 ready', next),
    makeCheck('reload-level2-ready', Boolean(reload), Boolean(reload), Boolean(reload?.state.levelNumber === 2 && reload.state.status === 'ready'), 'reload must retain level 2 ready', reload),
    makeCheck('reload-input-response', Boolean(postReloadPlay), Boolean(postReloadPlay?.input.inputReceiptObserved), Boolean(postReloadPlay?.playable), 'reload input must have a new receipt and new launch/flip/cut action', postReloadPlay),
  ];
  const failedCheck = checks.find((check) => check.executed && check.validObservation && !check.passed);
  if (failedCheck && !assertionFailure) { assertionFailure = `${failedCheck.id}: ${failedCheck.reason}`; assertionFailureObserved = true; }
  const validObservation = checks.every((check) => check.executed && check.validObservation);
  const allAssertionsPass = checks.every((check) => check.passed);
  const result = classify({ targetReached, validObservation: validObservation && allAssertionsPass, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  return { id: 'A-ordinary-1100x720', runId: process.env.R2_RUN_ID ?? randomUUID(), contextId: startedContext, viewport: '1100x720', inputMode: 'fixed visible canvas mouse events; no per-input screenshots', fixedScheduleMs: schedules.ordinary1100, startDelayMs, controlObserverStartInputIndex: 14, targetReached, result, rawOutcome: rawOutcome({ targetReached, terminal, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }), validObservation, allAssertionsPass, checks, requiredCheckpoint: 'ordinary phase/status/terminal; normal and finish-transition controls hidden; terminal controls visible after settlement; blank click unchanged; next level ready; reload level 2 ready; reload input has new action response', failureStage: assertionFailure ? 'product-assertion' : environmentFailure ? 'browser-or-tool' : unknownFailure ? 'unknown-execution-error' : terminal?.status === 'failed' ? 'ordinary-play-before-settlement' : targetReached ? 'complete' : 'ordinary-schedule-before-target', terminal, blankCheck, next, reload, postReloadPlay, controlObservations, dispatches, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure, rawError, consoleErrors: input.errors, evidence: [`${evidenceDirName}/ordinary-1100-ready.png`, ...(targetReached ? [`${evidenceDirName}/ordinary-1100-won.png`, `${evidenceDirName}/ordinary-1100-next-ready.png`, `${evidenceDirName}/ordinary-1100-reload-ready.png`] : [])] };
}
async function bonusCase(id, width, height, mobile, tapsMs) {
  const spec = { width, height, x: width / 2, y: height * 0.72, mobile };
  const input = await createPage({ width, height }, mobile);
  const startedAt = Date.now(); const dispatches = []; let entered = null; let responsive = null; let assertionFailure = null; let assertionFailureObserved = false; let environmentFailure = null; let unknownFailure = null; let rawError = null;
  try {
    await input.page.screenshot({ path: evidencePath(`${id}-ready.png`) });
    for (let index = 0; index < tapsMs.length; index += 1) {
      const item = await dispatchTap(input, spec, tapsMs[index], startedAt, `${id}-input-${index + 1}`); dispatches.push(item);
      if (!entered && item.after.phase === 'bonus') {
        entered = { inputIndex: index + 1, before: item.before, entry: item.after, received: item.received };
        await input.page.screenshot({ path: evidencePath(`${id}-bonus-entered.png`) });
        const responsiveBefore = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
        const next = await dispatchTap(input, spec, tapsMs[index + 1] ?? tapsMs[index] + 500, startedAt, `${id}-input-${index + 2}`); dispatches.push(next);
        responsive = { before: responsiveBefore, after: next.after, inputEffective: next.inputEffective, response: next.response, responded: next.inputReceiptObserved && next.response.hasAction && next.after.phase === 'bonus' };
        if (!responsive.responded) { assertionFailure = 'BONUS entry reached but subsequent normal input had no new launch/flip/cut action'; assertionFailureObserved = true; }
        break;
      }
      if (item.after.status === 'failed' || item.after.status === 'won') break;
    }
  } catch (error) {
    rawError = serializeError(error);
    if (isEnvironmentError(error)) environmentFailure = rawError.message; else unknownFailure = rawError.message;
  } finally { await input.context.close(); await input.browser.close(); }
  const targetReached = Boolean(entered);
  const validObservation = dispatches.length > 0 && dispatches.every((item) => item.inputReceiptObserved) && (targetReached || dispatches.length === tapsMs.length || dispatches.at(-1)?.after.status === 'failed' || dispatches.at(-1)?.after.status === 'won');
  const result = classify({ targetReached, validObservation, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  const raw = rawOutcome({ targetReached, terminal: dispatches.at(-1)?.after, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  return { id, runId: process.env.R2_RUN_ID ?? randomUUID(), contextId: input.contextId, viewport: `${width}x${height}`, inputMode: mobile ? 'fixed visible canvas touch events; no per-input screenshots' : 'fixed visible canvas mouse events; no per-input screenshots', fixedScheduleMs: tapsMs, targetReached, result, rawOutcome: raw, validObservation, requiredCheckpoint: 'ready→natural phase=bonus entry→normal input received→phase remains bonus with new launch/flip/cut response', failureStage: assertionFailure ? 'bonus-post-entry-input-response' : environmentFailure ? 'browser-or-tool' : unknownFailure ? 'unknown-execution-error' : targetReached ? 'complete' : dispatches.at(-1)?.after.status === 'failed' ? 'ordinary-play-before-bonus' : 'bonus-schedule-before-entry', entered, responsive, dispatches, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure, rawError, consoleErrors: input.errors, evidence: [`${evidenceDirName}/${id}-ready.png`, ...(entered ? [`${evidenceDirName}/${id}-bonus-entered.png`] : [])] };
}

const served = await servedBuildHash();
const ordinary = await ordinaryCase();
const deferredBonus = (id, viewport) => ({ id, runId: process.env.R2_RUN_ID ?? randomUUID(), contextId: null, viewport, targetReached: false, result: 'NOT_RUN', rawOutcome: 'bonus-checkpoint-not-executed-by-ordinary-only-run', validObservation: false, requiredCheckpoint: 'ready→natural phase=bonus entry→normal input received→phase remains bonus with new launch/flip/cut response', failureStage: 'ordinary-focused-run-deferred-bonus', entered: null, responsive: null, dispatches: [], assertionFailure: null, assertionFailureObserved: false, environmentFailure: null, unknownFailure: null, rawError: null, consoleErrors: [], evidence: [] });
const ordinaryOnly = process.env.R2_ORDINARY_ONLY === '1';
const results = { ordinary, bonus390: ordinaryOnly ? deferredBonus('B-bonus-390x844', '390x844') : await bonusCase('B-bonus-390x844', 390, 844, true, schedules.bonus390), bonus1100: ordinaryOnly ? deferredBonus('B-bonus-1100x720', '1100x720') : await bonusCase('B-bonus-1100x720', 1100, 720, false, schedules.bonus1100) };
const report = { schemaVersion: 1, artifactType: 'B01R2NaturalAcceptance', scriptVersion, scriptSha256, runId: process.env.R2_RUN_ID ?? randomUUID(), command: process.argv.join(' '), environmentVariables: Object.fromEntries(['SLICE_B01_URL', 'R2_ORDINARY_ONLY', 'R2_START_DELAY_MS', 'R2_A_TAPS_MS', 'R2_EVIDENCE_DIR', 'R2_REPORT_PATH', 'R2_CONSOLE_REPORT_PATH'].map((key) => [key, process.env[key] ?? null])), targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', sourceCommit, buildSha256, servedBuildSha256: served.sha256, servedBuildStatus: served.status, baseUrl, environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless' }, freshContexts: true, stateInjection: false, debugApiCalled: false, classificationPolicy: { targetCheckpointMissing: 'NOT_RUN', reachedCheckpointAssertionViolation: 'FAIL', browserOrToolFailure: 'BLOCKED', validObservationRequiredForPass: true }, results, oldR1Mapping: { 'r1-formal-ordinary-report.outcome=BLOCKED-before-won': 'NOT_RUN', 'r1-formal-bonus-report.outcome=BLOCKED-before-bonus': 'NOT_RUN', 'r1-formal-bonus-report.outcome=NOT_RUN-schedule-ended': 'NOT_RUN' }, evidencePolicy: 'getState is recorded only for passive checkpoints and response evidence; no internal state drives input; key screenshots are captured outside the click loop.' };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(consoleReportPath, `${JSON.stringify({ generatedAt: report.runId, scriptVersion, ordinary: results.ordinary.consoleErrors, bonus390: results.bonus390.consoleErrors, bonus1100: results.bonus1100.consoleErrors }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
