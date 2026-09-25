import { chromium } from '../../game/prototype-a/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('.', import.meta.url);
const baseUrl = process.env.SLICE_B01_URL ?? 'http://127.0.0.1:4175/';
await mkdir(new URL('./r1-ordinary/', root), { recursive: true });
await mkdir(new URL('./screenshots/', root), { recursive: true });
const spec = { id: 'ordinary-1100x720', width: 1100, height: 720, x: 550, y: 518.4,
  tapsMs: [800, 1859, 2032, 3068, 4140, 5118, 6155, 7157, 8215, 9199, 9352, 9774, 11152, 11382, 13775, 14833, 14991, 15145, 15389, 16391, 16722, 17872, 19618, 20644, 21614, 22592, 23645, 24216] };
function brief(s) { return { phase: s.phase, status: s.status, failReason: s.failReason, finishPhase: s.finishPhase, finishGateId: s.finishGateId, finishSelection: s.finishSelection, levelNumber: s.levelNumber, cuts: s.cuts, events: s.events.length, player: { x: s.player.x, y: s.player.y } }; }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
const page = await context.newPage(); const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
await page.goto(baseUrl, { waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
const cdp = await context.newCDPSession(page); const startedAt = Date.now();
const checkpoints = [{ atMs: 0, stage: 'ready', state: brief(await page.evaluate(() => window.__GAME_TEST__.getState())) }];
await page.screenshot({ path: new URL('./screenshots/ordinary-1100x720-r1-ready.png', root).pathname });
for (let i = 0; i < spec.tapsMs.length; i += 1) {
  const wait = spec.tapsMs[i] - (Date.now() - startedAt); if (wait > 0) await page.waitForTimeout(wait);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spec.x, y: spec.y, button: 'left', clickCount: 1 });
  await page.screenshot({ path: new URL(`./r1-ordinary/attempt-01-step-${String(i + 1).padStart(2, '0')}.png`, root).pathname });
  const state = await page.evaluate(() => window.__GAME_TEST__.getState());
  if (state.status === 'won' || state.status === 'failed' || state.finishPhase !== 'idle') checkpoints.push({ atMs: Date.now() - startedAt, stage: `afterTap-${i + 1}`, state: brief(state), terminalActionsHidden: await page.locator('#terminal-actions').getAttribute('hidden').then((value) => value !== null) });
}
await page.waitForTimeout(3000);
await page.screenshot({ path: new URL('./screenshots/ordinary-1100x720-r1-terminal.png', root).pathname });
const terminal = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
const terminalVisible = await page.locator('#terminal-actions').isVisible().catch(() => false);
const beforeTerminalHidden = checkpoints.filter((item) => item.state.status !== 'failed' && item.state.status !== 'won' && item.state.finishPhase !== 'terminal').every((item) => item.terminalActionsHidden !== false);
let blankCheck = null; let next = null; let reload = null; let assertionFailure = null;
if (terminal.status === 'won' && terminal.phase === 'ordinary' && terminal.finishPhase === 'terminal' && terminalVisible) {
  const before = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
  await page.mouse.click(990, 650); await page.waitForTimeout(150);
  const after = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
  blankCheck = { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  try {
    if (!blankCheck.unchanged) throw new Error('blank tap changed terminal state');
    await page.locator('#next-level-button').click(); await page.waitForFunction(() => window.__GAME_TEST__.getState().levelNumber === 2);
    next = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
    await page.screenshot({ path: new URL('./screenshots/ordinary-1100x720-r1-next.png', root).pathname });
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
    reload = brief(await page.evaluate(() => window.__GAME_TEST__.getState()));
    await page.screenshot({ path: new URL('./screenshots/ordinary-1100x720-r1-reload.png', root).pathname });
  } catch (error) { assertionFailure = error instanceof Error ? error.message : String(error); }
}
const outcome = terminal.status === 'won' && terminal.phase === 'ordinary' && terminal.finishPhase === 'terminal' && terminalVisible && beforeTerminalHidden && blankCheck?.unchanged === true && next?.levelNumber === 2 && next.status === 'ready' && reload?.levelNumber === 2 && reload.status === 'ready' ? 'PASS' : (terminal.status === 'failed' ? 'BLOCKED' : 'NOT_RUN');
const report = { schemaVersion: 1, artifactType: 'B01R1OrdinaryFixedInput', generatedAt: new Date().toISOString(), targetGame: 'Slice Master / 小李飞刀', workspace: 'game/prototype-a', sourceCommit: 'de6f11d2231398f6c655abbddd40c548d1524126', buildSha256: '8082ee92dbcc41e957f4d572457ea1fe69be429582dd001ece8623bde781275d', environment: { node: process.version, platform: process.platform, browser: 'Playwright Chromium headless' }, baseUrl, freshContext: true, stateInjection: false, debugApiCalled: false, viewport: '1100x720', inputMode: 'CDP mouse events at fixed visible canvas coordinate', fixedScheduleMs: spec.tapsMs, attempts: 1, outcome, failureStage: outcome === 'PASS' ? null : terminal.status === 'failed' ? 'before-ordinary-terminal' : 'ordinary-terminal-assertions', reason: outcome === 'PASS' ? 'all ordinary terminal and replay assertions passed' : terminal.status === 'failed' ? `ordinary run ended ${terminal.failReason ?? 'without reason'} before settlement` : 'ordinary won checkpoint was not reached', checkpoints, terminal, terminalVisible, beforeTerminalHidden, blankCheck, next, reload, assertionFailure, consoleErrors: errors, evidence: ['./screenshots/ordinary-1100x720-r1-ready.png', './screenshots/ordinary-1100x720-r1-terminal.png', 'r1-ordinary/attempt-01-step-01.png', 'r1-ordinary/attempt-01-step-08.png', ...(next ? ['./screenshots/ordinary-1100x720-r1-next.png', './screenshots/ordinary-1100x720-r1-reload.png'] : [])] };
await writeFile(new URL('./r1-ordinary-report.json', root), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2)); await context.close(); await browser.close();
