import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MatrixSchema, ResultSchema} from '../../../qa-recovery-20260907/recovery-schemas.ts';
import {QaReportSchema} from '../../../../../src/schemas/index.ts';
import {NaturalFlowEvidenceSchema} from '../../../../../src/schemas/natural-flow.ts';
import {PerceptualQaReportSchema} from '../../../../../src/schemas/product-experience.ts';

const root = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830';
const cycle = `${root}/recovery-human-20260907`;
const qa = `${cycle}/attempt-2/qa`;
const portrait = `${qa}/portrait-2`;
const desktop = `${qa}/desktop-2`;
const pFrame = (n: number) => `${portrait}/frames/frame-${String(n).padStart(4, '0')}.png`;
const dFrame = (n: number) => `${desktop}/frames/frame-${String(n).padStart(4, '0')}.png`;
const pRecording = `${portrait}/recording.json`;
const dRecording = `${desktop}/recording.json`;
const pTerminal = `${portrait}/frames/terminal.png`;
const dTerminal = `${desktop}/frames/terminal.png`;
const pReplay = `${portrait}/frames/replay.png`;
const dReplay = `${desktop}/frames/replay.png`;
const targetGame = 'mobile-slice-adaptation-20260830';
const workspace = `${root}/workspace/prototype-a`;
const builtHash = 'b234fd16adb1bf70e7bc021fd33a4703de03e59657bd21fb82419bda712747a6';
const now = new Date().toISOString();

const cells = [
  ['L1-INPUT-390', 'PASS', [pFrame(0), pRecording], '开场目标和刀均可见；正常触摸后切割与 HUD 变化可见。'],
  ['L1-GROUND-390', 'PASS', [pFrame(0)], '首个球体台面有可见厚度并接到下方地面。'],
  ['L1-STACK-390', 'BLOCKED', [pRecording], '录制走到同一关卡的后段，但没有足够清晰的逐对象画面证据确认指定 stack-b 的承托、散开和落地。'],
  ['L1-REWARD-390', 'PASS', [pFrame(0), pFrame(10)], '完整态 HUD 为 0；切面/分离后目标附近出现 +4，累计值同步。'],
  ['L1-PRESSURE-390', 'PASS', [pFrame(6), `${qa}/portrait-1/frames/terminal.png`], '尖刺在接近前可见；失败路线显示“跌出路线”和重试入口。'],
  ['L1-FINISH-390', 'PASS', [pFrame(15), pTerminal, pReplay], '终点倍率栏在手机视口可见；正常通关进入结算并重玩回到 ready。'],
  ['L1-INPUT-1100', 'PASS', [dFrame(0), dRecording], '开场目标和刀均可见；正常鼠标输入后切割与 HUD 变化可见。'],
  ['L1-GROUND-1100', 'PASS', [dFrame(0)], '首个球体台面有可见厚度并接到下方地面。'],
  ['L1-STACK-1100', 'BLOCKED', [dRecording], '录制走到同一关卡的后段，但没有足够清晰的逐对象画面证据确认指定 stack-b 的承托、散开和落地。'],
  ['L1-REWARD-1100', 'PASS', [dFrame(0), dFrame(10)], '完整态 HUD 为 0；切面/分离后目标附近出现局部奖励，累计值同步。'],
  ['L1-PRESSURE-1100', 'PASS', [dFrame(6), `${qa}/desktop-1/frames/terminal.png`], '尖刺在接近前可见；失败路线显示“跌出路线”和重试入口。'],
  ['L1-FINISH-1100', 'PASS', [dFrame(15), dTerminal, dReplay], '终点倍率栏在桌面视口可见；正常通关进入结算并重玩回到 ready。'],
] as const;

const matrix = MatrixSchema.parse({schemaVersion: 1, targetGame, workspace, cells: cells.map(([id, status, evidence, notes]) => ({id, objectType: id.includes('STACK') ? 'overlapping cuttable stack and support' : id.includes('FINISH') ? 'finish outcome lanes + settlement + replay' : id.includes('PRESSURE') ? 'spike hazard + failure/recovery affordance' : id.includes('REWARD') ? 'cut object + local reward + cumulative HUD' : id.includes('GROUND') ? 'visible tabletop base' : 'blade + first cuttable', stateBranch: 'active Level1 branch', renderer: 'Three.js runtime', viewport: id.endsWith('390') ? '390x844' : '1100x720', acceptance: 'active-slice-contract.json', status, evidence, notes}))});
const matrixPath = `${qa}/reproduction-matrix.json`;
writeFileSync(matrixPath, JSON.stringify(matrix, null, 2) + '\n');

