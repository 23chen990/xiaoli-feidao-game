import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const packet = JSON.parse(readFileSync(new URL('../../qa-task.json', import.meta.url), 'utf8'));
const arg = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => i % 2 ? a : [...a, [v.replace(/^--/u, ''), all[i + 1]]], []));
const viewport = packet.viewports.find(v => v.label === arg.viewport);
if (!viewport) throw new Error('Expected --viewport portrait-390x844 or desktop-1100x720');
const trial = arg.trial ? resolve(viewport.outputDirectory, arg.trial) : resolve(viewport.outputDirectory);
if (arg.trial && (!/^[a-z0-9-]+$/u.test(arg.trial) || !trial.startsWith(`${resolve(viewport.outputDirectory)}/`))) throw new Error('Invalid trial folder');
const out = trial;
const workspace = packet.workspace;
const buildPath = `${workspace}/dist/index.html`;
const sha = value => createHash('sha256').update(value).digest('hex');
const fileSha = path => sha(readFileSync(path));
const files = dir => readdirSync(dir).sort().flatMap(name => statSync(`${dir}/${name}`).isDirectory() ? files(`${dir}/${name}`) : [`${dir}/${name}`]);
const sourceFiles = () => [...files(`${workspace}/src`), ...files(`${workspace}/dist`), `${workspace}/index.html`, `${workspace}/package.json`].sort();
if (fileSha(buildPath) !== packet.expectedBuildSha256) throw new Error('Exact expected build hash mismatch; browser was not launched');
if (existsSync(`${out}/recording.json`)) throw new Error('Output directory already contains immutable capture evidence');
mkdirSync(`${out}/frames`, { recursive: true });
mkdirSync(`${out}/video`, { recursive: true });
const before = sourceFiles().map(path => ({ path, sha256: fileSha(path) }));
const save = (name, value) => writeFileSync(`${out}/${name}`, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
save('source-before.json', { targetGame: packet.targetGame, workspace, expectedBuildSha256: packet.expectedBuildSha256, files: before });
const cadenceMs = Number(arg.cadence || 550);
if (![550, 650, 750, 800, 950].includes(cadenceMs)) throw new Error('Undeclared fixed cadence');
const scheduleMs = arg.trial === 'static-spaced'
  ? Array.from({ length: 29 }, (_, i) => 400 + i * 1600)
  : arg.trial === 'desktop-white-opening'
    ? [400, ...Array.from({ length: 25 }, (_, i) => 6000 + i * 1600)]
    : Array.from({ length: Math.ceil(45000 / cadenceMs) }, (_, i) => i * cadenceMs);
save('input-policy.json', {
  freshContextPerViewport: true,
  viewport: { label: viewport.label, width: viewport.width, height: viewport.height, input: viewport.input },
  cadenceMs: arg.trial === 'static-spaced' ? null : cadenceMs,
  trial: arg.trial || `static-${cadenceMs}ms`,
  activeWindowMs: 45000,
  terminalObservationAllowanceMs: 30000,
  plannedInputOffsetsMs: scheduleMs,
  inputRule: arg.trial === 'static-spaced' ? 'Fixed absolute schedule at 400ms then every 1600ms.' : arg.trial === 'desktop-white-opening' ? 'Fixed absolute schedule with one opening tap at 400ms, a no-input observation interval through 6000ms, then taps every 1600ms.' : `Fixed absolute ${cadenceMs}ms wall-clock schedule. No state, pixel, event, object, or contact observation changes the input schedule. Late deadlines are skipped and never burst-replayed.`,
  terminalRule: 'Only exact visible completed/failed copy plus matching read-only status can stop inputs and qualify as terminal.',
  prohibited: ['state injection', 'debug API', 'storage injection', 'fixture or scenario loading', 'adaptive state scheduling', 'internal event dispatch'],
});

const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//u, '') || 'index.html';
  const path = resolve(workspace, 'dist', rel);
  if (!path.startsWith(`${workspace}/dist/`)) { res.statusCode = 403; res.end(); return; }
  if (!existsSync(path)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', contentTypes[extname(path)] || 'application/octet-stream');
  createReadStream(path).pipe(res);
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const require = createRequire(`${workspace}/package.json`);
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: viewport.width, height: viewport.height },
  isMobile: viewport.input === 'touch', hasTouch: viewport.input === 'touch',
  recordVideo: { dir: `${out}/video`, size: { width: viewport.width, height: viewport.height } },
});
const page = await context.newPage();
const errors = [];
const inputs = [];
const observations = [];
const branchProjections = [];
const screenshots = [];
let terminal = null;
let replay = null;
let runnerError = null;
let ended = false;
let t0 = 0;
let priorEventIds = new Set();
page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e) }));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push({ kind: m.type(), text: m.text() }); });

