const fs = require('node:fs');
const path = require('node:path');
const { z } = require('/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830/workspace/prototype-a/node_modules/zod');

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const severitySchema = z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);
const resultSchema = z.object({ command: z.string(), passed: z.boolean() }).strict();
const issueSchema = z.object({
  id: z.string(), severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM']), blockingCurrentScope: z.boolean(),
  status: z.enum(['OPEN', 'PARTIAL', 'INCONCLUSIVE', 'NOT_IMPLEMENTED', 'UNVERIFIED']), summary: z.string(),
}).strict();
const caseSchema = z.object({
  id: z.string(), title: z.string(), provenance: z.enum(['NATURAL_INPUT', 'TARGETED_DIAGNOSTIC', 'READ_ONLY_VERIFICATION', 'READ_ONLY_ARCHITECTURE']),
  verdict: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']), severity: severitySchema, blockingCurrentScope: z.boolean(),
  repeatableSteps: z.array(z.string()).min(1), expected: z.array(z.string()).min(1), actual: z.array(z.string()).min(1),
  mechanicalCause: z.string(), acceptanceCriteria: z.array(z.string()).min(1), suggestedTests: z.array(z.string()).min(1), evidence: z.array(z.string()).min(1),
}).strict();
const artifactSchema = z.object({
  schemaVersion: z.literal(1), artifactType: z.literal('IndependentFinalQaArtifactV4'), targetGame: z.string(), workspace: z.string(),
  testedAt: z.string(), passed: z.boolean(), decisionScope: z.string(), decisionRule: z.string(),
  checkpoint: z.object({ path: z.string(), sha256: hashSchema, matchesExpected: z.boolean() }).strict(),
  hashes: z.object({ distBefore: hashSchema, distAfter: hashSchema, gameCoreBefore: hashSchema, gameCoreAfter: hashSchema, themeBefore: hashSchema, themeAfter: hashSchema, workspaceModified: z.boolean() }).strict(),
  verification: z.object({
    lint: resultSchema, typecheck: resultSchema,
    tests: z.object({ command: z.string(), passed: z.boolean(), passedCount: z.number().int(), failedCount: z.number().int() }).strict(),
    isolatedBuild: z.object({ command: z.string(), passed: z.boolean(), bytes: z.number().int().positive(), sha256: hashSchema, matchesLockedDist: z.boolean(), workspaceDistUntouched: z.boolean() }).strict(),
    naturalPlay: z.object({ desktopWins: z.number().int(), desktopAttempts: z.number().int(), mobileWins: z.number().int(), mobileAttempts: z.number().int(), formerChokePasses: z.number().int(), formerChokeAttempts: z.number().int(), maxNoProgressBounceStreak: z.number().int(), lowGlobalPolicyWon: z.boolean(), allSuccessfulRunsVisitedThreeStages: z.boolean(), usedObstacleCoordinateOracle: z.boolean(), usedDebugOrStatePlacement: z.boolean() }).strict(),
    browserRuntime: z.object({ consoleErrors: z.number().int(), pageErrors: z.number().int(), requestFailures: z.number().int(), previewClosed: z.boolean() }).strict(),
    movingSupport: z.object({ passed: z.boolean(), provenance: z.literal('TARGETED_DIAGNOSTIC'), supportId: z.string(), contactPart: z.enum(['body', 'handle']), normal: z.tuple([z.number(), z.number()]), surfaceVelocityBefore: z.object({ vx: z.number(), vy: z.number() }).strict(), incomingRelativeNormal: z.number(), outgoingRelativeNormal: z.number(), impulseCountDuringLockout: z.number().int() }).strict(),
    themeBoundary: z.object({ productionThemeZodParsed: z.boolean(), productionManifestZodParsed: z.boolean(), parsedBeforePresentationConsumption: z.boolean(), htmlIsNeutralShell: z.boolean(), cssConsumesThemeVariablesOnly: z.boolean(), authoritativeProductThemeSource: z.string(), coreImportsTheme: z.boolean(), coreDependsOnDomColorOrAssetFilename: z.boolean(), placeholderStatusHonest: z.boolean(), finalStyleLock: z.boolean() }).strict(),
  }).strict(),
  remainingIssues: z.array(issueSchema), cases: z.array(caseSchema).min(1),
  platformScope: z.object({ verified: z.string(), wechatMiniGamePublishable: z.boolean(), douyinMiniGamePublishable: z.boolean(), taptapMiniGamePublishable: z.boolean() }).strict(),
  validatedWith: z.string(), previewClosed: z.boolean(), workspaceModified: z.boolean(),
}).strict();

const reportPath = path.join(__dirname, 'qa-report.json');
const parsed = artifactSchema.parse(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
if (!parsed.passed) throw new Error('Expected scoped final QA to pass');
if (parsed.verification.naturalPlay.desktopWins !== 5 || parsed.verification.naturalPlay.mobileWins !== 2) throw new Error('Natural matrix mismatch');
if (parsed.verification.naturalPlay.maxNoProgressBounceStreak > 2) throw new Error('Choke streak exceeds contract');
if (parsed.hashes.distBefore !== parsed.hashes.distAfter || parsed.hashes.gameCoreBefore !== parsed.hashes.gameCoreAfter || parsed.hashes.themeBefore !== parsed.hashes.themeAfter) throw new Error('Locked workspace changed');
process.stdout.write(JSON.stringify({ valid: true, artifactType: parsed.artifactType, passed: parsed.passed, cases: parsed.cases.length, remainingIssues: parsed.remainingIssues.length }) + '\n');
