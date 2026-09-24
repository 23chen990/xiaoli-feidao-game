const { chromium } = require('@playwright/test');
const { z } = require('zod');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const URL = 'http://127.0.0.1:4196/';
const WORKSPACE = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a';
const OUTPUT = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-night-readonly-v1';
const BUILD = path.join(WORKSPACE, 'dist/index.html');
const PREVIEW_PID = Number(process.env.PREVIEW_PID || 0);

const caseSchema = z.object({
  id: z.string(),
  title: z.string(),
  provenance: z.enum(['NATURAL_INPUT', 'TARGETED_DIAGNOSTIC']),
  repeatableSteps: z.array(z.string()),
  expected: z.array(z.string()),
  actual: z.array(z.string()),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE']),
  mechanicalCause: z.string(),
  acceptanceCriteria: z.array(z.string()),
  suggestedTests: z.array(z.string()),
  evidence: z.array(z.string()),
}).strict();

const issueSchema = z.object({
  caseId: z.string(),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']),
  summary: z.string(),
}).strict();

const artifactSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('NightReadOnlyMechanicsQaArtifact'),
  targetGame: z.string(),
  workspace: z.string(),
  buildSha256Before: z.string().regex(/^[a-f0-9]{64}$/),
  buildSha256After: z.string().regex(/^[a-f0-9]{64}$/),
  testedAt: z.string().datetime(),
  passed: z.boolean(),
  cases: z.array(caseSchema),
  issues: z.array(issueSchema),
  summary: z.object({
    naturalDesktopWins: z.number().int().nonnegative(),
    naturalDesktopAttempts: z.number().int().nonnegative(),
    naturalMobileWins: z.number().int().nonnegative(),
    naturalMobileAttempts: z.number().int().nonnegative(),
    reboundVerdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
    chokeVerdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  }).strict(),
  validatedWith: z.string(),
  previewClosed: z.boolean(),
}).strict();

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

