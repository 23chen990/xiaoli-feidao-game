import playwright from '../../../node_modules/@playwright/test/index.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = playwright;
const url = process.argv[2] ?? 'http://127.0.0.1:63426/';
const qaRoot = new URL('./', import.meta.url);
const pathFor = (name) => fileURLToPath(new URL(name, qaRoot));
const evidence = {};
const errors = [];
const failedRequests = [];
const browser = await chromium.launch({ headless: true });

function monitor(page, label) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${label} page: ${error.message}`));
  page.on('requestfailed', (request) => failedRequests.push(`${label}: ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

const state = (page) => page.evaluate(() => window.__PROTOTYPE_TEST__.getState());
const reset = (page, seed) => page.evaluate((value) => window.__PROTOTYPE_TEST__.resetGame(value), seed);

async function mouseTap(page) {
  const box = await page.locator('[data-action="flip"]').boundingBox();
  if (!box) throw new Error('missing flip surface');
  await page.mouse.click(box.x + box.width * 0.53, box.y + box.height * 0.55);
}

async function nativeTouchTap(page, cdp) {
  const box = await page.locator('[data-action="flip"]').boundingBox();
  if (!box) throw new Error('missing flip surface');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.54;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function waitForSettled(page, timeout = 3500) {
  await page.waitForFunction(() => {
    const status = window.__PROTOTYPE_TEST__.getState().status;
    return status !== 'airborne';
  }, undefined, { timeout });
  return state(page);
}

// This player reacts only to visible/public ready/landed/airborne states. It never reads elapsed.
async function playFromLandingStates(page, tap, finalBoostDelayMs = 400, firstLandingScreenshot = null) {
  const history = [];
  let launches = 0;
  for (let guard = 0; guard < 8; guard += 1) {
    const before = await state(page);
    history.push({ status: before.status, landedPlatformId: before.landedPlatformId, cuts: before.cuts });
    if (before.status === 'won' || before.status === 'failed') return { state: before, history, launches };
    if (before.status !== 'ready' && before.status !== 'landed') throw new Error(`unexpected pre-launch status ${before.status}`);
    await tap();
    launches += 1;
    if (launches === 5) {
      await page.waitForTimeout(finalBoostDelayMs);
      await tap();
    }
    const settled = await waitForSettled(page);
    history.push({ status: settled.status, landedPlatformId: settled.landedPlatformId, cuts: settled.cuts });
    if (launches === 1 && firstLandingScreenshot) await page.screenshot({ path: firstLandingScreenshot });
    if (settled.status === 'won' || settled.status === 'failed') return { state: settled, history, launches };
  }
  return { state: await state(page), history, launches };
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  monitor(desktop, 'desktop');
  await desktop.goto(url, { waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
  const readyBefore = await reset(desktop, 31);
  await desktop.waitForTimeout(1250);
  const readyAfter = await state(desktop);
  evidence.ready = {
    before: { status: readyBefore.status, x: readyBefore.player.x, y: readyBefore.player.y, seed: readyBefore.seed },
    after: { status: readyAfter.status, x: readyAfter.player.x, y: readyAfter.player.y, failReason: readyAfter.failReason },
    wallWaitMs: 1250,
  };
  await desktop.screenshot({ path: pathFor('desktop-ready.png') });

  await mouseTap(desktop);
  const mouseLaunch = await state(desktop);
  const launchAngle = mouseLaunch.player.angle;
  await desktop.waitForTimeout(120);
  const mouseRotated = await state(desktop);
  evidence.mouseLaunch = { launch: mouseLaunch, after120ms: mouseRotated, rotatedBy: mouseRotated.player.angle - launchAngle };
  const firstLanding = await waitForSettled(desktop);
  evidence.desktopFirstLanding = firstLanding;
  await desktop.screenshot({ path: pathFor('desktop-first-landing.png') });

  await reset(desktop, 32);
  await desktop.keyboard.down('Space');
  const keyboardFirst = await state(desktop);
  await desktop.keyboard.down('Space');
  const keyboardRepeat = await state(desktop);
  await desktop.keyboard.up('Space');
  evidence.keyboard = { first: keyboardFirst, repeat: keyboardRepeat };

  await reset(desktop, 33);
  const complete = await playFromLandingStates(desktop, () => mouseTap(desktop), 400);
  evidence.desktopCompletion = complete;
  await desktop.screenshot({ path: pathFor('desktop-result.png') });

  const tolerance = [];
  for (const delay of [300, 400, 500]) {
    await reset(desktop, 70 + delay);
    const run = await playFromLandingStates(desktop, () => mouseTap(desktop), delay);
    tolerance.push({ delay, status: run.state.status, failReason: run.state.failReason, multiplier: run.state.multiplier, cuts: run.state.cuts, score: run.state.finalScore });
  }
  evidence.reactionTolerance = tolerance;

  const timingVariation = [];
  for (const delay of [180, 650]) {
    await reset(desktop, 91);
    await mouseTap(desktop);
    await desktop.waitForTimeout(delay);
    await mouseTap(desktop);
    await desktop.waitForTimeout(420);
    const sample = await state(desktop);
    timingVariation.push({ delay, x: sample.player.x, y: sample.player.y, vx: sample.player.vx, vy: sample.player.vy, cuts: sample.cuts, status: sample.status });
  }
  evidence.timingVariation = timingVariation;

  // Reach the third launch position using only normal visible-state landings,
  // then one early real boost steers into the visible upper red hazard.
  await reset(desktop, 101);
  for (let index = 0; index < 3; index += 1) {
    await mouseTap(desktop);
    await waitForSettled(desktop);
  }
  const hazardLaunchOrigin = await state(desktop);
  await mouseTap(desktop);
  await desktop.waitForTimeout(170);
  await mouseTap(desktop);
  const hazardFailure = await waitForSettled(desktop, 5000);
  evidence.hazardFailure = { origin: hazardLaunchOrigin, result: hazardFailure };

  // Rapid real air flips miss every receiving surface and leave the top of the world.
  await reset(desktop, 102);
  await mouseTap(desktop);
  for (let index = 0; index < 5; index += 1) {
    await desktop.waitForTimeout(170);
    await mouseTap(desktop);
  }
  await desktop.waitForFunction(() => window.__PROTOTYPE_TEST__.getState().status === 'failed', undefined, { timeout: 5000 });
  const missFailure = await state(desktop);
  evidence.missFailure = missFailure;
  await desktop.screenshot({ path: pathFor('failure.png') });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  monitor(mobile, 'mobile');
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => Boolean(window.__PROTOTYPE_TEST__));
  const cdp = await mobile.context().newCDPSession(mobile);
  await reset(mobile, 41);
  await nativeTouchTap(mobile, cdp);
  const mobileLaunch = await state(mobile);
  const mobileLanding = await waitForSettled(mobile);
  await mobile.screenshot({ path: pathFor('mobile-first-landing.png') });
  const viewport = await mobile.evaluate(() => ({
    touchAction: getComputedStyle(document.documentElement).touchAction,
    scrollX,
    scrollY,
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  const mobileFailureStarted = Date.now();
  let mobileFailure = await state(mobile);
  while (mobileFailure.status !== 'failed' && Date.now() - mobileFailureStarted < 10_000) {
    await nativeTouchTap(mobile, cdp);
    await mobile.waitForTimeout(170);
    mobileFailure = await state(mobile);
  }
  let mobileRestart = mobileFailure;
  if (mobileFailure.status === 'failed') {
    await nativeTouchTap(mobile, cdp);
    mobileRestart = await state(mobile);
  }
  evidence.mobile = { launch: mobileLaunch, landing: mobileLanding, viewport, failure: mobileFailure, restart: mobileRestart };

  const html = await (await fetch(url)).text();
  evidence.expression = {
    hasSliceMasterBrand: /slice\s*master/i.test(html),
    externalUrls: [...html.matchAll(/https?:\/\/[^"'\s<]+/g)].map((match) => match[0]),
    hasOriginalTitle: html.includes('符刃夜行'),
    hasMultipliers: ['×2', '×4', '×8'].every((label) => html.includes(label)),
  };
  evidence.runtime = { errors, failedRequests };
  await writeFile(pathFor('console.log'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
