import { z } from 'zod';
import { ORIGINAL_COURSE_BLUEPRINT } from './game-content';
import type { SliceState } from './game-core';

const PointSchema = z.object({ x: z.number(), y: z.number() }).strict();
const MotionSchema = z.object({
  axis: z.enum(['x', 'y']),
  amplitude: z.number().positive(),
  period: z.number().positive(),
  phase: z.number(),
}).strict();
const SigilSchema = z.object({
  id: z.string().min(1), x: z.number(), y: z.number(), radius: z.number().positive(), value: z.number().int().positive(),
  jitterX: z.number().nonnegative(), jitterY: z.number().nonnegative(), motion: MotionSchema.optional(), supportSurfaceId: z.string().min(1).optional(), foodStyle: z.enum(['apple', 'banana', 'coconut', 'cake', 'pastry', 'cheesecake', 'dumpling', 'roast', 'skewer', 'moon-fruit', 'jade-bun', 'spirit-orb']),
}).strict();
const BlockSchema = z.object({
  id: z.string().min(1), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
  placement: z.enum(['above', 'side', 'below', 'tower']), value: z.number().int().positive(), thin: z.boolean(),
  dualRole: z.boolean(), supportedBy: z.string().min(1).nullable(),
  collidable: z.boolean().optional(),
  motion: MotionSchema.optional(),
  pathRole: z.enum(['main', 'branch', 'recovery', 'decorative']).optional(), decisionImpact: z.string().min(1).optional(), foodStyle: z.enum(['apple', 'banana', 'coconut', 'cake', 'pastry', 'cheesecake', 'dumpling', 'roast', 'skewer', 'moon-fruit', 'jade-bun', 'spirit-orb']),
}).strict();
const SupportSchema = z.object({
  id: z.string().min(1), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
  motion: MotionSchema.optional(), sourceBlockId: z.string().min(1).optional(),
  collidable: z.boolean().optional(),
  pathRole: z.enum(['main', 'branch', 'recovery', 'decorative']).optional(), decisionImpact: z.string().min(1).optional(),
}).strict();
const SpikeSchema = z.object({
  id: z.string().min(1), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
  motion: MotionSchema.optional(),
  pathRole: z.enum(['main', 'branch', 'recovery', 'decorative']).optional(), decisionImpact: z.string().min(1).optional(), reachableWindow: z.tuple([z.number(), z.number()]).optional(), collidable: z.boolean().optional(),
}).strict();
const FinishSchema = z.object({
  id: z.string().min(1), kind: z.enum(['safe', 'bonus', 'multiply', 'divide']), x: z.number(), y: z.number(),
  width: z.number().positive(), height: z.number().positive(), value: z.number().int().positive(),
  operation: z.enum(['multiply', 'divide']).optional(), operand: z.number().positive().finite().optional(),
}).strict();
const CourseSegmentSchema = z.object({
  id: z.string().min(1), startX: z.number(), endX: z.number(), labelToken: z.string().min(1), hasGap: z.boolean(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]), intensity: z.number().min(0).max(1),
  role: z.enum(['teach', 'develop', 'test']),
  mechanicIds: z.array(z.enum(['INPUT_TO_MOTION', 'CONTACT_TAXONOMY', 'CUT_OR_REFLECT', 'FAILURE_AND_RESTART', 'STAGED_DIFFICULTY', 'FEEDBACK_TIMING'])).min(1),
}).strict();

export const LEVEL_DEFINITION_SCHEMA = z.object({
  id: z.string().regex(/^level-\d{2}$/),
  number: z.number().int().min(1).max(12),
  expression: z.literal('original'),
  family: z.enum(['fundamentals', 'moving-supports', 'cut-chains', 'synthesis']),
  foodTheme: z.enum(['fruit', 'dessert', 'savory', 'mystic']),
  foodStyles: z.array(z.enum(['apple', 'banana', 'coconut', 'cake', 'pastry', 'cheesecake', 'dumpling', 'roast', 'skewer', 'moon-fruit', 'jade-bun', 'spirit-orb'])).min(2),
  featuredMechanic: z.string().min(1),
  mechanicTags: z.array(z.string().min(1)).min(2),
  requiredRelations: z.array(z.string().min(1)).min(1),
  targetDurationSeconds: z.tuple([z.number().min(20), z.number().max(45)]),
  start: PointSchema,
  finishX: z.number().positive(),
  worldBottom: z.number().positive(),
  bonusAvailable: z.boolean(),
  sigils: z.array(SigilSchema),
  blocks: z.array(BlockSchema),
  supports: z.array(SupportSchema),
  spikes: z.array(SpikeSchema),
  finishOptions: z.array(FinishSchema).min(2),
  courseSegments: z.array(CourseSegmentSchema).min(1),
  completionPath: z.array(PointSchema).min(2),
}).strict().superRefine((level, context) => {
  if (level.start.x >= level.finishX) context.addIssue({ code: 'custom', message: 'finish must follow start' });
  if (level.targetDurationSeconds[0] > level.targetDurationSeconds[1]) context.addIssue({ code: 'custom', message: 'duration range must be ordered' });
  const ids = [...level.sigils, ...level.blocks, ...level.supports, ...level.spikes, ...level.finishOptions].map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'level object ids must be unique' });
  if (level.finishOptions.some((option) => option.x !== level.finishX)) context.addIssue({ code: 'custom', message: 'finish options must share finishX' });
});