const stateRead = () => page.evaluate(() => window.__GAME_TEST__?.getState());
const takeScreenshot = async label => {
  const path = `${out}/frames/${label}.png`;
  await page.screenshot({ path, fullPage: true, timeout: 15000 });
  screenshots.push({ label, path, atMs: performance.now() - t0 });
  return path;
};
const exactVisibleTerminal = (copy, visible) => {
  if (!visible) return null;
  const text = copy.trim();
  if (/^关卡完成(?:\s|$)/u.test(text)) return 'won';
  if (/^(?:碰到危险物|跌出路线|失足|跌落|挑战失败)(?:\s|$)/u.test(text)) return 'failed';
  return null;
};
const visibleStatus = () => page.evaluate(() => {
  const el = document.querySelector('#terminal-text');
  if (!el) return { text: '', visible: false, visiblePixels: false, css: null };
  const css = getComputedStyle(el), rect = el.getBoundingClientRect();
  const visible = !el.hidden && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0 && rect.width > 0 && rect.height > 0;
  const canvas = document.querySelector('canvas');
  const canvasVisible = !!canvas && canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().height > 0;
  return { text: el.innerText, visible, visiblePixels: visible && canvasVisible, css: { display: css.display, visibility: css.visibility, opacity: css.opacity, width: rect.width, height: rect.height }, canvasVisible };
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__?.getState));
  await page.waitForTimeout(700);
  t0 = performance.now();
  await takeScreenshot('startup');
  const startState = await stateRead();
  observations.push({ atMs: performance.now() - t0, label: 'startup', status: startState.status, player: startState.player, cuts: startState.cuts, anchorId: startState.anchorId });
  priorEventIds = new Set(startState.events.map(e => e.id));

  let observationDone = false;
  const inputTask = (async () => {
    for (const plannedMs of scheduleMs) {
      const delay = t0 + plannedMs - performance.now();
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      if (terminal || ended) break;
      const dispatchedMs = performance.now() - t0;
      if (dispatchedMs - plannedMs > cadenceMs) { inputs.push({ kind: 'skipped-late-deadline', plannedMs, dispatchedMs }); continue; }
      if (viewport.input === 'touch') await page.touchscreen.tap(viewport.width / 2, viewport.height * 0.72);
      else await page.mouse.click(viewport.width / 2, viewport.height * 0.72);
      inputs.push({ kind: viewport.input, plannedMs, dispatchedMs, completedMs: performance.now() - t0, x: viewport.width / 2, y: viewport.height * 0.72 });
    }
  })();
  const observeTask = (async () => {
    let lastScreenshotSecond = -1;
    while (!ended) {
      const read = await page.evaluate(() => {
        const state = window.__GAME_TEST__.getState();
        const terminal = document.querySelector('#terminal-text');
        const css = terminal ? getComputedStyle(terminal) : null;
        const rect = terminal?.getBoundingClientRect();
        const visible = !!terminal && !terminal.hidden && !!terminal.getClientRects().length && css?.display !== 'none' && css?.visibility !== 'hidden' && Number(css?.opacity) > 0 && !!rect && rect.width > 0 && rect.height > 0;
        return { state, terminalCopy: terminal?.innerText || '', terminalVisible: visible, terminalCss: terminal && css && rect ? { display: css.display, visibility: css.visibility, opacity: css.opacity, width: rect.width, height: rect.height } : null, canvasVisible: (() => { const c = document.querySelector('canvas'); const r = c?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; })() };
      });
      const atMs = performance.now() - t0;
      const s = read.state;
      const newEvents = s.events.filter(e => !priorEventIds.has(e.id));
      for (const event of newEvents) {
        priorEventIds.add(event.id);
        if (event.targetId === 'level1-runway-main' && ['anchor', 'bounce'].includes(event.type)) {
          branchProjections.push({
            atMs, worldTime: s.worldTime, eventDelta: { eventId: event.id, type: event.type, targetId: event.targetId, contactPart: event.contactPart ?? null, normalX: event.normalX ?? null, normalY: event.normalY ?? null, eventX: event.x, eventY: event.y },
            supportId: event.targetId, part: event.contactPart ?? null, normal: { x: event.normalX ?? null, y: event.normalY ?? null }, lifecycleState: s.status,
            player: { ...s.player }, anchorId: s.anchorId, cuts: s.cuts,
          });
        }
      }
      if (s.levelNumber === 1 && s.player.x >= 250 && s.player.x <= 400) {
        const last = branchProjections.at(-1);
        if (!last || last.lifecycleState !== s.status || Math.abs(last.player.x - s.player.x) > 1.5) {
          branchProjections.push({ atMs, worldTime: s.worldTime, projectionOnly: true, supportId: s.anchorId, part: null, normal: null, lifecycleState: s.status, player: { ...s.player }, anchorId: s.anchorId, cuts: s.cuts, events: newEvents });
        }
      }
      observations.push({ atMs, label: atMs < 2500 ? 'early-route' : 'journey', status: s.status, player: { ...s.player }, cuts: s.cuts, anchorId: s.anchorId, totalEarnings: s.totalEarnings, events: newEvents, terminalCopy: read.terminalCopy, terminalVisible: read.terminalVisible, terminalCss: read.terminalCss, canvasVisible: read.canvasVisible });
      const kind = exactVisibleTerminal(read.terminalCopy, read.terminalVisible && read.canvasVisible);
      if (kind && s.status === kind) {
        terminal = { atMs, outcome: kind, exactCopy: read.terminalCopy, status: s.status, visible: read.terminalVisible, visiblePixels: read.terminalVisible && read.canvasVisible, css: read.terminalCss };
        observationDone = true;
        break;
      }
      if (atMs >= 75000) break;
      const second = Math.floor(atMs / 1000);
      if (second !== lastScreenshotSecond && atMs > 2500) { lastScreenshotSecond = second; await takeScreenshot(`journey-${String(second).padStart(2, '0')}s`); }
      await new Promise(r => setTimeout(r, 40));
    }
  })();
  await observeTask;
  ended = true;
  await inputTask;
  if (terminal) {
    await takeScreenshot('terminal');
    const replayButton = page.locator('#replay-button');
    const replayVisible = await replayButton.isVisible();
    const box = replayVisible ? await replayButton.boundingBox() : null;
    if (box && box.width > 0 && box.height > 0) {
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (viewport.input === 'touch') await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      await page.waitForTimeout(350);
      const after = await stateRead();
      await takeScreenshot('replay');
      replay = { clickedVisibleControl: true, controlText: await replayButton.innerText(), input: viewport.input, x, y, status: after.status, player: after.player, screenshot: `${out}/frames/replay.png` };
    } else replay = { clickedVisibleControl: false, reason: 'Replay control was not visible with nonzero bounds after terminal.' };
  }
  await takeScreenshot('end');
  observationDone = true;
} catch (error) {
  runnerError = String(error);
  errors.push({ kind: 'runner-error', text: runnerError });
} finally {
  ended = true;
  await context.close().catch(error => errors.push({ kind: 'context-cleanup', text: String(error) }));
  await browser.close().catch(error => errors.push({ kind: 'browser-cleanup', text: String(error) }));
  await new Promise(r => server.close(r));
  const after = sourceFiles().map(path => ({ path, sha256: existsSync(path) ? fileSha(path) : null }));
  const beforeByPath = new Map(before.map(x => [x.path, x.sha256]));
  const unchanged = before.length === after.length && after.every(x => x.sha256 && beforeByPath.get(x.path) === x.sha256) && fileSha(buildPath) === packet.expectedBuildSha256;
  save('source-after.json', { unchanged, expectedBuildSha256: packet.expectedBuildSha256, actualBuildSha256: fileSha(buildPath), files: after.map(x => ({ ...x, beforeSha256: beforeByPath.get(x.path) ?? null })) });
  save('recording.json', {
    schemaVersion: 1, targetGame: packet.targetGame, workspace, viewport: { label: viewport.label, width: viewport.width, height: viewport.height, input: viewport.input }, outputDirectory: out,
    expectedBuildSha256: packet.expectedBuildSha256, url, startedFromFreshContext: true, storageInjected: false, stateInjection: false, debugApiCalled: false, adaptiveScheduling: false, internalEventsDispatched: false,
    observedAt: new Date().toISOString(), inputSchedule: { cadenceMs, plannedOffsetsMs: scheduleMs }, inputs, observations, branchProjections, screenshots, terminal, replay, errors, runnerError, unchanged,
    limitations: branchProjections.length ? [] : ['The exact level1-runway-main natural contact event was not observed by this viewport trace.'],
  });
}
console.log(JSON.stringify({ viewport: viewport.label, out, terminal, replay, branchProjections: branchProjections.length, errors, runnerError }));
