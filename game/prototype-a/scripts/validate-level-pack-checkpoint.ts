import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const ResultSchema = z.object({
  status: z.enum(['PASS', 'BLOCKED']),
  command: z.string().min(1),
  evidence: z.string().min(1),
}).strict();

const CheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('BuilderLevelPackCheckpoint'),
  status: z.enum(['COMPLETE', 'BLOCKED_CONCURRENT_WRITE']),
  runId: z.literal('mobile-slice-adaptation-20260830'),
  targetWorkspace: z.literal('runs/mobile-slice-adaptation-20260830/workspace/prototype-a'),
  createdAt: z.string().datetime({ offset: true }),
  objective: z.string().min(1),
  lockedDecisions: z.array(z.string().min(1)).min(1),
  lockedEvidence: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(6),
  openSourceGate: z.object({ artifact: z.string().min(1), zodValidated: z.literal(true), approvedScope: z.string().min(1), platformAdapterApproved: z.literal(false) }).strict(),
  changedFiles: z.array(z.string().min(1)).min(1),
  levels: z.array(z.object({ number: z.number().int().min(1).max(12), id: z.string().regex(/^level-\d{2}$/), family: z.enum(['fundamentals', 'moving-supports', 'cut-chains', 'synthesis']), uniqueMechanic: z.string().min(1) }).strict()).length(12),
  redGreenEvidence: z.array(z.object({ behavior: z.string().min(1), red: z.string().min(1), green: z.string().min(1) }).strict()).min(2),
  verification: z.object({ lint: ResultSchema, typecheck: ResultSchema, tests: ResultSchema, build: ResultSchema, browserQa: ResultSchema, mobileQa: ResultSchema, performance: ResultSchema, runtimeErrors: ResultSchema }).strict(),
  automaticFixes: z.object({ fixerRoundsUsed: z.number().int().min(0).max(2), builderCorrections: z.number().int().nonnegative() }).strict(),
  residualIssues: z.array(z.string().min(1)),
  nextCommand: z.string().min(1),
  platformPublishingGaps: z.object({ wechat: z.string().min(1), douyin: z.string().min(1), taptap: z.string().min(1), claimBoundary: z.string().min(1) }).strict(),
}).strict().superRefine((checkpoint, context) => {
  const expected = Array.from({ length: 12 }, (_, index) => index + 1);
  if (JSON.stringify(checkpoint.levels.map(({ number }) => number)) !== JSON.stringify(expected)) context.addIssue({ code: 'custom', message: 'levels must be sequential 1..12' });
  if (checkpoint.status === 'COMPLETE' && Object.values(checkpoint.verification).some(({ status }) => status !== 'PASS')) context.addIssue({ code: 'custom', message: 'complete checkpoint cannot contain a blocked gate' });
});

const path = '../../artifacts/builder-checkpoint-level-pack-v1.json';
const parsed = CheckpointSchema.parse(JSON.parse(await readFile(path, 'utf8')));
console.log(JSON.stringify({ validated: true, artifactType: parsed.artifactType, status: parsed.status, levels: parsed.levels.length, fixerRoundsUsed: parsed.automaticFixes.fixerRoundsUsed }));

