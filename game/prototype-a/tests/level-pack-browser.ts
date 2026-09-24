import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import type { SliceState } from '../src/game-core';

const url = process.env.SLICE_LEVEL_QA_URL;
assert.ok(url, 'SLICE_LEVEL_QA_URL is required');
const artifactDirectory = '../../qa-level-pack-v1';
const storageKey = 'slice-master-neutral-progress-v2';

interface NaturalResult { level: number; status: SliceState['status']; failReason: SliceState['failReason']; elapsed: number; cuts: number; score: number; maxX: number; taps: number; }

async function state(page: Page): Promise<SliceState> { return page.evaluate(() => window.__GAME_TEST__.getState()); }
async function mouseTap(page: Page): Promise<void> { const size = page.viewportSize()!; await page.mouse.click(size.width / 2, size.height / 2); }
async function nativeTapper(page: Page): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 430, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

async function naturalPlay(page: Page, level: number, tap: () => Promise<void>, targetHeight: number, timeoutMs: number): Promise<NaturalResult> {
  await page.evaluate((number) => window.__GAME_TEST__.selectLevel(number), level);
  let lastTap = -10;
  let taps = 0;
  let maxX = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await state(page);
    maxX = Math.max(maxX, current.player.x);
    if (current.status === 'failed' || current.status === 'won') {
      await page.screenshot({ path: `${artifactDirectory}/${page.viewportSize()!.width === 390 ? 'mobile' : 'desktop'}-level-${String(level).padStart(2, '0')}-${current.status}.png`, fullPage: true });
      return { level, status: current.status, failReason: current.failReason, elapsed: current.elapsed, cuts: current.cuts, score: current.score, maxX, taps };
    }
    const projectedY = current.player.y + Math.max(0, current.player.vy) * 0.2;
    const shouldTap = current.status === 'ready' || current.status === 'anchored'
      || (current.status === 'airborne' && projectedY > targetHeight && current.player.vy > -125);
    if (shouldTap && current.worldTime - lastTap >= 0.14) {
      await tap();
      lastTap = current.worldTime;
      taps += 1;
    }
    await page.waitForTimeout(14);
  }
  const current = await state(page);
  return { level, status: current.status, failReason: current.failReason, elapsed: current.elapsed, cuts: current.cuts, score: current.score, maxX, taps };
}

async function playWithNaturalRetries(page: Page, level: number, tap: () => Promise<void>): Promise<{ attempts: NaturalResult[]; winner: NaturalResult }> {
  const attempts: NaturalResult[] = [];
  for (const target of [550, 590, 510, 630]) {
    const result = await naturalPlay(page, level, tap, target, 48_000);
    attempts.push(result);
    if (result.status === 'won') return { attempts, winner: result };
  }
  assert.fail(`Level ${level} natural play failed: ${JSON.stringify(attempts)}`);
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
const requestFailures: string[] = [];

try {
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop console: ${message.text()}`); });
  desktop.on('pageerror', (error) => errors.push(`desktop pageerror: ${error.message}`));
  desktop.on('requestfailed', (request) => requestFailures.push(`desktop ${request.url()}: ${request.failure()?.errorText}`));
  await desktop.goto(url, { waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => Boolean(window.__GAME_TEST__));

  const levelOne = await playWithNaturalRetries(desktop, 1, () => mouseTap(desktop));
  assert.equal((await desktop.evaluate(() => window.__GAME_TEST__.getProgress())).highestUnlockedLevel, 2);
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => Boolean(window.__GAME_TEST__));
  assert.equal((await desktop.evaluate(() => window.__GAME_TEST__.getProgress())).highestUnlockedLevel, 2, 'refresh lost highest unlocked level');

  await desktop.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } })), { key: storageKey });
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => window.__GAME_TEST__.getProgress().highestUnlockedLevel === 12);
  const desktopResults = [levelOne];
  for (const level of [4, 7, 10, 12]) desktopResults.push(await playWithNaturalRetries(desktop, level, () => mouseTap(desktop)));

  await desktop.evaluate(() => window.__GAME_TEST__.selectLevel(4));
  await desktop.evaluate(() => window.__GAME_TEST__.loadScenario('spike'));
  await desktop.waitForFunction(() => window.__GAME_TEST__.getState().status === 'failed');
  await desktop.locator('#replay-button').click();
  const replayed = await state(desktop);
  assert.equal(replayed.levelNumber, 4);
  assert.equal(replayed.status, 'ready');
  assert.equal(replayed.failReason, null);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`); });
  mobile.on('pageerror', (error) => errors.push(`mobile pageerror: ${error.message}`));
  mobile.on('requestfailed', (request) => requestFailures.push(`mobile ${request.url()}: ${request.failure()?.errorText}`));
  await mobile.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, highestUnlockedLevel: 12, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } })), { key: storageKey });
  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(() => window.__GAME_TEST__.getProgress().highestUnlockedLevel === 12);
  const nativeTap = await nativeTapper(mobile);
  const mobileResults = [];
  for (const level of [1, 6, 12]) mobileResults.push(await playWithNaturalRetries(mobile, level, nativeTap));

  const mobileLayout = await mobile.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewport: [innerWidth, innerHeight],
    theme: window.__GAME_TEST__.getThemeContract(),
    selectorButtons: document.querySelectorAll('#level-grid button').length,
  }));
  assert.deepEqual(mobileLayout.viewport, [390, 844]);
  assert.equal(mobileLayout.width, 390);
  assert.equal(mobileLayout.height, 844);
  assert.equal(mobileLayout.selectorButtons, 12);
  assert.equal(mobileLayout.theme.status, 'placeholder');
  assert.equal(mobileLayout.theme.styleLock, false);
  assert.deepEqual(errors, []);
  assert.deepEqual(requestFailures, []);

  const report = {
    schemaVersion: 1,
    artifactType: 'LevelPackBrowserQa',
    passed: true,
    desktop: { viewport: '1180x720', naturalMouse: true, levels: desktopResults },
    mobile: { viewport: '390x844', nativeTouch: true, levels: mobileResults, layout: mobileLayout },
    persistence: { level1UnlockedLevel2: true, refreshRestoredHighestUnlocked: true },
    failureReplay: { level: 4, stayedOnLevel: true, cleanReadyState: true },
    errors: { console: errors, pageerror: [], requestFailures },
    claimBoundary: 'web-lite browser candidate only; no WeChat, Douyin, or TapTap publishability claim',
  };
  await writeFile(`${artifactDirectory}/qa-report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
  await mobile.close();
  await desktop.close();
} finally {
  await browser.close();
}