const natural = NaturalFlowEvidenceSchema.parse({schemaVersion: 1, startedFromReset: true, actions: ['两种视口分别从新浏览器上下文开始，使用正常 touch/mouse 输入；完整时间戳见各 recording.json。', '未注入状态、存储、debug 或 fixture；只读状态仅用于观察终点。'], transitions: [{name: 'startup-to-core', changed: true, evidence: `${qa}/portrait-2/recording.json`}, {name: 'visible-true-terminal-phone', changed: true, evidence: pTerminal}, {name: 'visible-true-terminal-desktop', changed: true, evidence: dTerminal}, {name: 'replay-to-ready-phone', changed: true, evidence: pReplay}, {name: 'replay-to-ready-desktop', changed: true, evidence: dReplay}], completion: 'settlement', replayObserved: true, forbiddenOperations: [], screenshots: [pFrame(0), pFrame(6), pFrame(10), pFrame(15), pTerminal, pReplay, dFrame(0), dFrame(6), dFrame(10), dFrame(15), dTerminal, dReplay], passed: true, blockers: [], runner: 'independent-QA-normal-input-recorder', buildHash: builtHash, runtime: 'Chromium against unchanged dist/index.html; no rebuild during QA', device: {width: 390, height: 844, label: '390x844 and 1100x720 sequential captures'}, observedAt: now});
const naturalPath = `${qa}/qa-natural-journey-report.json`;
writeFileSync(naturalPath, JSON.stringify(natural, null, 2) + '\n');

const blocked = cells.filter(([, status]) => status !== 'PASS').map(([id, , , notes]) => `${id}: ${notes}`);
const perceptual = PerceptualQaReportSchema.parse({schemaVersion: 1, artifactType: 'perceptual-qa-report', game: targetGame, passed: false, checkedAt: now, features: cells.map(([id, status, evidence, notes]) => ({featureId: id, playerVisible: status === 'PASS', naturalTriggerVerified: status === 'PASS', screenshotEvidence: evidence.filter(path => /\.(png|jpg|jpeg)$/u.test(path)), evidence: evidence.length ? evidence : [pRecording], notes: [`${status}: ${notes}`]}))});
const perceptualPath = `${qa}/perceptual-qa-report.json`;
writeFileSync(perceptualPath, JSON.stringify(perceptual, null, 2) + '\n');

const qaReport = QaReportSchema.parse({schemaVersion: 1, passed: false, checks: [{name: 'exact build and source unchanged during sequential normal-input QA', passed: true, evidence: pRecording}, {name: 'normal input reaches a core cut', passed: true, evidence: pRecording}, {name: 'true visible terminal, settlement and replay on both viewports', passed: true, evidence: naturalPath}, {name: 'all contract cells independently player-visible', passed: false, evidence: matrixPath}], issues: [{id: 'L1-STACK-VISUAL-EVIDENCE-GAP', severity: 'error', message: '指定 stack-a/b 的自然画面没有清楚证明同一对象完成承托、切开、散开、下落并落地；保留为证据缺口，不能由状态日志关闭。', evidence: matrixPath}, {id: 'L1-GROUND-HIGH-SLAB', severity: 'error', message: '开场后段可见高处白色台面/横板仍缺少清晰可见承托关系；该分支在截图中可见，需进入下一次最小修复。', evidence: pFrame(0)}], screenshots: natural.screenshots, consoleLog: `${qa}/portrait-2/recording.json`, testedAt: now, naturalFlow: natural});
const qaPath = `${qa}/qa-report.json`;
writeFileSync(qaPath, JSON.stringify(qaReport, null, 2) + '\n');

const result = ResultSchema.parse({schemaVersion: 1, role: 'QAAgent', targetGame, workspace, status: 'BLOCKED', reportPaths: [matrixPath, naturalPath, perceptualPath, qaPath], blockers: [...blocked, '所有录制在 unchanged build 上完成；独立感知门因 stack 分支和高处台面承托证据未通过而保持 BLOCKED。'], sourceModified: false, summary: '第2次构建的独立正常输入复核：手机与桌面各有自然通关、结算和重玩；开场/奖励/危险/终点可见检查通过。指定堆叠的逐对象散落证据与高处白台面承托仍阻塞，保留进入下一次最小修复。'});
const resultPath = `${qa}/result.json`;
writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(`${qa}/evidence-sha256.json`, JSON.stringify({schemaVersion: 1, targetGame, workspace, expectedBuildSha256: builtHash, files: [matrixPath, naturalPath, perceptualPath, qaPath, resultPath].map(path => ({path, sha256: hash(path)}))}, null, 2) + '\n');
console.log(JSON.stringify({validated: true, status: result.status, matrixPath, resultPath, blockers: blocked.length}));
