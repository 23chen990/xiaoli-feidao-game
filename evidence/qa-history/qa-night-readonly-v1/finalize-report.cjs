const { z } = require('zod');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OUTPUT = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-night-readonly-v1';
const WORKSPACE = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a';
const REPORT = path.join(OUTPUT, 'qa-report.json');
const RAW = path.join(OUTPUT, 'raw-evidence.json');
const ARCH = path.join(OUTPUT, 'architecture-scan.json');

const caseSchema = z.object({
  id: z.string(), title: z.string(), provenance: z.enum(['NATURAL_INPUT', 'TARGETED_DIAGNOSTIC']),
  repeatableSteps: z.array(z.string()), expected: z.array(z.string()), actual: z.array(z.string()),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE']), mechanicalCause: z.string(),
  acceptanceCriteria: z.array(z.string()), suggestedTests: z.array(z.string()), evidence: z.array(z.string()),
}).strict();
const issueSchema = z.object({ caseId: z.string(), severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']), summary: z.string() }).strict();
const schema = z.object({
  schemaVersion: z.literal(1), artifactType: z.literal('NightReadOnlyMechanicsQaArtifact'), targetGame: z.string(), workspace: z.string(),
  buildSha256Before: z.string().regex(/^[a-f0-9]{64}$/), buildSha256After: z.string().regex(/^[a-f0-9]{64}$/), testedAt: z.string().datetime(), passed: z.boolean(),
  cases: z.array(caseSchema), issues: z.array(issueSchema),
  summary: z.object({ naturalDesktopWins: z.number().int().nonnegative(), naturalDesktopAttempts: z.number().int().nonnegative(), naturalMobileWins: z.number().int().nonnegative(), naturalMobileAttempts: z.number().int().nonnegative(), reboundVerdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']), chokeVerdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']) }).strict(),
  validatedWith: z.string(), previewClosed: z.boolean(),
}).strict();

const artifact = schema.parse(JSON.parse(fs.readFileSync(REPORT, 'utf8')));
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const architecture = JSON.parse(fs.readFileSync(ARCH, 'utf8'));
const source = (name) => path.join(WORKSPACE, 'src', name);
const findCase = (id) => artifact.cases.find((item) => item.id === id);

const choke = findCase('NATURAL-CHOKE-001');
choke.actual = [
  'desktop former-choke pass=4/5; desktop full wins=1/5',
  'mobile former-choke pass=2/2; mobile full wins=2/2',
  `desktop maxX=${raw.desktopRuns.map((run) => Math.round(run.maxX * 1000) / 1000).join(', ')}`,
  `desktop terminal outcomes=${raw.desktopRuns.map((run) => `${run.status}/${run.failReason || 'none'}`).join(', ')}`,
  'desktop-natural-5 stopped at maxX=1221.575 with 26 repeated no-progress white-column contacts',
];
choke.severity = 'BLOCKER';
choke.mechanicalCause = '原卡口并非所有策略都过不去：4/5 桌面与 2/2 移动策略已越过；但一组仅小幅改变时机的桌面策略在普通 white-column 前形成 26 次重新接触循环，因此卡口问题仍可自然复现且容错不足。';
choke.acceptanceCriteria = ['5/5 desktop variants pass the former choke', '2/2 mobile variants pass the former choke', 'no run has maxNoProgressBounceStreak>=3', 'desktop full-course success remains observable without debug placement'];
choke.suggestedTests = ['保留 desktop-natural-5 的全局高度/升降策略作为失败回归夹具；修复应消除重复回接而不是增加专用反弹物。'];

const stuck = findCase('STUCK-REBOUND-009');
stuck.actual = [
  'desktop-natural-5 maxX=1221.575, maxNoProgressBounceStreak=26',
  'generic-hard isolated contact emitted exactly one bounce and moved x=1138.533 -> 799.173 away from the face',
  'isolated reflection vx=280 -> -201.6; one recovery click changed vx=-201.6 -> 8.4',
];
stuck.severity = 'HIGH';
stuck.mechanicalCause = '专项碰撞证明单次重叠不会重复注入冲量；自然卡住来自刀被反弹后再次飞回同一白柱形成新的合法接触。当前一次救回点击只把 vx 从 -201.6 提到 8.4，几乎没有前进速度，容易再次落回柱面，形成控制/关卡循环而非物理解算瞬移。';
stuck.acceptanceCriteria = ['isolated overlap emits one bounce only', 'recovery input produces enough positive clearance speed to leave the column encounter', 'natural maxNoProgressBounceStreak<3'];
stuck.suggestedTests = ['以 desktop-natural-5 策略记录每次 bounce 后首个真实点击的 vxBefore/vxAfter 和下一次 targetId；断言三次接触内离开 white-column。', '增加恢复速度下限的性质测试，但避免把任何白柱做成专用反弹体。'];