export const LEVEL_CATALOG_SCHEMA = z.object({
  version: z.literal(1),
  levels: z.array(LEVEL_DEFINITION_SCHEMA).length(12),
}).strict().superRefine((catalog, context) => {
  const expected = Array.from({ length: 12 }, (_, index) => index + 1);
  if (JSON.stringify(catalog.levels.map(({ number }) => number)) !== JSON.stringify(expected)) {
    context.addIssue({ code: 'custom', message: 'levels must be sequential 1..12' });
  }
});

export type LevelDefinition = z.infer<typeof LEVEL_DEFINITION_SCHEMA>;

function sigil(id: string, x: number, y: number, radius = 31, value = 1, jitterX = 0, jitterY = 0, supportSurfaceId?: string) {
  return { id, x, y, radius, value, jitterX, jitterY, ...(supportSurfaceId ? { supportSurfaceId } : {}), foodStyle: 'apple' as const };
}

function support(id: string, x: number, y: number, width: number, height: number, motion?: z.infer<typeof MotionSchema>, sourceBlockId?: string, collidable?: boolean) {
  return { id, x, y, width, height, ...(motion ? { motion } : {}), ...(sourceBlockId ? { sourceBlockId } : {}), ...(collidable === false ? { collidable: false } : {}) };
}

function block(id: string, x: number, y: number, width: number, height: number, placement: z.infer<typeof BlockSchema>['placement'], options: Partial<Pick<z.infer<typeof BlockSchema>, 'value' | 'thin' | 'dualRole' | 'supportedBy' | 'motion' | 'collidable'>> = {}) {
  return { id, x, y, width, height, placement, value: options.value ?? 2, thin: options.thin ?? true, dualRole: options.dualRole ?? false, supportedBy: options.supportedBy ?? null, foodStyle: 'apple' as const, ...(options.collidable === false ? { collidable: false } : {}), ...(options.motion ? { motion: options.motion } : {}) };
}

function finishes(finishX: number, prefix: string) {
  return [
    { id: `${prefix}-high`, kind: 'multiply' as const, x: finishX, y: 120, width: 96, height: 80, value: 4, operation: 'multiply' as const, operand: 4 },
    { id: `${prefix}-mid`, kind: 'multiply' as const, x: finishX, y: 210, width: 96, height: 100, value: 2, operation: 'multiply' as const, operand: 2 },
    { id: `${prefix}-divide`, kind: 'divide' as const, x: finishX, y: 300, width: 96, height: 80, value: 3, operation: 'divide' as const, operand: 3 },
    { id: `${prefix}-half`, kind: 'multiply' as const, x: finishX, y: 390, width: 96, height: 100, value: 1, operation: 'multiply' as const, operand: 0.5 },
    { id: `${prefix}-safe`, kind: 'safe' as const, x: finishX, y: 570, width: 128, height: 260, value: 1, operation: 'multiply' as const, operand: 1 },
  ];
}

function segments(finishX: number, prefix: string) {
  const a = Math.round(120 + (finishX - 120) / 3);
  const b = Math.round(120 + ((finishX - 120) * 2) / 3);
  return [
    { id: `${prefix}-teach`, startX: 120, endX: a, labelToken: 'stage.teach', hasGap: true, difficulty: 1 as const, intensity: 0.28, role: 'teach' as const, mechanicIds: ['INPUT_TO_MOTION', 'CONTACT_TAXONOMY'] as const },
    { id: `${prefix}-develop`, startX: a, endX: b, labelToken: 'stage.develop', hasGap: true, difficulty: 2 as const, intensity: 0.56, role: 'develop' as const, mechanicIds: ['CUT_OR_REFLECT', 'FAILURE_AND_RESTART'] as const },
    { id: `${prefix}-test`, startX: b, endX: finishX, labelToken: 'stage.test', hasGap: true, difficulty: 3 as const, intensity: 0.84, role: 'test' as const, mechanicIds: ['STAGED_DIFFICULTY', 'FEEDBACK_TIMING'] as const },
  ];
}

function path(finishX: number, points: readonly [number, number][]) {
  return [{ x: 120, y: 420 }, ...points.map(([x, y]) => ({ x, y })), { x: finishX, y: 500 }];
}

function completionPathYAtX(points: readonly { x: number; y: number }[], x: number): number {
  const right = points.findIndex((point) => point.x >= x);
  if (right <= 0) return points[0]!.y;
  const a = points[right - 1]!;
  const b = points[right]!;
  const ratio = (x - a.x) / Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * ratio;
}

