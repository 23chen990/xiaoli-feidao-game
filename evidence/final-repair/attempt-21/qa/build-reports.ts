import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { QaReportSchema } from '../../../../../src/schemas/index.ts';
import { NaturalFlowEvidenceSchema } from '../../../../../src/schemas/natural-flow.ts';
import { PerceptualQaReportSchema } from '../../../../../src/schemas/product-experience.ts';
import { ResultSchema } from '../../../qa-recovery-20260907/recovery-schemas.ts';

const attempt = resolve(import.meta.dirname, '..');
const reportDir = resolve(import.meta.dirname);
const packet = JSON.parse(readFileSync(`${attempt}/qa-task.json`, 'utf8'));
const workspace = packet.workspace as string;
const buildHash = packet.expectedBuildSha256 as string;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as any;
const rel = (path: string) => resolve(attempt, path);
const capture = (viewportDir: string, trial: string) => read(`${attempt}/qa-natural/${viewportDir}/${trial === 'static-550ms' ? '' : `${trial}/`}recording.json`);
const portrait = capture('portrait-390x844', 'static-spaced');
const desktop = capture('desktop-1100x720', 'static-spaced');
const portraitInitial = capture('portrait-390x844', 'static-550ms');
const desktopInitial = capture('desktop-1100x720', 'static-550ms');
const desktopWhiteAttempt = capture('desktop-1100x720', 'desktop-white-opening');
const portraitContact = portrait.branchProjections.find((p: any) => p.eventDelta?.targetId === 'level1-runway-main' && p.eventDelta?.contactPart === 'tip');
const portraitRepeat = portrait.branchProjections.find((p: any) => p.eventDelta?.targetId === 'level1-runway-main' && p.eventDelta?.contactPart === 'tip' && p.atMs > (portraitContact?.atMs ?? 0));
const desktopRunway = desktop.branchProjections.find((p: any) => p.eventDelta?.targetId === 'level1-runway-main' && p.eventDelta?.contactPart === 'tip');
const desktopWhite = desktopWhiteAttempt.branchProjections.find((p: any) => p.eventDelta?.targetId === 'white-landing');
if (!portraitContact || !portraitRepeat || !desktopRunway) throw new Error('Required naturally observed runway contact projections are missing');

const evidence = (path: string) => ({ path, sha256: sha(path) });
const portraitRoot = `${attempt}/qa-natural/portrait-390x844`;
const desktopRoot = `${attempt}/qa-natural/desktop-1100x720`;
const evidencePaths = {
  portraitRecording: `${portraitRoot}/static-spaced/recording.json`,
  portraitContact: `${portraitRoot}/static-spaced/frames/journey-03s.png`,
  portraitTerminal: `${portraitRoot}/static-spaced/frames/terminal.png`,
  portraitReplay: `${portraitRoot}/static-spaced/frames/replay.png`,
  portraitVideo: readdirSync(`${portraitRoot}/static-spaced/video`).map(n => `${portraitRoot}/static-spaced/video/${n}`).find(p => p.endsWith('.webm'))!,
  desktopRecording: `${desktopRoot}/static-spaced/recording.json`,
  desktopContact: `${desktopRoot}/static-spaced/frames/journey-03s.png`,
  desktopLater: `${desktopRoot}/static-spaced/frames/journey-14s.png`,
  desktopTerminal: `${desktopRoot}/static-spaced/frames/terminal.png`,
  desktopReplay: `${desktopRoot}/static-spaced/frames/replay.png`,
  desktopVideo: readdirSync(`${desktopRoot}/static-spaced/video`).map(n => `${desktopRoot}/static-spaced/video/${n}`).find(p => p.endsWith('.webm'))!,
  desktopWhiteRecording: `${desktopRoot}/desktop-white-opening/recording.json`,
};
for (const path of Object.values(evidencePaths)) if (!path || !existsSync(path)) throw new Error(`Required QA evidence missing: ${path}`);
const observedAt = new Date().toISOString();
const viewportPortrait = { width: 390, height: 844, label: 'portrait-390x844' };
const viewportDesktop = { width: 1100, height: 720, label: 'desktop-1100x720' };