const progression = findCase('LEVEL-PROGRESSION-011');
progression.id = 'PROGRESSIVE-TEACHING-011';
progression.title = '关卡逐步教学并增加组合难度';
progression.severity = 'HIGH';
progression.actual = [
  'segment-observe already contains 7 sigils, three block placements (above/side/below), four supports, and one horizontally moving support',
  'segment-recover combines white-column, dual-role bridge, vertical lift, and spike in the next band',
  'segment-structure adds a three-block tower, another spike, and multiple finish operations',
  'course data has labels but no introduce/practice/combine/assessment metadata',
];
progression.mechanicalCause = '整体难度确实上升，但开场段同时引入过多新机制，缺少 introduce→practice→combine 的安全练习与机器可验证教学元数据；因此“逐步教学”不成立。';
progression.acceptanceCriteria = ['each new mechanic has one isolated safe introduction', 'a practice beat repeats it before combination', 'later segments combine only previously introduced mechanics', 'course schema declares teaches/practices/combines'];
progression.suggestedTests = ['为课程段增加 teaches/practices/combines 元数据并做顺序验证；首段一次只引入切割与一种支撑接触。'];

artifact.cases = artifact.cases.filter((item) => item.id !== 'SKIN-ARCHITECTURE-012');
artifact.cases.push({
  id: 'CORE-COLLISION-DECOUPLING-012',
  title: '核心碰撞与 HUD/主题表达解耦',
  provenance: 'TARGETED_DIAGNOSTIC',
  repeatableSteps: ['只读扫描 game-core.ts 的 DOM、HUD 文案、颜色和资产文件名依赖。', '对照 main.ts 确认 DOM/HUD 绑定位于表现入口。'],
  expected: ['核心碰撞和状态机不依赖 DOM、HUD 文案、颜色或资产文件名。'],
  actual: [`game-core DOM refs=${architecture.gameCoreDomReferences.length}`, `game-core asset filename refs=${architecture.gameCoreAssetFilenameReferences.length}`, 'game-core 中的 0x9e3779b9 是随机数混合常量，不是主题颜色', `main HUD separated from core=${architecture.mainHudDomSeparatedFromCore}`],
  severity: 'NONE',
  mechanicalCause: '核心碰撞、课程状态和事件模型没有 DOM 或资产文件依赖；HUD 绑定留在 main 表现层。',
  acceptanceCriteria: ['game-core DOM refs=0', 'game-core asset filename refs=0', 'theme replacement cannot change collision state transitions'],
  suggestedTests: ['用两套主题运行同 seed/input trace，断言 SliceState 与 FeedbackEvent 序列一致。'],
  evidence: [ARCH, source('game-core.ts'), source('main.ts')],
});
artifact.cases.push({
  id: 'LEVEL-THEME-COUPLING-013',
  title: '关卡语义 ID 与主题表达耦合',
  provenance: 'TARGETED_DIAGNOSTIC',
  repeatableSteps: ['只读检查 createCourse 中的 segment label、support ID 和其他主题化标识。'],
  expected: ['核心关卡使用中性语义 ID；主题文案和展示名来自 theme tokens 或本地化映射。'],
  actual: ['courseSegments.label 直接包含“看相下刃/借势救刃/断柱择门”', '核心 support ID 包含 white-bumper、white-column、lantern-ferry 等颜色/题材表达', '这些字段位于 game-core.ts 而非主题映射'],
  severity: 'MEDIUM',
  mechanicalCause: '碰撞数学本身已解耦，但关卡核心数据仍混入颜色、夜市文案和题材化 ID，换肤需要改核心课程数据。',
  acceptanceCriteria: ['core IDs are semantic and theme-neutral', 'segment display labels resolved outside game-core', 'theme swap changes no course topology or collision IDs'],
  suggestedTests: ['将核心 ID 改为 support-static-01 / segment-recovery 等中性语义；展示名从 ThemeTokens/localization 注入。'],
  evidence: [source('game-core.ts'), RAW],
});
artifact.cases.push({
  id: 'SAVE-SKIN-INDEPENDENCE-014',
  title: '存档与主题表达独立',
  provenance: 'TARGETED_DIAGNOSTIC',
  repeatableSteps: ['只读搜索 save、persist、storage 模块与 schema。'],
  expected: ['存档只保存语义 ID 与数值，不保存 HUD 文案、颜色或资产文件名。'],
  actual: [`save/persist/storage source files=${architecture.saveFiles.join(', ') || 'none'}`, '当前原型没有可验证的 save schema'],
  severity: 'MEDIUM',
  mechanicalCause: '当前没有存档实现，无法证明换肤后旧存档仍可加载；结论为 INCONCLUSIVE，而不是通过。',
  acceptanceCriteria: ['versioned save schema exists', 'saved IDs are theme-neutral', 'theme A save loads under theme B with identical gameplay state'],
  suggestedTests: ['未来引入存档时增加跨主题 round-trip 测试，并禁止序列化 HUD 文案、颜色和资产文件名。'],
  evidence: [ARCH, source('game-core.ts')],
});
artifact.cases.push({
  id: 'CENTRAL-THEME-PIPELINE-015',
  title: '统一 ThemeTokens 与 AssetManifest 换肤入口',
  provenance: 'TARGETED_DIAGNOSTIC',
  repeatableSteps: ['只读扫描 src 中 theme/token 与 asset manifest 文件。', '统计 renderer 和 CSS 的硬编码颜色。'],
  expected: ['主题颜色只经 ThemeTokens。', '正式资产只经 AssetManifest。', 'main、renderer、CSS 和 index 不散落主题常量。'],
  actual: [`theme token files=${architecture.themeTokenFiles.join(', ') || 'none'}`, `asset manifest files=${architecture.assetManifestFiles.join(', ') || 'none'}`, `renderer hardcoded colors=${architecture.rendererHardcodedHexColors}`, `CSS hardcoded colors=${architecture.cssHardcodedHexColors}`],
  severity: 'HIGH',
  mechanicalCause: '当前 main/renderer/CSS/index 的主题表达仍分散硬编码，没有统一 ThemeTokens/AssetManifest；换肤会要求跨文件修改。',
  acceptanceCriteria: ['one validated ThemeTokens source', 'one validated AssetManifest source', 'renderer and CSS consume tokens rather than literal theme colors', 'theme swap leaves core trace unchanged'],
  suggestedTests: ['建立严格 ThemeTokens/AssetManifest schema；以第二套测试主题构建并比较同 seed/input trace。'],
  evidence: [ARCH, source('main.ts'), source('three-world-renderer.ts'), source('style.css'), path.join(WORKSPACE, 'dist/index.html')],
});
artifact.cases.push({
  id: 'FULL-COURSE-TOLERANCE-016',
  title: '完整整关对小幅输入时机变化的容错',
  provenance: 'NATURAL_INPUT',
  repeatableSteps: ['桌面五次只改变全局高度阈值与轮询偏差。', '移动端两次使用相同类型的原生触摸策略。', '全程不调用 loadScenario、step、debug pose 或障碍坐标点击答案。'],
  expected: ['桌面至少 3/5 明确 won。', '移动端至少 1/2 won。', '未明确终态的尝试不得按胜利计数。'],
  actual: ['desktop won=1/5', 'mobile won=2/2', 'desktop outcomes: ready-after-near-finish race, airborne timeout, won, fall, airborne repeated-column loop'],
  severity: 'HIGH',
  mechanicalCause: '移动端两组策略均完成，但桌面小幅时机变化只有一组明确完成；完整路线容错不足，且一次临近终点点击与终态之间出现自动重开竞态，未按胜利计。',
  acceptanceCriteria: ['desktop won>=3/5', 'mobile won>=1/2', 'terminal state remains visible long enough for the next intentional restart input'],
  suggestedTests: ['终点状态增加输入释放/短暂锁，避免同一临近终点点击跨帧触发重开；保留五组策略回归。'],
  evidence: [RAW, ...raw.desktopRuns.flatMap((run) => run.screenshots), ...raw.mobileRuns.flatMap((run) => run.screenshots)],
});

artifact.issues = artifact.cases
  .filter((item) => item.severity !== 'NONE')
  .map((item) => ({ caseId: item.id, severity: item.severity, summary: item.mechanicalCause }));
artifact.summary.reboundVerdict = 'FAIL';
artifact.summary.chokeVerdict = 'FAIL';
artifact.passed = false;
artifact.validatedWith = 'zod@4 strict object schemas; finalized after black-box evidence review and independent read-only architecture audit';
artifact.testedAt = new Date().toISOString();

const validated = schema.parse(artifact);
fs.writeFileSync(REPORT, `${JSON.stringify(validated, null, 2)}\n`);
schema.parse(JSON.parse(fs.readFileSync(REPORT, 'utf8')));
const hash = crypto.createHash('sha256').update(fs.readFileSync(REPORT)).digest('hex');
process.stdout.write(`${JSON.stringify({ reportPath: REPORT, reportSha256: hash, passed: validated.passed, summary: validated.summary, issueCount: validated.issues.length }, null, 2)}\n`);
