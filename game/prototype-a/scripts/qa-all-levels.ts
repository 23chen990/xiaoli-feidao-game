import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium, type Page } from '@playwright/test';
import type { SliceState } from '../src/game-core';

const out = '../../qa-all-levels-v1';
async function port(): Promise<number> { const server = createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); const value = typeof address === 'object' && address ? address.port : 0; await new Promise<void>((resolve) => server.close(() => resolve())); return value; }
async function wait(url: string, child: ChildProcessWithoutNullStreams): Promise<void> { for (let i = 0; i < 100; i += 1) { if (child.exitCode !== null) throw new Error(`preview exited ${child.exitCode}`); try { if ((await fetch(url)).ok) return; } catch { /* starting */ } await new Promise((resolve) => setTimeout(resolve, 80)); } throw new Error('preview timeout'); }
async function stop(child: ChildProcessWithoutNullStreams): Promise<void> { if (child.exitCode !== null) return; child.kill('SIGTERM'); await new Promise((resolve) => setTimeout(resolve, 500)); if (child.exitCode === null) child.kill('SIGKILL'); }
async function state(page: Page): Promise<SliceState> { return page.evaluate(() => window.__GAME_TEST__.getState()); }
async function tap(page: Page): Promise<void> { const size = page.viewportSize()!; if (size.width <= 500) await page.touchscreen.tap(size.width / 2, 430); else await page.mouse.click(size.width / 2, size.height / 2); }

interface LevelEvidence { level: number; theme: string; styles: string[]; status: SliceState['status']; failReason: SliceState['failReason']; elapsed: number; maxX: number; taps: number; screenshots: string[]; hardObjects: Array<{ id: string; minDy: number | null; contacted: boolean; cut: boolean; decisionWindowObserved: boolean }>; }

async function chooseLevel(page: Page, level: number): Promise<void> { const panel = page.locator('#level-select'); if (await panel.isHidden()) await page.locator('#level-selector-toggle').click(); await page.locator('#level-grid button').nth(level - 1).click(); await page.waitForTimeout(120); }
async function play(page: Page, level: number, viewportName: string): Promise<LevelEvidence> {
  await chooseLevel(page, level);
  const initial = await state(page);
  const styleSet = new Set([...initial.sigils, ...initial.blocks].map((item) => item.foodStyle));
  const hard = new Map(initial.blocks.map((block) => [block.id, { minDy: null as number | null, contacted: false, cut: false, decisionWindowObserved: false }]));
  const screenshots: string[] = [];
  let maxX = initial.player.x; let taps = 0; let lastTap = -10; let lastShotX = -1;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) { await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__GAME_TEST__)); await chooseLevel(page, level); }
    const deadline = Date.now() + 28_000;
    while (Date.now() < deadline) {
      const current = await state(page); maxX = Math.max(maxX, current.player.x);
      for (const block of current.blocks) {
        const record = hard.get(block.id); if (!record) continue;
        if (Math.abs(current.player.x - block.x) <= 190) { record.decisionWindowObserved = true; record.minDy = Math.min(record.minDy ?? Infinity, Math.abs(current.player.y - block.y)); }
        if (block.cut) record.cut = true;
      }
      for (const event of current.events) if (event.targetId && hard.has(event.targetId)) hard.get(event.targetId)!.contacted = true;
      if (lastShotX < 0 && current.player.x > current.finishX * 0.5) { const path = `${out}/${viewportName}-level-${String(level).padStart(2, '0')}-pressure.png`; await page.screenshot({ path, fullPage: true }); screenshots.push(path); lastShotX = current.player.x; }
      if (current.status === 'failed' || current.status === 'won') {
        const path = `${out}/${viewportName}-level-${String(level).padStart(2, '0')}-${current.status}.png`; await page.screenshot({ path, fullPage: true }); screenshots.push(path);
        return { level, theme: await page.evaluate(() => document.body.dataset.foodTheme ?? ''), styles: [...styleSet], status: current.status, failReason: current.failReason, elapsed: current.elapsed, maxX, taps, screenshots, hardObjects: [...hard].map(([id, record]) => ({ id, ...record })) };
      }
      const projectedY = current.player.y + Math.max(0, current.player.vy) * 0.2;
      const targetHeight = [550, 590, 510, 630][attempt]!;
      if ((current.status === 'ready' || current.status === 'anchored' || (current.status === 'airborne' && projectedY > targetHeight && current.player.vy > -125)) && current.worldTime - lastTap >= 0.14) { await tap(page); lastTap = current.worldTime; taps += 1; }
      await page.waitForTimeout(14);
    }
  }
  const current = await state(page);
  return { level, theme: await page.evaluate(() => document.body.dataset.foodTheme ?? ''), styles: [...styleSet], status: current.status, failReason: current.failReason, elapsed: current.elapsed, maxX, taps, screenshots, hardObjects: [...hard].map(([id, record]) => ({ id, ...record })) };
}

await mkdir(out, { recursive: true });
const selectedPort = await port(); const url = `http://127.0.0.1:${selectedPort}/`;
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(selectedPort), '--strictPort'], { stdio: ['pipe', 'pipe', 'pipe'] });
let log = ''; preview.stdout.on('data', (chunk: Buffer) => { log += chunk.toString(); }); preview.stderr.on('data', (chunk: Buffer) => { log += chunk.toString(); });
const errors: string[] = []; const results: LevelEvidence[] = [];
try {
  await wait(url, preview);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  await page.addInitScript(() => localStorage.setItem('slice-master-neutral-progress-v2', JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } })));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); }); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => Boolean(window.__GAME_TEST__));
  for (let level = 1; level <= 12; level += 1) results.push(await play(page, level, 'desktop'));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.addInitScript(() => localStorage.setItem('slice-master-neutral-progress-v2', JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } })));
  await mobile.goto(url, { waitUntil: 'networkidle' }); await mobile.waitForFunction(() => Boolean(window.__GAME_TEST__));
  for (let level = 1; level <= 12; level += 1) results.push(await play(mobile, level, 'mobile'));
  await mobile.close(); await page.close(); await browser.close();
} finally { await stop(preview); await writeFile(`${out}/console.log`, log, 'utf8'); }
const report = { schemaVersion: 1, artifactType: 'AllLevelsNaturalQa', targetGame: '小李飞刀', workspace: 'runs/mobile-slice-adaptation-20260830/workspace/prototype-a', passed: results.length === 24 && results.every((result) => result.status === 'won' && result.styles.length >= 2 && result.hardObjects.every((object) => object.decisionWindowObserved)), viewports: ['1180x720', '390x844'], naturalInput: 'mouse/touch only', results, errors, claimBoundary: 'web-lite browser evidence only; platform adapters remain unverified' };
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ passed: report.passed, levels: results.length, errors: errors.length }));
if (!report.passed) process.exitCode = 1;
