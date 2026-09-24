const { chromium } = require('@playwright/test');
const { z } = require('zod');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const URL = 'http://127.0.0.1:4198/';
const PREVIEW_PID = Number(process.env.PREVIEW_PID || 0);
const WORKSPACE = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a';
const CHECKPOINT = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/artifacts/builder-checkpoint-choke-fix-v4.json';
const OUTPUT = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-night-independent-final-v4';

const fileMap = {
  checkpoint: CHECKPOINT,
  dist: path.join(WORKSPACE, 'dist/index.html'),
  gameCore: path.join(WORKSPACE, 'src/game-core.ts'),
  theme: path.join(WORKSPACE, 'src/theme.ts'),
};

const runSchema = z.object({
  label: z.string(), platform: z.string(), seed: z.number(), inputPolicy: z.string(), inputCount: z.number().int(),
  maxX: z.number(), status: z.string(), failReason: z.string().nullable(), elapsed: z.number(), finishGateId: z.string().nullable(), cuts: z.number().int(),
  maxNoProgressBounceStreak: z.number().int(), stageIdsVisited: z.array(z.string()), whiteColumnBounceCount: z.number().int(), whiteColumnAnchorCount: z.number().int(),
  bridgeMutationCalls: z.array(z.string()), layout: z.record(z.string(), z.unknown()).optional(), screenshots: z.array(z.string()),
}).strict();
const rawSchema = z.object({
  schemaVersion: z.literal(1), artifactType: z.literal('IndependentNaturalEvidenceV4'), hashesBefore: z.record(z.string(), z.string()), hashesAfter: z.record(z.string(), z.string()),
  desktopRuns: z.array(runSchema).length(5), mobileRuns: z.array(runSchema).length(2), movingSupportDiagnostic: z.record(z.string(), z.unknown()),
  consoleErrors: z.array(z.string()), pageErrors: z.array(z.string()), requestFailures: z.array(z.string()), previewClosed: z.boolean(), testedAt: z.string().datetime(),
}).strict();

function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function hashes() { return Object.fromEntries(Object.entries(fileMap).map(([id, file]) => [id, sha(file)])); }
function round(value, digits = 3) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
async function readState(page) { return page.evaluate(() => window.__GAME_TEST__.getState()); }

