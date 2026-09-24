import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const outDir = '../../qa-cut-geometry-v1';
const storageKey = 'slice-master-neutral-progress-v2';

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve QA port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function waitForPreview(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`preview exited (${child.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('preview timeout');
}
async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function tapper(page: Page): Promise<() => Promise<void>> {
  if (!page.viewportSize() || page.viewportSize()!.width > 500) return async () => { const size = page.viewportSize()!; await page.mouse.click(size.width / 2, size.height / 2); };
  const cdp = await page.context().newCDPSession(page);
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 430, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}
async function runCase(page: Page, level: number, label: string): Promise<Record<string, unknown>> {
  await page.evaluate((n) => window.__GAME_TEST__.selectLevel(n), level);
  const tap = await tapper(page);
  const trace: Array<Record<string, unknown>> = [];
  let lastTap = -10;
  let capturedCut = false;
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => ({ state: window.__GAME_TEST__.getState(), render: window.__GAME_TEST__.getRenderState() }));
    const cutKinds = sample.render.cutVisuals.filter((v) => v.phase === 'cut').map((v) => v.id);
    trace.push({ t: sample.state.worldTime, status: sample.state.status, x: sample.state.player.x, cutKinds });
    if (!capturedCut && cutKinds.length > 0) {
      capturedCut = true;
      await page.screenshot({ path: `${outDir}/${label}-level-${String(level).padStart(2, '0')}-cut.png`, fullPage: true });
    }
    if (sample.state.status === 'failed' || sample.state.status === 'won') break;
    const projectedY = sample.state.player.y + Math.max(0, sample.state.player.vy) * 0.2;
    const shouldTap = sample.state.status === 'ready' || sample.state.status === 'anchored'
      || (sample.state.status === 'airborne' && projectedY > (level === 4 ? 390 : 540) && sample.state.player.vy > -125);
    if (shouldTap && sample.state.worldTime - lastTap >= 0.16) { await tap(); lastTap = sample.state.worldTime; }
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  const final = await page.evaluate(() => ({ state: window.__GAME_TEST__.getState(), render: window.__GAME_TEST__.getRenderState() }));
  await page.screenshot({ path: `${outDir}/${label}-level-${String(level).padStart(2, '0')}-settled.png`, fullPage: true });
  return { level, viewport: label, capturedCut, terminal: final.state.status, cutVisuals: final.render.cutVisuals.filter((v) => v.phase === 'cut').map((v) => ({ id: v.id, visibleHalves: v.visibleHalves, caps: v.capMeshNames })), traceSamples: trace.length };
}

await mkdir(outDir, { recursive: true });
const port = await reservePort();
const url = `http://127.0.0.1:${port}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
let failure: unknown = null;
const cases: Record<string, unknown>[] = [];
try {
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const config of [{ label: 'desktop', viewport: { width: 1180, height: 720 }, mobile: false }, { label: 'mobile', viewport: { width: 390, height: 844 }, mobile: true }] as const) {
      const page = await browser.newPage({ viewport: config.viewport, isMobile: config.mobile, hasTouch: config.mobile });
      await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } })), storageKey);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
      cases.push(await runCase(page, 1, config.label));
      cases.push(await runCase(page, 4, config.label));
      cases.push(await runCase(page, 7, config.label));
      await page.close();
    }
  } finally { await browser.close(); }
} catch (error) { failure = error; }
finally { await stop(preview); await writeFile(`${outDir}/report.json`, `${JSON.stringify({ schemaVersion: 1, artifactType: 'CutGeometryNaturalQa', passed: failure === null, cases, error: failure instanceof Error ? failure.message : failure ? String(failure) : null }, null, 2)}\n`, 'utf8'); }
if (failure) throw failure;
console.log(JSON.stringify({ schemaVersion: 1, artifactType: 'CutGeometryNaturalQa', passed: true, cases }));
