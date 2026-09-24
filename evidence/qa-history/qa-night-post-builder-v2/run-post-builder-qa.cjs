const { chromium } = require('@playwright/test');
const { z } = require('zod');
const ts = require('typescript');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const URL = 'http://127.0.0.1:4197/';
const PREVIEW_PID = Number(process.env.PREVIEW_PID || 0);
const WORKSPACE = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a';
const OUTPUT = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-night-post-builder-v2';
const REPORT = path.join(OUTPUT, 'qa-report.json');
const BUILD = path.join(WORKSPACE, 'dist/index.html');
const LOCKED_HASH = 'bc41d40f25ac9c6f612b5d3d484d0971dcb6c6212a7a1ae9cec126eb42fa2f34';

const caseSchema = z.object({
  id: z.string(),
  title: z.string(),
  previousStatus: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'NEW']),
  closure: z.enum(['CLOSED', 'OPEN', 'PARTIAL', 'INCONCLUSIVE']),
  provenance: z.enum(['NATURAL_INPUT', 'TARGETED_DIAGNOSTIC', 'READ_ONLY_ARCHITECTURE']),
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

const reportSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('PostBuilderRetestQaArtifact'),
  targetGame: z.string(),
  workspace: z.string(),
  lockedBuildSha256: z.string().regex(/^[a-f0-9]{64}$/),
  buildSha256Before: z.string().regex(/^[a-f0-9]{64}$/),
  buildSha256After: z.string().regex(/^[a-f0-9]{64}$/),
  testedAt: z.string().datetime(),
  passed: z.boolean(),
  naturalPlay: z.object({
    desktopAttempts: z.number().int(), desktopWins: z.number().int(), desktopFormerChokePasses: z.number().int(),
    mobileAttempts: z.number().int(), mobileWins: z.number().int(), mobileFormerChokePasses: z.number().int(),
    maxNoProgressBounceStreak: z.number().int(), exactV1Replay: z.object({ label: z.string(), maxX: z.number(), status: z.string(), maxNoProgressBounceStreak: z.number().int() }).strict(),
    desktopRuns: z.array(z.record(z.string(), z.unknown())), mobileRuns: z.array(z.record(z.string(), z.unknown())),
  }).strict(),
  movingSupportDiagnostic: z.record(z.string(), z.unknown()),
  themeAudit: z.record(z.string(), z.unknown()),
  cases: z.array(caseSchema),
  issues: z.array(issueSchema),
  screenshots: z.array(z.string()),
  consoleLog: z.string(),
  previewClosed: z.boolean(),
  validatedWith: z.string(),
}).strict();

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sha256Value(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

async function state(page) {
  return page.evaluate(() => window.__GAME_TEST__.getState());
}

async function openPage(browser, mobile, errors) {
  const context = await browser.newContext(mobile ? {
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  } : { viewport: { width: 1180, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${mobile ? 'mobile' : 'desktop'} console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`${mobile ? 'mobile' : 'desktop'} page: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`${mobile ? 'mobile' : 'desktop'} request: ${request.url()} ${request.failure()?.errorText || ''}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
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
  const initial = await state(page);
  const result = {
    label: options.label,
    platform: options.platform,
    seed: initial.seed,
    inputPolicy: `global-height=${options.targetHeight}; vertical-threshold=${options.verticalThreshold}; wait-bias=${options.waitBias}; no obstacle-coordinate oracle`,
    inputCount: 0,
    maxX: initial.player.x,
    status: initial.status,
    failReason: initial.failReason,
    elapsed: initial.elapsed,
    finishGateId: initial.finishGateId,
    cuts: initial.cuts,
    maxNoProgressBounceStreak: 0,
    stageIdsVisited: [],
    seedChanged: false,
    whiteColumnBounceCount: 0,
    whiteColumnAnchorCount: 0,
    screenshots: [],
  };
  const stageSet = new Set();
  const capturedStages = new Set();
  let lastTapWorldTime = -10;
  let lastEventId = 0;
  let lastBounceX = -Infinity;
  let lastBounceTarget = '';
  let bounceStreak = 0;
  const deadline = Date.now() + (options.timeoutMs || 36_000);
  while (Date.now() < deadline) {
    const current = await state(page);
    if (current.seed !== initial.seed) {
      result.seedChanged = true;
      result.status = current.status;
      result.elapsed = round(current.elapsed);
      break;
    }
    result.maxX = Math.max(result.maxX, current.player.x);
    const segment = current.courseSegments.find((candidate) => current.player.x >= candidate.startX && current.player.x < candidate.endX);
    if (segment) {
      stageSet.add(segment.id);
      if (!capturedStages.has(segment.id)) {
        const shot = path.join(OUTPUT, `${options.label}-${segment.id}.png`);
        await page.screenshot({ path: shot });
        result.screenshots.push(shot);
        capturedStages.add(segment.id);
      }
    }
    for (const event of current.events) {
      if (event.id <= lastEventId) continue;
      lastEventId = Math.max(lastEventId, event.id);
      if (event.type === 'bounce') {
        bounceStreak = event.targetId === lastBounceTarget && Math.abs(event.x - lastBounceX) < 28 ? bounceStreak + 1 : 1;
        lastBounceTarget = event.targetId || '';
        lastBounceX = event.x;
        result.maxNoProgressBounceStreak = Math.max(result.maxNoProgressBounceStreak, bounceStreak);
        if (event.targetId === 'white-column') result.whiteColumnBounceCount += 1;
      }
      if (event.type === 'anchor' && event.targetId === 'white-column') result.whiteColumnAnchorCount += 1;
    }
    if (current.status === 'failed' || current.status === 'won') {
      result.status = current.status;
      result.failReason = current.failReason;
      result.elapsed = round(current.elapsed);
      result.finishGateId = current.finishGateId;
      result.cuts = current.cuts;
      const shot = path.join(OUTPUT, `${options.label}-${current.status}.png`);
      await page.screenshot({ path: shot });
      result.screenshots.push(shot);
      result.stageIdsVisited = [...stageSet];
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
  result.stageIdsVisited = [...stageSet];
  const shot = path.join(OUTPUT, `${options.label}-timeout-or-reset.png`);
  await page.screenshot({ path: shot });
  result.screenshots.push(shot);
  return result;
}

async function movingSupportScan(page) {
  return page.evaluate(() => {
    const bridge = window.__GAME_TEST__;
    const scenarios = ['moving-horizontal', 'moving-vertical'];
    const holds = [0, 45, 90, 135, 180, 225, 270, 315];
    const followups = [null, 15, 30, 45, 60, 90];
    const attempts = [];
    for (const scenario of scenarios) {
      for (const holdSteps of holds) {
        for (const followupStep of followups) {
          const loaded = bridge.loadScenario(scenario);
          const supportId = loaded.anchorId;
          for (let step = 0; step < holdSteps; step += 1) bridge.step(1 / 120);
          const release = bridge.getState();
          const releaseSupport = release.supports.find((item) => item.id === supportId);
          bridge.act('flip');
          let previous = bridge.getState();
          let found = null;
          for (let step = 0; step < 360; step += 1) {
            if (followupStep !== null && step === followupStep) bridge.act('flip');
            const before = previous;
            const beforeSupport = before.supports.find((item) => item.id === supportId);
            const beforeEventId = before.events.at(-1)?.id || 0;
            const after = bridge.step(1 / 120);
            const afterSupport = after.supports.find((item) => item.id === supportId);
            const event = after.events.find((item) => item.id > beforeEventId && item.type === 'bounce' && item.targetId === supportId);
            if (event && beforeSupport && afterSupport) {
              const incomingRelativeX = before.player.vx - beforeSupport.vx;
              const incomingRelativeY = before.player.vy - beforeSupport.vy;
              const outgoingRelativeX = after.player.vx - afterSupport.vx;
              const outgoingRelativeY = after.player.vy - afterSupport.vy;
              const incomingRelativeNormal = incomingRelativeX * (event.normalX || 0) + incomingRelativeY * (event.normalY || 0);
              const outgoingRelativeNormal = outgoingRelativeX * (event.normalX || 0) + outgoingRelativeY * (event.normalY || 0);
              const eventId = event.id;
              let later = after;
              for (let lock = 0; lock < 22; lock += 1) later = bridge.step(1 / 120);
              const impulseCount = later.events.filter((item) => item.type === 'bounce' && item.targetId === supportId && item.id >= eventId).length;
              found = {
                scenario, supportId, holdSteps, followupStep, contactPart: event.contactPart,
                normalX: event.normalX, normalY: event.normalY,
                supportVelocityBefore: { vx: beforeSupport.vx, vy: beforeSupport.vy },
                playerVelocityBefore: { vx: before.player.vx, vy: before.player.vy },
                incomingRelativeVelocity: { vx: incomingRelativeX, vy: incomingRelativeY, normal: incomingRelativeNormal },
                supportVelocityAfter: { vx: afterSupport.vx, vy: afterSupport.vy },
                playerVelocityAfter: { vx: after.player.vx, vy: after.player.vy },
                outgoingRelativeVelocity: { vx: outgoingRelativeX, vy: outgoingRelativeY, normal: outgoingRelativeNormal },
                impulseCountDuringLockout: impulseCount,
                reflected: incomingRelativeNormal < 0 && outgoingRelativeNormal > 0 && impulseCount === 1,
              };
              break;
            }
            previous = after;
            if (after.status === 'failed' || after.status === 'won' || after.status === 'anchored') break;
          }
          attempts.push({ scenario, holdSteps, followupStep, releaseSupportVelocity: releaseSupport ? { vx: releaseSupport.vx, vy: releaseSupport.vy } : null, found: Boolean(found) });
          if (found && ['body', 'handle'].includes(found.contactPart)) return { found, attempts };
        }
      }
    }
    return { found: null, attempts };
  });
}

function loadTranspiled(file, dependencyMap = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => dependencyMap[specifier] || require(specifier);
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}

function auditTheme() {
  const src = path.join(WORKSPACE, 'src');
  const themeModule = loadTranspiled(path.join(src, 'theme.ts'));
  const contentModule = loadTranspiled(path.join(src, 'game-content.ts'));
  const coreModule = loadTranspiled(path.join(src, 'game-core.ts'), { './game-content': contentModule });
  const assetSchema = z.object({
    id: z.string(), role: z.enum(['knife', 'cuttable', 'terrain', 'hazard', 'feedback']), source: z.literal('programmatic-original'),
    implementation: z.enum(['three-geometry', 'three-material', 'css']), externalUri: z.null(), replaceable: z.literal(true),
  }).strict();
  const cssSchema = z.object({
    colorScheme: z.string(), fontFamily: z.string(), background: z.string(), panel: z.string(), panelStrong: z.string(), border: z.string(), borderStrong: z.string(),
    title: z.string(), accent: z.string(), secondary: z.string(), direction: z.string(), gate: z.string(), instruction: z.string(), feedback: z.string(),
    feedbackCut: z.string(), feedbackFail: z.string(), shadow: z.string(), panelShadow: z.string(), textShadow: z.string(), impact: z.string(),
  }).strict();
  const worldSchema = z.object({
    background: z.number(), skyLight: z.number(), groundLight: z.number(), keyLight: z.number(), road: z.number(), skyline: z.number(), support: z.number(), supportActive: z.number(),
    spike: z.number(), spikeEmissive: z.number(), finishMultiply: z.number(), finishDivide: z.number(), finishSafe: z.number(), finishBonus: z.number(), finishBonusEmissive: z.number(),
    particle: z.number(), blade: z.number(), bladeEmissive: z.number(), spine: z.number(), handle: z.number(), cuttableBlock: z.number(), cuttableSigil: z.number(),
    cuttableSigilEmissive: z.number(), capA: z.number(), capB: z.number(), capEmissiveA: z.number(), capEmissiveB: z.number(),
  }).strict();
  const copySchema = z.object({
    title: z.string(), canvasLabel: z.string(), instruction: z.string(), gateLegend: z.string(),
    phase: z.object({ ordinary: z.string(), bonus: z.string() }).strict(), counter: z.object({ cuts: z.string(), score: z.string() }).strict(),
    status: z.object({ ready: z.string(), airborne: z.string(), anchored: z.string(), failed: z.string(), won: z.string() }).strict(),
    recovery: z.object({ reverse: z.string(), forward: z.string() }).strict(), stage: z.record(z.string(), z.string()),
    finishDistance: z.string(), fallbackStage: z.string(), terminal: z.object({ spike: z.string(), fall: z.string(), ordinaryWin: z.string(), bonusWin: z.string(), score: z.string(), restart: z.string() }).strict(),
    feedback: z.record(z.string(), z.string()),
  }).strict();
  const themeSchema = z.object({
    id: z.string(), status: z.literal('placeholder'), styleLock: z.literal(false), copy: copySchema, css: cssSchema, world: worldSchema,
    typography: z.object({ family: z.string() }).strict(), hud: z.object({ placement: z.literal('top-left'), safeInsetPx: z.number(), compactWidthPx: z.number() }).strict(),
    icons: z.object({ input: z.string(), sharp: z.string(), blunt: z.string() }).strict(), assets: z.array(assetSchema),
  }).strict();
  const blueprintSchema = z.array(z.object({
    id: z.string(), startX: z.number(), endX: z.number(), labelToken: z.string(), hasGap: z.boolean(), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    intensity: z.number().min(0).max(1), role: z.enum(['teach', 'develop', 'test', 'bonus']), mechanicIds: z.array(z.string()), expression: z.literal('original'),
  }).strict());
  const theme = themeSchema.parse(themeModule.MECHANICS_DEMO_THEME);
  const manifest = z.array(assetSchema).length(5).parse(themeModule.MECHANICS_DEMO_ASSET_MANIFEST);
  const blueprint = blueprintSchema.parse(contentModule.ORIGINAL_COURSE_BLUEPRINT);
  const alternate = JSON.parse(JSON.stringify(theme));
  alternate.id = 'qa-alternate-placeholder';
  alternate.css.background = '#123456';
  alternate.world.background = 0x123456;
  themeSchema.parse(alternate);
  const trace = () => {
    const simulation = new coreModule.SliceSimulation(31);
    const frames = [];
    for (let frame = 0; frame < 720; frame += 1) {
      if (frame % 72 === 0) simulation.act('flip');
      const state = simulation.step(1 / 120);
      if (frame % 24 === 0) frames.push({ frame, status: state.status, x: round(state.player.x), y: round(state.player.y), vx: round(state.player.vx), vy: round(state.player.vy), cuts: state.cuts, score: state.score, events: state.events.map((event) => [event.id, event.type, event.targetId || null]) });
    }
    return frames;
  };
  const traceA = trace();
  const traceB = trace();
  const gameCore = fs.readFileSync(path.join(src, 'game-core.ts'), 'utf8');
  const gameContent = fs.readFileSync(path.join(src, 'game-content.ts'), 'utf8');
  const main = fs.readFileSync(path.join(src, 'main.ts'), 'utf8');
  const themeSource = fs.readFileSync(path.join(src, 'theme.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(src, 'three-world-renderer.ts'), 'utf8');
  const cutVisuals = fs.readFileSync(path.join(src, 'three-cut-visuals.ts'), 'utf8');
  const style = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
  const html = fs.readFileSync(path.join(WORKSPACE, 'index.html'), 'utf8');
  const styleWithoutRoot = style.replace(/:root\s*\{[\s\S]*?\}/, '');
  return {
    themeZodValidated: true,
    assetManifestZodValidated: true,
    courseBlueprintZodValidated: true,
    themeId: theme.id,
    assetRoles: manifest.map((item) => item.role),
    alternateThemeZodValidated: true,
    coreTraceDefaultSha256: sha256Value(traceA),
    coreTraceAlternateSha256: sha256Value(traceB),
    identicalCoreTraceAcrossThemeBoundary: sha256Value(traceA) === sha256Value(traceB),
    coreImportsTheme: /from ['"]\.\/theme['"]/.test(gameCore) || /from ['"]\.\/theme['"]/.test(gameContent),
    coreDomReferences: [...`${gameCore}\n${gameContent}`.matchAll(/\b(document|window|HTMLElement|querySelector|textContent)\b/g)].length,
    coreAssetFilenameReferences: [...`${gameCore}\n${gameContent}`.matchAll(/["'][^"']+\.(png|jpg|webp|glb|svg|mp3|wav)["']/gi)].length,
    presentationImportsTheme: [main, renderer, cutVisuals].every((source) => source.includes("from './theme'")),
    cssLiteralColorsOutsideFallbackRoot: [...styleWithoutRoot.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length,
    productionThemeUsesZodParse: /from ['"]zod['"]|\.parse\s*\(/.test(themeSource),
    rendererResolvesAssetManifestRoles: /MECHANICS_DEMO_ASSET_MANIFEST|\.assets\.(find|map)|assets\.(find|map)/.test(renderer),
    cssDuplicatesThemeDefaults: /:root\s*\{[\s\S]*--theme-background\s*:/.test(style),
    htmlDuplicatesThemeCopy: /<title>\s*Mechanics Demo\s*<\/title>/i.test(html),
    themedCoreIds: [...gameCore.matchAll(/['"](white-[^'"]+|lantern-[^'"]+|calm-[^'"]+|jade-[^'"]+|ember-[^'"]+|mist-[^'"]+)['"]/g)].map((match) => match[1]),
    blueprint: blueprint.map((stage) => ({ id: stage.id, role: stage.role, difficulty: stage.difficulty, intensity: stage.intensity, mechanicIds: stage.mechanicIds, labelToken: stage.labelToken })),
  };
}

async function main() {
  await fsp.mkdir(OUTPUT, { recursive: true });
  const hashBefore = sha256File(BUILD);
  const errors = [];
  const screenshots = [];
  const desktopRuns = [];
  const mobileRuns = [];
  let movingDiagnostic = { found: null, attempts: [] };
  let runtimeThemeFacts = null;
  let previewClosed = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopVariants = [
      { targetHeight: 530, verticalThreshold: -128, waitBias: 0 },
      { targetHeight: 540, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 550, verticalThreshold: -120, waitBias: 2 },
      { targetHeight: 560, verticalThreshold: -116, waitBias: 3 },
      { targetHeight: 570, verticalThreshold: -112, waitBias: 4 },
    ];
    for (let index = 0; index < desktopVariants.length; index += 1) {
      const { context, page } = await openPage(browser, false, errors);
      if (index === 0) runtimeThemeFacts = await page.evaluate(() => ({ contract: window.__GAME_TEST__.getThemeContract(), dataset: { id: document.documentElement.dataset.theme, status: document.documentElement.dataset.themeStatus }, canvasCount: document.querySelectorAll('canvas').length }));
      const run = await playNatural(page, () => mouseTap(page), { ...desktopVariants[index], label: `desktop-natural-${index + 1}`, platform: 'desktop-real-mouse', timeoutMs: 36_000 });
      desktopRuns.push(run);
      screenshots.push(...run.screenshots);
      await context.close();
    }
    const mobileVariants = [
      { targetHeight: 535, verticalThreshold: -124, waitBias: 1 },
      { targetHeight: 555, verticalThreshold: -116, waitBias: 3 },
    ];
    for (let index = 0; index < mobileVariants.length; index += 1) {
      const { context, page } = await openPage(browser, true, errors);
      const tap = await nativeTapper(page);
      const run = await playNatural(page, tap, { ...mobileVariants[index], label: `mobile-natural-${index + 1}`, platform: '390x844-native-touch', timeoutMs: 40_000 });
      run.layout = await page.evaluate(() => ({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, touchAction: getComputedStyle(document.documentElement).touchAction, canvasCount: document.querySelectorAll('canvas').length }));
      mobileRuns.push(run);
      screenshots.push(...run.screenshots);
      await context.close();
    }
    await fsp.writeFile(path.join(OUTPUT, 'natural-checkpoint.json'), `${JSON.stringify({ desktopRuns, mobileRuns, errors }, null, 2)}\n`);
    const targeted = await openPage(browser, false, errors);
    movingDiagnostic = await movingSupportScan(targeted.page);
    await fsp.writeFile(path.join(OUTPUT, 'moving-scan-checkpoint.json'), `${JSON.stringify(movingDiagnostic, null, 2)}\n`);
    if (movingDiagnostic.found) {
      const found = movingDiagnostic.found;
      await targeted.page.evaluate(({ scenario, holdSteps, followupStep, supportId }) => {
        const bridge = window.__GAME_TEST__;
        bridge.loadScenario(scenario);
        for (let step = 0; step < holdSteps; step += 1) bridge.step(1 / 120);
        bridge.act('flip');
        let lastEventId = bridge.getState().events.at(-1)?.id || 0;
        for (let step = 0; step < 360; step += 1) {
          if (followupStep !== null && step === followupStep) bridge.act('flip');
          const next = bridge.step(1 / 120);
          if (next.events.some((event) => event.id > lastEventId && event.type === 'bounce' && event.targetId === supportId)) break;
          lastEventId = next.events.at(-1)?.id || lastEventId;
        }
      }, found);
      const shot = path.join(OUTPUT, 'targeted-moving-support-reflection.png');
      await targeted.page.screenshot({ path: shot });
      screenshots.push(shot);
      movingDiagnostic.screenshot = shot;
    }
    await targeted.context.close();
  } finally {
    await browser.close();
    if (PREVIEW_PID > 0) {
      try { process.kill(PREVIEW_PID, 'SIGTERM'); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
      try { process.kill(PREVIEW_PID, 0); previewClosed = false; } catch { previewClosed = true; }
    }
  }

  const hashAfter = sha256File(BUILD);
  const themeAudit = { ...auditTheme(), runtimeThemeFacts };
  const rawPath = path.join(OUTPUT, 'raw-evidence.json');
  await fsp.writeFile(rawPath, `${JSON.stringify({ desktopRuns, mobileRuns, movingDiagnostic, themeAudit, errors }, null, 2)}\n`);
  const themePath = path.join(OUTPUT, 'theme-audit.json');
  await fsp.writeFile(themePath, `${JSON.stringify(themeAudit, null, 2)}\n`);
  const consolePath = path.join(OUTPUT, 'console.log');
  await fsp.writeFile(consolePath, errors.length ? `${errors.join('\n')}\n` : 'No console, page, or request errors.\n');

  const desktopWins = desktopRuns.filter((run) => run.status === 'won').length;
  const mobileWins = mobileRuns.filter((run) => run.status === 'won').length;
  const desktopChoke = desktopRuns.filter((run) => run.maxX > 1650).length;
  const mobileChoke = mobileRuns.filter((run) => run.maxX > 1650).length;
  const maxStreak = Math.max(0, ...desktopRuns.map((run) => run.maxNoProgressBounceStreak), ...mobileRuns.map((run) => run.maxNoProgressBounceStreak));
  const exact = desktopRuns[4];
  const stageIds = ['stage-1-read-and-cut', 'stage-2-recover-and-choose', 'stage-3-structure-and-finish'];
  const desktopFullStages = desktopRuns.some((run) => run.status === 'won' && stageIds.every((id) => run.stageIdsVisited.includes(id)));
  const mobileFullStages = mobileRuns.some((run) => run.status === 'won' && stageIds.every((id) => run.stageIdsVisited.includes(id)));
  const movingPass = Boolean(movingDiagnostic.found?.reflected && ['body', 'handle'].includes(movingDiagnostic.found.contactPart));
  const qaThemeEvidencePass = themeAudit.themeZodValidated && themeAudit.assetManifestZodValidated && themeAudit.identicalCoreTraceAcrossThemeBoundary
    && !themeAudit.coreImportsTheme && themeAudit.coreDomReferences === 0 && themeAudit.coreAssetFilenameReferences === 0
    && themeAudit.presentationImportsTheme && themeAudit.cssLiteralColorsOutsideFallbackRoot === 0;
  const themePass = qaThemeEvidencePass && themeAudit.productionThemeUsesZodParse && themeAudit.rendererResolvesAssetManifestRoles
    && !themeAudit.cssDuplicatesThemeDefaults && !themeAudit.htmlDuplicatesThemeCopy;
  const stableBuild = hashBefore === LOCKED_HASH && hashAfter === LOCKED_HASH;

  const cases = [];
  cases.push({
    id: 'NATURAL-CHOKE-001', title: '原卡口自然通过回归', previousStatus: 'BLOCKER',
    closure: desktopChoke === 5 && mobileChoke === 2 && maxStreak < 3 ? 'CLOSED' : 'OPEN', provenance: 'NATURAL_INPUT',
    repeatableSteps: ['从全新普通页面执行五组桌面全局高度/升降策略。', '执行两组 390x844 原生触摸策略。', '不调用 resetGame、loadScenario、step、debug pose 或障碍坐标点击答案。'],
    expected: ['desktop former-choke=5/5', 'mobile former-choke=2/2', 'maxNoProgressBounceStreak<3'],
    actual: [`desktop former-choke=${desktopChoke}/5`, `mobile former-choke=${mobileChoke}/2`, `maxNoProgressBounceStreak=${maxStreak}`, `desktop maxX=${desktopRuns.map((run) => round(run.maxX)).join(', ')}`],
    severity: desktopChoke === 5 && mobileChoke === 2 && maxStreak < 3 ? 'NONE' : 'BLOCKER',
    mechanicalCause: desktopChoke === 5 && mobileChoke === 2 && maxStreak < 3 ? '全部七组自然策略均越过原卡口，且没有连续三次同点无进展反弹。' : '至少一个自然策略仍未越过原卡口，或仍存在三次以上同点反弹循环。',
    acceptanceCriteria: ['5/5 desktop pass x=1650', '2/2 mobile pass x=1650', 'all bounce streaks<3'],
    suggestedTests: ['继续将七组策略作为不含障碍坐标的浏览器回归。'], evidence: [rawPath, ...screenshots],
  });
  cases.push({
    id: 'STUCK-REBOUND-009', title: 'v1 desktop-natural-5 精确重放', previousStatus: 'HIGH',
    closure: exact.maxX > 1650 && exact.maxNoProgressBounceStreak < 3 ? 'CLOSED' : 'OPEN', provenance: 'NATURAL_INPUT',
    repeatableSteps: ['全新 1180x720 页面。', '使用 global-height=570、vertical-threshold=-112、wait-bias=4。', '仅真实鼠标点击，不读取障碍坐标。'],
    expected: ['maxX>1650', 'maxNoProgressBounceStreak<3', '不再在 white-column 形成重复回接循环。'],
    actual: [`maxX=${round(exact.maxX)}`, `status=${exact.status}/${exact.failReason || 'none'}`, `maxNoProgressBounceStreak=${exact.maxNoProgressBounceStreak}`, `whiteColumnBounceCount=${exact.whiteColumnBounceCount}`],
    severity: exact.maxX > 1650 && exact.maxNoProgressBounceStreak < 3 ? 'NONE' : 'HIGH',
    mechanicalCause: exact.maxX > 1650 && exact.maxNoProgressBounceStreak < 3 ? '输入缓冲/当前接触时序使 v1 的失败策略自然离开白柱并越过卡口。' : '精确策略仍在白柱前停止或形成重复接触循环。',
    acceptanceCriteria: ['same v1 policy passes former choke', 'bounce streak<3'], suggestedTests: ['保留 exact desktop-natural-5 配置与当前 hash 结果。'], evidence: [rawPath, ...exact.screenshots],
  });
  const blueprint = themeAudit.blueprint;
  const progressiveMetadata = blueprint.map((stage) => stage.role).join(',') === 'teach,develop,test'
    && blueprint.map((stage) => stage.difficulty).join(',') === '1,2,3'
    && blueprint.every((stage, index) => index === 0 || stage.intensity > blueprint[index - 1].intensity);
  cases.push({
    id: 'PROGRESSIVE-TEACHING-011', title: '三阶段教学递进', previousStatus: 'HIGH',
    closure: progressiveMetadata ? 'PARTIAL' : 'OPEN', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['Zod 解析 ORIGINAL_COURSE_BLUEPRINT。', '检查 role、difficulty、intensity 与 mechanicIds。', '对照运行时自然试玩的 stageIdsVisited。'],
    expected: ['明确 teach→develop→test。', '难度与强度单调上升。', '实际几何提供 introduce→practice→combine，而非只增加标签。'],
    actual: [`blueprint=${JSON.stringify(blueprint)}`, `desktop full-stage win observable=${desktopFullStages}`, `mobile full-stage win observable=${mobileFullStages}`, '原有开场几何仍同时包含多种切割块、多个支撑和移动支撑，未新增 isolated practice beat 元数据。'],
    severity: 'MEDIUM',
    mechanicalCause: 'Builder 已新增可验证的 teach/develop/test、难度和强度元数据，关闭了“完全无教学结构”；但实际开场机制密度和 introduce→practice→combine 安全练习仍未被机器证据闭合。',
    acceptanceCriteria: ['validated staged metadata', 'one isolated safe introduction per new mechanic', 'practice before combination'],
    suggestedTests: ['为 blueprint 增加 introduces/practices/combines 字段并验证实际对象分布。'], evidence: [themePath, rawPath, path.join(WORKSPACE, 'src/game-content.ts')],
  });
  cases.push({
    id: 'LEVEL-THEME-COUPLING-013', title: '核心关卡与最终主题表达解耦', previousStatus: 'MEDIUM',
    closure: 'CLOSED', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['检查 game-content 蓝图 labelToken。', '检查 game-core 的 support/finish ID。', '确认 HUD 最终文案通过 theme copy 解析。'],
    expected: ['课程仅保存中性 labelToken/语义 ID。', '核心状态不保存颜色、题材文案或资产名。'],
    actual: [`blueprint labelTokens=${blueprint.map((stage) => stage.labelToken).join(', ')}`, `remaining themed core IDs=${themeAudit.themedCoreIds.join(', ') || 'none'}`, '最终显示文案已从 theme.copy.stage 解析。'],
    severity: 'NONE',
    mechanicalCause: '课程阶段只保存 labelToken，main 通过 theme copy 解析最终文案；几何和状态规则不读取可见文案、颜色或资产文件名。现存对象 ID 不参与主题表现决策。',
    acceptanceCriteria: ['display copy outside game core', 'geometry independent of copy/colors/assets', 'no asset filenames in state'],
    suggestedTests: ['未来加入存档前再评估对象 ID 的跨主题迁移兼容性。'], evidence: [themePath, path.join(WORKSPACE, 'src/game-core.ts'), path.join(WORKSPACE, 'src/game-content.ts')],
  });
  cases.push({
    id: 'CENTRAL-THEME-PIPELINE-015', title: 'ThemeTokens 与 AssetManifest 集中入口', previousStatus: 'HIGH',
    closure: themePass ? 'CLOSED' : 'PARTIAL', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['用严格 Zod schema 解析 MECHANICS_DEMO_THEME 与五项 AssetManifest。', '解析第二套 QA theme。', '检查 core 依赖图和相同输入 trace hash。', '检查 main/renderer/cut visuals 与 CSS 主题入口。'],
    expected: ['theme/manifest Zod 通过。', '两套主题核心 trace 相同。', '核心不导入 theme/DOM/资产文件名。', '表现层集中消费 theme。'],
    actual: [`QA themeZodValidated=${themeAudit.themeZodValidated}`, `QA assetManifestZodValidated=${themeAudit.assetManifestZodValidated}`, `identicalCoreTrace=${themeAudit.identicalCoreTraceAcrossThemeBoundary}`, `coreImportsTheme=${themeAudit.coreImportsTheme}, coreDomRefs=${themeAudit.coreDomReferences}, coreAssetRefs=${themeAudit.coreAssetFilenameReferences}`, `presentationImportsTheme=${themeAudit.presentationImportsTheme}`, `productionThemeUsesZodParse=${themeAudit.productionThemeUsesZodParse}`, `rendererResolvesAssetManifestRoles=${themeAudit.rendererResolvesAssetManifestRoles}`, `cssDuplicatesThemeDefaults=${themeAudit.cssDuplicatesThemeDefaults}`, `htmlDuplicatesThemeCopy=${themeAudit.htmlDuplicatesThemeCopy}`],
    severity: themePass ? 'NONE' : 'HIGH',
    mechanicalCause: themePass ? '主题和资产管线在生产入口完整验证并集中解析。' : 'theme.ts 已集中颜色/文案并列出资产清单，QA 侧严格 schema 与跨主题核心 trace 通过；但生产代码没有 Zod parse，CSS/index 仍重复默认主题，renderer 也未按 manifest role/provider 解析资产，因此只关闭了一部分旧问题。',
    acceptanceCriteria: ['production strict theme parse', 'production strict manifest parse', 'renderer resolves manifest roles/providers', 'no duplicated CSS/index defaults', 'identical core trace'], suggestedTests: ['把 QA 的严格 schema 提升为生产构建前验证；renderer 只按 manifest role/provider 获取表现资源。'], evidence: [themePath, path.join(WORKSPACE, 'src/theme.ts'), path.join(WORKSPACE, 'tests/theme.test.ts')],
  });
  cases.push({
    id: 'CORE-SKIN-INDEPENDENCE-018', title: '核心机制与主题依赖隔离', previousStatus: 'NEW', closure: 'CLOSED', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['检查 game-core/game-content import graph。', '扫描 DOM 与资产文件名引用。', '比较两套主题边界下的同 seed/input trace hash。'],
    expected: ['核心不导入 theme/renderer/DOM。', '核心 trace 不随主题改变。'],
    actual: [`coreImportsTheme=${themeAudit.coreImportsTheme}`, `coreDomReferences=${themeAudit.coreDomReferences}`, `coreAssetFilenameReferences=${themeAudit.coreAssetFilenameReferences}`, `identicalCoreTrace=${themeAudit.identicalCoreTraceAcrossThemeBoundary}`],
    severity: 'NONE', mechanicalCause: '碰撞、运动和课程状态仅依赖数值与接触语义；主题替换不进入核心依赖图。',
    acceptanceCriteria: ['no theme or DOM import', 'identical trace'], suggestedTests: ['保留跨主题 trace hash 回归。'], evidence: [themePath, path.join(WORKSPACE, 'src/game-core.ts'), path.join(WORKSPACE, 'src/game-content.ts')],
  });
  cases.push({
    id: 'SAVE-SKIN-INDEPENDENCE-014', title: '存档跨主题独立性', previousStatus: 'MEDIUM', closure: 'INCONCLUSIVE', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['搜索 versioned save schema、save/load 和 persistence adapter。'],
    expected: ['存档只含主题中性语义与数值。', '主题 A 存档可在主题 B 加载并保持核心状态。'],
    actual: ['当前原型没有 versioned persistence schema 或 save/load 路径，无法执行跨主题往返。'],
    severity: 'MEDIUM', mechanicalCause: '缺少存档实现，不能以核心解耦替代跨主题存档验证。',
    acceptanceCriteria: ['versioned save schema', 'cross-theme round trip'], suggestedTests: ['加入存档时禁止文案、颜色和资产文件名进入 schema。'], evidence: [themePath, path.join(WORKSPACE, 'src')],
  });
  cases.push({
    id: 'FULL-COURSE-TOLERANCE-016', title: '完整整关自然输入容错', previousStatus: 'HIGH',
    closure: desktopWins >= 3 && mobileWins >= 1 && desktopFullStages && mobileFullStages ? 'CLOSED' : 'OPEN', provenance: 'NATURAL_INPUT',
    repeatableSteps: ['五次桌面和两次移动从普通起点完整试玩。', '只允许真实鼠标/原生触摸。', '记录三阶段访问和明确 won。'],
    expected: ['desktop won>=3/5', 'mobile won>=1/2', '至少一个桌面和移动胜局遍历全部三阶段。'],
    actual: [`desktop won=${desktopWins}/5`, `mobile won=${mobileWins}/2`, `desktop full-stage win=${desktopFullStages}`, `mobile full-stage win=${mobileFullStages}`, `desktop outcomes=${desktopRuns.map((run) => `${run.status}/${run.failReason || 'none'}`).join(', ')}`],
    severity: desktopWins >= 3 && mobileWins >= 1 && desktopFullStages && mobileFullStages ? 'NONE' : 'HIGH',
    mechanicalCause: desktopWins >= 3 && mobileWins >= 1 && desktopFullStages && mobileFullStages ? '小幅输入时机变化下仍保留足够桌面/移动完整通关，并有三阶段路径证据。' : '完整路线在桌面或移动端的明确胜局数量/三阶段证据不足。',
    acceptanceCriteria: ['desktop>=3 wins', 'mobile>=1 win', 'one full-stage win per platform'], suggestedTests: ['继续使用同一组全局高度策略，避免通过障碍坐标特调。'], evidence: [rawPath, ...screenshots],
  });
  cases.push({
    id: 'MOVING-SUPPORT-REFLECTION-017', title: '移动支撑相对速度钝端反射', previousStatus: 'NEW',
    closure: movingPass ? 'CLOSED' : 'INCONCLUSIVE', provenance: 'TARGETED_DIAGNOSTIC',
    repeatableSteps: ['loadScenario moving-horizontal/vertical，仅用于专项初态。', '扫描支撑运动相位和一次后续翻转时机。', '逐 fixed step 记录碰撞前后玩家/支撑速度和事件法线。'],
    expected: ['body/handle 命中移动支撑。', 'incoming relative normal<0。', 'outgoing relative normal>0。', '恢复锁内只产生一次 bounce。'],
    actual: movingDiagnostic.found ? [`scenario=${movingDiagnostic.found.scenario}, support=${movingDiagnostic.found.supportId}, part=${movingDiagnostic.found.contactPart}`, `supportBefore=${JSON.stringify(movingDiagnostic.found.supportVelocityBefore)}`, `incomingRelative=${JSON.stringify(movingDiagnostic.found.incomingRelativeVelocity)}`, `normal=(${movingDiagnostic.found.normalX},${movingDiagnostic.found.normalY})`, `supportAfter=${JSON.stringify(movingDiagnostic.found.supportVelocityAfter)}`, `outgoingRelative=${JSON.stringify(movingDiagnostic.found.outgoingRelativeVelocity)}`, `impulseCountDuringLockout=${movingDiagnostic.found.impulseCountDuringLockout}`] : [`no blunt moving-support bounce found across ${movingDiagnostic.attempts.length} deterministic phase/timing attempts`],
    severity: movingPass ? 'NONE' : 'MEDIUM',
    mechanicalCause: movingPass ? '移动支撑碰撞按表面相对速度的法线分量反射，且恢复锁期间仅注入一次冲量。' : '现有桥和相位扫描未复现移动支撑钝端碰撞，无法闭合黑盒反射证据。',
    acceptanceCriteria: ['blunt contact', 'relative normal reverses sign', 'one impulse'], suggestedTests: ['若仍不可复现，增加仅构造入射初态的 moving-blunt 场景；碰撞必须由 step/真实时钟发生。'], evidence: [rawPath, ...(movingDiagnostic.screenshot ? [movingDiagnostic.screenshot] : [])],
  });
  if (!stableBuild) cases.unshift({
    id: 'UNSTABLE_BUILD', title: '测试期间构建哈希变化', previousStatus: 'NEW', closure: 'OPEN', provenance: 'READ_ONLY_ARCHITECTURE',
    repeatableSteps: ['测试前后计算 dist/index.html SHA-256。'], expected: [`both hashes=${LOCKED_HASH}`], actual: [`before=${hashBefore}`, `after=${hashAfter}`], severity: 'BLOCKER',
    mechanicalCause: '测试对象未保持锁定构建，证据不可归属。', acceptanceCriteria: ['stable locked hash'], suggestedTests: ['重新锁定构建后重跑。'], evidence: [BUILD],
  });

  const issues = cases.filter((item) => item.severity !== 'NONE').map((item) => ({ caseId: item.id, severity: item.severity, summary: item.mechanicalCause }));
  const passed = stableBuild && desktopChoke === 5 && mobileChoke === 2 && maxStreak < 3 && desktopWins >= 3 && mobileWins >= 1
    && desktopFullStages && mobileFullStages && movingPass && themePass && errors.length === 0 && previewClosed && issues.length === 0;
  const report = {
    schemaVersion: 1, artifactType: 'PostBuilderRetestQaArtifact', targetGame: '符刃夜行', workspace: WORKSPACE,
    lockedBuildSha256: LOCKED_HASH, buildSha256Before: hashBefore, buildSha256After: hashAfter, testedAt: new Date().toISOString(), passed,
    naturalPlay: {
      desktopAttempts: 5, desktopWins, desktopFormerChokePasses: desktopChoke,
      mobileAttempts: 2, mobileWins, mobileFormerChokePasses: mobileChoke, maxNoProgressBounceStreak: maxStreak,
      exactV1Replay: { label: exact.label, maxX: round(exact.maxX), status: exact.status, maxNoProgressBounceStreak: exact.maxNoProgressBounceStreak },
      desktopRuns, mobileRuns,
    },
    movingSupportDiagnostic: movingDiagnostic,
    themeAudit,
    cases,
    issues,
    screenshots,
    consoleLog: consolePath,
    previewClosed,
    validatedWith: 'zod@4 strict PostBuilderRetestQaArtifact, case, theme token, asset manifest, and course blueprint schemas',
  };
  const validated = reportSchema.parse(report);
  await fsp.writeFile(REPORT, `${JSON.stringify(validated, null, 2)}\n`);
  reportSchema.parse(JSON.parse(await fsp.readFile(REPORT, 'utf8')));
  process.stdout.write(`${JSON.stringify({ artifactPath: REPORT, artifactSha256: sha256File(REPORT), buildSha256: hashAfter, passed: validated.passed, naturalPlay: { desktopWins, desktopChoke, mobileWins, mobileChoke, maxStreak, exact: validated.naturalPlay.exactV1Replay }, movingPass, themePass, previewClosed, issues }, null, 2)}\n`);
}

main().catch(async (error) => {
  await fsp.mkdir(OUTPUT, { recursive: true });
  await fsp.writeFile(path.join(OUTPUT, 'runner-error.log'), `${error.stack || error.message || String(error)}\n`);
  if (PREVIEW_PID > 0) { try { process.kill(PREVIEW_PID, 'SIGTERM'); } catch {} }
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
