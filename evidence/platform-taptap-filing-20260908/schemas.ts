import { z } from 'zod';

const NonEmpty = z.string().trim().min(1);

export const PlatformTriageSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-package-triage'),
  route: z.literal('formal-fixer'),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  request: NonEmpty,
  reproductionEvidence: z.array(NonEmpty).min(1),
  classification: z.literal('platform-adapter-build-and-release-configuration'),
  scope: z.object({
    included: z.array(NonEmpty).min(1),
    excluded: z.array(NonEmpty).min(1),
  }).strict(),
  acceptanceCriteria: z.array(NonEmpty).min(1),
  blockers: z.array(z.object({ id: NonEmpty, status: z.enum(['OPEN', 'RESOLVED']), detail: NonEmpty }).strict()),
}).strict();

export const PlatformRepairTaskSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('repair-task'),
  role: z.literal('FixerAgent'),
  route: z.literal('formal-fixer'),
  cycleId: NonEmpty,
  attempt: z.number().int().min(1).max(5),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  platformWorkspace: NonEmpty,
  outputDirectory: NonEmpty,
  triagePath: NonEmpty,
  researchPath: NonEmpty,
  officialPlugin: z.object({ version: z.literal('1.2.2'), sourceUrl: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  tapTapGame: z.object({ name: z.literal('疯狂切割'), appId: z.literal('928932'), identityEvidence: NonEmpty }).strict(),
  instructions: z.array(NonEmpty).min(1),
  acceptanceChecks: z.array(NonEmpty).min(1),
  contextIntentionallyOmitted: z.array(NonEmpty).min(1),
}).strict();

export const PlatformFixResultSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-fix-result'),
  role: z.literal('FixerAgent'),
  route: z.literal('formal-fixer'),
  cycleId: NonEmpty,
  attempt: z.number().int().min(1).max(5),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  status: z.enum(['READY_FOR_INDEPENDENT_QA', 'BLOCKED']),
  why: NonEmpty,
  filesChanged: z.array(NonEmpty),
  tests: z.array(z.object({ command: NonEmpty, passed: z.boolean(), evidence: NonEmpty }).strict()),
  build: z.object({ attempted: z.boolean(), passed: z.boolean(), zipPath: z.string(), sha256: z.string(), bytes: z.number().int().nonnegative() }).strict(),
  blockers: z.array(z.object({ id: NonEmpty, detail: NonEmpty }).strict()),
  evidenceGaps: z.array(NonEmpty),
}).strict();

export const PlatformQaTaskSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-qa-task'),
  role: z.literal('QAAgent'),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  zipPath: NonEmpty,
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fixerResultPath: NonEmpty,
  checks: z.array(NonEmpty).min(1),
  prohibitedActions: z.array(NonEmpty).min(1),
  outputPath: NonEmpty,
}).strict();

export const PlatformQaResultSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-qa-result'),
  role: z.literal('QAAgent'),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  testedSha256: z.string().regex(/^[a-f0-9]{64}$/),
  engineeringVerdict: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  naturalJourneyVerdict: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  perceptualVerdict: z.enum(['PASS', 'FAIL', 'BLOCKED']),
  filingPackageVerdict: z.enum(['READY_FOR_BACKEND_SCAN', 'REJECT', 'BLOCKED']),
  checks: z.array(z.object({ id: NonEmpty, passed: z.boolean(), evidence: NonEmpty }).strict()).min(1),
  issues: z.array(z.object({ id: NonEmpty, severity: z.enum(['warning', 'error']), message: NonEmpty, evidence: NonEmpty }).strict()),
  evidenceGaps: z.array(NonEmpty),
}).strict();

const DeviceSchema = z.object({
  brand: NonEmpty,
  model: NonEmpty,
  os: NonEmpty,
  resolution: NonEmpty,
}).strict();

export const PlatformReproductionMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-reproduction-matrix'),
  targetGame: NonEmpty,
  workspace: NonEmpty,
  evidencePackageHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  evidencePackageHashStatus: z.enum(['BOUND', 'UNKNOWN']),
  rendererPipeline: z.array(NonEmpty).min(1),
  cases: z.array(z.object({
    id: NonEmpty,
    objectType: NonEmpty,
    lifecycleStateBranch: NonEmpty,
    rendererPresentationPath: NonEmpty,
    device: DeviceSchema,
    viewport: NonEmpty,
    observed: NonEmpty,
    expected: NonEmpty,
    status: z.enum(['PASS', 'FAIL', 'UNVERIFIED']),
    evidence: z.array(NonEmpty).min(1),
    siblingCoverage: z.enum(['EXACT_BRANCH', 'SIBLING_ONLY', 'NONE']),
  }).strict()).min(1),
  acceptanceCriteria: z.array(NonEmpty).min(1),
  evidenceGaps: z.array(NonEmpty),
}).strict();

export const PlatformRuntimeCycleSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('platform-runtime-compatibility-cycle'),
  cycleId: NonEmpty,
  targetGame: NonEmpty,
  workspace: NonEmpty,
  platformWorkspace: NonEmpty,
  route: z.literal('formal-fixer'),
  authorizedBy: z.literal('user-request-20260908-repair'),
  maxAttempts: z.literal(5),
  currentAttempt: z.number().int().min(1).max(5),
  status: z.enum(['OPEN', 'READY_FOR_QA', 'BLOCKED', 'COMPLETE']),
  triagePath: NonEmpty,
  matrixPath: NonEmpty,
  priorCyclePath: NonEmpty,
}).strict();