const branchProjection = {
  schemaVersion: 1,
  artifactType: 'natural-branch-projection',
  targetGame: packet.targetGame,
  workspace,
  buildHash,
  source: 'Read-only __GAME_TEST__.getState snapshots during fresh-context natural-input sessions; no setters, storage injection, debug API, fixture, or internal events dispatched.',
  inputTrials: [
    { id: 'static-550ms', viewports: [portraitInitial.viewport, desktopInitial.viewport], result: 'both reach one cut and visible failure before x>1000; replay click returns to ready; exact runway contact event not observed' },
    { id: 'static-spaced-1600ms', viewports: [portrait.viewport, desktop.viewport], result: 'both naturally emit exact level1-runway-main top-face sharp tip anchor; desktop later reaches x>1000 before visible failure; portrait also crosses x>1000 before visible failure' },
    { id: 'desktop-white-opening', viewports: [desktopWhiteAttempt.viewport], result: desktopWhite ? 'white-landing observed' : 'white-landing not observed; same run reaches runway branch instead' },
    { id: 'static-950ms', viewports: [capture('portrait-390x844', 'static-950ms').viewport, capture('desktop-1100x720', 'static-950ms').viewport], result: 'fresh portrait and desktop sessions; fixed cadence; early terminal before required runway or white landing event projection' },
  ],
  matrix: [
    {
      id: 'L1-RUNWAY-EARLY-SHARP-390', objectType: 'level1-runway-main sharp blade tip', lifecycleStateBranch: 'fresh start → first cut → airborne → early top-face contact → anchored', rendererPresentationPath: 'SliceSimulation support sharp-hit event → ThreeWorldRenderer visible blade/support presentation', viewport: '390x844', status: 'FAIL',
      observed: { atMs: portraitContact.atMs, worldTime: portraitContact.worldTime, eventDelta: portraitContact.eventDelta, supportId: portraitContact.supportId, part: portraitContact.part, normal: portraitContact.normal, lifecycleState: portraitContact.lifecycleState, player: portraitContact.player, anchorId: portraitContact.anchorId, cuts: portraitContact.cuts },
      followUp: { atMs: portraitRepeat.atMs, eventDelta: portraitRepeat.eventDelta, supportId: portraitRepeat.supportId, part: portraitRepeat.part, normal: portraitRepeat.normal, lifecycleState: portraitRepeat.lifecycleState, player: portraitRepeat.player, anchorId: portraitRepeat.anchorId },
      evidence: [evidence(evidencePaths.portraitRecording), evidence(evidencePaths.portraitContact), evidence(evidencePaths.portraitVideo)],
      conclusion: 'The exact natural top-face tip branch still emits anchor on level1-runway-main at player x≈305, then anchors again at x≈333 within the reproduced dead-end area. Later input recovers and crosses x>1000, but does not change the observed incorrect anchor response at this contact.',
    },
    {
      id: 'L1-RUNWAY-DESKTOP-CONTROL', objectType: 'level1-runway-main sharp blade tip', lifecycleStateBranch: 'fresh start → first cut → airborne → early top-face contact → anchored', rendererPresentationPath: 'SliceSimulation support sharp-hit event → ThreeWorldRenderer visible blade/support presentation', viewport: '1100x720', status: 'FAIL',
      observed: { atMs: desktopRunway.atMs, worldTime: desktopRunway.worldTime, eventDelta: desktopRunway.eventDelta, supportId: desktopRunway.supportId, part: desktopRunway.part, normal: desktopRunway.normal, lifecycleState: desktopRunway.lifecycleState, player: desktopRunway.player, anchorId: desktopRunway.anchorId, cuts: desktopRunway.cuts },
      evidence: [evidence(evidencePaths.desktopRecording), evidence(evidencePaths.desktopContact), evidence(evidencePaths.desktopVideo)],
      conclusion: 'Desktop also emits an early runway top-face tip anchor. This is recorded separately from the required desktop white-landing opening control.',
    },
    {
      id: 'L1-WHITE-LANDING-OPENING-1100', objectType: 'white-landing teaching support', lifecycleStateBranch: 'fresh start → first cut → opening landing → anchored teaching pause', rendererPresentationPath: 'authored white-landing support → ThreeWorldRenderer visible anchor → normal mouse input', viewport: '1100x720', status: desktopWhite ? 'PASS' : 'BLOCKED',
      observed: desktopWhite ? { eventDelta: desktopWhite.eventDelta, supportId: desktopWhite.supportId, part: desktopWhite.part, normal: desktopWhite.normal, lifecycleState: desktopWhite.lifecycleState, player: desktopWhite.player } : null,
      evidence: [evidence(evidencePaths.desktopWhiteRecording), evidence(`${desktopRoot}/desktop-white-opening/frames/startup.png`), evidence(`${desktopRoot}/desktop-white-opening/frames/journey-03s.png`)],
      conclusion: desktopWhite ? 'Exact white-landing anchor observed.' : 'Required separate white-landing anchor was not observed in any fresh desktop session; a sibling runway branch cannot close this viewport/state cell.',
    },
    {
      id: 'L1-TERMINAL-REPLAY-BOTH', objectType: 'visible failure settlement and replay control', lifecycleStateBranch: 'natural journey → visible failed terminal → visible replay click → ready', rendererPresentationPath: 'game DOM terminal layer and replay button over ThreeWorldRenderer canvas', viewport: '390x844 + 1100x720', status: 'PASS',
      observed: { portrait: { terminal: portrait.terminal, replay: portrait.replay }, desktop: { terminal: desktop.terminal, replay: desktop.replay } },
      evidence: [evidence(evidencePaths.portraitTerminal), evidence(evidencePaths.portraitReplay), evidence(evidencePaths.desktopTerminal), evidence(evidencePaths.desktopReplay)],
      conclusion: 'Both viewports show exact visible failure copy matching read-only status=failed; clicking the visible 重玩 control produces read-only status=ready and a replay screenshot.',
    },
    {
      id: 'L1-LATER-ROUTE-BOTH', objectType: 'level-one route progression', lifecycleStateBranch: 'natural input → runway recovery attempt → later course → terminal failure', rendererPresentationPath: 'normal input → SliceSimulation → ThreeWorldRenderer', viewport: '390x844 + 1100x720', status: 'PASS',
      observed: { portraitMaxX: Math.max(...portrait.observations.map((o: any) => o.player?.x ?? 0)), desktopMaxX: Math.max(...desktop.observations.map((o: any) => o.player?.x ?? 0)) },
      evidence: [evidence(evidencePaths.portraitRecording), evidence(evidencePaths.desktopRecording), evidence(evidencePaths.desktopLater)],
      conclusion: 'The spaced static schedule crosses x>1000 in both viewports before visible failure; the 550 ms schedule ends earlier and is preserved as separate evidence.',
    },
  ],
  checkedAt: observedAt,
};
const BranchProjectionSchema = z.object({
  schemaVersion: z.literal(1), artifactType: z.literal('natural-branch-projection'), targetGame: z.string(), workspace: z.string(), buildHash: z.string().regex(/^[a-f0-9]{64}$/u), source: z.string(), inputTrials: z.array(z.object({ id: z.string(), viewports: z.array(z.any()), result: z.string() })), matrix: z.array(z.object({ id: z.string(), objectType: z.string(), lifecycleStateBranch: z.string(), rendererPresentationPath: z.string(), viewport: z.string(), status: z.enum(['PASS', 'FAIL', 'BLOCKED']), observed: z.any(), followUp: z.any().optional(), evidence: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) })), conclusion: z.string() })), checkedAt: z.string().datetime(),
}).strict();
const parsedProjection = BranchProjectionSchema.parse(branchProjection);
const projectionPath = `${reportDir}/branch-projection.json`;
writeFileSync(projectionPath, `${JSON.stringify(parsedProjection, null, 2)}\n`, { flag: 'wx' });

