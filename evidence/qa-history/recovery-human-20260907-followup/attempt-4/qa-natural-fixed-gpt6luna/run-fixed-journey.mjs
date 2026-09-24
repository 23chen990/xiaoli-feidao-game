import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const workspace = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a';
const output = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/recovery-human-20260907-followup/attempt-4/qa-natural-fixed-gpt6luna';
const expectedBuildHash = '5b2e1604b93d66614229f6481e71f82dfd2864e099cbd3c3af5ed34371ca30e5';
const schedule = JSON.parse(await readFile(path.join(output, 'static-input-schedule.json'), 'utf8'));
const viewports = schedule.viewports;
const sampleOffsetsMs = [200, 1000, 3000, 6000, 9000, 12000, 15000, 18000, 20500, 24000];

const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
async function hashFile(file) { return digest(await readFile(file)); }
async function sourceManifest() {
  const files = [];
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await visit(full);
      else files.push(full);
    }
  }
  await visit(path.join(workspace, 'src'));
  files.sort();
  const entries = await Promise.all(files.map(async (file) => ({
    path: path.relative(workspace, file),
    sha256: await hashFile(file),
  })));
  return { aggregateSha256: digest(Buffer.from(entries.map(({ path: name, sha256 }) => `${name}\0${sha256}`).join('\n'))), files: entries };
}
async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No preview port');
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir(output, { recursive: true });
const initialBuildHash = await hashFile(path.join(workspace, 'dist/index.html'));
if (initialBuildHash !== expectedBuildHash) throw new Error(`Build hash mismatch before run: ${initialBuildHash}`);
const initialSource = await sourceManifest();
const port = await reservePort();
const url = `http://127.0.0.1:${port}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'],
});
let previewLog = '';
preview.stdout.on('data', (chunk) => { previewLog += chunk.toString(); });
preview.stderr.on('data', (chunk) => { previewLog += chunk.toString(); });
const results = [];
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try { const response = await fetch(url); if (response.ok) { ready = true; break; } } catch {}
    if (preview.exitCode !== null) throw new Error(`Preview exited with ${preview.exitCode}`);
    await sleep(100);
  }
  if (!ready) throw new Error(`Preview failed to start at ${url}`);
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    const dir = path.join(output, viewport.label);
    await mkdir(path.join(dir, 'screenshots'), { recursive: true });
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.input === 'touch',
      hasTouch: viewport.input === 'touch',
      recordVideo: { dir: path.join(dir, 'video'), size: { width: viewport.width, height: viewport.height } },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const runStart = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#game-shell').waitFor({ state: 'visible' });
    const visibleCanvas = await page.locator('canvas').count() > 0;
    const inputs = [];
    const shots = [];
    let sampleIndex = 0;
    let terminalVisibleAtMs = null;
    let replayObserved = false;
    let replayButtonClicked = false;
    let terminalText = '';
    let postReplayStatusText = '';
    const capture = async (label) => {
      const file = path.join(dir, 'screenshots', `${label}.png`);
      await page.screenshot({ path: file });
      shots.push({ file: path.relative(output, file), sha256: await hashFile(file) });
    };
    await capture('startup');
    const start = Date.now();
    const terminalWatch = (async () => {
      while (Date.now() - start < 35000) {
        const text = (await page.locator('#terminal-text').innerText().catch(() => '')).trim();
        const terminalCopy = /(?:碰到危险物|跌出路线|关卡完成|附加挑战完成)[\s\S]*分数[\s\S]*再次轻触/.test(text);
        if (terminalCopy) {
          terminalVisibleAtMs ??= Date.now() - start;
          terminalText = text;
          return;
        }
        await sleep(50);
      }
    })();
    for (let i = 0; i < schedule.plannedOffsetsMs.length; i += 1) {
      const plannedMs = schedule.plannedOffsetsMs[i];
      const remaining = plannedMs - (Date.now() - start);
      if (remaining > 0) await sleep(remaining);
      const dispatchedMs = Date.now() - start;
      if (viewport.input === 'touch') await page.touchscreen.tap(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
      else await page.mouse.click(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
      inputs.push({ plannedMs, dispatchedMs, kind: viewport.input, coordinate: [Math.floor(viewport.width / 2), Math.floor(viewport.height / 2)] });
      while (sampleIndex < sampleOffsetsMs.length && Date.now() - start >= sampleOffsetsMs[sampleIndex]) {
        await capture(`t-${String(sampleOffsetsMs[sampleIndex]).padStart(5, '0')}ms`);
        sampleIndex += 1;
      }
    }
    while (sampleIndex < sampleOffsetsMs.length) {
      const remaining = sampleOffsetsMs[sampleIndex] - (Date.now() - start);
      if (remaining > 0 && remaining < 35000) await sleep(remaining);
      if (Date.now() - start >= sampleOffsetsMs[sampleIndex]) {
        await capture(`t-${String(sampleOffsetsMs[sampleIndex]).padStart(5, '0')}ms`);
        sampleIndex += 1;
      } else break;
    }
    await terminalWatch;
    if (terminalVisibleAtMs !== null) {
      await capture('terminal');
      const replay = page.locator('#replay-button');
      const replayVisible = await replay.isVisible().catch(() => false);
      if (replayVisible) {
        await replay.click();
        replayButtonClicked = true;
        await sleep(350);
        postReplayStatusText = (await page.locator('#state-text').innerText().catch(() => '')).trim();
        replayObserved = /准备|就绪/.test(postReplayStatusText);
        await capture('replay');
      }
    } else {
      await capture('end-no-terminal');
    }
    await context.tracing.stop({ path: path.join(dir, 'playwright-trace.zip') });
    const video = page.video();
    await context.close();
    const videoPath = await video?.path();
    const result = {
      viewport,
      freshBrowserContext: true,
      startToCoreLoop: { visibleCanvas, normalInputCount: inputs.length },
      fixedInputs: inputs,
      terminal: { visible: terminalVisibleAtMs !== null, atMs: terminalVisibleAtMs, visibleText: terminalText },
      replay: { clickedVisibleReplayButton: replayButtonClicked, returnedToReady: replayObserved, postReplayStatusText },
      consoleErrors,
      pageErrors,
      screenshots: shots,
      trace: { path: path.relative(output, path.join(dir, 'playwright-trace.zip')), sha256: await hashFile(path.join(dir, 'playwright-trace.zip')) },
      video: videoPath ? { path: path.relative(output, videoPath), sha256: await hashFile(videoPath) } : null,
      elapsedWallMs: Date.now() - runStart,
    };
    await writeFile(path.join(dir, 'run-result.json'), `${JSON.stringify(result, null, 2)}\n`);
    results.push(result);
  }
} finally {
  if (browser) await browser.close();
  if (preview.exitCode === null) {
    preview.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => preview.once('exit', resolve)), sleep(2000)]);
    if (preview.exitCode === null) preview.kill('SIGKILL');
  }
}
const finalBuildHash = await hashFile(path.join(workspace, 'dist/index.html'));
const finalSource = await sourceManifest();
const report = {
  schemaVersion: 1,
  artifactType: 'IndependentFixedScheduleNaturalQa',
  targetGame: schedule.targetGame,
  workspace,
  outputDirectory: output,
  build: { expectedSha256: expectedBuildHash, beforeSha256: initialBuildHash, afterSha256: finalBuildHash, unchanged: initialBuildHash === finalBuildHash },
  source: { before: initialSource, after: finalSource, unchanged: initialSource.aggregateSha256 === finalSource.aggregateSha256 },
  inputSchedule: 'static-input-schedule.json',
  scheduleFrozenBeforeBrowserRun: schedule.derivedOfflineBeforeBrowserRun,
  forbiddenOperations: [],
  previewLog,
  runs: results,
  status: results.length === 2 && results.every((run) => run.terminal.visible && run.replay.clickedVisibleReplayButton && run.replay.returnedToReady && run.pageErrors.length === 0 && run.consoleErrors.length === 0) ? 'PASS' : 'BLOCKED',
  blockers: results.flatMap((run) => [
    ...(!run.terminal.visible ? [`${run.viewport.label}: no player-visible terminal/settlement by timeout`] : []),
    ...(!run.replay.clickedVisibleReplayButton || !run.replay.returnedToReady ? [`${run.viewport.label}: normal-input replay did not return visibly to ready state`] : []),
    ...(run.pageErrors.length ? [`${run.viewport.label}: page errors`] : []),
    ...(run.consoleErrors.length ? [`${run.viewport.label}: console errors`] : []),
  ]),
};
if (!report.build.unchanged || !report.source.unchanged) report.status = 'BLOCKED';
await writeFile(path.join(output, 'qa-natural-fixed-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, runs: results.map(({ viewport, terminal, replay }) => ({ viewport: viewport.label, terminal, replay })), build: report.build, sourceUnchanged: report.source.unchanged }));
