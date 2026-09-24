import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const smokeUrl = process.env.CUT_POC_SMOKE_URL;
assert.ok(smokeUrl, 'CUT_POC_SMOKE_URL must be supplied by the self-starting qa:3d runner');
const artifactDirectory = 'tests/artifacts/qa-3d-cut-poc';

async function readState(page: Page) {
  return page.evaluate(() => window.__CUT_POC__.getState());
}

async function cutAndCapture(page: Page, kind: 'crate' | 'log' | 'crystal', screenshot: string): Promise<void> {
  const before = await readState(page);
  assert.equal(before.kind, kind);
  assert.equal(before.phase, 'intact');
  await page.locator('#cut-button').click();
  await page.waitForFunction(() => window.__CUT_POC__.getState().phase === 'cut');
  await page.waitForFunction((previousImpactCount) => window.__CUT_POC__.getState().impactCount > previousImpactCount, before.impactCount);
  const facts = await page.evaluate(() => window.__CUT_POC__.getSceneFacts());
  assert.ok(facts.feedbackLayers.length >= 5, `${kind} cut did not fire the full feedback bundle`);
  if (kind === 'crate') {
    await page.evaluate(() => window.__CUT_POC__.seekFeedbackForQa(206));
    await page.waitForTimeout(32);
    await page.screenshot({ path: `${artifactDirectory}/desktop-impact-crate.png` });
    await page.evaluate(() => window.__CUT_POC__.releaseFeedbackQaHold());
  }
  await page.waitForFunction(() => window.__CUT_POC__.getState().lowestPieceOffsetY < -0.14, undefined, { timeout: 5_000 });
  const after = await readState(page);
  assert.equal(after.kind, kind);
  assert.equal(after.renderedPieceCount, 2, `${kind} did not render as two pieces`);
  assert.equal(after.capMaterialCount, 2, `${kind} did not cap both halves`);
  assert.ok(after.groundedPieceCount >= 1, `${kind} halves did not enter a settled landing state`);
  assert.ok(after.lowestPieceOffsetY < -0.14, `${kind} halves did not settle onto the platform`);
  await page.screenshot({ path: `${artifactDirectory}/${screenshot}` });
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  await page.goto(smokeUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__CUT_POC__));
  await page.waitForFunction(() => window.__CUT_POC__.getState().externalAssetStatus !== 'loading');

  const initial = await readState(page);
  const skinFacts = await page.evaluate(() => {
    const state = window.__CUT_POC__.getState() as unknown as Record<string, unknown>;
    return {
      skinId: state.skinId,
      baseColorTextureCount: state.baseColorTextureCount,
      knifeAtlasPartCount: state.knifeAtlasPartCount,
      proceduralTextureCount: state.proceduralTextureCount,
      texturedMaterialCount: state.texturedMaterialCount,
      environmentLighting: state.environmentLighting,
    };
  });
  const facts = await page.evaluate(() => window.__CUT_POC__.getSceneFacts());
  const canvasFacts = await page.locator('#poc-canvas canvas').evaluate((canvas) => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  }));
  assert.equal(initial.externalAssetStatus, 'loaded', 'hash-pinned Kenney GLB resources did not load');
  assert.equal(initial.weaponAssetStatus, 'loaded', 'selected CC0 sword GLB did not load');
  assert.equal(skinFacts.skinId, 'fresh-a-bitmap-v1');
  assert.equal(skinFacts.baseColorTextureCount, 4, 'formal A Base Color atlas set is incomplete');
  assert.equal(skinFacts.knifeAtlasPartCount, 2, 'single-mesh knife did not split into blade and handle atlas regions');
  assert.ok(Number(skinFacts.proceduralTextureCount) >= 3, 'supporting procedural texture set is incomplete');
  assert.ok(Number(skinFacts.texturedMaterialCount) >= 6, 'visible surfaces did not receive the new skin');
  assert.equal(skinFacts.environmentLighting, true, 'PBR skin has no image-based environment lighting');
  assert.equal(initial.cameraProjection, 'orthographic');
  assert.deepEqual(facts.cuttableKinds, ['crate', 'log', 'crystal']);
  assert.ok(Math.abs(facts.cameraPosition[0] - facts.cameraTarget[0]) > 2, 'camera has no side offset');
  assert.ok(facts.cameraPosition[1] - facts.cameraTarget[1] > 2, 'camera has no downward angle');
  assert.ok(facts.cameraPosition[2] - facts.cameraTarget[2] > 2, 'camera has no depth offset');
  assert.ok(canvasFacts.width >= 1_200 && canvasFacts.height >= 700);
  await page.screenshot({ path: `${artifactDirectory}/desktop-intact-crate.png` });

  await cutAndCapture(page, 'crate', 'desktop-cut-crate.png');
  await page.locator('#cut-button').click();
  await cutAndCapture(page, 'log', 'desktop-cut-log.png');
  await page.locator('#cut-button').click();
  await cutAndCapture(page, 'crystal', 'desktop-cut-crystal.png');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`); });
  mobile.on('pageerror', (error) => errors.push(`mobile page: ${error.message}`));
  await mobile.goto(smokeUrl, { waitUntil: 'networkidle' });
  await mobile.waitForFunction(() => window.__CUT_POC__?.getState().externalAssetStatus === 'loaded');
  const noOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && document.documentElement.scrollHeight <= innerHeight);
  await mobile.tap('#cut-button');
  await mobile.waitForFunction(() => window.__CUT_POC__.getState().phase === 'cut');
  await mobile.waitForFunction(() => window.__CUT_POC__.getState().lowestPieceOffsetY < -0.14, undefined, { timeout: 5_000 });
  await mobile.screenshot({ path: `${artifactDirectory}/mobile-cut-crate.png` });
  const mobileCut = await readState(mobile);
  assert.equal(mobileCut.capMaterialCount, 2);
  assert.ok(mobileCut.groundedPieceCount >= 1);
  assert.ok(mobileCut.lowestPieceOffsetY < -0.14);
  assert.equal(noOverflow, true, 'mobile POC overflows its viewport');
  await mobile.close();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    schemaVersion: 1,
    artifactType: 'ThreeCutPocBrowserSmokeResult',
    passed: true,
    evidence: {
      desktop: [
        'desktop-intact-crate.png',
        'desktop-impact-crate.png',
        'desktop-cut-crate.png',
        'desktop-cut-log.png',
        'desktop-cut-crystal.png',
      ],
      mobile: ['mobile-cut-crate.png'],
      externalAssetStatus: initial.externalAssetStatus,
      cameraProjection: initial.cameraProjection,
      canvasFacts,
    },
    consoleErrors: errors,
  }));
} finally {
  await browser.close();
}