const contactPixelsPass = true;
const perceptualBlockers = [
  'Portrait exact runway tip contact is naturally visible but enters anchored state instead of the hypothesized recovery response.',
  'Desktop white-landing opening anchor was not observed; the exact viewport/state branch remains BLOCKED.',
];
const perceptualCases = [
  {
    featureId: 'level1-runway-early-sharp-contact', sourceCheckIds: ['L1-RUNWAY-EARLY-SHARP-390'], objectType: 'level1-runway-main sharp blade tip', stateBranch: 'fresh start → first cut → early top-face tip contact → anchored', playerAction: 'fixed predeclared normal touch schedule', visibleSignal: 'knife tip remains visibly planted on the yellow runway while read-only anchorId names level1-runway-main', naturalTrigger: 'natural-input contact event observed in fresh context', expectedEventOrder: ['touch input', 'approaching sharp top-face contact', 'hard-surface bounce and forward/upward recovery'], requiredViewports: [viewportPortrait], negativeAssertions: ['must not remain anchored between the reproduced x≈301.95 and x≈329.45 dead-end'], sourceEvidence: [evidencePaths.portraitRecording], blockingIf: ['anchor event is emitted instead of bounce/recovery', 'the same-object projection is absent'],
  },
].map(f => f);
const perceptual = PerceptualQaReportSchema.parse({
  schemaVersion: 2, artifactType: 'perceptual-qa-report', targetGame: packet.targetGame, targetRunId: 'mobile-slice-adaptation-20260830', targetWorkspace: workspace,
  runtimeEntrypoints: [`${workspace}/index.html`, `${workspace}/src/main.ts`],
  contractHash: sha(`${attempt}/../../qa-recovery-20260907/active-slice-contract.json`), buildHash, runtime: 'web-lite', reviewer: 'QAAgent', authorIndependent: true, passed: false, blockers: perceptualBlockers,
  cases: [
    {
      featureId: 'level1-runway-early-sharp-contact', sourceCheckIds: ['L1-RUNWAY-EARLY-SHARP-390'], objectType: 'level1-runway-main sharp blade tip', stateBranch: 'fresh start → first cut → early top-face tip contact → anchored', viewport: viewportPortrait,
      playerVisible: contactPixelsPass, naturalTriggerVerified: true, eventOrderVerified: false, negativeAssertionsPassed: false, perceptualPassed: false,
      observedSignal: 'The knife and yellow runway are both visible; the blade stands planted at the runway while status is anchored. Projection confirms same support, sharp tip, and top-face normal.', observedEventOrder: ['touch input', 'level1-runway-main tip anchor'],
      screenshots: [evidence(evidencePaths.portraitContact)], trace: evidence(evidencePaths.portraitRecording), evidence: [evidencePaths.portraitRecording], notes: ['Exact branch pixels reviewed at 390x844; visible pixels exist, but the observed response fails the acceptance branch.'],
    },
    {
      featureId: 'white-landing-opening-teaching-anchor', sourceCheckIds: ['L1-WHITE-LANDING-OPENING-1100'], objectType: 'white-landing teaching support', stateBranch: 'fresh start → first cut → opening landing → anchored teaching pause', viewport: viewportDesktop,
      playerVisible: false, naturalTriggerVerified: false, eventOrderVerified: false, negativeAssertionsPassed: false, perceptualPassed: false,
      observedSignal: 'The opening anchor identity and causal relation were not observed in a desktop natural trace; review remains blocked.', observedEventOrder: [],
      screenshots: [evidence(`${desktopRoot}/desktop-white-opening/frames/startup.png`), evidence(`${desktopRoot}/desktop-white-opening/frames/journey-03s.png`)], trace: evidence(evidencePaths.desktopWhiteRecording), evidence: [evidence(evidencePaths.desktopWhiteRecording)], notes: ['A separate white-landing anchor cannot be inferred from the runway branch.'],
    },
    ...[
      { id: 'natural-failure-replay-portrait', viewport: viewportPortrait, terminal: portrait.terminal, replay: portrait.replay, terminalPath: evidencePaths.portraitTerminal, replayPath: evidencePaths.portraitReplay, recordingPath: evidencePaths.portraitRecording },
      { id: 'natural-failure-replay-desktop', viewport: viewportDesktop, terminal: desktop.terminal, replay: desktop.replay, terminalPath: evidencePaths.desktopTerminal, replayPath: evidencePaths.desktopReplay, recordingPath: evidencePaths.desktopRecording },
    ].map(item => ({
      featureId: item.id, sourceCheckIds: ['L1-TERMINAL-390', 'L1-TERMINAL-1100'], objectType: 'visible failure terminal and replay control', stateBranch: 'natural gameplay → visible failure → visible replay → ready', viewport: item.viewport,
      playerVisible: !!item.terminal?.visiblePixels, naturalTriggerVerified: !!item.terminal && !!item.replay?.clickedVisibleControl, eventOrderVerified: item.terminal?.status === 'failed' && item.replay?.status === 'ready', negativeAssertionsPassed: true, perceptualPassed: true,
      observedSignal: `${item.terminal?.exactCopy}; replay control text=${item.replay?.controlText}; post-click status=${item.replay?.status}.`, observedEventOrder: ['visible failure copy', 'read-only status=failed', 'visible replay click', 'read-only status=ready'],
      screenshots: [evidence(item.terminalPath), evidence(item.replayPath)], trace: evidence(item.recordingPath), evidence: [item.recordingPath], notes: ['Text and action affordance are visible and readable at the tested viewport.'],
    })),
    ...[
      { id: 'later-route-portrait', viewport: viewportPortrait, recordingPath: evidencePaths.portraitRecording, screenshotPath: `${portraitRoot}/static-spaced/frames/journey-10s.png`, maxX: Math.max(...portrait.observations.map((o: any) => o.player?.x ?? 0)) },
      { id: 'later-route-desktop', viewport: viewportDesktop, recordingPath: evidencePaths.desktopRecording, screenshotPath: evidencePaths.desktopLater, maxX: Math.max(...desktop.observations.map((o: any) => o.player?.x ?? 0)) },
    ].map(item => ({
      featureId: item.id, sourceCheckIds: ['L1-RUNWAY-EARLY-SHARP-390', 'L1-INPUT-1100'], objectType: 'level-one later route', stateBranch: 'natural input → contact/recovery attempt → later route progression', viewport: item.viewport,
      playerVisible: true, naturalTriggerVerified: item.maxX > 1000, eventOrderVerified: true, negativeAssertionsPassed: true, perceptualPassed: item.maxX > 1000,
      observedSignal: `Later natural route reaches x=${item.maxX.toFixed(1)} before visible terminal failure.`, observedEventOrder: ['normal input', 'route progress', 'visible failure terminal'],
      screenshots: [evidence(item.screenshotPath)], trace: evidence(item.recordingPath), evidence: [item.recordingPath], notes: ['Later progress does not waive the earlier incorrectly anchored runway contact.'],
    })),
  ], checkedAt: observedAt,
});
const perceptualPath = `${reportDir}/perceptual-qa-report.json`;
writeFileSync(perceptualPath, `${JSON.stringify(perceptual, null, 2)}\n`, { flag: 'wx' });

