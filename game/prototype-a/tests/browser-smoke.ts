import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import type { SliceState } from '../src/game-core';
import type { CutVisualFacts } from '../src/three-cut-visuals';
import type { ThreeRendererFacts } from '../src/three-world-renderer';

const smokeUrl = process.env.SLICE_SMOKE_URL;
assert.ok(smokeUrl, 'SLICE_SMOKE_URL must be supplied by the self-starting qa:browser runner');
const artifactDirectory = 'tests/artifacts/qa-3d-main-v1';

interface CutEvidence {
  targetId: string;
  visibleHalves: number;
  capMaterialIds: string[];
  caps: CutVisualFacts['caps'];
}

interface NaturalRun {
  label: string;
  maxX: number;
  status: SliceState['status'];
  failReason: SliceState['failReason'];
  elapsed: number;
  finishGateId: string | null;
  cuts: number;
  cutEvidence: CutEvidence | null;
  finishPhases: string[];
  totalEarnings: number;
  routeOpeningCount: number;
  finishHighlightedCount: number;
}

interface SigilDropTrace {
  targetId: string;
  y: number[];
  floorY: number;
}

async function readState(page: Page): Promise<SliceState> {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function mouseTap(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  assert.ok(viewport);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

async function createNativeTapper(page: Page): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 440, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

async function verifyNaturalSigilDrop(page: Page, tap: () => Promise<void>, label: string): Promise<SigilDropTrace> {
  await page.evaluate(() => window.__GAME_TEST__.resetGame(22));
  const deadline = Date.now() + 8_000;
  let lastTap = -1;
  let targetId = '';
  while (Date.now() < deadline && !targetId) {
    const state = await readState(page);
    const cut = state.sigils.find((candidate) => candidate.cut);
    if (cut) { targetId = cut.id; break; }
    const projectedHeight = state.player.y + Math.max(0, state.player.vy) * 0.22;
    if (state.worldTime - lastTap >= 0.14 && (state.status === 'ready' || state.status === 'anchored' || (state.status === 'airborne' && projectedHeight > 550 && state.player.vy > -120))) {
      await tap();
      lastTap = state.worldTime;
    }
    await page.waitForTimeout(16);
  }
  assert.ok(targetId, `${label} natural input did not cut a blue sigil`);
  const y: number[] = [];
  let floorY = 0;
  for (let sample = 0; sample < 14; sample += 1) {
    const state = await readState(page);
    const sigil = state.sigils.find((candidate) => candidate.id === targetId)!;
    y.push(sigil.y);
    floorY = state.worldBottom - sigil.radius;
    await page.waitForTimeout(250);
  }
  const final = await readState(page);
  const landed = final.sigils.find((candidate) => candidate.id === targetId)!;
  assert.ok(Math.max(...y) - y[0]! > 100, `${label} sigil did not visibly descend: ${y.join(',')}`);
  assert.ok(Math.abs(landed.y - floorY) < 0.01 && landed.vy === 0, `${label} sigil did not settle at floor ${floorY}: y=${landed.y}, vy=${landed.vy}`);
  await page.screenshot({ path: `${artifactDirectory}/${label}-sigil-grounded.png`, fullPage: true });
  return { targetId, y, floorY };
}

async function waitPerformanceFrames(page: Page, count: number): Promise<void> {
  await page.waitForFunction((expected) => window.__GAME_TEST__.getPerformanceReport().frames >= expected, count, { timeout: 20_000 });
}

function cutEvidenceFrom(render: ThreeRendererFacts): CutEvidence | null {
  const visual = render.cutVisuals.find((candidate) => candidate.phase === 'cut' && candidate.visibleHalves === 2);
  if (!visual) return null;
  return { targetId: visual.id, visibleHalves: visual.visibleHalves, capMaterialIds: visual.capMaterialIds, caps: visual.caps };
}

async function playNaturalCourse(
  page: Page,
  tap: () => Promise<void>,
  targetHeight: number,
  timingPerturbation: number,
  label: string,
  timeoutMs = 36_000,
): Promise<NaturalRun> {
  await page.evaluate(() => window.__GAME_TEST__.resetGame(22));
  const initial = await readState(page);
  let maxX = initial.player.x;
  let lastTapWorldTime = -1;
  let cutEvidence: CutEvidence | null = null;
  const finishPhases: string[] = [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readState(page);
    if (state.finishPhase !== 'idle' && finishPhases.at(-1) !== state.finishPhase) finishPhases.push(state.finishPhase);
    maxX = Math.max(maxX, state.player.x);
    if (state.cuts > 0 && !cutEvidence) {
      await page.waitForTimeout(110);
      const firstFacts = await page.evaluate(() => window.__GAME_TEST__.getRenderState());
      const secondFacts = await page.evaluate(() => window.__GAME_TEST__.getRenderState());
      cutEvidence = cutEvidenceFrom(firstFacts);
      if (cutEvidence) {
        const repeated = secondFacts.cutVisuals.find((candidate) => candidate.id === cutEvidence!.targetId)!;
        assert.equal(repeated.visibleHalves, 2, 'cut event duplicated or removed the half pair');
        assert.deepEqual(repeated.capMaterialIds, cutEvidence.capMaterialIds, 'idempotent sync changed cap identities');
        await page.screenshot({ path: `${artifactDirectory}/${label}-cut-halves.png`, fullPage: true });
      }
    }
    if (state.status === 'failed' || state.status === 'won') {
      await page.screenshot({ path: `${artifactDirectory}/${label}-${state.status}.png`, fullPage: true });
      const render = await page.evaluate(() => window.__GAME_TEST__.getRenderState());
      return { label, maxX, status: state.status, failReason: state.failReason, elapsed: state.elapsed, finishGateId: state.finishGateId, cuts: state.cuts, cutEvidence, finishPhases, totalEarnings: state.totalEarnings, routeOpeningCount: render.routeOpeningCount, finishHighlightedCount: render.finishHighlightedCount };
    }
    const canTap = state.worldTime - lastTapWorldTime >= 0.14;
    const projectedHeight = state.player.y + Math.max(0, state.player.vy) * 0.22;
    const shouldTap = state.status === 'ready'
      || state.status === 'anchored'
      || (state.status === 'airborne' && projectedHeight > targetHeight && state.player.vy > -120 + timingPerturbation);
    if (canTap && shouldTap) {
      await tap();
      lastTapWorldTime = state.worldTime;
    }
    await page.waitForTimeout(16 + Math.max(0, timingPerturbation / 4));
  }
  const state = await readState(page);
  const render = await page.evaluate(() => window.__GAME_TEST__.getRenderState());
  return { label, maxX, status: state.status, failReason: state.failReason, elapsed: state.elapsed, finishGateId: state.finishGateId, cuts: state.cuts, cutEvidence, finishPhases, totalEarnings: state.totalEarnings, routeOpeningCount: render.routeOpeningCount, finishHighlightedCount: render.finishHighlightedCount };
}

async function verifyNaturalFailureReplay(page: Page, tap: () => Promise<void>, label: string): Promise<void> {
  await page.evaluate(() => window.__GAME_TEST__.resetGame(77));
  await tap();
  for (let index = 0; index < 8; index += 1) {
    await page.waitForTimeout(220);
    const state = await readState(page);
    if (state.status === 'failed') break;
    await tap();
  }
  await page.waitForFunction(() => window.__GAME_TEST__.getState().status === 'failed', undefined, { timeout: 20_000 });
  const failed = await readState(page);
  assert.ok(failed.failReason === 'fall' || failed.failReason === 'spike');
  assert.equal(await page.locator('#replay-button').isVisible(), true);
  await page.locator('#replay-button').click();
  const replayed = await readState(page);
  assert.equal(replayed.status, 'ready');
  assert.equal(replayed.failReason, null);
  await page.screenshot({ path: `${artifactDirectory}/${label}-failure-replay.png`, fullPage: true });
}

function assertCutEvidence(evidence: CutEvidence, mobile: boolean): void {
  assert.equal(evidence.visibleHalves, 2);
  assert.equal(new Set(evidence.capMaterialIds).size, 2);
  assert.ok(evidence.capMaterialIds.every((id) => id.includes(evidence.targetId)));
  assert.deepEqual(evidence.caps.map((cap) => cap.half), ['halfA', 'halfB']);
  assert.ok(evidence.caps.every((cap) => cap.materialId.includes(evidence.targetId)));
  assert.ok(evidence.caps.every((cap) => cap.cameraFacingScore > 0.2));
  assert.ok(evidence.caps.every((cap) => Math.abs(Math.hypot(...cap.worldNormal) - 1) < 0.001));
  assert.ok(evidence.caps.every((cap) => Math.abs(cap.worldNormal[0]) + Math.abs(cap.worldNormal[1]) > 0.05), 'cap facts reused fixed +/-Z normals');
  if (mobile) {
    assert.ok(evidence.caps.every((cap) => cap.projection && cap.projection.area >= 16), 'mobile cap projection is too small');
    const [left, right] = evidence.caps.map((cap) => cap.projection!);
    const separation = Math.hypot((left.x + left.width / 2) - (right.x + right.width / 2), (left.y + left.height / 2) - (right.y + right.height / 2));
    assert.ok(separation >= 2, `mobile cap halves do not separate in projection (${separation})`);
  }
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];

try {
  const desktop = await browser.newPage({ viewport: { width: 1180, height: 720 } });
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop console: ${message.text()}`); });
  desktop.on('pageerror', (error) => errors.push(`desktop page: ${error.message}`));
  await desktop.goto(smokeUrl, { waitUntil: 'networkidle' });
  await desktop.waitForFunction(() => Boolean(window.__GAME_TEST__) && window.__GAME_TEST__ === window.__PROTOTYPE_TEST__);
  const desktopSigilDrop = await verifyNaturalSigilDrop(desktop, () => mouseTap(desktop), 'desktop-natural');
  await verifyNaturalFailureReplay(desktop, () => mouseTap(desktop), 'desktop-natural');
  await desktop.screenshot({ path: `${artifactDirectory}/desktop-three-main.png`, fullPage: true });

  const initial = await desktop.evaluate(() => ({
    state: window.__GAME_TEST__.getState(),
    render: window.__GAME_TEST__.getRenderState(),
    theme: window.__GAME_TEST__.getThemeContract(),
    themeDataset: { id: document.documentElement.dataset.theme, status: document.documentElement.dataset.themeStatus },
    canvasCount: document.querySelectorAll('canvas').length,
    aliasesMatch: window.__GAME_TEST__ === window.__PROTOTYPE_TEST__,
    cutPocPresent: '__CUT_POC__' in window,
  }));
  assert.equal(initial.canvasCount, 1);
  assert.equal(initial.aliasesMatch, true);
  assert.equal(initial.cutPocPresent, false);
  assert.equal(initial.render.renderer, 'WebGLRenderer');
  assert.equal(initial.render.cameraProjection, 'perspective');
  assert.ok(initial.render.fov >= 20 && initial.render.fov <= 34);
  assert.equal(initial.render.shadows, false);
  assert.ok(initial.render.dpr <= 1.5);
  assert.equal(initial.render.resourceContract.runtimeKind, 'PROGRAMMATIC_ORIGINAL');
  assert.deepEqual(initial.render.baseColorTextureIds, [
    'a-crate-basecolor',
    'a-log-basecolor',
    'a-knife-basecolor',
    'a-crystal-basecolor',
  ]);
  assert.ok(initial.render.texturedMaterialCount >= 10, 'formal Base Color atlases were not applied to visible model materials');
  assert.ok(initial.render.resourceCounts.textures >= 4, 'renderer did not upload the four formal bitmap atlases');
  assert.deepEqual(initial.theme, { id: 'mechanics-demo-placeholder-v1', status: 'placeholder', styleLock: false, assetCount: 5 });
  assert.deepEqual(initial.themeDataset, { id: initial.theme.id, status: initial.theme.status });
  assert.deepEqual(initial.state.courseSegments.slice(0, 3).map(({ difficulty, role }) => ({ difficulty, role })), [
    { difficulty: 1, role: 'teach' },
    { difficulty: 2, role: 'develop' },
    { difficulty: 3, role: 'test' },
  ]);

  const knifePose = await desktop.evaluate(() => ({ state: window.__GAME_TEST__.getState(), render: window.__GAME_TEST__.getRenderState() }));
  assert.ok(Math.abs(knifePose.render.knifePosition[0] - knifePose.state.player.x / 100) < 0.001);
  assert.ok(Math.abs(knifePose.render.knifePosition[1] - (700 - knifePose.state.player.y) / 100) < 0.001);
  assert.ok(Math.abs(knifePose.render.knifeRotationZ + knifePose.state.player.angle) < 0.001);

  const scenarioRegression = await desktop.evaluate(() => {
    const bridge = window.__GAME_TEST__;
    const movingBefore = bridge.loadScenario('moving-horizontal');
    const movingAfter = bridge.step(0.4);
    bridge.act('flip');
    const inherited = bridge.step(1 / 120);
    bridge.loadScenario('back-contact');
    const rebound = bridge.step(0.25);
    bridge.loadScenario('spike');
    const spike = bridge.step(0.25);
    bridge.loadScenario('fall');
    const fall = bridge.step(1 / 30);
    const bonus = bridge.loadScenario('bonus');
    return {
      movingCarried: movingAfter.anchorId === movingBefore.anchorId && movingAfter.player.x !== movingBefore.player.x,
      inheritedVx: inherited.player.vx,
      rebound: rebound.events.some((event) => event.type === 'bounce') && rebound.player.vx < 0,
      spike: [spike.status, spike.failReason],
      fall: [fall.status, fall.failReason],
      bonusPhase: bonus.phase,
    };
  });
  assert.equal(scenarioRegression.movingCarried, true);
  assert.ok(scenarioRegression.inheritedVx > 190);
  assert.equal(scenarioRegression.rebound, true);
  assert.deepEqual(scenarioRegression.spike, ['failed', 'spike']);
  assert.deepEqual(scenarioRegression.fall, ['failed', 'fall']);
  assert.equal(scenarioRegression.bonusPhase, 'bonus');

  const desktopRuns: NaturalRun[] = [];
  for (const timing of [0, 8, -8]) {
    const run = await playNaturalCourse(desktop, () => mouseTap(desktop), 550, timing, `desktop-natural-${timing < 0 ? 'm8' : timing === 0 ? 'zero' : 'p8'}`);
    desktopRuns.push(run);
    if (run.status === 'won' && run.cutEvidence) break;
  }
  const desktopRun = desktopRuns.find((run) => run.status === 'won' && run.cutEvidence);
  assert.ok(desktopRun, `desktop real-mouse play did not finish with a real cut: ${JSON.stringify(desktopRuns)}`);
  assertCutEvidence(desktopRun.cutEvidence!, false);
  assert.deepEqual(desktopRun.finishPhases, ['contact', 'reward', 'celebration', 'terminal']);
  assert.ok(desktopRun.totalEarnings > 0);
  assert.ok(desktopRun.routeOpeningCount > 0, 'natural route never exposed a cut-open support/bridge');
  assert.ok(desktopRun.finishHighlightedCount > 0, 'finish multiplier wall never highlighted the selected lane');

  const resourceBefore = await desktop.evaluate(() => window.__GAME_TEST__.getRenderState().resourceCounts);
  for (let index = 0; index < 8; index += 1) {
    await desktop.evaluate(() => window.__GAME_TEST__.resetGame(22));
    await desktop.waitForTimeout(40);
  }
  const resourceAfter = await desktop.evaluate(() => window.__GAME_TEST__.getRenderState().resourceCounts);
  assert.deepEqual(resourceAfter, resourceBefore, 'renderer resources grew across deterministic restarts');

  await desktop.evaluate(() => window.__GAME_TEST__.resetPerformanceSamples());
  await waitPerformanceFrames(desktop, 120);
  await desktop.evaluate(() => window.__GAME_TEST__.resetPerformanceSamples());
  await waitPerformanceFrames(desktop, 600);
  const performance = await desktop.evaluate(() => window.__GAME_TEST__.getPerformanceReport());
  assert.equal(performance.frames, 600);
  assert.equal(performance.withinTargets, true, `release performance gate failed: ${JSON.stringify(performance)}`);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`); });
  mobile.on('pageerror', (error) => errors.push(`mobile page: ${error.message}`));
  await mobile.goto(smokeUrl, { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => Boolean(window.__GAME_TEST__));
  const nativeTap = await createNativeTapper(mobile);
  const mobileSigilDrop = await verifyNaturalSigilDrop(mobile, nativeTap, 'mobile-natural');
  await verifyNaturalFailureReplay(mobile, nativeTap, 'mobile-natural');
  await mobile.screenshot({ path: `${artifactDirectory}/mobile-three-main.png`, fullPage: true });
  const mobileInitial = await mobile.evaluate(() => {
    const render = window.__GAME_TEST__.getRenderState();
    const visibleTarget = render.cutVisuals.find((visual) => visual.targetProjection
      && visual.targetProjection.x + visual.targetProjection.width > 0
      && visual.targetProjection.x < innerWidth);
    const safeRects = ['hud', 'instruction-text'].map((id) => {
      const rect = document.getElementById(id)!.getBoundingClientRect();
      return { id, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    });
    return {
      render,
      visibleTarget: visibleTarget?.targetProjection ?? null,
      safeRects,
      noOverflow: getComputedStyle(document.documentElement).touchAction === 'none'
        && document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
    };
  });
  assert.ok(mobileInitial.render.dpr <= 1.5);
  assert.equal(mobileInitial.render.canvasCount, 1);
  assert.ok(mobileInitial.render.knifeProjection);
  assert.ok(mobileInitial.render.knifeProjection.width >= 24 && mobileInitial.render.knifeProjection.height >= 12);
  assert.ok(mobileInitial.render.knifeProjection.x >= 0 && mobileInitial.render.knifeProjection.x + mobileInitial.render.knifeProjection.width <= 390);
  assert.ok(mobileInitial.visibleTarget && mobileInitial.visibleTarget.width >= 20 && mobileInitial.visibleTarget.height >= 20);
  assert.equal(mobileInitial.noOverflow, true);
  assert.ok(mobileInitial.safeRects.every((rect) => rect.x >= 0 && rect.y >= 0 && rect.right <= 390 && rect.bottom <= 844));

  const mobileRuns: NaturalRun[] = [];
  for (const timing of [0, 8, -8]) {
    const run = await playNaturalCourse(mobile, nativeTap, 550, timing, `mobile-natural-${timing < 0 ? 'm8' : timing === 0 ? 'zero' : 'p8'}`, 40_000);
    mobileRuns.push(run);
    if (run.status === 'won' && run.cutEvidence) break;
  }
  const mobileRun = mobileRuns.find((run) => run.status === 'won' && run.cutEvidence);
  assert.ok(mobileRun, `390x844 native-touch play did not finish with a real cut: ${JSON.stringify(mobileRuns)}`);
  assertCutEvidence(mobileRun.cutEvidence!, true);
  assert.deepEqual(mobileRun.finishPhases, ['contact', 'reward', 'celebration', 'terminal']);
  assert.ok(mobileRun.totalEarnings > 0);
  assert.ok(mobileRun.routeOpeningCount > 0, 'mobile natural route never exposed a cut-open support/bridge');
  assert.ok(mobileRun.finishHighlightedCount > 0, 'mobile finish multiplier wall never highlighted the selected lane');
  assert.deepEqual(errors, []);

  const mainSource = await readFile('src/main.ts', 'utf8');
  const releaseHtml = await readFile('dist/index.html', 'utf8');
  assert.doesNotMatch(mainSource, /Phaser|__CUT_POC__/);
  assert.doesNotMatch(releaseHtml, /Phaser|GLTFLoader|DRACOLoader|\.glb\b/i);

  const result = {
    schemaVersion: 1,
    artifactType: 'BrowserSmokeResult',
    passed: true,
    evidence: {
      desktop: { viewport: '1180x720', realMouse: true, sigilDrop: desktopSigilDrop, naturalRuns: desktopRuns },
      mobile: { viewport: '390x844', nativeTouch: true, sigilDrop: mobileSigilDrop, naturalRuns: mobileRuns, metrics: mobileInitial },
      renderer: initial.render,
      themeContract: initial.theme,
      courseBlueprint: initial.state.courseSegments.slice(0, 3).map(({ id, difficulty, role, mechanicIds }) => ({ id, difficulty, role, mechanicIds })),
      scenarioRegression,
      resourceRestart: { before: resourceBefore, after: resourceAfter, stable: true },
      performance: {
        ...performance,
        warmupFrames: 120,
        sampledFrames: 600,
        environment: 'Headless Chromium on the local development machine; evidence is not representative mobile hardware certification.',
      },
    },
    screenshots: [
      'desktop-three-main.png',
      `${desktopRun.label}-cut-halves.png`,
      `${desktopRun.label}-won.png`,
      'mobile-three-main.png',
      `${mobileRun.label}-cut-halves.png`,
      `${mobileRun.label}-won.png`,
    ],
    consoleErrors: errors,
  };
  await writeFile(`${artifactDirectory}/browser-result.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result));
  await mobile.close();
  await desktop.close();
} finally {
  await browser.close();
}
