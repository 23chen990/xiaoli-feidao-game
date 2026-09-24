export type LockedMechanicId =
  | 'INPUT_TO_MOTION'
  | 'CONTACT_TAXONOMY'
  | 'CUT_OR_REFLECT'
  | 'FAILURE_AND_RESTART'
  | 'STAGED_DIFFICULTY'
  | 'FEEDBACK_TIMING';

export type CourseRole = 'teach' | 'develop' | 'test' | 'bonus';

export interface CourseStageBlueprint {
  id: string;
  startX: number;
  endX: number;
  labelToken: string;
  hasGap: boolean;
  difficulty: 1 | 2 | 3;
  intensity: number;
  role: CourseRole;
  mechanicIds: readonly LockedMechanicId[];
  expression: 'original';
}

export interface MechanicsTraceEntry {
  id: LockedMechanicId;
  sourceBasis: readonly ('public-observed' | 'validated-local-research' | 'original-design')[];
  relationship: string;
  expressionBoundary: 'generic-mechanic-only';
  regressionIds: readonly string[];
}

export const FEEL_TIMING_BASELINE = Object.freeze({
  fixedStepHz: 120,
  flipCooldownMs: 130,
  inputBufferMs: 95,
  contactRecoveryLockoutMs: 180,
  comboWindowMs: 320,
  feedbackOrder: ['motion', 'contact', 'cut-or-reflect', 'visual-feedback'] as const,
});

export const ORIGINAL_COURSE_BLUEPRINT: readonly CourseStageBlueprint[] = Object.freeze([
  Object.freeze({
    id: 'stage-1-read-and-cut',
    startX: 120,
    endX: 1120,
    labelToken: 'stage.teach',
    hasGap: true,
    difficulty: 1,
    intensity: 0.28,
    role: 'teach',
    mechanicIds: ['INPUT_TO_MOTION', 'CONTACT_TAXONOMY', 'CUT_OR_REFLECT'] as const,
    expression: 'original',
  }),
  Object.freeze({
    id: 'stage-2-recover-and-choose',
    startX: 1120,
    endX: 1980,
    labelToken: 'stage.develop',
    hasGap: true,
    difficulty: 2,
    intensity: 0.57,
    role: 'develop',
    mechanicIds: ['CUT_OR_REFLECT', 'FAILURE_AND_RESTART', 'FEEDBACK_TIMING'] as const,
    expression: 'original',
  }),
  Object.freeze({
    id: 'stage-3-structure-and-finish',
    startX: 1980,
    endX: 3000,
    labelToken: 'stage.test',
    hasGap: true,
    difficulty: 3,
    intensity: 0.84,
    role: 'test',
    mechanicIds: ['CONTACT_TAXONOMY', 'FAILURE_AND_RESTART', 'STAGED_DIFFICULTY'] as const,
    expression: 'original',
  }),
]);

export const MECHANICS_TRACE_MATRIX: readonly MechanicsTraceEntry[] = Object.freeze([
  Object.freeze({
    id: 'INPUT_TO_MOTION',
    sourceBasis: ['public-observed', 'validated-local-research', 'original-design'] as const,
    relationship: 'one discrete input changes launch or airborne rotation on the next fixed simulation step',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['INPUT-EDGE-001', 'INPUT-BUFFER-002'],
  }),
  Object.freeze({
    id: 'CONTACT_TAXONOMY',
    sourceBasis: ['validated-local-research', 'original-design'] as const,
    relationship: 'tip and edge are sharp while body and handle are blunt contact parts',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['CONTACT-001', 'CONTACT-002'],
  }),
  Object.freeze({
    id: 'CUT_OR_REFLECT',
    sourceBasis: ['public-observed', 'validated-local-research', 'original-design'] as const,
    relationship: 'sharp contact cuts once while blunt contact reflects from the incident surface normal',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['CUT-001', 'HARD-REFLECT-002'],
  }),
  Object.freeze({
    id: 'FAILURE_AND_RESTART',
    sourceBasis: ['public-observed', 'validated-local-research', 'original-design'] as const,
    relationship: 'hazard and fall are attributable failures and the next discrete input starts a fresh run',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['FAIL-001', 'FAIL-002'],
  }),
  Object.freeze({
    id: 'STAGED_DIFFICULTY',
    sourceBasis: ['validated-local-research', 'original-design'] as const,
    relationship: 'three contiguous original stages teach, develop and test the shared mechanic set',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['COURSE-STAGE-001', 'COURSE-STAGE-002'],
  }),
  Object.freeze({
    id: 'FEEDBACK_TIMING',
    sourceBasis: ['validated-local-research', 'original-design'] as const,
    relationship: 'motion resolves before contact semantics and presentation consumes the resulting event afterward',
    expressionBoundary: 'generic-mechanic-only',
    regressionIds: ['FEEDBACK-TIMING-001'],
  }),
]);
