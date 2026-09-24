import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, type Page } from '@playwright/test';
import { LEVEL_CATALOG } from '../src/game-levels';
import type { SliceState } from '../src/game-core';

const out = '../../qa-spike-impact-v1';
const storageKey = 'slice-master-neutral-progress-v2';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function waitForPreview(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`preview exited ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error('preview timeout');
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function state(page: Page): Promise<SliceState> {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function chooseLevel(page: Page, level: number): Promise<void> {
  const panel = page.locator('#level-select');
  if (await panel.isHidden()) await page.locator('#level-selector-toggle').click();
  await page.locator('#level-grid button').nth(level - 1).click();
  await page.waitForTimeout(120);
}

async function naturalTap(page: Page): Promise<void> {
  const size = page.viewportSize()!;
  if (size.width <= 500) await page.touchscreen.tap(size.width / 2, 430);
  else await page.mouse.click(size.width / 2, size.height / 2);
}

function pathYAt(path: readonly { x: number; y: number }[], x: number): number {
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]!;
    const b = path[index]!;
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return path.at(-1)!.y;
}

type SpikeTrace = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pathY: number;
  pathDy: number;
  minDyInWindow: number | null;
  windowObserved: boolean;
  contacted: boolean;
  failureAtSpike: boolean;
  passedWindowWithoutContact: boolean;
};

type NaturalRun = {
  viewport: string;
  level: number;
  attempt: number;
  policy: 'safe' | 'risk';
  status: SliceState['status'];
  failReason: SliceState['failReason'];
  elapsed: number;
  maxX: number;
  taps: number;
  spikes: SpikeTrace[];
  pressureScreenshot: string | null;
  screenshot: string | null;
  dessertIntactScreenshot: string | null;
  dessertCutScreenshot: string | null;
};

async function runLevel(page: Page, level: number, viewport: string, policy: 'safe' | 'risk'): Promise<NaturalRun[]> {
  const traces: NaturalRun[] = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (attempt > 1) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
    }
    await chooseLevel(page, level);
    const dessertIntactScreenshot = `${out}/${viewport}-level-${String(level).padStart(2, '0')}-${policy}-dessert-intact.png`;
    await page.screenshot({ path: dessertIntactScreenshot, fullPage: true });
    const initial = await state(page);
    const authored = new Map(initial.spikes.map((spike) => [spike.id, {
      id: spike.id, x: spike.x, y: spike.y, width: spike.width, height: spike.height,
      pathY: pathYAt(LEVEL_CATALOG.levels[level - 1]!.completionPath, spike.x),
      pathDy: Math.abs(spike.y - pathYAt(LEVEL_CATALOG.levels[level - 1]!.completionPath, spike.x)),
      minDyInWindow: null as number | null, windowObserved: false, contacted: false,
      failureAtSpike: false, passedWindowWithoutContact: false,
    }]));
    let lastTap = -10;
    let taps = 0;
    let maxX = initial.player.x;
    let pressureScreenshot: string | null = null;
    let dessertCutScreenshot: string | null = null;
    const deadline = Date.now() + 38_000;
    while (Date.now() < deadline) {
      const current = await state(page);
      maxX = Math.max(maxX, current.player.x);
      for (const spike of current.spikes) {
        const trace = authored.get(spike.id);
        if (!trace) continue;
        const inWindow = Math.abs(current.player.x - spike.x) <= Math.max(140, spike.width * 1.5);
        if (inWindow) {
          trace.windowObserved = true;
          trace.minDyInWindow = Math.min(trace.minDyInWindow ?? Infinity, Math.abs(current.player.y - spike.y));
          if (!pressureScreenshot) {
            pressureScreenshot = `${out}/${viewport}-level-${String(level).padStart(2, '0')}-attempt-${attempt}-spike-window.png`;
            await page.screenshot({ path: pressureScreenshot, fullPage: true });
          }
        }
        if (current.player.x > spike.x + Math.max(140, spike.width * 1.5) && !trace.contacted) trace.passedWindowWithoutContact = true;
      }
      for (const event of current.events) {
        const trace = event.targetId ? authored.get(event.targetId) : undefined;
        if (trace) trace.contacted = true;
      }
      if (!dessertCutScreenshot && current.events.some((event) => event.type === 'cut')) {
        dessertCutScreenshot = `${out}/${viewport}-level-${String(level).padStart(2, '0')}-${policy}-dessert-cut.png`;
        await page.screenshot({ path: dessertCutScreenshot, fullPage: true });
      }
      if (current.status === 'failed' || current.status === 'won') {
        const screenshot = `${out}/${viewport}-level-${String(level).padStart(2, '0')}-attempt-${attempt}-${current.status}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        for (const trace of authored.values()) trace.failureAtSpike = current.failReason === 'spike' && trace.windowObserved;
        traces.push({ viewport, level, attempt, policy, status: current.status, failReason: current.failReason, elapsed: current.elapsed, maxX, taps, spikes: [...authored.values()], pressureScreenshot, screenshot, dessertIntactScreenshot, dessertCutScreenshot });
        break;
      }
      const projectedY = current.player.y + Math.max(0, current.player.vy) * 0.2;
      const targetHeight = policy === 'safe' ? 430 : 580;
      const shouldTap = current.status === 'ready' || current.status === 'anchored'
        || (current.status === 'airborne' && projectedY > targetHeight && current.player.vy > -125);
      if (shouldTap && current.worldTime - lastTap >= 0.14) {
        await naturalTap(page);
        lastTap = current.worldTime;
        taps += 1;
      }
      await page.waitForTimeout(14);
    }
    if (traces.at(-1)?.status === 'won') break;
  }
  return traces;
}

