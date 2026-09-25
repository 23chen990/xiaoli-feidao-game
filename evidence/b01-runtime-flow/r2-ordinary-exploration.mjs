import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';
const coordinate = { x: 550, y: 518.4 };
const portraitTrace = [194.138125, 1586.86375, 2327.048167, 4602.164, 5309.087709, 6275.0135, 6948.908875, 7607.319334, 8567.920042, 9607.281042];
const candidates = [
  { number: 1, id: 'portrait-trace-direct', tapsMs: portraitTrace, adjustment: 'Reuse the existing independent portrait trace on desktop at the same visible canvas coordinate; no screenshot during input.' },
  { number: 2, id: 'portrait-trace-plus-150ms', tapsMs: portraitTrace.map((t) => t + 150), adjustment: 'The direct trace may begin before desktop readiness settles; add a fixed 150ms offset while retaining all inter-tap intervals.' },
  { number: 3, id: 'portrait-trace-plus-300ms', tapsMs: portraitTrace.map((t) => t + 300), adjustment: 'The prior offset still did not establish the runway branch; add another fixed 150ms without using state to choose taps.' },
  { number: 4, id: 'broad-early-airborne-window', tapsMs: [500, 1450, 2300, 3200, 4350, 5250, 6250, 7100, 8050, 9000, 10150, 11300], adjustment: 'Use a slower fixed rhythm around visible airborne travel to test whether the desktop camera requires a wider timing window.' },
];

function brief(s) {
  return {
    phase: s.phase, status: s.status, failReason: s.failReason, finishPhase: s.finishPhase,
    finishGateId: s.finishGateId, finishSelection: s.finishSelection,
    elapsed: s.elapsed, worldTime: s.worldTime, cuts: s.cuts, routeChanges: s.routeChanges,
    anchorId: s.anchorId, player: { ...s.player }, eventCount: s.events.length,
    events: s.events.slice(-8),
  };
}

async function runCandidate(spec) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  await page.evaluate(() => {
    const diagnostics = { received: [] };
    window.__R2_EXPLORE__ = diagnostics;
    const receive = (event) => diagnostics.received.push({ kind: event.type, timeMs: performance.now(), clientX: event.clientX ?? null, clientY: event.clientY ?? null });
    window.addEventListener('pointerdown', receive, true);
    window.addEventListener('pointerup', receive, true);
  });
  const cdp = await context.newCDPSession(page);
  const startedAt = performance.now();
  const ready = await page.evaluate(() => window.__GAME_TEST__.getState());
  const dispatches = [];
  for (let i = 0; i < spec.tapsMs.length; i += 1) {
    const waitMs = spec.tapsMs[i] - (performance.now() - startedAt);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const before = await page.evaluate(() => window.__GAME_TEST__.getState());
    const sendStartMs = performance.now() - startedAt;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coordinate.x, y: coordinate.y, button: 'left', clickCount: 1 });
    const pressSentMs = performance.now() - startedAt;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coordinate.x, y: coordinate.y, button: 'left', clickCount: 1 });
    const releaseSentMs = performance.now() - startedAt;
    const after = await page.evaluate(() => window.__GAME_TEST__.getState());
    const received = await page.evaluate(() => window.__R2_EXPLORE__.received.slice(-2));
    dispatches.push({ index: i + 1, targetMs: spec.tapsMs[i], sendStartMs, pressSentMs, releaseSentMs, received, before: brief(before), after: brief(after), inputEffective: after.events.length > before.events.length || after.status !== before.status || after.player.vx !== before.player.vx || after.player.vy !== before.player.vy });
    if (after.status === 'won' || after.status === 'failed') break;
  }
  await page.waitForTimeout(1200);
  const final = await page.evaluate(() => window.__GAME_TEST__.getState());
  const path = `r2-explore-${String(spec.number).padStart(2, '0')}-${spec.id}`;
  await mkdir(new URL('./r2-exploration/', root), { recursive: true });
  await page.screenshot({ path: new URL(`./r2-exploration/${path}-final.png`, root).pathname });
  const result = { ...spec, viewport: '1100x720', inputMode: 'fixed CDP mouse at visible canvas coordinate; no screenshot while input schedule ran', freshContext: true, ready: brief(ready), dispatches, final: brief(final), terminalReached: final.status === 'won' || final.status === 'failed', outcome: final.status === 'won' && final.phase === 'ordinary' ? 'PASS' : final.status === 'failed' ? 'NOT_RUN' : 'NOT_RUN', errors, evidence: [`r2-exploration/${path}-final.png`] };
  await context.close();
  await browser.close();
  return result;
}

const attempts = [];
for (const spec of candidates) attempts.push(await runCandidate(spec));
const report = {
  schemaVersion: 1,
  artifactType: 'B01R2OrdinaryBoundedExploration',
  generatedAt: new Date().toISOString(),
  targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', sourceCommit, buildSha256,
  environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless', baseUrl },
  diagnosisOnly: true, stateInjection: false, debugApiCalled: false,
  maxCompleteExplorations: 6, priorComparisonAttempts: 2, newAttempts: attempts.length, totalDiagnosticAttempts: 6,
  target: 'ordinary-1100x720', coordinate, attempts,
  conclusion: attempts.some((attempt) => attempt.outcome === 'PASS')
    ? 'A visible fixed strategy reached ordinary won in diagnosis; parent must rerun formal natural acceptance serially in fresh contexts.'
    : 'No visible fixed strategy reached ordinary won in four bounded additions; ordinary failure/trajectory remains timing-sensitive and no product root cause is assigned.',
};
await writeFile(new URL('./r2-ordinary-exploration.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ conclusion: report.conclusion, attempts: attempts.map((attempt) => ({ number: attempt.number, id: attempt.id, sendTimes: attempt.dispatches.map((item) => Math.round(item.sendStartMs)), status: attempt.final.status, phase: attempt.final.phase, failReason: attempt.final.failReason, x: attempt.final.player.x, y: attempt.final.player.y, events: attempt.final.eventCount })) }, null, 2));
