const { chromium } = require('@playwright/test');
const { z } = require('zod');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const RUN = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830';
const WORKSPACE = path.join(RUN, 'workspace/prototype-a');
const OUTPUT = path.join(RUN, 'qa-night-builder-fix-v3');
const BUILD = path.join(WORKSPACE, 'dist/index.html');

const runSchema = z.object({
  label: z.string(),
  platform: z.enum(['desktop-real-mouse', '390x844-native-touch']),
  inputPolicy: z.string(),
  status: z.enum(['ready', 'airborne', 'anchored', 'failed', 'won']),
  failReason: z.enum(['fall', 'spike']).nullable(),
  maxX: z.number(),
  elapsed: z.number(),
  cuts: z.number().int().nonnegative(),
  finishGateId: z.string().nullable(),
  maxNoProgressBounceStreak: z.number().int().nonnegative(),
  whiteColumnBounceCount: z.number().int().nonnegative(),
  whiteColumnAnchorCount: z.number().int().nonnegative(),
  stageIdsVisited: z.array(z.string()),
  inputCount: z.number().int().nonnegative(),
  screenshot: z.string(),
}).strict();

const reportSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('NaturalInputContractQa'),
  workspace: z.literal(WORKSPACE),
  buildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  testedAt: z.string().datetime(),
  inputContract: z.object({ desktopAttempts: z.literal(5), mobileAttempts: z.literal(2), obstacleCoordinateOracle: z.literal(false) }).strict(),
  desktopRuns: z.array(runSchema).length(5),
  mobileRuns: z.array(runSchema).length(2),
  summary: z.object({
    desktopWins: z.number().int(), desktopChokePasses: z.number().int(), mobileWins: z.number().int(), mobileChokePasses: z.number().int(),
    maxNoProgressBounceStreak: z.number().int(), fullStageDesktopWin: z.boolean(), fullStageMobileWin: z.boolean(),
  }).strict(),
  blockerClosed: z.boolean(),
  passed: z.boolean(),
  consoleErrors: z.array(z.string()),
  pageErrors: z.array(z.string()),
  requestFailures: z.array(z.string()),
  previewClosed: z.boolean(),
  validatedWith: z.literal('zod@4 strict NaturalInputContractQa'),
}).strict();

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve QA port');
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForPreview(url, preview) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (preview.exitCode !== null) throw new Error(`Preview exited early (${preview.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Preview unavailable: ${url}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return true;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
  return child.exitCode !== null || child.killed;
}

async function openPage(browser, mobile, url, diagnostics) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    : { viewport: { width: 1180, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') diagnostics.consoleErrors.push(`${mobile ? 'mobile' : 'desktop'}: ${message.text()}`); });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(`${mobile ? 'mobile' : 'desktop'}: ${error.message}`));
  page.on('requestfailed', (request) => diagnostics.requestFailures.push(`${mobile ? 'mobile' : 'desktop'}: ${request.url()} ${request.failure()?.errorText || ''}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__) && document.querySelectorAll('canvas').length === 1);
  return { context, page };
}

async function mouseTap(page) {
  const viewport = page.viewportSize();
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
}

async function nativeTapper(page) {
  const cdp = await page.context().newCDPSession(page);
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 422, radiusX: 4, radiusY: 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
}

async function playNatural(page, tap, options) {
  let lastTapWorldTime = -10;
  let lastEventId = 0;
  let lastBounceX = -Infinity;
  let lastBounceTarget = '';
  let bounceStreak = 0;
  let maxNoProgressBounceStreak = 0;
  let maxX = 0;
  let inputCount = 0;
  let whiteColumnBounceCount = 0;
  let whiteColumnAnchorCount = 0;
  const stageIdsVisited = new Set();
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.__GAME_TEST__.getState());
    maxX = Math.max(maxX, state.player.x);
    const segment = state.courseSegments.find((candidate) => state.player.x >= candidate.startX && state.player.x < candidate.endX);
    if (segment) stageIdsVisited.add(segment.id);
    for (const event of state.events) {
      if (event.id <= lastEventId) continue;
      lastEventId = Math.max(lastEventId, event.id);
      if (event.type === 'bounce') {
        bounceStreak = event.targetId === lastBounceTarget && Math.abs(event.x - lastBounceX) < 28 ? bounceStreak + 1 : 1;
        lastBounceTarget = event.targetId || '';
        lastBounceX = event.x;
        maxNoProgressBounceStreak = Math.max(maxNoProgressBounceStreak, bounceStreak);
        if (event.targetId === 'white-column') whiteColumnBounceCount += 1;
      }
      if (event.type === 'anchor' && event.targetId === 'white-column') whiteColumnAnchorCount += 1;
    }
    if (state.status === 'failed' || state.status === 'won') break;
    const canTap = state.worldTime - lastTapWorldTime >= 0.14;
    const projectedY = state.player.y + Math.max(0, state.player.vy) * 0.22;
    const shouldTap = state.status === 'ready'
      || state.status === 'anchored'
      || (state.status === 'airborne' && projectedY > options.targetHeight && state.player.vy > options.verticalThreshold);
    if (canTap && shouldTap) {
      await tap();
      inputCount += 1;
      lastTapWorldTime = state.worldTime;
    }
    await page.waitForTimeout(16 + options.waitBias);
  }

  const state = await page.evaluate(() => window.__GAME_TEST__.getState());
  maxX = Math.max(maxX, state.player.x);
  const screenshot = path.join(OUTPUT, `${options.label}-${state.status}.png`);
  await page.screenshot({ path: screenshot });
  return {
    label: options.label,
    platform: options.platform,
    inputPolicy: `global-height=${options.targetHeight}; vertical-threshold=${options.verticalThreshold}; wait-bias=${options.waitBias}; no obstacle-coordinate oracle`,
    status: state.status,
    failReason: state.failReason,
    maxX,
    elapsed: state.elapsed,
    cuts: state.cuts,
    finishGateId: state.finishGateId,
    maxNoProgressBounceStreak,
    whiteColumnBounceCount,
    whiteColumnAnchorCount,
    stageIdsVisited: [...stageIdsVisited],
    inputCount,
    screenshot,
  };
}

