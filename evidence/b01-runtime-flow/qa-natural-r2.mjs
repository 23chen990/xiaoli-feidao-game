import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const scriptVersion = 'B01-R2-acceptance-v2.3';
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

const { ACTION_EVENT_TYPES, newEvents, actionEvents, classify, rawOutcome, makeCheck, responseEvidence, buildOrdinaryChecks, summarizeOrdinary } = await import('./r2-acceptance-checks-v23.mjs');
function brief(state) { return { phase: state.phase, status: state.status, failReason: state.failReason, finishPhase: state.finishPhase, finishGateId: state.finishGateId, finishSelection: state.finishSelection, levelNumber: state.levelNumber, elapsed: state.elapsed, worldTime: state.worldTime, cuts: state.cuts, bonusConsumed: state.bonusConsumed, player: { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy, angle: state.player.angle, angularVelocity: state.player.angularVelocity }, events: state.events.slice(-8), eventCount: state.events.length }; }
function serializeError(error) { return { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack ?? null }; }
function isEnvironmentError(error) { return /network|browser|Target closed|timeout|connection|protocol|context/i.test(error?.message ?? String(error)); }
function selectNewReceipts(receipts, beforeLength) { return receipts.slice(beforeLength); }
if (process.env.R2_SCRIPT_SELF_CHECK === '1') {
  const fakeReceipts = [{ seq: 1 }, { seq: 2 }];
  const sample = (finishPhase, status = 'ready', coverage = 'transition', extra = {}) => ({ phase: 'ordinary', finishPhase, status, hidden: true, visible: false, coverage, epochMs: Date.now(), ...extra });
  const completeFixture = (overrides = {}) => ({
    readyState: { phase: 'ordinary', status: 'ready' },
    readyControl: { exists: true, hidden: true, visible: false },
    terminal: { phase: 'ordinary', status: 'won', finishPhase: 'terminal' },
    targetReached: true,
    terminalControl: { exists: true, hidden: false, visible: true },
    blankCheck: { unchanged: true },
    next: { state: { levelNumber: 2, status: 'ready' } },
    reload: { state: { levelNumber: 2, status: 'ready' } },
    postReloadPlay: { playable: true, receiptValid: true, handlerObservationComplete: true, expectedImmediateAction: true, actionOccurred: true, input: { inputReceiptObserved: true, response: { hasCausalAction: true } } },
    controlObservations: [
      sample('idle', 'airborne', 'normal-running'),
      sample('contact'), sample('reward'), sample('celebration'), sample('terminal', 'won', 'transition'),
    ],
    controlObserverWindow: { startedEpochMs: 1, endedEpochMs: Date.now() + 1, interrupted: false },
    dispatches: [{ received: [{ epochMs: 2 }] }],
    ...overrides,
  });
  const completeChecks = buildOrdinaryChecks(completeFixture());
  const invalidFixture = completeFixture({ controlObservations: [sample('idle', 'ready', 'ready'), sample('contact')] });
  const invalidObservation = summarizeOrdinary({ ...invalidFixture, checks: buildOrdinaryChecks(invalidFixture), targetReached: true });
  const productFixture = completeFixture();
  const productFailThenToolError = summarizeOrdinary({ ...productFixture, checks: buildOrdinaryChecks(productFixture), assertionFailure: 'blank changed', assertionFailureObserved: true, environmentFailure: 'later context close' });
  const cutOnlyResponse = responseEvidence({ before: { events: [], player: { x: 0, y: 0, vx: 0, vy: 0 } }, after: { events: [{ id: 1, type: 'cut' }], player: { x: 0, y: 0, vx: 0, vy: 0 } }, received: fakeReceipts, inputId: 'cut-only', requireCausal: true, causalEvidence: { after: { eventsAfterInput: [{ id: 1, type: 'cut' }] } } });
  const mutationViolation = completeFixture({ controlObservations: [sample('idle', 'airborne', 'transition', { hidden: false, visible: true }) , sample('contact'), sample('reward'), sample('celebration')] });
  const mutationViolationSummary = summarizeOrdinary({ ...mutationViolation, checks: buildOrdinaryChecks(mutationViolation), targetReached: true });
  const noActionFixture = completeFixture({ postReloadPlay: { playable: false, receiptValid: true, handlerObservationComplete: true, expectedImmediateAction: true, actionOccurred: false, input: { inputReceiptObserved: true, response: { hasCausalAction: false } } } });
  const noActionSummary = summarizeOrdinary({ ...noActionFixture, checks: buildOrdinaryChecks(noActionFixture), targetReached: true });
  const missingObservationFixture = completeFixture({ postReloadPlay: { playable: false, receiptValid: false, handlerObservationComplete: false, expectedImmediateAction: true, actionOccurred: false, input: { inputReceiptObserved: false, response: null } } });
  const missingObservationSummary = summarizeOrdinary({ ...missingObservationFixture, checks: buildOrdinaryChecks(missingObservationFixture), targetReached: true });
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
    [completeChecks.every((check) => check.executed && check.validObservation && check.passed), true],
    [buildOrdinaryChecks(completeFixture({ controlObservations: [sample('idle', 'ready', 'ready'), sample('contact'), sample('reward'), sample('celebration')] })).find((check) => check.id === 'normal-running-controls-hidden').validObservation, false],
    [buildOrdinaryChecks(completeFixture({ controlObservations: [sample('idle', 'airborne', 'normal-running'), sample('contact')] })).find((check) => check.id === 'reward-controls-hidden').executed, false],
    [cutOnlyResponse.automaticCutOnly, true],
    [cutOnlyResponse.hasCausalAction, false],
    [invalidObservation.result, 'NOT_RUN'],
    [invalidObservation.rawOutcome, 'target-checkpoint-observation-invalid'],
    [productFailThenToolError.result, 'FAIL'],
    [productFailThenToolError.rawOutcome, 'target-checkpoint-assertion-failure'],
    [mutationViolationSummary.result, 'FAIL'],
    [mutationViolationSummary.checks.find((check) => check.id === 'normal-running-controls-hidden').passed, false],
    [noActionSummary.result, 'FAIL'],
    [missingObservationSummary.result, 'NOT_RUN'],
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
  return page.evaluate(() => {
    const element = document.querySelector('#terminal-actions');
    const terminalText = document.querySelector('#terminal-text');
    const samples = [];
    let lastDomKey = null;
    const snapshot = (reason) => {
      const domKey = `${element?.hidden ?? null}|${terminalText?.hidden ?? null}|${element?.getAttribute('class') ?? ''}|${element?.getAttribute('style') ?? ''}|${terminalText?.getAttribute('class') ?? ''}|${terminalText?.getAttribute('style') ?? ''}|${terminalText?.textContent ?? ''}`;
      if (!['initial', 'normal-running-start'].includes(reason) && domKey === lastDomKey) return;
      lastDomKey = domKey;
      const state = window.__GAME_TEST__.getState();
      const style = element ? getComputedStyle(element) : null;
      const rect = element?.getBoundingClientRect();
      samples.push({ reason, atMs: performance.now(), epochMs: performance.timeOrigin + performance.now(), coverage: reason === 'normal-running-start' ? 'normal-running' : reason === 'initial' ? 'ready' : 'transition', phase: state.phase, status: state.status, finishPhase: state.finishPhase, worldTime: state.worldTime, hidden: element?.hidden ?? null, visible: Boolean(element && !element.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity ?? 1) > 0 && rect?.width > 0 && rect?.height > 0), display: style?.display ?? null, visibility: style?.visibility ?? null, opacity: style?.opacity ?? null });
    };
    const observer = new MutationObserver(() => snapshot('mutation'));
    if (element) observer.observe(element, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    if (terminalText) observer.observe(terminalText, { attributes: true, attributeFilter: ['hidden', 'style', 'class'], childList: true, characterData: true, subtree: true });
    const timer = null;
    snapshot('initial');
    window.__R2_CONTROL_OBS__ = { samples, observer, timer, snapshot, startedAtMs: performance.now(), startedEpochMs: performance.timeOrigin + performance.now() };
    return { startedAtMs: window.__R2_CONTROL_OBS__.startedAtMs, startedEpochMs: window.__R2_CONTROL_OBS__.startedEpochMs };
  });
}
async function stopControlObserver(page) {
  return page.evaluate(() => {
    const observer = window.__R2_CONTROL_OBS__;
    if (!observer) return { samples: [], endedAtMs: null, endedEpochMs: null, interrupted: true };
    if (observer.timer) clearInterval(observer.timer);
    observer.observer.disconnect();
    return { samples: observer.samples, endedAtMs: performance.now(), endedEpochMs: performance.timeOrigin + performance.now(), interrupted: false };
  }).catch(() => ({ samples: [], endedAtMs: null, endedEpochMs: null, interrupted: true }));
}
async function captureControlSample(page, reason) {
  return page.evaluate((sampleReason) => {
    const observer = window.__R2_CONTROL_OBS__;
    if (!observer) return null;
    observer.snapshot(sampleReason);
    return observer.samples.at(-1) ?? null;
  }, reason).catch(() => null);
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
async function documentResponseEvidence(response, navigation) {
  if (!response) return { available: false, reason: 'browser navigation returned no main-document response' };
  try {
    const body = await response.body();
    return { available: true, url: response.url(), status: response.status(), sha256: createHash('sha256').update(body).digest('hex'), navigation };
  } catch (error) {
    return { available: false, url: response.url(), status: response.status(), navigation, error: serializeError(error) };
  }
}
async function installCausalProbe(page) {
  await page.evaluate(() => {
    window.__R2_CAUSAL_ARMED__ = null;
    window.__R2_CAUSAL_RESULTS__ = [];
    const summarize = () => {
      const state = window.__GAME_TEST__.getState();
      return { phase: state.phase, status: state.status, finishPhase: state.finishPhase, worldTime: state.worldTime, player: { ...state.player }, events: state.events.slice(-8), eventCount: state.events.length };
    };
    window.addEventListener('pointerdown', () => {
      if (!window.__R2_CAUSAL_ARMED__) return;
      window.__R2_CAUSAL_PENDING__ = { inputId: window.__R2_CAUSAL_ARMED__, receiptEpochMs: performance.timeOrigin + performance.now(), before: summarize() };
    }, true);
    window.addEventListener('pointerdown', () => {
      const pending = window.__R2_CAUSAL_PENDING__;
      if (!pending) return;
      window.__R2_CAUSAL_RESULTS__.push({ ...pending, handlerEpochMs: performance.timeOrigin + performance.now(), after: summarize() });
      window.__R2_CAUSAL_PENDING__ = null;
    });
  });
}
async function createPage(viewport, mobile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const contextId = randomUUID();
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  const documentResponses = [];
  const navigationResponse = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  documentResponses.push(await documentResponseEvidence(navigationResponse, 'initial-navigation'));
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  await installReceiptProbe(page);
  await installCausalProbe(page);
  return { browser, context, contextId, page, cdp: await context.newCDPSession(page), errors, documentResponses };
}
async function dispatchTap(input, spec, targetMs, startedAt, inputId, options = {}) {
  const waitMs = targetMs - (Date.now() - startedAt);
  if (waitMs > 0) await input.page.waitForTimeout(waitMs);
  const before = await input.page.evaluate(() => window.__GAME_TEST__.getState());
  const receiptBeforeLength = await input.page.evaluate(() => window.__R2_RECEIVED__.length);
  const sendStartMs = Date.now() - startedAt;
  const sendStartEpochMs = Date.now();
  if (options.requireCausal) await input.page.evaluate((id) => { window.__R2_CAUSAL_ARMED__ = id; }, inputId);
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
  const inputReceiptObserved = received.length === 2 && received.every((event) => event.inputId === inputId) && received.map((event) => event.type).sort().join(',') === 'pointerdown,pointerup';
  const causalResults = options.requireCausal ? await input.page.evaluate(() => window.__R2_CAUSAL_RESULTS__) : [];
  const causalRaw = options.requireCausal ? causalResults.findLast((item) => item.inputId === inputId) ?? causalResults.at(-1) ?? null : null;
  if (options.requireCausal) await input.page.evaluate(() => { window.__R2_CAUSAL_ARMED__ = null; });
  const causalEvidence = causalRaw ? { inputId, receiptEpochMs: causalRaw.receiptEpochMs, handlerEpochMs: causalRaw.handlerEpochMs, before: causalRaw.before, after: { ...causalRaw.after, eventsAfterInput: newEvents(causalRaw.before, causalRaw.after) } } : null;
  const response = responseEvidence({ before, after, received, causalEvidence, requireCausal: Boolean(options.requireCausal), inputId });
  return { inputId, plannedMs: targetMs, sendStartMs, sendEndMs: Date.now() - startedAt, sendStartEpochMs, received, receiptBeforeLength, receiptAfterLength: receivedAll.length, inputReceiptObserved, before: brief(before), after: brief(after), eventsAfterInput: response.newEvents, response, inputEffective: inputReceiptObserved && response.hasAction, causalRequired: Boolean(options.requireCausal) };
}

async function ordinaryCase() {
  const spec = { width: 1100, height: 720, x: 550, y: 518.4, mobile: false };
  const input = await createPage({ width: spec.width, height: spec.height }, false);
  const dispatches = [];
  const startDelayMs = Number(process.env.R2_START_DELAY_MS ?? 0);
  let controlObservations = [];
  let controlObserverStarted = false;
  let controlObserverWindow = { startedAtMs: null, startedEpochMs: null, endedAtMs: null, endedEpochMs: null, interrupted: true };
  let readyState = null; let readyControl = null; let terminalControl = null;
  let targetReached = false; let assertionFailure = null; let assertionFailureObserved = false; let environmentFailure = null; let unknownFailure = null; let rawError = null; let terminal = null; let blankCheck = null; let next = null; let reload = null; let postReloadPlay = null;
  const startedContext = input.contextId;
  try {
    readyState = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
    readyControl = await readControl(input.page);
    await input.page.screenshot({ path: evidencePath('ordinary-1100-ready.png') });
    controlObserverStarted = true;
    controlObserverWindow = { ...controlObserverWindow, ...(await installControlObserver(input.page)), interrupted: false };
    if (startDelayMs > 0) await input.page.waitForTimeout(startDelayMs);
    const startedAt = Date.now();
    for (let index = 0; index < schedules.ordinary1100.length; index += 1) {
      const item = await dispatchTap(input, spec, schedules.ordinary1100[index], startedAt, `ordinary-input-${index + 1}`);
      dispatches.push(item);
      if (index === 0) await captureControlSample(input.page, 'normal-running-start');
      if (item.after.status === 'failed' || item.after.status === 'won') {
        terminal = item.after;
        await input.page.waitForFunction(() => !document.querySelector('#terminal-actions')?.hasAttribute('hidden'), null, { timeout: 1500 }).catch(() => {});
        terminalControl = await readControl(input.page);
        break;
      }
    }
    targetReached = Boolean(terminal?.phase === 'ordinary' && terminal.status === 'won' && terminal.finishPhase === 'terminal');
    if (targetReached) {
      const stopped = await stopControlObserver(input.page);
      controlObservations = stopped.samples;
      controlObserverWindow = { ...controlObserverWindow, endedAtMs: stopped.endedAtMs, endedEpochMs: stopped.endedEpochMs, interrupted: stopped.interrupted };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-won.png') });
      const before = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      await input.page.mouse.click(990, 650); await input.page.waitForTimeout(150);
      const after = brief(await input.page.evaluate(() => window.__GAME_TEST__.getState()));
      blankCheck = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), coordinate: { x: 990, y: 650 } };
      await input.page.locator('#next-level-button').click();
      await input.page.waitForFunction(() => window.__GAME_TEST__.getState().levelNumber === 2 && window.__GAME_TEST__.getState().status === 'ready');
      next = { state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())), control: await readControl(input.page) };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-next-ready.png') });
      const reloadResponse = await input.page.reload({ waitUntil: 'networkidle' });
      input.documentResponses.push(await documentResponseEvidence(reloadResponse, 'level-2-reload'));
      await input.page.waitForFunction(() => Boolean(window.__GAME_TEST__)); await installReceiptProbe(input.page); await installCausalProbe(input.page);
      reload = { state: brief(await input.page.evaluate(() => window.__GAME_TEST__.getState())), control: await readControl(input.page) };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-reload-ready.png') });
      const postReloadInput = await dispatchTap({ ...input, page: input.page }, spec, 0, Date.now(), 'reload-input-1', { requireCausal: true });
      const handlerObservationComplete = Boolean(postReloadInput.inputReceiptObserved && postReloadInput.response?.causalEvidence?.inputId === postReloadInput.inputId && postReloadInput.response?.causalEvidence?.before && postReloadInput.response?.causalEvidence?.after);
      const expectedImmediateAction = reload.state.status === 'ready' && reload.state.phase === 'ordinary';
      const actionOccurred = Boolean(postReloadInput.response?.hasCausalAction);
      postReloadPlay = { input: postReloadInput, receiptValid: postReloadInput.inputReceiptObserved, handlerObservationComplete, expectedImmediateAction, actionOccurred, playerInputPathHit: postReloadInput.inputReceiptObserved && handlerObservationComplete, playable: actionOccurred && (postReloadInput.after.status === 'airborne' || postReloadInput.after.status === 'anchored'), visibleResponse: postReloadInput.response };
      await input.page.screenshot({ path: evidencePath('ordinary-1100-reload-after-input.png') });
    }
  } catch (error) {
    rawError = serializeError(error);
    if (isEnvironmentError(error)) environmentFailure = rawError.message;
    else if (targetReached) { assertionFailure = rawError.message; assertionFailureObserved = true; }
    else unknownFailure = rawError.message;
  } finally {
    if (controlObserverStarted && controlObserverWindow.endedAtMs === null) {
      const remaining = await stopControlObserver(input.page);
      if (controlObservations.length === 0 && remaining.samples.length > 0) controlObservations = remaining.samples;
      controlObserverWindow = { ...controlObserverWindow, endedAtMs: remaining.endedAtMs, endedEpochMs: remaining.endedEpochMs, interrupted: remaining.interrupted };
    }
    await input.context.close(); await input.browser.close();
  }
  const summary = summarizeOrdinary({ checks: buildOrdinaryChecks({ readyState, readyControl, terminal, targetReached, terminalControl, blankCheck, next, reload, postReloadPlay, controlObservations, controlObserverWindow, dispatches }), targetReached, terminal, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  const { checks, validObservation, allAssertionsPass, result, rawOutcome: summaryRawOutcome } = summary;
  return { id: 'A-ordinary-1100x720', runId: process.env.R2_RUN_ID ?? randomUUID(), contextId: startedContext, viewport: '1100x720', inputMode: 'fixed visible canvas mouse events; no per-input screenshots; one post-response screenshot', fixedScheduleMs: schedules.ordinary1100, startDelayMs, controlObserverStartInputIndex: 0, controlObserverWindow, targetReached, result, rawOutcome: summaryRawOutcome, validObservation, allAssertionsPass, checks, requiredCheckpoint: 'ordinary phase/status/terminal; normal coverage from first input; contact/reward/celebration controls hidden; terminal controls visible after settlement; blank click unchanged; next level ready; reload level 2 ready; reload input has causal action response', failureStage: summary.assertionFailure ? 'product-assertion' : environmentFailure ? 'browser-or-tool' : unknownFailure ? 'unknown-execution-error' : terminal?.status === 'failed' ? 'ordinary-play-before-settlement' : targetReached ? 'complete' : 'ordinary-schedule-before-target', terminal, blankCheck, next, reload, postReloadPlay, documentResponses: input.documentResponses, controlObservations, dispatches, assertionFailure: summary.assertionFailure, assertionFailureObserved: summary.assertionFailureObserved, environmentFailure, unknownFailure, rawError, consoleErrors: input.errors, evidence: [`${evidenceDirName}/ordinary-1100-ready.png`, ...(targetReached ? [`${evidenceDirName}/ordinary-1100-won.png`, `${evidenceDirName}/ordinary-1100-next-ready.png`, `${evidenceDirName}/ordinary-1100-reload-ready.png`, `${evidenceDirName}/ordinary-1100-reload-after-input.png`] : [])] };
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
        const next = await dispatchTap(input, spec, tapsMs[index + 1] ?? tapsMs[index] + 500, startedAt, `${id}-input-${index + 2}`, { requireCausal: true }); dispatches.push(next);
        responsive = { before: responsiveBefore, after: next.after, inputEffective: next.inputEffective, response: next.response, responded: next.inputReceiptObserved && next.response.hasCausalAction && next.after.phase === 'bonus' };
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
  const allAssertionsPass = !assertionFailure && Boolean(!targetReached || responsive?.responded);
  const raw = rawOutcome({ targetReached, validObservation, allAssertionsPass, terminal: dispatches.at(-1)?.after, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  return { id, runId: process.env.R2_RUN_ID ?? randomUUID(), contextId: input.contextId, viewport: `${width}x${height}`, inputMode: mobile ? 'fixed visible canvas touch events; no per-input screenshots' : 'fixed visible canvas mouse events; no per-input screenshots', fixedScheduleMs: tapsMs, targetReached, result, rawOutcome: raw, validObservation, allAssertionsPass, requiredCheckpoint: 'ready→natural phase=bonus entry→normal input received→phase remains bonus with new causal launch/flip response', failureStage: assertionFailure ? 'bonus-post-entry-input-response' : environmentFailure ? 'browser-or-tool' : unknownFailure ? 'unknown-execution-error' : targetReached ? 'complete' : dispatches.at(-1)?.after.status === 'failed' ? 'ordinary-play-before-bonus' : 'bonus-schedule-before-entry', entered, responsive, dispatches, documentResponses: input.documentResponses, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure, rawError, consoleErrors: input.errors, evidence: [`${evidenceDirName}/${id}-ready.png`, ...(entered ? [`${evidenceDirName}/${id}-bonus-entered.png`] : [])] };
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