const level1Finish = [
  { id: 'ember-four', kind: 'multiply' as const, x: 3000, y: 120, width: 72, height: 80, value: 4, operation: 'multiply' as const, operand: 4 },
  { id: 'jade-two', kind: 'multiply' as const, x: 3000, y: 200, width: 88, height: 80, value: 2, operation: 'multiply' as const, operand: 2 },
  { id: 'mist-half', kind: 'divide' as const, x: 3000, y: 280, width: 88, height: 80, value: 3, operation: 'divide' as const, operand: 3 },
  { id: 'moon-half', kind: 'multiply' as const, x: 3000, y: 350, width: 88, height: 60, value: 1, operation: 'multiply' as const, operand: 0.5 },
  { id: 'star-cache', kind: 'bonus' as const, x: 3000, y: 438, width: 76, height: 15, value: 7 },
  { id: 'calm-moon', kind: 'safe' as const, x: 3000, y: 547.5, width: 116, height: 305, value: 1, operation: 'multiply' as const, operand: 1 },
];

const rawLevels = [
  {
    id: 'level-01', number: 1, expression: 'original' as const, family: 'fundamentals' as const,
    featuredMechanic: 'three-beat-foundation', mechanicTags: ['flip-basics', 'sharp-cut', 'blunt-reflect'],
    requiredRelations: ['observe → cut → recover → choose'], targetDurationSeconds: [20, 35] as [number, number],
    start: { x: 120, y: 420 }, finishX: 3000, worldBottom: 700, bonusAvailable: true,
    sigils: [...[[205, 312, 48], [650, 452, 32], [850, 448, 30], [1050, 444, 30], [1250, 440, 30], [1450, 436, 30], [1650, 432, 30], [1850, 428, 31], [2050, 424, 31], [2250, 351, 32], [2630, 341, 32]].map(([x, y, radius], index) => sigil(`rune-${index + 1}`, x!, y!, radius, index >= 2 && index <= 6 ? 2 : 1, 4, 5, index === 0 ? 'opening-table-a' : index === 9 ? 'tower-table' : index === 10 ? 'late-table' : 'level1-runway-main')),
      sigil('level1-hazard-approach-token', 1495, 471, 24, 3, 2, 2, 'dual-bridge-face'), sigil('level1-reward-token', 2060, 242, 24, 4, 2, 2, 'level1-reward-shelf')],
    blocks: [block('hanging-above', 610, 315, 84, 38, 'above'), block('side-tag', 930, 505, 42, 104, 'side'), block('under-slat', 1070, 610, 132, 32, 'below', { value: 3 }),
      // The same visible bodies carry the support relationship and collisions.
      // Both lower faces touch the runway (top=473); offset upper footprints overlap.
      { ...block('level1-rainbow-step-a', 1400, 459, 64, 28, 'above', { value: 2, thin: false }), pathRole: 'branch' as const, decisionImpact: 'cut bearing block to release upper stack' },
      { ...block('level1-ladder-stack-a', 1412, 379, 84, 132, 'above', { value: 3, thin: false, supportedBy: 'level1-rainbow-step-a' }), pathRole: 'branch' as const, decisionImpact: 'overlapping stack falls after support cut' },
      block('dual-bridge', 1580, 520, 184, 34, 'side', { value: 4, thin: false, dualRole: true }),
      { ...block('level1-rainbow-step-b', 1760, 460, 58, 26, 'above', { value: 2, thin: false }), pathRole: 'branch' as const, decisionImpact: 'cut bearing block to release upper stack' },
      { ...block('level1-ladder-stack-b', 1772, 381, 92, 132, 'above', { value: 3, thin: false, supportedBy: 'level1-rainbow-step-b' }), pathRole: 'branch' as const, decisionImpact: 'overlapping stack falls after support cut' },
      block('tower-base', 2250, 570, 112, 88, 'tower', { value: 3, thin: false }), block('tower-middle', 2250, 480, 112, 82, 'tower', { value: 5, thin: false, supportedBy: 'tower-base' }), block('tower-top', 2250, 390, 112, 88, 'tower', { value: 4, thin: false, supportedBy: 'tower-middle' })],
    supports: [support('white-bumper', 260, 250, 120, 24), support('white-landing', 330, 580, 280, 38), support('white-branch', 470, 280, 180, 34), support('lantern-ferry', 760, 555, 160, 30, { axis: 'x', amplitude: 78, period: 2.7, phase: 0.35 }), support('white-column', 1260, 400, 34, 180), support('dual-bridge-face', 1580, 509, 184, 12, undefined, 'dual-bridge'), support('white-recovery-shelf', 1760, 590, 420, 46), support('lift-plank', 1840, 430, 148, 28, { axis: 'y', amplitude: 88, period: 3.1, phase: 1.2 }), support('level1-reward-shelf', 2050, 280, 220, 28), support('tower-approach', 2040, 565, 160, 34), support('level1-runway-main', 1250, 500, 1900, 54), support('opening-table-a', 205, 369, 120, 18, undefined, undefined, false), support('opening-table-b', 560, 480, 120, 18, undefined, undefined, false), support('bridge-table', 1490, 407, 170, 18, undefined, undefined, false), support('lift-table', 1840, 383, 150, 18, undefined, undefined, false), support('tower-table', 2210, 392, 150, 18, undefined, undefined, false), support('late-table', 2630, 382, 150, 18, undefined, undefined, false)],
    spikes: [{ id: 'spike-high', x: 1540, y: 100, width: 80, height: 100 }, { id: 'spike-low', x: 2480, y: 690, width: 120, height: 20 }],
    finishOptions: level1Finish,
    courseSegments: ORIGINAL_COURSE_BLUEPRINT.map((segment) => ({
      id: segment.id, startX: segment.startX, endX: segment.endX, labelToken: segment.labelToken,
      hasGap: segment.hasGap, difficulty: segment.difficulty, intensity: segment.intensity,
      role: segment.role, mechanicIds: [...segment.mechanicIds],
    })),
    completionPath: path(3000, [[650, 450], [1260, 520], [1900, 350], [2500, 440]]),
  },
  {
    id: 'level-02', number: 2, expression: 'original' as const, family: 'fundamentals' as const,
    featuredMechanic: 'sharp-side-window', mechanicTags: ['sharp-cut', 'side-target'], requiredRelations: ['high sigil sets rotation before a side cut'], targetDurationSeconds: [20, 32] as [number, number], start: { x: 120, y: 420 }, finishX: 3150, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l2-high', 520, 270, 36, 2), sigil('l2-low', 980, 500, 34), sigil('l2-exit', 2450, 350, 34)], blocks: [block('l2-side', 1450, 430, 44, 132, 'side', { value: 4 }), block('l2-cut-bridge', 1850, 430, 132, 34, 'above', { value: 4, thin: false })], supports: [support('l2-floor', 430, 610, 360, 28), support('l2-cut-bridge-face', 1850, 465, 132, 12, undefined, 'l2-cut-bridge'), support('l2-wall', 1960, 420, 32, 150)], spikes: [{ id: 'l2-ceiling-risk', x: 1750, y: 80, width: 110, height: 70 }], finishOptions: finishes(3150, 'l2-finish'), courseSegments: segments(3150, 'l2'), completionPath: path(3150, [[650, 360], [1500, 430], [2050, 520], [2600, 410]]),
  },
  {
    id: 'level-03', number: 3, expression: 'original' as const, family: 'fundamentals' as const,
    featuredMechanic: 'blunt-rebound-lane', mechanicTags: ['blunt-reflect', 'recovery-tap'], requiredRelations: ['a narrow hard face redirects into a safe recovery lane'], targetDurationSeconds: [21, 34] as [number, number], start: { x: 120, y: 420 }, finishX: 3300, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l3-entry', 430, 360, 40), sigil('l3-recovery', 1510, 300, 34), sigil('l3-exit', 2710, 430, 34)], blocks: [block('l3-cut-ramp', 2200, 500, 144, 34, 'side', { value: 4, thin: false })], supports: [support('l3-ramp', 420, 455, 260, 40), support('l3-rebound', 900, 430, 46, 240), support('l3-recovery-pad', 1420, 555, 360, 38), support('l3-cut-ramp-face', 2200, 535, 144, 12, undefined, 'l3-cut-ramp')], spikes: [{ id: 'l3-low-risk', x: 1850, y: 640, width: 220, height: 80 }], finishOptions: finishes(3300, 'l3-finish'), courseSegments: segments(3300, 'l3'), completionPath: path(3300, [[420, 455], [900, 430], [1420, 555], [1850, 610], [2750, 390]]),
  },
  {
    id: 'level-04', number: 4, expression: 'original' as const, family: 'moving-supports' as const,
    featuredMechanic: 'horizontal-relative-launch', mechanicTags: ['moving-horizontal', 'relative-velocity'], requiredRelations: ['ride laterally, then inherit support velocity into the landing'], targetDurationSeconds: [22, 36] as [number, number], start: { x: 120, y: 420 }, finishX: 3450, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l4-entry', 450, 360, 35), sigil('l4-transfer', 1450, 340, 34), sigil('l4-exit', 2850, 400, 34)], blocks: [block('l4-over', 2100, 260, 100, 36, 'above')], supports: [support('l4-early-recovery', 520, 609.9, 440, 180), support('l4-ferry', 880, 570, 180, 30, { axis: 'x', amplitude: 105, period: 3.2, phase: 0.2 }), support('l4-safe-recovery', 1080, 510, 180, 32), support('l4-landing', 1660, 600, 300, 30), support('l4-column', 2450, 420, 34, 90), support('l4-finish-recovery', 3250, 670, 440, 60)], spikes: [{ id: 'l4-gap-risk', x: 1300, y: 680, width: 120, height: 40 }], finishOptions: finishes(3450, 'l4-finish'), courseSegments: segments(3450, 'l4'), completionPath: path(3450, [[900, 420], [1700, 450], [2500, 330], [3000, 430]]),
  },
  {
    id: 'level-05', number: 5, expression: 'original' as const, family: 'moving-supports' as const,
    featuredMechanic: 'landing-window-choice', mechanicTags: ['landing-judgement', 'moving-horizontal'], requiredRelations: ['choose between a moving short landing and a static long recovery'], targetDurationSeconds: [22, 37] as [number, number], start: { x: 120, y: 420 }, finishX: 3500, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l5-high', 560, 250, 34), sigil('l5-mid', 1750, 390, 34), sigil('l5-low', 2900, 520, 34)], blocks: [block('l5-under', 2250, 560, 150, 30, 'below', { value: 3 })], supports: [support('l5-short-ferry', 1100, 500, 100, 26, { axis: 'x', amplitude: 130, period: 2.8, phase: 1 }), support('l5-long-pad', 1420, 620, 360, 30), support('l5-exit-pad', 2600, 570, 240, 30)], spikes: [{ id: 'l5-route-divider', x: 2010, y: 110, width: 80, height: 90 }], finishOptions: finishes(3500, 'l5-finish'), courseSegments: segments(3500, 'l5'), completionPath: path(3500, [[650, 360], [1450, 470], [2250, 380], [2950, 450]]),
  },
  {
    id: 'level-06', number: 6, expression: 'original' as const, family: 'moving-supports' as const,
    featuredMechanic: 'vertical-lift-recovery', mechanicTags: ['moving-vertical', 'failure-recovery'], requiredRelations: ['release from a vertical lift at a readable height and recover below'], targetDurationSeconds: [23, 38] as [number, number], start: { x: 120, y: 420 }, finishX: 3600, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l6-entry', 500, 370, 36), sigil('l6-lift-top', 1250, 250, 34), sigil('l6-recover', 2020, 500, 36), sigil('l6-exit', 3100, 360, 34)], blocks: [block('l6-side', 2600, 420, 42, 120, 'side')], supports: [support('l6-lift', 970, 450, 150, 28, { axis: 'y', amplitude: 120, period: 3.4, phase: 0.7 }), support('l6-recovery', 1550, 620, 390, 30), support('l6-checkpoint', 2350, 560, 220, 28)], spikes: [{ id: 'l6-low-gap', x: 2850, y: 680, width: 110, height: 40 }], finishOptions: finishes(3600, 'l6-finish'), courseSegments: segments(3600, 'l6'), completionPath: path(3600, [[980, 380], [1600, 470], [2350, 410], [3100, 390]]),
  },
  {
    id: 'level-07', number: 7, expression: 'original' as const, family: 'cut-chains' as const,
    featuredMechanic: 'seven-cut-wave', mechanicTags: ['continuous-cut', 'combo-window'], requiredRelations: ['a rising-falling seven-target wave rewards maintained rotation'], targetDurationSeconds: [23, 39] as [number, number], start: { x: 120, y: 420 }, finishX: 3650, worldBottom: 700, bonusAvailable: false,
    sigils: [300, 540, 780, 1020, 1260, 1500, 1740, 2850].map((x, index) => sigil(`l7-chain-${index + 1}`, x, 355 + Math.sin(index * 1.35) * 95, 32, 2)), blocks: [block('l7-chain-end', 2200, 340, 90, 36, 'above', { value: 4 })], supports: [support('l7-rest', 2450, 600, 320, 30)], spikes: [{ id: 'l7-ceiling', x: 1900, y: 90, width: 100, height: 70 }], finishOptions: finishes(3650, 'l7-finish'), courseSegments: segments(3650, 'l7'), completionPath: path(3650, [[900, 380], [1800, 400], [2500, 470], [3100, 400]]),
  },
  {
    id: 'level-08', number: 8, expression: 'original' as const, family: 'cut-chains' as const,
    featuredMechanic: 'above-below-alternation', mechanicTags: ['above-target', 'below-target'], requiredRelations: ['alternate high and low target faces without losing forward cadence'], targetDurationSeconds: [24, 40] as [number, number], start: { x: 120, y: 420 }, finishX: 3750, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l8-guide-1', 420, 300, 34), sigil('l8-guide-2', 1320, 520, 34), sigil('l8-guide-3', 2350, 290, 34)], blocks: [block('l8-above-1', 850, 250, 110, 34, 'above'), block('l8-below-1', 1750, 610, 140, 32, 'below'), block('l8-side-1', 2750, 430, 42, 125, 'side')], supports: [support('l8-breather', 2100, 570, 230, 28)], spikes: [{ id: 'l8-floor-risk', x: 3050, y: 680, width: 120, height: 40 }], finishOptions: finishes(3750, 'l8-finish'), courseSegments: segments(3750, 'l8'), completionPath: path(3750, [[900, 350], [1750, 430], [2450, 360], [3100, 450]]),
  },
  {
    id: 'level-09', number: 9, expression: 'original' as const, family: 'cut-chains' as const,
    featuredMechanic: 'moving-combination-chicane', mechanicTags: ['combo-obstacles', 'moving-supports'], requiredRelations: ['moving rest point, side cut and hard column form a three-part chicane'], targetDurationSeconds: [25, 41] as [number, number], start: { x: 120, y: 420 }, finishX: 3900, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l9-entry', 480, 370, 36), sigil('l9-moving-read', 1150, 300, 34), sigil('l9-column-exit', 2500, 350, 34), sigil('l9-final', 3300, 470, 34)], blocks: [block('l9-side-cut', 1780, 430, 44, 130, 'side', { value: 4 }), block('l9-under-cut', 2960, 560, 150, 32, 'below')], supports: [support('l9-ferry', 900, 560, 150, 28, { axis: 'x', amplitude: 90, period: 2.9, phase: 0.4 }), support('l9-column', 2200, 410, 34, 190), support('l9-lift', 2750, 470, 150, 28, { axis: 'y', amplitude: 75, period: 3, phase: 1.1 })], spikes: [{ id: 'l9-low-risk', x: 1450, y: 680, width: 120, height: 40 }], finishOptions: finishes(3900, 'l9-finish'), courseSegments: segments(3900, 'l9'), completionPath: path(3900, [[950, 410], [1800, 400], [2250, 300], [3000, 420], [3400, 440]]),
  },
  {
    id: 'level-10', number: 10, expression: 'original' as const, family: 'synthesis' as const,
    featuredMechanic: 'load-bearing-tower', mechanicTags: ['structure-cut', 'falling-dependants'], requiredRelations: ['cutting a load-bearing middle releases the upper structure and opens the path'], targetDurationSeconds: [26, 42] as [number, number], start: { x: 120, y: 420 }, finishX: 4000, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l10-entry', 500, 350, 36), sigil('l10-tower-read', 1450, 300, 34), sigil('l10-exit', 3200, 420, 34)], blocks: [block('l10-base', 1900, 520, 120, 88, 'tower', { thin: false, value: 3 }), block('l10-middle', 1900, 450, 120, 86, 'tower', { thin: false, value: 5, supportedBy: 'l10-base' }), block('l10-top', 1900, 380, 120, 88, 'tower', { thin: false, value: 4, supportedBy: 'l10-middle' })], supports: [support('l10-approach', 1300, 590, 300, 30), support('l10-exit-pad', 2500, 570, 300, 30)], spikes: [{ id: 'l10-falling-risk', x: 2360, y: 680, width: 100, height: 40 }], finishOptions: finishes(4000, 'l10-finish'), courseSegments: segments(4000, 'l10'), completionPath: path(4000, [[1000, 400], [1900, 360], [2600, 430], [3350, 410]]),
  },
  {
    id: 'level-11', number: 11, expression: 'original' as const, family: 'synthesis' as const,
    featuredMechanic: 'risk-route-fork', mechanicTags: ['risk-route', 'finish-choice'], requiredRelations: ['a high scoring route crosses a ceiling risk while a lower safe route trades reward for recovery'], targetDurationSeconds: [27, 43] as [number, number], start: { x: 120, y: 420 }, finishX: 4150, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l11-safe-1', 700, 500, 32), sigil('l11-risk-1', 700, 220, 32, 3), sigil('l11-safe-2', 1700, 520, 32), sigil('l11-risk-2', 1700, 210, 32, 4), sigil('l11-merge', 3000, 380, 36)], blocks: [block('l11-high-cut', 2300, 300, 100, 34, 'above', { value: 5 }), block('l11-low-cut', 2300, 560, 130, 32, 'below', { value: 2 })], supports: [support('l11-safe-pad', 1200, 610, 420, 30), support('l11-risk-ferry', 1300, 330, 130, 26, { axis: 'x', amplitude: 115, period: 3.1, phase: 0.8 })], spikes: [{ id: 'l11-high-risk', x: 2050, y: 90, width: 190, height: 80 }, { id: 'l11-low-risk', x: 2700, y: 680, width: 150, height: 40 }], finishOptions: finishes(4150, 'l11-finish'), courseSegments: segments(4150, 'l11'), completionPath: path(4150, [[900, 470], [1800, 480], [2400, 430], [3200, 400]]),
  },
  {
    id: 'level-12', number: 12, expression: 'original' as const, family: 'synthesis' as const,
    featuredMechanic: 'dual-role-final-exam', mechanicTags: ['dual-role-support', 'moving-relative-velocity', 'structure-cut', 'finish-choice'], requiredRelations: ['ride, reflect, cut the dual-role bridge, release its support and select a finish lane'], targetDurationSeconds: [28, 45] as [number, number], start: { x: 120, y: 420 }, finishX: 4300, worldBottom: 700, bonusAvailable: false,
    sigils: [sigil('l12-entry', 450, 350, 36), sigil('l12-ferry-read', 1050, 300, 34), sigil('l12-bridge-read', 2100, 350, 34), sigil('l12-tower-read', 3050, 310, 34), sigil('l12-finish-read', 3800, 440, 34)], blocks: [block('l12-dual-bridge', 2200, 520, 190, 34, 'side', { value: 5, thin: false, dualRole: true }), block('l12-base', 3100, 570, 110, 82, 'tower', { thin: false, value: 3 }), block('l12-top', 3100, 480, 110, 82, 'tower', { thin: false, value: 5, supportedBy: 'l12-base' })], supports: [support('l12-ferry', 850, 560, 160, 28, { axis: 'x', amplitude: 95, period: 3, phase: 0.3 }), support('l12-column', 1550, 410, 34, 180), support('l12-bridge-face', 2200, 501, 190, 12, undefined, 'l12-dual-bridge'), support('l12-lift', 2700, 450, 150, 28, { axis: 'y', amplitude: 80, period: 3.2, phase: 1 }), support('l12-final-pad', 3500, 590, 300, 30), support('l12-finish-recovery', 4140, 670, 320, 60)], spikes: [{ id: 'l12-ceiling-risk', x: 2450, y: 90, width: 110, height: 80 }, { id: 'l12-floor-risk', x: 3350, y: 680, width: 130, height: 40 }], finishOptions: finishes(4300, 'l12-finish'), courseSegments: segments(4300, 'l12'), completionPath: path(4300, [[900, 400], [1600, 330], [2250, 420], [2750, 360], [3400, 430], [3900, 450]]),
  },
];