async function state(page) {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function newPage(browser, mobile, errors) {
  const context = await browser.newContext(mobile ? {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  } : { viewport: { width: 1180, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${mobile ? 'mobile' : 'desktop'} console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${mobile ? 'mobile' : 'desktop'} page: ${error.message}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__GAME_TEST__) && document.querySelectorAll('canvas').length === 1);
  return { context, page };
}

async function desktopTap(page) {
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
  const initial = await state(page);
  const result = {
    label: options.label,
    platform: options.platform,
    seed: initial.seed,
    inputPolicy: `global-height=${options.targetHeight}; vertical-trend only; no obstacle coordinate oracle`,
    inputCount: 0,
    maxX: initial.player.x,
    status: initial.status,
    failReason: initial.failReason,
    elapsed: initial.elapsed,
    finishGateId: initial.finishGateId,
    maxNoProgressBounceStreak: 0,
    cuts: initial.cuts,
    whiteColumnEvents: [],
    bounceEvents: [],
    anchorEvents: [],
    cutEvents: [],
    courseSummary: {
      segments: initial.courseSegments.map((segment) => ({ id: segment.id, label: segment.label, startX: segment.startX, endX: segment.endX })),
      bands: initial.courseSegments.map((segment) => ({
        id: segment.id,
        sigils: initial.sigils.filter((item) => item.x >= segment.startX && item.x < segment.endX).length,
        blocks: initial.blocks.filter((item) => item.x >= segment.startX && item.x < segment.endX).map((item) => ({ id: item.id, placement: item.placement, dualRole: item.dualRole })),
        supports: initial.supports.filter((item) => item.x >= segment.startX && item.x < segment.endX).map((item) => ({ id: item.id, movingAxis: item.motion?.axis || null })),
        spikes: initial.spikes.filter((item) => item.x >= segment.startX && item.x < segment.endX).map((item) => item.id),
      })),
      finishKinds: initial.finishOptions.map((item) => item.kind),
    },
    screenshots: [],
  };
  let lastTapWorldTime = -10;
  let lastEventId = 0;
  let lastBounceX = -Infinity;
  let lastBounceTarget = '';
  let bounceStreak = 0;
  let beforeCaptured = false;
  let afterCaptured = false;
  const deadline = Date.now() + (options.timeoutMs || 35_000);
  while (Date.now() < deadline) {
    const current = await state(page);
    result.maxX = Math.max(result.maxX, current.player.x);
    for (const event of current.events) {
      if (event.id <= lastEventId) continue;
      lastEventId = Math.max(lastEventId, event.id);
      const compact = {
        id: event.id,
        type: event.type,
        targetId: event.targetId || null,
        contactPart: event.contactPart || null,
        normalX: event.normalX ?? null,
        normalY: event.normalY ?? null,
        x: round(event.x),
        y: round(event.y),
        playerVx: round(current.player.vx),
        playerVy: round(current.player.vy),
        worldTime: round(current.worldTime),
      };
      if (event.type === 'bounce') {
        result.bounceEvents.push(compact);
        bounceStreak = event.targetId === lastBounceTarget && Math.abs(event.x - lastBounceX) < 28 ? bounceStreak + 1 : 1;
        lastBounceX = event.x;
        lastBounceTarget = event.targetId || '';
        result.maxNoProgressBounceStreak = Math.max(result.maxNoProgressBounceStreak, bounceStreak);
      }
      if (event.type === 'anchor') result.anchorEvents.push(compact);
      if (event.type === 'cut') result.cutEvents.push(compact);
      if (event.targetId === 'white-column' && (event.type === 'bounce' || event.type === 'anchor')) {
        result.whiteColumnEvents.push(compact);
        const shot = path.join(OUTPUT, `${options.label}-white-column-${event.type}.png`);
        await page.screenshot({ path: shot });
        result.screenshots.push(shot);
      }
    }
    if (!beforeCaptured && result.maxX > 1080) {
      const shot = path.join(OUTPUT, `${options.label}-choke-before.png`);
      await page.screenshot({ path: shot });
      result.screenshots.push(shot);
      beforeCaptured = true;
    }
    if (!afterCaptured && result.maxX > 1650) {
      const shot = path.join(OUTPUT, `${options.label}-choke-after.png`);
      await page.screenshot({ path: shot });
      result.screenshots.push(shot);
      afterCaptured = true;
    }
    if (current.status === 'failed' || current.status === 'won') {
      result.status = current.status;
      result.failReason = current.failReason;
      result.elapsed = round(current.elapsed);
      result.finishGateId = current.finishGateId;
      result.cuts = current.cuts;
      const shot = path.join(OUTPUT, `${options.label}-terminal.png`);
      await page.screenshot({ path: shot });
      result.screenshots.push(shot);
      return result;
    }
    const canTap = current.worldTime - lastTapWorldTime >= 0.14;
    const projectedY = current.player.y + Math.max(0, current.player.vy) * 0.22;
    const shouldTap = current.status === 'ready'
      || current.status === 'anchored'
      || (current.status === 'airborne' && projectedY > options.targetHeight && current.player.vy > options.verticalThreshold);
    if (canTap && shouldTap) {
      await tap();
      result.inputCount += 1;
      lastTapWorldTime = current.worldTime;
    }
    await page.waitForTimeout(16 + options.waitBias);
  }
  const current = await state(page);
  result.status = current.status;
  result.failReason = current.failReason;
  result.elapsed = round(current.elapsed);
  result.finishGateId = current.finishGateId;
  result.cuts = current.cuts;
  return result;
}

async function genericHardDiagnostic(page, errors) {
  const initial = await page.evaluate(() => window.__GAME_TEST__.loadScenario('generic-hard'));
  const beforeShot = path.join(OUTPUT, 'targeted-white-column-before.png');
  await page.screenshot({ path: beforeShot });
  const trajectory = [{ t: 0, x: round(initial.player.x), y: round(initial.player.y), vx: round(initial.player.vx), vy: round(initial.player.vy), status: initial.status }];
  let bounce = null;
  const deadline = Date.now() + 1500;
  const started = performance.now();
  while (Date.now() < deadline && !bounce) {
    const current = await state(page);
    trajectory.push({ t: round(performance.now() - started), x: round(current.player.x), y: round(current.player.y), vx: round(current.player.vx), vy: round(current.player.vy), status: current.status });
    bounce = current.events.find((event) => event.type === 'bounce' && event.targetId === 'white-column') || null;
    await page.waitForTimeout(8);
  }
  const bounceState = await state(page);
  const bounceShot = path.join(OUTPUT, 'targeted-white-column-bounce.png');
  await page.screenshot({ path: bounceShot });
  const firstBounceId = bounce?.id ?? -1;
  for (let index = 0; index < 35; index += 1) {
    const current = await state(page);
    trajectory.push({ t: round(performance.now() - started), x: round(current.player.x), y: round(current.player.y), vx: round(current.player.vx), vy: round(current.player.vy), status: current.status });
    await page.waitForTimeout(10);
  }
  const separated = await state(page);
  const separatedShot = path.join(OUTPUT, 'targeted-white-column-separated.png');
  await page.screenshot({ path: separatedShot });
  const sameTargetBounces = separated.events.filter((event) => event.type === 'bounce' && event.targetId === 'white-column' && event.id >= firstBounceId);

  await page.evaluate(() => window.__GAME_TEST__.loadScenario('generic-hard'));
  let noInputBounce = null;
  let noInputTerminal = null;
  const noInputDeadline = Date.now() + 5000;
  while (Date.now() < noInputDeadline) {
    const current = await state(page);
    noInputBounce ||= current.events.find((event) => event.type === 'bounce' && event.targetId === 'white-column') || null;
    if (current.status === 'failed' || current.status === 'won') {
      noInputTerminal = current;
      break;
    }
    await page.waitForTimeout(16);
  }
  const noInputShot = path.join(OUTPUT, 'targeted-white-column-no-input-terminal.png');
  await page.screenshot({ path: noInputShot });
  const noInputSeed = noInputTerminal?.seed ?? null;
  await desktopTap(page);
  await page.waitForTimeout(80);
  const restarted = await state(page);
  const restartShot = path.join(OUTPUT, 'targeted-white-column-one-touch-restart.png');
  await page.screenshot({ path: restartShot });

  await page.evaluate(() => window.__GAME_TEST__.loadScenario('generic-hard'));
  let recoveryBounce = null;
  const recoveryDeadline = Date.now() + 1500;
  while (Date.now() < recoveryDeadline && !recoveryBounce) {
    const current = await state(page);
    recoveryBounce = current.events.find((event) => event.type === 'bounce' && event.targetId === 'white-column') || null;
    await page.waitForTimeout(8);
  }
  const immediatelyBeforeTap = await state(page);
  await desktopTap(page);
  await page.waitForTimeout(80);
  const afterTap = await state(page);
  await page.waitForTimeout(900);
  const recoveryLater = await state(page);
  const recoveryShot = path.join(OUTPUT, 'targeted-white-column-recovery.png');
  await page.screenshot({ path: recoveryShot });

  if (!bounce) errors.push('targeted diagnostic: generic-hard did not produce white-column bounce');
  return {
    initial: { x: round(initial.player.x), y: round(initial.player.y), vx: round(initial.player.vx), vy: round(initial.player.vy) },
    bounce: bounce ? { id: bounce.id, targetId: bounce.targetId, contactPart: bounce.contactPart, normalX: bounce.normalX, normalY: bounce.normalY } : null,
    bounceState: { x: round(bounceState.player.x), y: round(bounceState.player.y), vx: round(bounceState.player.vx), vy: round(bounceState.player.vy) },
    separatedState: { x: round(separated.player.x), y: round(separated.player.y), vx: round(separated.player.vx), vy: round(separated.player.vy) },
    sameTargetBounceCount: sameTargetBounces.length,
    trajectory,
    noInput: noInputTerminal ? { status: noInputTerminal.status, failReason: noInputTerminal.failReason, elapsed: round(noInputTerminal.elapsed), seed: noInputTerminal.seed, bounce: noInputBounce } : null,
    restart: { beforeSeed: noInputSeed, afterSeed: restarted.seed, status: restarted.status, failReason: restarted.failReason, cuts: restarted.cuts, events: restarted.events.length },
    recovery: {
      bounce: recoveryBounce,
      beforeTap: { vx: round(immediatelyBeforeTap.player.vx), vy: round(immediatelyBeforeTap.player.vy), status: immediatelyBeforeTap.status },
      afterTap: { vx: round(afterTap.player.vx), vy: round(afterTap.player.vy), status: afterTap.status },
      later: { x: round(recoveryLater.player.x), y: round(recoveryLater.player.y), vx: round(recoveryLater.player.vx), vy: round(recoveryLater.player.vy), status: recoveryLater.status, failReason: recoveryLater.failReason },
    },
    evidence: [beforeShot, bounceShot, separatedShot, noInputShot, restartShot, recoveryShot],
  };
}

async function movingSupportDiagnostic(page, scenario, label) {
  const initial = await page.evaluate((id) => window.__GAME_TEST__.loadScenario(id), scenario);
  const targetId = initial.anchorId;
  const initialSupport = initial.supports.find((support) => support.id === targetId);
  await desktopTap(page);
  const samples = [];
  let bounce = null;
  const deadline = Date.now() + 2500;
  const started = performance.now();
  while (Date.now() < deadline) {
    const current = await state(page);
    const support = current.supports.find((candidate) => candidate.id === targetId);
    samples.push({
      t: round(performance.now() - started),
      playerX: round(current.player.x), playerY: round(current.player.y),
      playerVx: round(current.player.vx), playerVy: round(current.player.vy),
      supportX: support ? round(support.x) : null, supportY: support ? round(support.y) : null,
      supportVx: support ? round(support.vx) : null, supportVy: support ? round(support.vy) : null,
      status: current.status,
    });
    bounce ||= current.events.find((event) => event.type === 'bounce' && event.targetId === targetId) || null;
    if (bounce || current.status === 'failed' || current.status === 'won' || current.status === 'anchored') break;
    await page.waitForTimeout(12);
  }
  const shot = path.join(OUTPUT, `${label}.png`);
  await page.screenshot({ path: shot });
  return {
    scenario,
    targetId,
    initialSupport: initialSupport ? { x: round(initialSupport.x), y: round(initialSupport.y), vx: round(initialSupport.vx), vy: round(initialSupport.vy) } : null,
    bounce,
    samples,
    screenshot: shot,
  };
}

async function main() {
  await fsp.mkdir(OUTPUT, { recursive: true });
  const hashBefore = sha256(BUILD);
  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const desktopRuns = [];
  const mobileRuns = [];
  let generic = null;
  let movingHorizontal = null;
  let movingVertical = null;
  let previewClosed = false;
  try {
    const desktopVariants = [
      { targetHeight: 530, verticalThreshold: -128, waitBias: 0 },
      { targetHeight: 540, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 550, verticalThreshold: -120, waitBias: 2 },
      { targetHeight: 560, verticalThreshold: -116, waitBias: 3 },
      { targetHeight: 570, verticalThreshold: -112, waitBias: 4 },
    ];
    for (let index = 0; index < desktopVariants.length; index += 1) {
      const { context, page } = await newPage(browser, false, errors);
      const run = await playNatural(page, () => desktopTap(page), {
        ...desktopVariants[index], label: `desktop-natural-${index + 1}`, platform: 'desktop', timeoutMs: 35_000,
      });
      desktopRuns.push(run);
      await context.close();
    }
    const mobileVariants = [
      { targetHeight: 535, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 555, verticalThreshold: -116, waitBias: 3 },
    ];
    for (let index = 0; index < mobileVariants.length; index += 1) {
      const { context, page } = await newPage(browser, true, errors);
      const tap = await nativeTapper(page);
      const run = await playNatural(page, tap, {
        ...mobileVariants[index], label: `mobile-natural-${index + 1}`, platform: 'mobile-native-touch', timeoutMs: 40_000,
      });
      run.layout = await page.evaluate(() => ({
        innerWidth, innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        touchAction: getComputedStyle(document.documentElement).touchAction,
        canvasCount: document.querySelectorAll('canvas').length,
      }));
      mobileRuns.push(run);
      await context.close();
    }
    const targeted = await newPage(browser, false, errors);
    generic = await genericHardDiagnostic(targeted.page, errors);
    movingHorizontal = await movingSupportDiagnostic(targeted.page, 'moving-horizontal', 'targeted-moving-horizontal');
    movingVertical = await movingSupportDiagnostic(targeted.page, 'moving-vertical', 'targeted-moving-vertical');
    await targeted.context.close();
  } finally {
    await browser.close();
    if (PREVIEW_PID > 0) {
      try { process.kill(PREVIEW_PID, 'SIGTERM'); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
      try { process.kill(PREVIEW_PID, 0); previewClosed = false; } catch { previewClosed = true; }
    }
  }

  const rawEvidencePath = path.join(OUTPUT, 'raw-evidence.json');
  await fsp.writeFile(rawEvidencePath, `${JSON.stringify({ desktopRuns, mobileRuns, generic, movingHorizontal, movingVertical, errors }, null, 2)}\n`);
  const consolePath = path.join(OUTPUT, 'console.log');
  await fsp.writeFile(consolePath, errors.length ? `${errors.join('\n')}\n` : 'No console or page errors.\n');

  const desktopWins = desktopRuns.filter((run) => run.status === 'won').length;
  const mobileWins = mobileRuns.filter((run) => run.status === 'won').length;
  const desktopPassedChoke = desktopRuns.filter((run) => run.maxX > 1650).length;
  const mobilePassedChoke = mobileRuns.filter((run) => run.maxX > 1650).length;
  const naturalWhiteBounces = [...desktopRuns, ...mobileRuns].flatMap((run) => run.whiteColumnEvents).filter((event) => event.type === 'bounce');
  const naturalWhiteAnchors = [...desktopRuns, ...mobileRuns].flatMap((run) => run.whiteColumnEvents).filter((event) => event.type === 'anchor');
  const naturalCuts = [...desktopRuns, ...mobileRuns].flatMap((run) => run.cutEvents);
  const genericBounceOk = Boolean(generic?.bounce && generic.bounce.normalX === -1 && generic.bounceState.vx < 0);
  const separates = Boolean(generic && generic.separatedState.x < generic.bounceState.x && generic.sameTargetBounceCount === 1);
  const noInputFails = generic?.noInput?.status === 'failed' && generic?.noInput?.failReason === 'fall';
  const recoveryWorks = Boolean(generic?.recovery?.beforeTap.vx < 0 && generic?.recovery?.afterTap.vx > generic?.recovery?.beforeTap.vx && generic?.recovery?.later.status !== 'failed');
  const movingBounces = [movingHorizontal, movingVertical].filter((item) => item?.bounce).length;
  const mobileLayoutOk = mobileRuns.every((run) => run.layout.canvasCount === 1 && run.layout.scrollWidth <= run.layout.innerWidth && run.layout.scrollHeight <= run.layout.innerHeight);
  const stableHash = hashBefore === sha256(BUILD);
  const sourceRoot = path.join(WORKSPACE, 'src');
  const gameCoreSource = await fsp.readFile(path.join(sourceRoot, 'game-core.ts'), 'utf8');
  const mainSource = await fsp.readFile(path.join(sourceRoot, 'main.ts'), 'utf8');
  const rendererSource = await fsp.readFile(path.join(sourceRoot, 'three-world-renderer.ts'), 'utf8');
  const styleSource = await fsp.readFile(path.join(sourceRoot, 'style.css'), 'utf8');
  const sourceNames = (await fsp.readdir(sourceRoot)).sort();
  const architecture = {
    gameCoreDomReferences: [...gameCoreSource.matchAll(/\b(document|window|HTMLElement|querySelector|textContent)\b/g)].map((match) => match[0]),
    gameCoreColorReferences: [...gameCoreSource.matchAll(/(?:0x|#)[0-9a-fA-F]{6}/g)].map((match) => match[0]),
    gameCoreAssetFilenameReferences: [...gameCoreSource.matchAll(/["'][^"']+\.(?:png|jpg|jpeg|webp|glb|gltf|svg|mp3|wav)["']/gi)].map((match) => match[0]),
    mainImportsGameCore: mainSource.includes("from './game-core'"),
    rendererImportsGameCore: rendererSource.includes("from './game-core'"),
    rendererHardcodedHexColors: [...rendererSource.matchAll(/0x[0-9a-fA-F]{6}/g)].length,
    cssHardcodedHexColors: [...styleSource.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length,
    themeTokenFiles: sourceNames.filter((name) => /theme|token/i.test(name)),
    assetManifestFiles: sourceNames.filter((name) => /asset.*manifest|manifest.*asset/i.test(name)),
    saveFiles: sourceNames.filter((name) => /save|persist|storage/i.test(name)),
    mainHudDomSeparatedFromCore: mainSource.includes("querySelector") && !/\b(document|window|HTMLElement|querySelector|textContent)\b/.test(gameCoreSource),
  };
  const architecturePath = path.join(OUTPUT, 'architecture-scan.json');
  await fsp.writeFile(architecturePath, `${JSON.stringify(architecture, null, 2)}\n`);

  const cases = [];
  cases.push({
    id: 'NATURAL-CHOKE-001',
    title: '原卡口自然通过率',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['打开普通起点，不调用场景或状态修改桥。', '桌面执行五个仅改变全局高度阈值的真实鼠标策略。', '移动端执行两个 390x844 原生 CDP 触摸策略。', '点击决策不读取任何障碍坐标，统计 maxX、终态和原卡口前后截图。'],
    expected: ['桌面至少 4/5 越过 x=1650 且至少 3/5 通关。', '移动端至少 1/2 越过并通关。', '不存在连续三次以上同点无进展反弹。'],
    actual: [`desktop wins=${desktopWins}/5, passedChoke=${desktopPassedChoke}/5`, `mobile wins=${mobileWins}/2, passedChoke=${mobilePassedChoke}/2`, `desktop maxX=${desktopRuns.map((run) => round(run.maxX)).join(', ')}`, `mobile maxX=${mobileRuns.map((run) => round(run.maxX)).join(', ')}`, `max repeated no-progress bounces=${Math.max(0, ...desktopRuns.map((run) => run.maxNoProgressBounceStreak), ...mobileRuns.map((run) => run.maxNoProgressBounceStreak))}`],
    severity: desktopWins >= 3 && desktopPassedChoke >= 4 && mobileWins >= 1 && mobilePassedChoke >= 1 ? 'NONE' : 'BLOCKER',
    mechanicalCause: desktopWins >= 3 && desktopPassedChoke >= 4 && mobileWins >= 1 && mobilePassedChoke >= 1 ? '全局高度/升降策略可自然越过原卡口，未依赖障碍坐标答案。' : '普通输入容错仍不足，部分或全部全局高度策略无法越过原卡口或抵达终点。',
    acceptanceCriteria: ['desktopPassedChoke>=4', 'desktopWins>=3', 'mobilePassedChoke>=1', 'mobileWins>=1', 'maxNoProgressBounceStreak<3'],
    suggestedTests: ['将五组桌面与两组移动自然策略固化为只读回归，但不得将障碍坐标加入点击策略。'],
    evidence: [rawEvidencePath, ...desktopRuns.flatMap((run) => run.screenshots), ...mobileRuns.flatMap((run) => run.screenshots)],
  });
  cases.push({
    id: 'WHITE-HARD-REFLECTION-002',
    title: '普通白柱钝端按入射法线反射',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['加载 generic-hard 可重复初态并标记为专项诊断。', '不输入，使用真实时钟等待普通 white-column 的首次碰撞。', '读取 bounce 事件 contactPart、normalX 和碰撞前后速度，并截取接触画面。'],
    expected: ['目标为普通 white-column。', 'contactPart 为 body 或 handle。', '左表面法线 normalX=-1。', '入射 vx>0，反射后 vx<0。'],
    actual: [generic?.bounce ? `target=${generic.bounce.targetId}, part=${generic.bounce.contactPart}, normal=(${generic.bounce.normalX},${generic.bounce.normalY})` : '未观测到 bounce', `initial velocity=(${generic?.initial.vx},${generic?.initial.vy})`, `bounce-state velocity=(${generic?.bounceState.vx},${generic?.bounceState.vy})`, `natural white-column blunt bounce count=${naturalWhiteBounces.length}`],
    severity: genericBounceOk && ['body', 'handle'].includes(generic?.bounce?.contactPart) ? 'NONE' : 'HIGH',
    mechanicalCause: genericBounceOk ? '普通硬表面使用接触法线反射相对入射速度；未观察到专用反弹体身份。' : '未能从普通白柱碰撞得到正确的法线事件或向后速度。',
    acceptanceCriteria: ['targetId=white-column', 'contactPart=body|handle', 'normalX=-1', 'vxBefore>0', 'vxAfter<0'],
    suggestedTests: ['对普通静态支撑的 body/handle 左、右、上、下入射建立参数化法线反射测试。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || [])],
  });
  cases.push({
    id: 'SEPARATION-003',
    title: '反弹后连续离面且不重复注入冲量',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['从 generic-hard 首次 bounce 后不输入。', '以约 10ms 间隔记录 350ms 轨迹。', '统计同一 white-column 的 bounce 事件数量并截取碰撞、分离画面。'],
    expected: ['速度连续由正变负，无位置瞬移。', '玩家中心持续向左离开白柱。', '同一接触只产生一次 bounce。', '没有吸附或每帧重复最低速度注入。'],
    actual: [`bounce x=${generic?.bounceState.x}, separated x=${generic?.separatedState.x}`, `same-target bounce count=${generic?.sameTargetBounceCount}`, `trajectory samples=${generic?.trajectory.length}`],
    severity: separates ? 'NONE' : 'HIGH',
    mechanicalCause: separates ? '首次法线反射后 recoveryAge 抑制重入，轨迹向离面方向连续演进。' : '反弹后未稳定离面，或同一重叠区重复产生 bounce 事件。',
    acceptanceCriteria: ['separatedX<bounceX for left-face reflection', 'sameTargetBounceCount=1', 'trajectory contains no discontinuous teleport'],
    suggestedTests: ['保存接触前后 40 帧轨迹并断言离面距离单调增长、同一接触只发一个 bounce 事件。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || [])],
  });
  cases.push({
    id: 'RECOVERY-BRANCH-004',
    title: '反弹后补点可救回，不补点会落空',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['分支 A 加载 generic-hard 后完全不输入，等待终态。', '分支 B 在首次负 vx bounce 后使用真实 mouse click 一次。', '比较两分支终态和点击前后速度。'],
    expected: ['不输入分支最终 fall。', '补点分支 vx 明显恢复，短期内不进入同一坠落失败。'],
    actual: [`no-input=${generic?.noInput ? `${generic.noInput.status}/${generic.noInput.failReason}` : 'no terminal'}`, `recovery beforeTap vx=${generic?.recovery.beforeTap.vx}, afterTap vx=${generic?.recovery.afterTap.vx}`, `recovery later=${generic?.recovery.later.status}/${generic?.recovery.later.failReason}`],
    severity: noInputFails && recoveryWorks ? 'NONE' : 'HIGH',
    mechanicalCause: noInputFails && recoveryWorks ? '负向反弹制造真实坠落压力；一次真实补点通过 airborne flip 改善速度并脱离即时失败。' : '不输入与补点分支没有形成稳定、可归因的结果差异。',
    acceptanceCriteria: ['no-input status=failed and failReason=fall', 'beforeTap vx<0', 'afterTap vx>beforeTap vx', 'recovery later status!=failed'],
    suggestedTests: ['为同一初态保留无输入/一次输入双分支实时浏览器回归。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || [])],
  });
  cases.push({
    id: 'SHARP-ANCHOR-005',
    title: '同一普通白柱锐端锚定、钝端反弹',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['汇总七次自然真实输入中 targetId=white-column 的 anchor 与 bounce 事件。', '比较 contactPart 和同一目标身份。'],
    expected: ['同一 white-column 至少观测一次 tip/edge anchor。', '同一 white-column 至少观测一次 body/handle bounce。'],
    actual: [`natural anchors=${naturalWhiteAnchors.length}: ${naturalWhiteAnchors.map((event) => `${event.contactPart}@${event.normalX},${event.normalY}`).join('; ') || 'none'}`, `natural bounces=${naturalWhiteBounces.length}: ${naturalWhiteBounces.map((event) => `${event.contactPart}@${event.normalX},${event.normalY}`).join('; ') || 'none'}`, `targeted blunt=${generic?.bounce?.contactPart || 'none'}`],
    severity: naturalWhiteAnchors.some((event) => ['tip', 'edge'].includes(event.contactPart)) && (naturalWhiteBounces.some((event) => ['body', 'handle'].includes(event.contactPart)) || ['body', 'handle'].includes(generic?.bounce?.contactPart)) ? 'NONE' : 'HIGH',
    mechanicalCause: naturalWhiteAnchors.length ? '同一普通支撑通过接触部位区分锚定与反弹。' : '未在自然输入中复现同一白柱的锐端锚定，因此无法独立证明双语义。',
    acceptanceCriteria: ['same targetId=white-column', 'anchor contactPart=tip|edge', 'bounce contactPart=body|handle'],
    suggestedTests: ['增加同一普通白柱、相同速度、仅改变刀角的真实输入成对浏览器用例。'],
    evidence: [rawEvidencePath, ...desktopRuns.flatMap((run) => run.screenshots), ...mobileRuns.flatMap((run) => run.screenshots), ...(generic?.evidence || [])],
  });
  cases.push({
    id: 'MOVING-SUPPORT-006',
    title: '移动支撑的表面相对速度反射',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['分别加载 moving-horizontal 与 moving-vertical 锚定初态。', '用真实鼠标点击释放刀。', '使用真实时钟记录玩家与支撑位置/速度，寻找同一支撑 body/handle bounce。'],
    expected: ['至少一个移动支撑出现 body/handle bounce。', '反射方向与接触法线及支撑表面速度一致。'],
    actual: [`horizontal target=${movingHorizontal?.targetId}, bounce=${movingHorizontal?.bounce ? JSON.stringify(movingHorizontal.bounce) : 'none'}`, `vertical target=${movingVertical?.targetId}, bounce=${movingVertical?.bounce ? JSON.stringify(movingVertical.bounce) : 'none'}`, `moving bounce count=${movingBounces}`],
    severity: movingBounces >= 1 ? 'NONE' : 'MEDIUM',
    mechanicalCause: movingBounces >= 1 ? '移动支撑相对速度碰撞在真实时钟下可复现。' : '现有 moving-* 场景从锚定释放后没有再次以钝端撞回同一支撑，无法用当前只读桥闭合该专项证据。',
    acceptanceCriteria: ['at least one moving support body|handle bounce', 'event normal present', 'post-contact relative normal velocity separates'],
    suggestedTests: ['为测试桥增加只构造入射初态、不直接触发碰撞的 moving-support-blunt 场景；随后必须由真实时钟产生事件。'],
    evidence: [rawEvidencePath, movingHorizontal?.screenshot, movingVertical?.screenshot].filter(Boolean),
  });
  cases.push({
    id: 'MOBILE-RUNTIME-007',
    title: '390x844 原生触摸与运行时洁净度',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['以 390x844、isMobile=true、hasTouch=true 启动页面。', '仅用 CDP touchStart/touchEnd 完成两次自然试玩。', '检查 Canvas、滚动溢出、console 与 page errors。'],
    expected: ['至少一次移动端通关。', '单 Canvas，无横纵溢出。', 'console/page errors 为零。'],
    actual: [`mobile wins=${mobileWins}/2`, `layoutOk=${mobileLayoutOk}`, `runtime errors=${errors.length}`],
    severity: mobileWins >= 1 && mobileLayoutOk && errors.length === 0 ? 'NONE' : 'HIGH',
    mechanicalCause: mobileWins >= 1 && mobileLayoutOk && errors.length === 0 ? '原生触摸路径、单 Canvas 与移动布局在本构建中工作正常。' : '移动通关、布局或运行时错误门槛未满足。',
    acceptanceCriteria: ['mobileWins>=1', 'canvasCount=1', 'no overflow', 'errors=[]'],
    suggestedTests: ['保留两种全局高度策略作为移动只读回归。'],
    evidence: [rawEvidencePath, consolePath, ...mobileRuns.flatMap((run) => run.screenshots)],
  });
  const contactExplainable = naturalCuts.some((event) => ['tip', 'edge'].includes(event.contactPart))
    && Boolean(generic?.bounce && ['body', 'handle'].includes(generic.bounce.contactPart) && generic.bounce.normalX !== undefined)
    && naturalWhiteAnchors.some((event) => ['tip', 'edge'].includes(event.contactPart));
  cases.push({
    id: 'CONTACT-EXPLAINABILITY-008',
    title: '正刃、刀背与边缘碰撞结果可解释',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['汇总七次自然输入的 cut、anchor、bounce 事件。', '用普通白柱专项反射补充钝端 contactPart 与法线证据。', '只评价通用机制关系，不评价 HUD、素材或临时配色。'],
    expected: ['tip/edge 接触可导致 cut 或 anchor。', 'body/handle 接触普通硬表面导致 bounce。', 'bounce 事件包含可解释的接触法线。'],
    actual: [`natural cut parts=${[...new Set(naturalCuts.map((event) => event.contactPart))].join(', ') || 'none'}`, `natural white anchor parts=${[...new Set(naturalWhiteAnchors.map((event) => event.contactPart))].join(', ') || 'none'}`, `targeted white bounce part=${generic?.bounce?.contactPart || 'none'}, normal=(${generic?.bounce?.normalX ?? 'none'},${generic?.bounce?.normalY ?? 'none'})`],
    severity: contactExplainable ? 'NONE' : 'HIGH',
    mechanicalCause: contactExplainable ? '同一套接触部位分类能解释切割、锚定和反弹三种结果。' : '至少一种接触语义未被自然输入与当前只读桥共同复现，玩家结果仍可能显得不可归因。',
    acceptanceCriteria: ['natural cut includes tip|edge', 'white-column anchor includes tip|edge', 'white-column bounce includes body|handle and a contact normal'],
    suggestedTests: ['建立接触部位×表面类型的浏览器事件矩阵，断言事件类型、法线和后续速度。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || []), ...desktopRuns.flatMap((run) => run.screenshots)],
  });
  const maxBounceStreak = Math.max(0, ...desktopRuns.map((run) => run.maxNoProgressBounceStreak), ...mobileRuns.map((run) => run.maxNoProgressBounceStreak));
  cases.push({
    id: 'STUCK-REBOUND-009',
    title: '卡住或异常反弹原因与复现路径',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['用五组桌面和两组移动全局高度策略完整试玩。', '按 targetId 与接触 x 距离统计连续无进展 bounce。', '在 generic-hard 专项中记录首次反弹后 350ms 连续轨迹与事件数。'],
    expected: ['自然试玩不出现连续三次同目标、近同位置的无进展反弹。', '专项反弹后离面且同一接触只注入一次冲量。', '若发生卡住，证据应给出目标、contactPart、法线与连续轨迹。'],
    actual: [`max natural no-progress bounce streak=${maxBounceStreak}`, `targeted same-contact bounce count=${generic?.sameTargetBounceCount}`, `targeted left-face separation x: ${generic?.bounceState.x} -> ${generic?.separatedState.x}`],
    severity: maxBounceStreak < 3 && separates ? 'NONE' : 'HIGH',
    mechanicalCause: maxBounceStreak < 3 && separates ? '本轮未复现卡住；接触恢复窗使刀在一次反弹后持续离面。' : '同点反弹重复或离面失败，是卡住/异常弹跳的直接机械原因。',
    acceptanceCriteria: ['maxNoProgressBounceStreak<3', 'sameTargetBounceCount=1', 'post-bounce separation grows'],
    suggestedTests: ['失败时持久化最后 60 帧 targetId/contactPart/normal/relativeVelocity/recoveryAge，形成可重放卡住夹具。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || [])],
  });
  const restartConsistent = Boolean(generic?.restart?.beforeSeed !== null && generic.restart.afterSeed === generic.restart.beforeSeed + 1 && generic.restart.status === 'ready' && generic.restart.failReason === null && generic.restart.cuts === 0);
  cases.push({
    id: 'FAILURE-RECOVERY-010',
    title: '失败、重开与反弹补救的一致性',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['分支 A 不补点，等待 white-column 反弹后的 fall。', '失败画面用一次真实鼠标点击重开。', '分支 B 在负 vx 后补点，比较短期状态。'],
    expected: ['无输入分支明确 fall。', '一次真实输入完整重置 seed、失败原因、切割和事件。', '补点分支短期脱离同一失败。'],
    actual: [`no-input=${generic?.noInput?.status}/${generic?.noInput?.failReason}`, `restart=${JSON.stringify(generic?.restart || null)}`, `recovery later=${generic?.recovery?.later.status}/${generic?.recovery?.later.failReason}`],
    severity: noInputFails && restartConsistent && recoveryWorks ? 'NONE' : 'HIGH',
    mechanicalCause: noInputFails && restartConsistent && recoveryWorks ? '失败原因、一次触重开和空中补救遵循一致状态转换。' : '失败、重开或补救至少一项未形成可重复的一致状态转换。',
    acceptanceCriteria: ['fall failure is attributable', 'one real click increments seed and returns ready', 'failReason=null, cuts=0 after restart', 'recovery branch avoids immediate same failure'],
    suggestedTests: ['对 spike、fall、won 分别断言一次真实输入后的完整状态清零与 seed 迁移。'],
    evidence: [rawEvidencePath, ...(generic?.evidence || [])],
  });
  const courseSummary = desktopRuns[0]?.courseSummary;
  const progressionOk = Boolean(courseSummary
    && courseSummary.segments.length >= 3
    && courseSummary.bands[0].sigils > 0
    && courseSummary.bands[1].supports.some((item) => item.id === 'white-column')
    && courseSummary.bands[1].supports.some((item) => item.movingAxis)
    && courseSummary.bands[2].blocks.some((item) => item.placement === 'tower')
    && courseSummary.bands[2].spikes.length > 0
    && courseSummary.finishKinds.length >= 2);
  cases.push({
    id: 'LEVEL-PROGRESSION-011',
    title: '关卡逐步教学并增加组合难度',
    provenance: 'NATURAL_INPUT',
    repeatableSteps: ['从普通起点读取运行时 courseSegments 与每段机制构成，仅作事后结构分析。', '对照完整自然试玩中机制出现顺序和终点选择。', '不要求复制任何第三方具体关卡或数值。'],
    expected: ['前段先呈现基础切割与安全支撑。', '中段引入移动支撑、普通白柱和恢复分支。', '后段组合结构块、尖刺与多种终点门。'],
    actual: [`segments=${courseSummary?.segments.map((item) => item.id).join(' -> ') || 'none'}`, `bands=${JSON.stringify(courseSummary?.bands || [])}`, `finishKinds=${courseSummary?.finishKinds.join(', ') || 'none'}`],
    severity: progressionOk ? 'NONE' : 'MEDIUM',
    mechanicalCause: progressionOk ? '运行时课程从单一目标逐步叠加移动、碰撞恢复、结构和风险选择。' : '机制分布未形成清晰的基础教学到组合挑战递进。',
    acceptanceCriteria: ['at least three ordered segments', 'early basic cuttable/support', 'middle moving support plus ordinary hard surface', 'late structure plus hazard plus finish choice'],
    suggestedTests: ['为每段声明 teaches、combines、examines 三类机制标签，并验证首次出现顺序。'],
    evidence: [rawEvidencePath, ...desktopRuns[0].screenshots],
  });
  const coreDecoupled = architecture.gameCoreDomReferences.length === 0 && architecture.gameCoreColorReferences.length === 0 && architecture.gameCoreAssetFilenameReferences.length === 0;
  const themedThroughBoundary = architecture.themeTokenFiles.length > 0 && architecture.assetManifestFiles.length > 0;
  cases.push({
    id: 'SKIN-ARCHITECTURE-012',
    title: '核心机制与主题换肤边界',
    provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['只读扫描 game-core.ts、main.ts、three-world-renderer.ts、style.css 及 src 文件名。', '检查碰撞与课程核心是否引用 HUD DOM、文案、颜色或资产文件名。', '检查主题替换是否集中经过 theme tokens 与 asset manifest。'],
    expected: ['核心碰撞和关卡不依赖 HUD DOM、文案、颜色或资产文件名。', '存档若存在，也不得依赖上述表达层字段。', '主题颜色和资产替换集中经过 theme tokens 与 asset manifest。'],
    actual: [`core DOM refs=${architecture.gameCoreDomReferences.length}, colors=${architecture.gameCoreColorReferences.length}, asset filenames=${architecture.gameCoreAssetFilenameReferences.length}`, `save files=${architecture.saveFiles.join(', ') || 'none (no persistence module in current prototype)'}`, `theme token files=${architecture.themeTokenFiles.join(', ') || 'none'}`, `asset manifest files=${architecture.assetManifestFiles.join(', ') || 'none'}`, `renderer hardcoded colors=${architecture.rendererHardcodedHexColors}, CSS hardcoded colors=${architecture.cssHardcodedHexColors}`],
    severity: coreDecoupled && themedThroughBoundary ? 'NONE' : coreDecoupled ? 'MEDIUM' : 'HIGH',
    mechanicalCause: coreDecoupled && themedThroughBoundary ? '玩法核心与表达层解耦，主题替换有集中边界。' : coreDecoupled ? '玩法核心已与 DOM/颜色/资产名解耦，但主题颜色仍硬编码且没有可验证的 theme token / asset manifest 入口。' : '玩法核心仍引用表达层细节，换肤可能改变碰撞、课程或状态行为。',
    acceptanceCriteria: ['game-core DOM refs=0', 'game-core color refs=0', 'game-core asset filename refs=0', 'theme token file exists', 'asset manifest exists', 'save schema contains semantic IDs only when persistence is added'],
    suggestedTests: ['增加 theme tokens 与 asset manifest schema；用两套主题运行同一 seed 并断言核心状态轨迹完全一致。', '未来加入存档时只序列化语义 ID/数值，不序列化 HUD 文案、颜色或资产文件名。'],
    evidence: [architecturePath, path.join(sourceRoot, 'game-core.ts'), path.join(sourceRoot, 'main.ts'), path.join(sourceRoot, 'three-world-renderer.ts'), path.join(sourceRoot, 'style.css')],
  });

  const hashAfter = sha256(BUILD);
  if (!stableHash || hashAfter !== hashBefore) {
    cases.unshift({
      id: 'UNSTABLE_BUILD',
      title: '测试期间构建发生变化',
      provenance: 'TARGETED_DIAGNOSTIC',
      repeatableSteps: ['测试前后分别计算 dist/index.html SHA-256。'],
      expected: ['两次哈希完全一致。'],
      actual: [`before=${hashBefore}`, `after=${hashAfter}`],
      severity: 'BLOCKER',
      mechanicalCause: 'Builder 或其他进程在 QA 期间改写了构建，所有行为证据失去单一构建归属。',
      acceptanceCriteria: ['buildSha256Before=buildSha256After'],
      suggestedTests: ['锁定构建后重新执行整轮只读 QA。'],
      evidence: [BUILD],
    });
  }
  const issues = cases.filter((item) => item.severity !== 'NONE').map((item) => ({ caseId: item.id, severity: item.severity, summary: item.mechanicalCause }));
  const chokePass = desktopWins >= 3 && desktopPassedChoke >= 4 && mobileWins >= 1 && mobilePassedChoke >= 1;
  const reboundPass = genericBounceOk && separates && noInputFails && recoveryWorks && naturalWhiteAnchors.length > 0 && movingBounces >= 1;
  const artifact = {
    schemaVersion: 1,
    artifactType: 'NightReadOnlyMechanicsQaArtifact',
    targetGame: '符刃夜行',
    workspace: WORKSPACE,
    buildSha256Before: hashBefore,
    buildSha256After: hashAfter,
    testedAt: new Date().toISOString(),
    passed: stableHash && chokePass && reboundPass && mobileLayoutOk && errors.length === 0 && issues.length === 0 && previewClosed,
    cases,
    issues,
    summary: {
      naturalDesktopWins: desktopWins,
      naturalDesktopAttempts: desktopRuns.length,
      naturalMobileWins: mobileWins,
      naturalMobileAttempts: mobileRuns.length,
      reboundVerdict: reboundPass ? 'PASS' : 'FAIL',
      chokeVerdict: chokePass ? 'PASS' : 'FAIL',
    },
    validatedWith: 'zod@4 strict object schemas via artifactSchema.parse',
    previewClosed,
  };
  const validated = artifactSchema.parse(artifact);
  const reportPath = path.join(OUTPUT, 'qa-report.json');
  await fsp.writeFile(reportPath, `${JSON.stringify(validated, null, 2)}\n`);
  const validation = artifactSchema.parse(JSON.parse(await fsp.readFile(reportPath, 'utf8')));
  process.stdout.write(`${JSON.stringify({ reportPath, reportSha256: sha256(reportPath), summary: validation.summary, passed: validation.passed, issues: validation.issues }, null, 2)}\n`);
}

main().catch(async (error) => {
  await fsp.mkdir(OUTPUT, { recursive: true });
  await fsp.writeFile(path.join(OUTPUT, 'runner-error.log'), `${error.stack || error.message || String(error)}\n`);
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