const naturalBlockers = [
  'Portrait exact natural Level1 runway top-face tip contact entered anchored state at x≈305 and remained anchored near x≈333; this is the reproduced blocker.',
  'Desktop exact white-landing opening teaching anchor was not observed in the fresh natural-input runs.',
  'Natural runs reached a visible failure and replayed successfully, but neither viewport completed the declared default journey through successful terminal settlement.',
];
const natural = NaturalFlowEvidenceSchema.parse({
  schemaVersion: 1, startedFromReset: true,
  actions: ['Fresh Chromium context per viewport; no storage or state injection.', 'Fixed static input schedules only; 550ms, 950ms, and a predeclared 400ms + 1600ms spaced schedule. No adaptive scheduling from state, event, or pixels.', 'Read-only state snapshots for status/contact projections; visible normal touch/mouse input only; visible replay control clicked after visible failure.'],
  transitions: [
    { name: 'startup-to-first-cut-portrait', changed: portrait.observations.some((o: any) => o.cuts > 0), evidence: evidencePaths.portraitRecording },
    { name: 'portrait-exact-level1-runway-main-tip-contact', changed: true, evidence: evidencePaths.portraitRecording },
    { name: 'desktop-exact-white-landing-opening-anchor', changed: !!desktopWhite, evidence: evidencePaths.desktopWhiteRecording },
    { name: 'visible-failure-terminal-both-viewports', changed: !!portrait.terminal && !!desktop.terminal, evidence: evidencePaths.portraitTerminal },
    { name: 'visible-replay-to-ready-both-viewports', changed: portrait.replay?.status === 'ready' && desktop.replay?.status === 'ready', evidence: evidencePaths.portraitReplay },
  ], completion: 'terminal', replayObserved: portrait.replay?.status === 'ready' && desktop.replay?.status === 'ready', forbiddenOperations: [],
  screenshots: [evidencePaths.portraitContact, evidencePaths.portraitTerminal, evidencePaths.portraitReplay, evidencePaths.desktopContact, evidencePaths.desktopLater, evidencePaths.desktopTerminal, evidencePaths.desktopReplay],
  passed: false, blockers: naturalBlockers, runner: 'independent-QAAgent-fixed-schedule-recorder', buildHash, runtime: 'Chromium against unchanged dist/index.html; no rebuild during QA',
  device: { width: 390, height: 844, label: '390x844 portrait and 1100x720 desktop; separately captured fresh contexts' }, observedAt,
});
const naturalPath = `${reportDir}/qa-natural-journey-report.json`;
writeFileSync(naturalPath, `${JSON.stringify(natural, null, 2)}\n`, { flag: 'wx' });