async function main() {
  await fsp.mkdir(OUTPUT, { recursive: true });
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  const desktopRuns = [];
  const mobileRuns = [];
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}/`;
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: WORKSPACE,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk.toString(); });
  preview.stderr.on('data', (chunk) => { previewLog += chunk.toString(); });
  let previewClosed = false;
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForPreview(url, preview);
    const desktopVariants = [
      { targetHeight: 530, verticalThreshold: -128, waitBias: 0 },
      { targetHeight: 540, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 550, verticalThreshold: -120, waitBias: 2 },
      { targetHeight: 560, verticalThreshold: -116, waitBias: 3 },
      { targetHeight: 570, verticalThreshold: -112, waitBias: 4 },
    ];
    for (let index = 0; index < desktopVariants.length; index += 1) {
      const opened = await openPage(browser, false, url, diagnostics);
      desktopRuns.push(await playNatural(opened.page, () => mouseTap(opened.page), {
        ...desktopVariants[index], label: `desktop-natural-${index + 1}`, platform: 'desktop-real-mouse', timeoutMs: 36_000,
      }));
      await opened.context.close();
    }
    const mobileVariants = [
      { targetHeight: 535, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 555, verticalThreshold: -116, waitBias: 3 },
    ];
    for (let index = 0; index < mobileVariants.length; index += 1) {
      const opened = await openPage(browser, true, url, diagnostics);
      const tap = await nativeTapper(opened.page);
      mobileRuns.push(await playNatural(opened.page, tap, {
        ...mobileVariants[index], label: `mobile-natural-${index + 1}`, platform: '390x844-native-touch', timeoutMs: 40_000,
      }));
      await opened.context.close();
    }
  } finally {
    await browser.close();
    previewClosed = await stopProcess(preview);
  }

  const stages = ['stage-1-read-and-cut', 'stage-2-recover-and-choose', 'stage-3-structure-and-finish'];
  const summary = {
    desktopWins: desktopRuns.filter((run) => run.status === 'won').length,
    desktopChokePasses: desktopRuns.filter((run) => run.maxX > 1650).length,
    mobileWins: mobileRuns.filter((run) => run.status === 'won').length,
    mobileChokePasses: mobileRuns.filter((run) => run.maxX > 1650).length,
    maxNoProgressBounceStreak: Math.max(...desktopRuns.map((run) => run.maxNoProgressBounceStreak), ...mobileRuns.map((run) => run.maxNoProgressBounceStreak)),
    fullStageDesktopWin: desktopRuns.some((run) => run.status === 'won' && stages.every((stage) => run.stageIdsVisited.includes(stage))),
    fullStageMobileWin: mobileRuns.some((run) => run.status === 'won' && stages.every((stage) => run.stageIdsVisited.includes(stage))),
  };
  const blockerClosed = summary.desktopChokePasses === 5 && summary.mobileChokePasses === 2 && summary.maxNoProgressBounceStreak < 3;
  const passed = blockerClosed && summary.desktopWins >= 3 && summary.mobileWins >= 1 && summary.fullStageDesktopWin && summary.fullStageMobileWin
    && diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0 && diagnostics.requestFailures.length === 0 && previewClosed;
  const report = reportSchema.parse({
    schemaVersion: 1,
    artifactType: 'NaturalInputContractQa',
    workspace: WORKSPACE,
    buildSha256: sha256(BUILD),
    testedAt: new Date().toISOString(),
    inputContract: { desktopAttempts: 5, mobileAttempts: 2, obstacleCoordinateOracle: false },
    desktopRuns,
    mobileRuns,
    summary,
    blockerClosed,
    passed,
    ...diagnostics,
    previewClosed,
    validatedWith: 'zod@4 strict NaturalInputContractQa',
  });
  await fsp.writeFile(path.join(OUTPUT, 'natural-contract-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fsp.writeFile(path.join(OUTPUT, 'console.log'), [previewLog.trim(), diagnostics.consoleErrors.join('\n'), diagnostics.pageErrors.join('\n')].filter(Boolean).join('\n') || 'No console or page errors.');
  console.log(JSON.stringify({ passed: report.passed, blockerClosed: report.blockerClosed, summary: report.summary }));
  if (!report.passed) process.exitCode = 1;
}

main().catch(async (error) => {
  await fsp.mkdir(OUTPUT, { recursive: true });
  await fsp.writeFile(path.join(OUTPUT, 'runner-error.log'), `${error.stack || error}\n`);
  console.error(error);
  process.exitCode = 1;
});