async function openPage(browser, mobile, logs) {
  const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1180, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') logs.consoleErrors.push(`${mobile ? 'mobile' : 'desktop'}: ${message.text()}`); });
  page.on('pageerror', (error) => logs.pageErrors.push(`${mobile ? 'mobile' : 'desktop'}: ${error.message}`));
  page.on('requestfailed', (request) => logs.requestFailures.push(`${mobile ? 'mobile' : 'desktop'}: ${request.url()} ${request.failure()?.errorText || ''}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__) && window.__GAME_TEST__ === window.__PROTOTYPE_TEST__ && document.querySelectorAll('canvas').length === 1);
  return { context, page };
}

async function mouseTap(page) { const viewport = page.viewportSize(); await page.mouse.click(viewport.width / 2, viewport.height / 2); }
async function nativeTapper(page) {
  const cdp = await page.context().newCDPSession(page);
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

async function playNatural(page, tap, options) {
  const initial = await readState(page);
  const result = {
    label: options.label, platform: options.platform, seed: initial.seed,
    inputPolicy: `global-height=${options.targetHeight}; vertical-threshold=${options.verticalThreshold}; wait-bias=${options.waitBias}; no obstacle-coordinate oracle`,
    inputCount: 0, maxX: initial.player.x, status: initial.status, failReason: initial.failReason, elapsed: initial.elapsed,
    finishGateId: initial.finishGateId, cuts: initial.cuts, maxNoProgressBounceStreak: 0, stageIdsVisited: [], whiteColumnBounceCount: 0,
    whiteColumnAnchorCount: 0, bridgeMutationCalls: [], screenshots: [],
  };
  const stages = new Set();
  const stageShots = new Set();
  let lastTapWorldTime = -10;
  let lastEventId = 0;
  let lastBounceTarget = '';
  let lastBounceX = -Infinity;
  let streak = 0;
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const current = await readState(page);
    result.maxX = Math.max(result.maxX, current.player.x);
    const segment = current.courseSegments.find((candidate) => current.player.x >= candidate.startX && current.player.x < candidate.endX);
    if (segment) {
      stages.add(segment.id);
      if (!stageShots.has(segment.id)) {
        const shot = path.join(OUTPUT, `${options.label}-${segment.id}.png`);
        await page.screenshot({ path: shot });
        result.screenshots.push(shot);
        stageShots.add(segment.id);
      }
    }
    for (const event of current.events) {
      if (event.id <= lastEventId) continue;
      lastEventId = Math.max(lastEventId, event.id);
      if (event.type === 'bounce') {
        streak = event.targetId === lastBounceTarget && Math.abs(event.x - lastBounceX) < 28 ? streak + 1 : 1;
        lastBounceTarget = event.targetId || '';
        lastBounceX = event.x;
        result.maxNoProgressBounceStreak = Math.max(result.maxNoProgressBounceStreak, streak);
        if (event.targetId === 'white-column') result.whiteColumnBounceCount += 1;
      }
      if (event.type === 'anchor' && event.targetId === 'white-column') result.whiteColumnAnchorCount += 1;
    }
    if (current.status === 'won' || current.status === 'failed') {
      result.status = current.status;
      result.failReason = current.failReason;
      result.elapsed = round(current.elapsed);
      result.finishGateId = current.finishGateId;
      result.cuts = current.cuts;
      result.stageIdsVisited = [...stages];
      const shot = path.join(OUTPUT, `${options.label}-${current.status}.png`);
      await page.screenshot({ path: shot });
      result.screenshots.push(shot);
      return result;
    }
    const canTap = current.worldTime - lastTapWorldTime >= 0.14;
    const projectedY = current.player.y + Math.max(0, current.player.vy) * 0.22;
    const shouldTap = current.status === 'ready' || current.status === 'anchored'
      || (current.status === 'airborne' && projectedY > options.targetHeight && current.player.vy > options.verticalThreshold);
    if (canTap && shouldTap) {
      await tap();
      result.inputCount += 1;
      lastTapWorldTime = current.worldTime;
    }
    await page.waitForTimeout(16 + options.waitBias);
  }
  const current = await readState(page);
  result.status = current.status;
  result.failReason = current.failReason;
  result.elapsed = round(current.elapsed);
  result.finishGateId = current.finishGateId;
  result.cuts = current.cuts;
  result.stageIdsVisited = [...stages];
  const shot = path.join(OUTPUT, `${options.label}-timeout.png`);
  await page.screenshot({ path: shot });
  result.screenshots.push(shot);
  return result;
}

async function scanMovingSupport(page) {
  return page.evaluate(() => {
    const bridge = window.__GAME_TEST__;
    const configs = [
      { scenario: 'moving-horizontal', holdSteps: 180, followupStep: 15 },
      ...['moving-horizontal', 'moving-vertical'].flatMap((scenario) => [0, 45, 90, 135, 180, 225, 270, 315].flatMap((holdSteps) => [null, 15, 30, 45, 60, 90].map((followupStep) => ({ scenario, holdSteps, followupStep })))),
    ];
    const attempts = [];
    for (const config of configs) {
      const loaded = bridge.loadScenario(config.scenario);
      const supportId = loaded.anchorId;
      for (let step = 0; step < config.holdSteps; step += 1) bridge.step(1 / 120);
      const release = bridge.getState();
      const releaseSupport = release.supports.find((item) => item.id === supportId);
      bridge.act('flip');
      let previous = bridge.getState();
      let found = null;
      for (let step = 0; step < 360; step += 1) {
        if (config.followupStep !== null && step === config.followupStep) bridge.act('flip');
        const before = previous;
        const beforeSupport = before.supports.find((item) => item.id === supportId);
        const eventId = before.events.at(-1)?.id || 0;
        const after = bridge.step(1 / 120);
        const afterSupport = after.supports.find((item) => item.id === supportId);
        const event = after.events.find((item) => item.id > eventId && item.type === 'bounce' && item.targetId === supportId);
        if (event && beforeSupport && afterSupport) {
          const inX = before.player.vx - beforeSupport.vx;
          const inY = before.player.vy - beforeSupport.vy;
          const outX = after.player.vx - afterSupport.vx;
          const outY = after.player.vy - afterSupport.vy;
          const inNormal = inX * (event.normalX || 0) + inY * (event.normalY || 0);
          const outNormal = outX * (event.normalX || 0) + outY * (event.normalY || 0);
          let later = after;
          for (let lock = 0; lock < 22; lock += 1) later = bridge.step(1 / 120);
          const impulseCount = later.events.filter((item) => item.type === 'bounce' && item.targetId === supportId && item.id >= event.id).length;
          found = {
            provenance: 'TARGETED_DIAGNOSTIC', scenario: config.scenario, supportId, holdSteps: config.holdSteps, followupStep: config.followupStep,
            contactPart: event.contactPart, normalX: event.normalX, normalY: event.normalY,
            surfaceVelocityBefore: { vx: beforeSupport.vx, vy: beforeSupport.vy }, playerVelocityBefore: { vx: before.player.vx, vy: before.player.vy },
            incomingRelativeVelocity: { vx: inX, vy: inY, normal: inNormal }, surfaceVelocityAfter: { vx: afterSupport.vx, vy: afterSupport.vy },
            playerVelocityAfter: { vx: after.player.vx, vy: after.player.vy }, outgoingRelativeVelocity: { vx: outX, vy: outY, normal: outNormal },
            impulseCountDuringLockout: impulseCount, reflected: inNormal < 0 && outNormal > 0 && impulseCount === 1,
          };
          break;
        }
        previous = after;
        if (after.status === 'won' || after.status === 'failed' || after.status === 'anchored') break;
      }
      attempts.push({ ...config, releaseSurfaceVelocity: releaseSupport ? { vx: releaseSupport.vx, vy: releaseSupport.vy } : null, found: Boolean(found) });
      if (found && ['body', 'handle'].includes(found.contactPart)) return { found, attempts };
    }
    return { found: null, attempts };
  });
}

async function main() {
  await fsp.mkdir(OUTPUT, { recursive: true });
  const hashesBefore = hashes();
  const logs = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  const desktopRuns = [];
  const mobileRuns = [];
  let movingSupportDiagnostic = { found: null, attempts: [] };
  let previewClosed = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopPolicies = [
      { targetHeight: 530, verticalThreshold: -128, waitBias: 0 },
      { targetHeight: 540, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 550, verticalThreshold: -120, waitBias: 2 },
      { targetHeight: 560, verticalThreshold: -116, waitBias: 3 },
      { targetHeight: 570, verticalThreshold: -112, waitBias: 4 },
    ];
    for (let index = 0; index < desktopPolicies.length; index += 1) {
      const { context, page } = await openPage(browser, false, logs);
      const result = await playNatural(page, () => mouseTap(page), { ...desktopPolicies[index], label: `desktop-natural-${index + 1}`, platform: 'desktop-real-mouse', timeoutMs: 36_000 });
      desktopRuns.push(runSchema.parse(result));
      await fsp.writeFile(path.join(OUTPUT, 'natural-checkpoint.json'), `${JSON.stringify({ desktopRuns, mobileRuns }, null, 2)}\n`);
      await context.close();
    }
    const mobilePolicies = [
      { targetHeight: 535, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 555, verticalThreshold: -116, waitBias: 3 },
    ];
    for (let index = 0; index < mobilePolicies.length; index += 1) {
      const { context, page } = await openPage(browser, true, logs);
      const tap = await nativeTapper(page);
      const result = await playNatural(page, tap, { ...mobilePolicies[index], label: `mobile-natural-${index + 1}`, platform: '390x844-native-touch', timeoutMs: 40_000 });
      result.layout = await page.evaluate(() => ({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, touchAction: getComputedStyle(document.documentElement).touchAction, canvasCount: document.querySelectorAll('canvas').length }));
      mobileRuns.push(runSchema.parse(result));
      await fsp.writeFile(path.join(OUTPUT, 'natural-checkpoint.json'), `${JSON.stringify({ desktopRuns, mobileRuns }, null, 2)}\n`);
      await context.close();
    }
    const targeted = await openPage(browser, false, logs);
    movingSupportDiagnostic = await scanMovingSupport(targeted.page);
    await fsp.writeFile(path.join(OUTPUT, 'moving-checkpoint.json'), `${JSON.stringify(movingSupportDiagnostic, null, 2)}\n`);
    if (movingSupportDiagnostic.found) {
      const shot = path.join(OUTPUT, 'moving-support-targeted.png');
      await targeted.page.screenshot({ path: shot });
      movingSupportDiagnostic.screenshot = shot;
    }
    await targeted.context.close();
  } finally {
    await browser.close();
    if (PREVIEW_PID > 0) {
      try { process.kill(PREVIEW_PID, 'SIGTERM'); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 160));
      try { process.kill(PREVIEW_PID, 0); previewClosed = false; } catch { previewClosed = true; }
    }
  }
  const raw = rawSchema.parse({
    schemaVersion: 1, artifactType: 'IndependentNaturalEvidenceV4', hashesBefore, hashesAfter: hashes(), desktopRuns, mobileRuns, movingSupportDiagnostic,
    ...logs, previewClosed, testedAt: new Date().toISOString(),
  });
  const rawPath = path.join(OUTPUT, 'natural-evidence.json');
  await fsp.writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
  rawSchema.parse(JSON.parse(await fsp.readFile(rawPath, 'utf8')));
  await fsp.writeFile(path.join(OUTPUT, 'console.log'), [...logs.consoleErrors, ...logs.pageErrors, ...logs.requestFailures].join('\n') || 'No console errors, pageerrors, or request failures.\n');
  process.stdout.write(`${JSON.stringify({ rawPath, rawSha256: sha(rawPath), desktop: desktopRuns.map((run) => ({ label: run.label, status: run.status, maxX: round(run.maxX), streak: run.maxNoProgressBounceStreak })), mobile: mobileRuns.map((run) => ({ label: run.label, status: run.status, maxX: round(run.maxX), streak: run.maxNoProgressBounceStreak })), moving: movingSupportDiagnostic.found, errors: logs, previewClosed }, null, 2)}\n`);
}

main().catch(async (error) => {
  await fsp.mkdir(OUTPUT, { recursive: true });
  await fsp.writeFile(path.join(OUTPUT, 'runner-error.log'), `${error.stack || String(error)}\n`);
  if (PREVIEW_PID > 0) { try { process.kill(PREVIEW_PID, 'SIGTERM'); } catch {} }
  process.stderr.write(`${error.stack || String(error)}\n`);
  process.exitCode = 1;
});