const fatalIssues = [
  { id: 'L1-RUNWAY-EARLY-SHARP-390', severity: 'error' as const, message: 'Natural same-object Level1 runway top-face tip contact still emits anchor and reaches the reproduced anchored dead-end area.', evidence: evidencePaths.portraitRecording },
  { id: 'L1-WHITE-LANDING-OPENING-1100', severity: 'error' as const, message: 'Desktop white-landing opening branch was not observed; branch-specific QA remains blocked.', evidence: evidencePaths.desktopWhiteRecording },
];
const checks = [
  { name: 'exact expected build hash before and after capture', passed: [portrait, desktop, portraitInitial, desktopInitial, desktopWhiteAttempt].every((r: any) => r.expectedBuildSha256 === buildHash && r.unchanged), evidence: `${attempt}/qa-natural/` },
  { name: 'no state injection, debug API, or adaptive input scheduling', passed: [portrait, desktop, portraitInitial, desktopInitial, desktopWhiteAttempt].every((r: any) => r.startedFromFreshContext && !r.storageInjected && !r.stateInjection && !r.debugApiCalled && !r.adaptiveScheduling && !r.internalEventsDispatched), evidence: `${attempt}/qa-natural/` },
  { name: 'exact portrait runway branch uses recovery response', passed: portraitContact.eventDelta.type === 'bounce' && portraitContact.lifecycleState !== 'anchored' && portraitContact.anchorId === null, evidence: evidencePaths.portraitRecording },
  { name: 'exact desktop white-landing opening anchor observed', passed: !!desktopWhite, evidence: evidencePaths.desktopWhiteRecording },
  { name: 'visible terminal copy matches read-only status', passed: [portrait, desktop].every((r: any) => r.terminal?.visible && r.terminal?.visiblePixels && r.terminal.status === r.terminal.outcome), evidence: evidencePaths.portraitTerminal },
  { name: 'visible replay control returns to ready', passed: [portrait, desktop].every((r: any) => r.replay?.clickedVisibleControl && r.replay?.status === 'ready'), evidence: evidencePaths.portraitReplay },
  { name: 'perceptual and natural gates pass', passed: false, evidence: perceptualPath },
];
const allScreenshots = [evidencePaths.portraitContact, evidencePaths.portraitTerminal, evidencePaths.portraitReplay, evidencePaths.desktopContact, evidencePaths.desktopLater, evidencePaths.desktopTerminal, evidencePaths.desktopReplay];
const qaReport = QaReportSchema.parse({ schemaVersion: 1, passed: checks.every(c => c.passed) && fatalIssues.length === 0, checks, issues: fatalIssues, screenshots: allScreenshots, consoleLog: `${reportDir}/console.log`, testedAt: observedAt, naturalFlow: natural });
const qaPath = `${reportDir}/qa-report.json`;
writeFileSync(qaPath, `${JSON.stringify(qaReport, null, 2)}\n`, { flag: 'wx' });

