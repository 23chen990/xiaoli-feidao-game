import playwright from '../../../node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
const { chromium } = playwright;
const url = 'http://127.0.0.1:4182/';
const out = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-v2';
const browser = await chromium.launch({ headless: true });
const log = { events: [], consoleErrors: [], pageErrors: [] };
const state = (page) => page.evaluate(() => window.__PROTOTYPE_TEST__?.getState?.());
const reset = (page, seed) => page.evaluate((s) => window.__PROTOTYPE_TEST__?.resetGame?.(s), seed);
async function tapMouse(page) { const box = await page.locator('[data-action="flip"]').boundingBox(); if (!box) throw new Error('missing action surface'); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); }
async function nativeTap(page, cdp) { const box = await page.locator('[data-action="flip"]').boundingBox(); if (!box) throw new Error('missing action surface'); const x = box.x + box.width / 2; const y = box.y + box.height / 2; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 5, radiusY: 5 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
async function waitNonAirborne(page, timeout = 5000) { await page.waitForFunction(() => !['airborne', 'bonus-airborne'].includes(window.__PROTOTYPE_TEST__.getState().status), undefined, { timeout }); return state(page); }
function monitor(page, label) { page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(`${label}: ${m.text()}`); }); page.on('pageerror', (e) => log.pageErrors.push(`${label}: ${e.message}`)); }
try {
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  monitor(desktop, 'desktop');
  await desktop.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await desktop.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__), undefined, { timeout: 10_000 });
  await reset(desktop, 31);
  await desktop.screenshot({ path: `${out}/feel-initial.png` });
  const initial = await state(desktop);
  log.events.push({ name: 'initial', state: initial });

  // Unassisted run: react only to visible/public landed/ready states with real mouse actions.
  const startWall = Date.now();
  let firstFeedback = null;
  let firstSettled = null;
  const runHistory = [];
  for (let action = 1; action <= 12; action += 1) {
    const before = await state(desktop);
    if (['failed', 'won', 'bonus-failed', 'bonus-won'].includes(before.status)) break;
    await tapMouse(desktop);
    await desktop.waitForTimeout(action % 3 === 0 ? 260 : 60);
    const early = await state(desktop);
    runHistory.push({ action, beforeStatus: before.status, earlyStatus: early.status, x: early.player?.x, y: early.player?.y, angle: early.player?.angle, lastEvent: early.lastEvent, cuts: early.cuts });
    if (!firstFeedback && early.lastEvent && !['ready', 'launched'].includes(early.lastEvent)) firstFeedback = { wallMs: Date.now() - startWall, state: early };
    if (['airborne', 'bonus-airborne'].includes(early.status)) {
      const settled = await waitNonAirborne(desktop).catch(() => state(desktop));
      if (!firstSettled) { firstSettled = settled; await desktop.screenshot({ path: `${out}/feel-first-cut.png` }); }
    }
  }
  log.events.push({ name: 'unassisted', wallMs: Date.now() - startWall, firstFeedback, firstSettled, history: runHistory, final: await state(desktop) });

  // Keyboard edge.
  await reset(desktop, 32);
  await desktop.keyboard.press('Space');
  await desktop.waitForTimeout(100);
  log.events.push({ name: 'space', state: await state(desktop) });

  // Five distinct delay decisions from the same reset; all transitions remain real mouse input.
  const variation = [];
  for (const delay of [0, 120, 240, 400, 650]) {
    await reset(desktop, 41);
    await tapMouse(desktop);
    if (delay) await desktop.waitForTimeout(delay);
    await tapMouse(desktop);
    await desktop.waitForTimeout(350);
    const snapshot = await state(desktop);
    variation.push({ delay, status: snapshot.status, event: snapshot.lastEvent, x: snapshot.player?.x, y: snapshot.player?.y, angle: snapshot.player?.angle, cuts: snapshot.cuts });
  }
  log.events.push({ name: 'variation', variation });

  // Scenario exploration uses deterministic resets after ordinary play; real input drives outcomes.
  const scenarios = [];
  for (const seed of [51, 52, 53, 54, 55, 56, 57, 58]) {
    await reset(desktop, seed);
    const history = [];
    for (let action = 0; action < 14; action += 1) {
      let snapshot = await state(desktop);
      if (['failed', 'won', 'bonus-failed', 'bonus-won'].includes(snapshot.status)) break;
      await tapMouse(desktop);
      await desktop.waitForTimeout(action % 4 === 3 ? 220 : 90);
      snapshot = await state(desktop);
      history.push({ action: action + 1, status: snapshot.status, event: snapshot.lastEvent, x: snapshot.player?.x, y: snapshot.player?.y, cuts: snapshot.cuts, mode: snapshot.mode, multiplier: snapshot.multiplier, bonusScore: snapshot.bonusScore });
      if (['airborne', 'bonus-airborne'].includes(snapshot.status)) await desktop.waitForTimeout(250);
    }
    const final = await state(desktop);
    scenarios.push({ seed, history, final });
    if (final.lastEvent === 'bounce' || history.some((h) => h.event === 'bounce' || h.event === 'anchor')) await desktop.screenshot({ path: `${out}/feel-bounce-or-anchor.png` });
    if (final.status === 'failed') await desktop.screenshot({ path: `${out}/feel-spike-or-fall.png` });
    if (final.status === 'won') await desktop.screenshot({ path: `${out}/feel-finish.png` });
    if (String(final.status).includes('bonus') || final.mode === 'bonus') await desktop.screenshot({ path: `${out}/feel-bonus.png` });
  }
  log.events.push({ name: 'scenarios', scenarios });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  monitor(mobile, 'mobile');
  await mobile.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await mobile.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__), undefined, { timeout: 10_000 });
  await reset(mobile, 61);
  const cdp = await mobile.context().newCDPSession(mobile);
  const mobileBefore = await state(mobile);
  await nativeTap(mobile, cdp);
  await mobile.waitForTimeout(120);
  const mobileAfter = await state(mobile);
  await mobile.screenshot({ path: `${out}/feel-mobile.png` });
  const mobileLayout = await mobile.evaluate(() => ({ innerWidth, innerHeight, scrollX, scrollY, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, touchAction: getComputedStyle(document.documentElement).touchAction }));
  log.events.push({ name: 'mobile', before: mobileBefore, after: mobileAfter, layout: mobileLayout });

  await writeFile(`${out}/feel-console.log`, `${JSON.stringify(log, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, events: log.events.map((e) => e.name), consoleErrors: log.consoleErrors.length, pageErrors: log.pageErrors.length }));
} finally { await browser.close(); }