const FOOD_THEME_BY_LEVEL = ['fruit', 'fruit', 'fruit', 'dessert', 'dessert', 'dessert', 'savory', 'savory', 'savory', 'mystic', 'mystic', 'mystic'] as const;
const FOOD_STYLES_BY_THEME = {
  fruit: ['apple', 'banana', 'coconut'],
  dessert: ['cake', 'pastry', 'cheesecake'],
  savory: ['dumpling', 'roast', 'skewer'],
  mystic: ['moon-fruit', 'jade-bun', 'spirit-orb'],
} as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const levelsWithEscalatingHazards = rawLevels.map((level, index) => {
  const foodTheme = FOOD_THEME_BY_LEVEL[index]!;
  const foodStyles = FOOD_STYLES_BY_THEME[foodTheme];
  const styledSigils = level.sigils.map((item, itemIndex) => ({ ...item, foodStyle: foodStyles[itemIndex % foodStyles.length]! }));
  const movingSupportSigils = index >= 3 ? level.supports.filter((item) => item.motion).map((support, itemIndex) => ({ id: `${level.id}-${support.id}-target`, x: support.x, y: support.y - support.height / 2 - 30, radius: 14, value: 1, jitterX: 0, jitterY: 0, motion: support.motion, foodStyle: foodStyles[(styledSigils.length + itemIndex) % foodStyles.length]! })) : [];
  const styledBlocks = level.blocks.map((item, itemIndex) => ({ ...item, foodStyle: foodStyles[(itemIndex + 1) % foodStyles.length]! }));
  const beats = level.courseSegments.map((segment, beatIndex) => {
    const roleOrder = index < 3 ? ['teach', 'develop', 'test'] : index < 6 ? ['teach', 'test', 'develop'] : ['develop', 'teach', 'test'];
    return { ...segment, role: roleOrder[beatIndex] as 'teach' | 'develop' | 'test', intensity: Math.min(1, 0.32 + index * 0.045 + beatIndex * 0.18) };
  });
  // Bonus is the narrow cap of the same contiguous reward wall, above the
  // highest multiplier lane, so it cannot visually overlap another reward.
  const bonus = index >= 3 ? [{ id: `${level.id}-bonus`, kind: 'bonus' as const, x: level.finishX, y: 60, width: 88, height: 40, value: 7 }] : [];
  const movingBlocks = index >= 3 ? [
    block(`${level.id}-hard-mover-a`, level.finishX * 0.58, index % 2 ? 300 : 420, 110, 42, 'side', { value: 3, thin: false, motion: { axis: index % 2 ? 'y' : 'x', amplitude: 70 + index * 4, period: 2.8 + index * 0.1, phase: index * 0.4 } }),
    ...(index >= 6 ? [block(`${level.id}-hard-mover-b`, level.finishX * 0.76, 380, 120, 44, 'above', { value: 4, thin: false, motion: { axis: 'x', amplitude: 90 + index * 3, period: 2.4 + index * 0.08, phase: 1.2 } })] : []),
  ] : [];
  return {
    ...level,
    foodTheme,
    foodStyles: [...foodStyles],
    targetDurationSeconds: [Math.max(35, level.targetDurationSeconds[0]), Math.max(40, level.targetDurationSeconds[1])] as [number, number],
    bonusAvailable: index >= 3 ? true : level.bonusAvailable,
    sigils: [...styledSigils, ...movingSupportSigils],
    blocks: [...styledBlocks, ...movingBlocks.map((item, itemIndex) => ({ ...item, foodStyle: foodStyles[(styledBlocks.length + itemIndex) % foodStyles.length]! }))].map((item, itemIndex) => ({ ...item, pathRole: (item as { pathRole?: 'main' | 'branch' | 'recovery' | 'decorative' }).pathRole ?? (itemIndex === 0 ? 'main' as const : 'branch' as const), decisionImpact: (item as { decisionImpact?: string }).decisionImpact ?? 'timing and route choice' })),
    supports: (index === 2 ? (level.supports ?? []).map((support, supportIndex) => ({ ...support, pathRole: supportIndex === 0 ? 'main' as const : supportIndex === 1 ? 'branch' as const : 'recovery' as const, decisionImpact: supportIndex === 0 ? 'launch height' : supportIndex === 1 ? 'bounce into low route' : 'recover after miss' })) : (level.supports ?? [])).map((support, supportIndex) => ({ ...support, pathRole: (support as { pathRole?: 'main' | 'branch' | 'recovery' | 'decorative' }).pathRole ?? (support.id === 'l4-early-recovery' || support.id === 'l4-safe-recovery' ? 'recovery' as const : supportIndex === 0 ? 'main' as const : 'recovery' as const), decisionImpact: (support as { decisionImpact?: string }).decisionImpact ?? 'landing and recovery choice' })),
    // Level 6 already carries its intended timing pressure through the moving
    // lift/checkpoint supports. The authored floor spike creates a blind,
    // non-decision collision on the natural route, so keep this level's hazard
    // lane empty rather than silently generating an unfair moving spike.
    spikes: (index === 2 || index === 5 ? [] : level.spikes).map((spike) => {
      // Preserve the accepted fundamentals teaching geometry (levels 1–2);
      // later hazard packs receive the route-alignment repair below.
      if (index < 3) return { ...spike, pathRole: 'main' as const, decisionImpact: 'timing hazard', reachableWindow: [spike.x - 140, spike.x + 140] as [number, number] };
      const routeY = completionPathYAtX(level.completionPath, spike.x);
      const level10RiskBand = level.number === 10 && spike.id === 'l10-falling-risk';
      const level12FloorRiskBand = level.number === 12 && spike.id === 'l12-floor-risk';
      const level6RiskBand = level.number === 6;
      const lowRoutePressureBand = (level.number === 8 && spike.id === 'l8-floor-risk') || (level.number === 9 && spike.id === 'l9-low-risk');
      const routeOffset = level10RiskBand || level12FloorRiskBand ? 190 : lowRoutePressureBand ? 70 : spike.y < 400 ? -130 : 130;
      const level4RiskBand = level.number === 4 && spike.id === 'l4-gap-risk';
      return {
        ...spike,
        // Place each hazard on a fair, readable branch of the authored route
        // instead of floating hundreds of pixels away from the player.
        y: Math.max(70, Math.min(level.worldBottom - 30, routeY + routeOffset)),
        width: level4RiskBand ? 200 : level6RiskBand ? 12 : spike.width,
        height: level4RiskBand ? 80 : lowRoutePressureBand ? 90 : level10RiskBand || level12FloorRiskBand ? 40 : level6RiskBand ? 20 : spike.height,
        pathRole: 'main' as const,
        decisionImpact: 'timing hazard',
        reachableWindow: [spike.x - 140, spike.x + 140] as [number, number],
      };
    }).map((spike, spikeIndex) => index >= 3 && spikeIndex === 0
      ? { ...spike, motion: { axis: index % 2 === 0 ? 'x' as const : 'y' as const, amplitude: (level.number === 8 || level.number === 9) ? 24 : 18, period: 2.8 + index * 0.12, phase: index * 0.35 } }
      : spike),
    finishOptions: [...level.finishOptions, ...bonus],
    courseSegments: beats,
  };
});

export const LEVEL_CATALOG = deepFreeze(LEVEL_CATALOG_SCHEMA.parse({ version: 1, levels: levelsWithEscalatingHazards }));

export function getLevelDefinition(levelNumber: number): LevelDefinition {
  const normalized = Math.max(1, Math.min(LEVEL_CATALOG.levels.length, Math.floor(levelNumber)));
  return LEVEL_CATALOG.levels[normalized - 1]!;
}

export function courseCoreTrace(state: SliceState): object {
  return {
    levelNumber: state.levelNumber,
    seed: state.seed,
    phase: state.phase,
    status: state.status,
    failReason: state.failReason,
    worldTime: state.worldTime,
    player: state.player,
    cuts: state.cuts,
    score: state.score,
    finishGateId: state.finishGateId,
    anchorId: state.anchorId,
    sigils: state.sigils.map(({ id, cut }) => ({ id, cut })),
    blocks: state.blocks.map(({ id, cut, falling }) => ({ id, cut, falling })),
  };
}