await mkdir(out, { recursive: true });
const port = await freePort();
const url = `http://127.0.0.1:${port}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['pipe', 'pipe', 'pipe'] });
let previewLog = '';
preview.stdout.on('data', (chunk: Buffer) => { previewLog += chunk.toString(); });
preview.stderr.on('data', (chunk: Buffer) => { previewLog += chunk.toString(); });
const errors: string[] = [];
const runs: NaturalRun[] = [];
try {
  await waitForPreview(url, preview);
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  const setup = ({ key }: { key: string }) => localStorage.setItem(key, JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 4, records: {}, settings: { soundEnabled: true, reducedMotion: false } }));
  await desktop.addInitScript(setup, { key: storageKey });
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop: ${message.text()}`); });
  desktop.on('pageerror', (error) => errors.push(`desktop pageerror: ${error.message}`));
  await desktop.goto(url, { waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => Boolean(window.__GAME_TEST__));
  runs.push(...await runLevel(desktop, 4, 'desktop', 'safe'));
  runs.push(...await runLevel(desktop, 4, 'desktop', 'risk'));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(setup, { key: storageKey });
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile: ${message.text()}`); });
  mobile.on('pageerror', (error) => errors.push(`mobile pageerror: ${error.message}`));
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => Boolean(window.__GAME_TEST__));
  runs.push(...await runLevel(mobile, 4, 'mobile', 'safe'));
  runs.push(...await runLevel(mobile, 4, 'mobile', 'risk'));
  await mobile.close();
  await desktop.close();
  await browser.close();
} finally {
  await stop(preview);
  await writeFile(`${out}/console.log`, previewLog, 'utf8');
}

const finalRuns = runs.filter((run) => run.status === 'won' || run.status === 'failed');
const safeRuns = finalRuns.filter((run) => run.policy === 'safe');
const riskRuns = finalRuns.filter((run) => run.policy === 'risk');
const safePolicyWonByViewport = Object.fromEntries(['desktop', 'mobile'].map((viewport) => [viewport, safeRuns.some((run) => run.viewport === viewport && run.status === 'won')]));
const riskPolicyContactedByViewport = Object.fromEntries(['desktop', 'mobile'].map((viewport) => [viewport, riskRuns.some((run) => run.viewport === viewport && run.spikes.some((spike) => spike.contacted || spike.failureAtSpike))]));
const safePolicyWon = Object.values(safePolicyWonByViewport).every(Boolean);
const riskPolicyContacted = Object.values(riskPolicyContactedByViewport).every(Boolean);
const anySpikeContact = finalRuns.some((run) => run.spikes.some((spike) => spike.contacted || spike.failureAtSpike));
const report = {
  schemaVersion: 1,
  artifactType: 'SpikeImpactNaturalQa',
  targetGame: '小李飞刀',
  level: 4,
  inputPolicy: 'fresh browser; visible level picker; mouse/touch only; no state injection or debug scenario',
  viewports: ['1180x720', '390x844'],
  runs: finalRuns,
  structural: {
    spikes: LEVEL_CATALOG.levels[3]!.spikes.map((spike) => ({
      id: spike.id,
      x: spike.x,
      y: spike.y,
      reachableWindow: spike.reachableWindow,
      completionPathY: pathYAt(LEVEL_CATALOG.levels[3]!.completionPath, spike.x),
      verticalDistanceFromCompletionPath: Math.abs(spike.y - pathYAt(LEVEL_CATALOG.levels[3]!.completionPath, spike.x)),
    })),
  },
  errors,
  passed: safePolicyWon && riskPolicyContacted,
  policyCheck: { safePolicyWon, riskPolicyContacted, safePolicyWonByViewport, riskPolicyContactedByViewport, safePolicy: 'target height 430 avoids the low spike and must reach won on desktop and mobile', riskPolicy: 'target height 580 deliberately enters the low spike window and must fail with spike on desktop and mobile' },
  verdict: safePolicyWon && riskPolicyContacted ? 'PASS_SAFE_AVOID_AND_RISK_CONTACT' : anySpikeContact ? 'CONTACT_OBSERVED_BUT_DECISION_QUALITY_UNPROVEN' : 'BLOCKED_ORPHAN_HAZARD_NO_NATURAL_CONTACT',
  claimBoundary: 'web-lite evidence only; this is targeted supplemental QA and does not prove platform packaging',
};
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, runs: finalRuns.length, errors: errors.length }));
if (!anySpikeContact) process.exitCode = 1;
