import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { writeFile } from 'node:fs/promises';

const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
const intervalMs = Number(process.env.R2_CANDIDATE_INTERVAL_MS ?? 1000);
const offsetMs = Number(process.env.R2_CANDIDATE_OFFSET_MS ?? 300);
const tapsMs = Array.from({ length: 30 }, (_, index) => offsetMs + index * intervalMs);
const spec = { width: 1100, height: 720, x: 550, y: 518.4 };
const sourceCommit = 'de6f11d2231398f6c655abbddd40c548d1524126';
const buildSha256 = '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d';

function brief(state) {
  return { seed: state.seed, levelNumber: state.levelNumber, phase: state.phase, status: state.status, failReason: state.failReason, finishPhase: state.finishPhase, finishGateId: state.finishGateId, finishSelection: state.finishSelection, worldTime: state.worldTime, cuts: state.cuts, player: { ...state.player }, eventCount: state.events.length, events: state.events.slice(-8) };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
await page.evaluate(() => {
  window.__R2_CANDIDATE_RECEIVED__ = [];
  const receive = (event) => window.__R2_CANDIDATE_RECEIVED__.push({ type: event.type, epochMs: performance.timeOrigin + performance.now(), clientX: event.clientX, clientY: event.clientY });
  window.addEventListener('pointerdown', receive, true);
  window.addEventListener('pointerup', receive, true);
});
await page.screenshot({ path: new URL('./r2-ordinary-candidate-ready.png', root).pathname });
const startedAt = Date.now();
const dispatches = [];
for (let index = 0; index < tapsMs.length; index += 1) {
  const plannedMs = tapsMs[index];
  const remaining = plannedMs - (Date.now() - startedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const before = await page.evaluate(() => window.__GAME_TEST__.getState());
  const receiptBefore = await page.evaluate(() => window.__R2_CANDIDATE_RECEIVED__.length);
  const sendEpochMs = Date.now();
  await page.mouse.click(spec.x, spec.y);
  const received = (await page.evaluate(() => window.__R2_CANDIDATE_RECEIVED__)).slice(receiptBefore);
  const after = await page.evaluate(() => window.__GAME_TEST__.getState());
  dispatches.push({ index: index + 1, plannedMs, sendEpochMs, received, before: brief(before), after: brief(after), inputReceiptObserved: received.filter((event) => event.type === 'pointerdown' || event.type === 'pointerup').length === 2 });
  if (after.status === 'failed' || after.status === 'won') break;
}
const final = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
const terminalVisible = await page.locator('#terminal-actions').isVisible().catch(() => false);
if (terminalVisible) await page.screenshot({ path: new URL('./r2-ordinary-candidate-terminal.png', root).pathname });
const report = { schemaVersion: 1, artifactType: 'B01R2OrdinaryCandidateNaturalTrace', generatedAt: new Date().toISOString(), targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', sourceCommit, buildSha256, baseUrl, viewport: '1100x720', inputPlan: { intervalMs, offsetMs, tapsMs }, naturalVisibleInput: true, freshContext: true, stateInjection: false, debugApiCalled: false, terminalVisible, dispatches, final, outcome: final.phase === 'ordinary' && final.status === 'won' && final.finishPhase === 'terminal' ? 'DIAGNOSTIC_NATURAL_CANDIDATE_WON' : 'NOT_RUN', errors, evidence: ['r2-ordinary-candidate-ready.png', ...(terminalVisible ? ['r2-ordinary-candidate-terminal.png'] : [])] };
await writeFile(new URL('./r2-ordinary-candidate.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
await context.close();
await browser.close();