const consoleSummary = {
  schemaVersion: 1, targetGame: packet.targetGame, workspace, buildHash,
  fatalPageErrors: [], consoleErrors: [],
  consoleWarnings: [
    'All sessions emitted repeated Three.js warning: Texture marked for update but no image data found.',
    'All sessions emitted Chromium GPU ReadPixels stall warnings during screen capture.',
  ],
  warningEvidence: [portraitInitial, desktopInitial, portrait, desktop, desktopWhiteAttempt].map((r: any) => ({ viewport: r.viewport.label, errors: r.errors.filter((e: any) => e.kind === 'warning') })),
  classification: 'No pageerror or console error observed. Texture and GPU ReadPixels messages were console warnings and are preserved for review.',
};
writeFileSync(`${reportDir}/console.log`, `${JSON.stringify(consoleSummary, null, 2)}\n`, { flag: 'wx' });

const blockers = [
  'PORTRAIT_EXACT_BRANCH_FAIL: the level1-runway-main sharp tip with normalY=-1 naturally emitted anchor at x≈305 and another anchor at x≈333; the expected no-anchor bounce/recovery was not observed.',
  'DESKTOP_WHITE_LANDING_BLOCKED: the separate white-landing opening teaching anchor was not naturally observed in any fresh desktop capture.',
  'DEFAULT_JOURNEY_BLOCKED: both viewports reached visible failure and replay-ready, but no successful level completion/settlement was observed.',
  'PERCEPTUAL_GATE_BLOCKED: the exact runway branch visibly remained anchored and the desktop white-landing cell is unobserved.',
];
const strictResult = ResultSchema.parse({ schemaVersion: 1, role: 'QAAgent', targetGame: packet.targetGame, workspace, status: 'BLOCKED', reportPaths: [projectionPath, naturalPath, perceptualPath, qaPath, `${reportDir}/console.log`], blockers, sourceModified: false, summary: 'Independent natural-input QA is BLOCKED. The portrait exact runway branch is reproduced and fails the expected recovery response; the desktop white-landing branch and successful default settlement remain unverified.' });
writeFileSync(`${reportDir}/strict-result.json`, `${JSON.stringify(strictResult, null, 2)}\n`, { flag: 'wx' });

function listFiles(dir: string): string[] { return readdirSync(dir).sort().flatMap(name => statSync(`${dir}/${name}`).isDirectory() ? listFiles(`${dir}/${name}`) : [`${dir}/${name}`]); }
const allEvidence = [...listFiles(`${attempt}/qa-natural`), ...listFiles(reportDir)].filter(path => !path.endsWith('/evidence-sha256.json'));
const digestManifest = { schemaVersion: 1, targetGame: packet.targetGame, workspace, expectedBuildSha256: buildHash, files: [...new Set(allEvidence)].sort().map(path => ({ path, sha256: sha(path) })) };
writeFileSync(`${reportDir}/evidence-sha256.json`, `${JSON.stringify(digestManifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ validated: true, status: strictResult.status, reportPaths: strictResult.reportPaths, blockers }));
