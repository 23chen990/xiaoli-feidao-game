const { z } = require('zod');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const output = '/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/qa-night-post-builder-v2';
const reportPath = path.join(output, 'qa-report.json');
const caseSchema = z.object({
  id: z.string(), title: z.string(), previousStatus: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'NEW']), closure: z.enum(['CLOSED', 'OPEN', 'PARTIAL', 'INCONCLUSIVE']),
  provenance: z.enum(['NATURAL_INPUT', 'TARGETED_DIAGNOSTIC', 'READ_ONLY_ARCHITECTURE']), repeatableSteps: z.array(z.string()), expected: z.array(z.string()), actual: z.array(z.string()),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE']), mechanicalCause: z.string(), acceptanceCriteria: z.array(z.string()), suggestedTests: z.array(z.string()), evidence: z.array(z.string()),
}).strict();
const issueSchema = z.object({ caseId: z.string(), severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']), summary: z.string() }).strict();
const schema = z.object({
  schemaVersion: z.literal(1), artifactType: z.literal('PostBuilderRetestQaArtifact'), targetGame: z.string(), workspace: z.string(), lockedBuildSha256: z.string(), buildSha256Before: z.string(), buildSha256After: z.string(), testedAt: z.string().datetime(), passed: z.boolean(),
  naturalPlay: z.object({ desktopAttempts: z.number(), desktopWins: z.number(), desktopFormerChokePasses: z.number(), mobileAttempts: z.number(), mobileWins: z.number(), mobileFormerChokePasses: z.number(), maxNoProgressBounceStreak: z.number(), exactV1Replay: z.object({ label: z.string(), maxX: z.number(), status: z.string(), maxNoProgressBounceStreak: z.number() }).strict(), desktopRuns: z.array(z.record(z.string(), z.unknown())), mobileRuns: z.array(z.record(z.string(), z.unknown())) }).strict(),
  movingSupportDiagnostic: z.record(z.string(), z.unknown()), themeAudit: z.record(z.string(), z.unknown()), cases: z.array(caseSchema), issues: z.array(issueSchema), screenshots: z.array(z.string()), consoleLog: z.string(), previewClosed: z.boolean(), validatedWith: z.string(),
}).strict();

const report = schema.parse(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
const natural = report.cases.find((item) => item.id === 'NATURAL-CHOKE-001');
natural.actual = [
  'desktop former-choke=4/5; mobile former-choke=2/2',
  'desktop-natural-1: height=530, verticalThreshold=-128, waitBias=0, maxX=1226.5, timeout airborne',
  'desktop-natural-1: white-column bounce count=30, maxNoProgressBounceStreak=29',
  'desktop-natural-5 exact v1 replay: won, maxX=3001.581, maxNoProgressBounceStreak=1',
  'desktop full wins=4/5; mobile full wins=2/2',
];
natural.mechanicalCause = '旧 desktop-natural-5 的具体失败已关闭，但卡口容错问题迁移到 desktop-natural-1：更低的全局高度阈值在普通 white-column 产生 30 次重新接触、29 次连续无进展反弹。单个时机点修复没有满足 5/5 容错合同。';
natural.suggestedTests = ['同时保留 desktop-natural-1 与 desktop-natural-5；修复必须使两者都在三次接触内离开 white-column，不能只移动可通过的时机窗口。'];
report.issues = report.cases.filter((item) => item.severity !== 'NONE').map((item) => ({ caseId: item.id, severity: item.severity, summary: item.mechanicalCause }));
report.testedAt = new Date().toISOString();
report.validatedWith = 'zod@4 strict PostBuilderRetestQaArtifact plus strict case/theme/manifest/blueprint schemas; final black-box closure normalization';
const validated = schema.parse(report);
fs.writeFileSync(reportPath, `${JSON.stringify(validated, null, 2)}\n`);
schema.parse(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
const hash = crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex');
process.stdout.write(`${JSON.stringify({ artifactPath: reportPath, artifactSha256: hash, passed: validated.passed, issues: validated.issues }, null, 2)}\n`);
