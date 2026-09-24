import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import type { SliceState } from '../src/game-core';

const url = process.env.SLICE_CORE_QA_URL;
assert.ok(url, 'SLICE_CORE_QA_URL is required');
const artifactDirectory = '../../qa-core-loop-v1';
const storageKey = 'slice-master-neutral-progress-v2';

async function getState(page: Page): Promise<SliceState> {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function tap(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  if (viewport.width <= 500) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width / 2, y: viewport.height * 0.52, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

async function selectLevelViaUi(page: Page, level: number): Promise<void> {
  await page.locator('#level-selector-toggle').click();
  await page.locator(`#level-grid button:nth-child(${level})`).click();
  await page.waitForFunction((expected) => window.__GAME_TEST__.getState().levelNumber === expected, level);
}

async function naturalRun(page: Page, level: number, targetHeight: number): Promise<Record<string, unknown>> {
  await selectLevelViaUi(page, level);
  const start = await getState(page);
  let lastTap = -10;
  let taps = 0;
  const seenTargets = new Set<string>();
  const routeChanges: number[] = [];
  const finishPhases = new Set<string>();
  const deadline = Date.now() + 48_000;
  while (Date.now() < deadline) {
    const state = await getState(page);
    state.events.forEach((event) => { if (event.targetId) seenTargets.add(event.targetId); });
    routeChanges.push(state.routeChanges);
    finishPhases.add(state.finishPhase);
    if (state.status === 'won' || state.status === 'failed') {
      await page.screenshot({ path: `${artifactDirectory}/${page.viewportSize()!.width <= 500 ? 'mobile' : 'desktop'}-level-${level}-${state.status}.png`, fullPage: true });
      return {
        level,
        viewport: `${page.viewportSize()!.width}x${page.viewportSize()!.height}`,
        status: state.status,
        failReason: state.failReason,
        cuts: state.cuts,
        score: state.score,
        totalEarnings: state.totalEarnings,
        routeChanges: Math.max(...routeChanges),
        routeBias: state.routeBias,
        seenTargets: [...seenTargets],
        finishGateId: state.finishGateId,
        finishPhases: [...finishPhases],
        taps,
      };
    }
    const projectedY = state.player.y + Math.max(0, state.player.vy) * 0.2;
    const shouldTap = state.status === 'ready' || state.status === 'anchored'
      || (state.status === 'airborne' && projectedY > targetHeight && state.player.vy > -125);
    if (shouldTap && state.worldTime - lastTap >= 0.14) {
      await tap(page);
      lastTap = state.worldTime;
      taps += 1;
    }
    await page.waitForTimeout(14);
  }
  const end = await getState(page);
  return { level, viewport: `${page.viewportSize()!.width}x${page.viewportSize()!.height}`, status: end.status, timeout: true, startLevel: start.levelNumber, taps };
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const results: Record<string, unknown>[] = [];
try {
  const progress = JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } });
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  desktop.on('pageerror', (error) => errors.push(`desktop: ${error.message}`));
  await desktop.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: progress });
  await desktop.goto(url, { waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => Boolean(window.__GAME_TEST__));
  for (const level of [1, 2, 3]) results.push(await naturalRun(desktop, level, level === 2 ? 500 : 550));
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', (error) => errors.push(`mobile: ${error.message}`));
  await mobile.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: progress });
  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(() => Boolean(window.__GAME_TEST__));
  for (const level of [1, 2, 3]) results.push(await naturalRun(mobile, level, level === 2 ? 500 : 550));
  const report = { schemaVersion: 1, artifactType: 'CoreLoopNaturalQa', passed: errors.length === 0 && results.every((result) => result.status === 'won'), results, errors, claimBoundary: 'Natural input after UI level selection; web-lite only; no debug placement or state injection during play.' };
  await writeFile(`${artifactDirectory}/qa-report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
