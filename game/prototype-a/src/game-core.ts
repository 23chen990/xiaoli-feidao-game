import { FEEL_TIMING_BASELINE, type CourseRole, type LockedMechanicId } from './game-content';
import { getLevelDefinition } from './game-levels';

export type FlipAction = 'flip';
export type RunStatus = 'ready' | 'airborne' | 'anchored' | 'failed' | 'won';
export type RunPhase = 'ordinary' | 'bonus';
export type FinishPhase = 'idle' | 'contact' | 'reward' | 'celebration' | 'terminal';
export type FailReason = 'fall' | 'spike' | null;
export type FeedbackType = 'launch' | 'flip' | 'cut' | 'bounce' | 'anchor' | 'spike' | 'fall' | 'finish' | 'bonus';
export type ContactPart = 'tip' | 'edge' | 'body' | 'handle';
export type BlockPlacement = 'above' | 'side' | 'below' | 'tower';
export type MotionAxis = 'x' | 'y';
export type FinishOperation = 'multiply' | 'divide';
export type FoodStyle = 'apple' | 'banana' | 'coconut' | 'cake' | 'pastry' | 'cheesecake' | 'dumpling' | 'roast' | 'skewer' | 'moon-fruit' | 'jade-bun' | 'spirit-orb';
export type DebugScenario =
  | 'course'
  | 'moving-horizontal'
  | 'moving-vertical'
  | 'generic-hard'
  | 'back-contact'
  | 'cut-above'
  | 'cut-side'
  | 'cut-below'
  | 'tower'
  | 'dual-role'
  | 'finish-multiply'
  | 'finish-divide'
  | 'bonus'
  | 'spike'
  | 'fall';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
}

export interface CuttableSigil {
  id: string;
  kind: 'cuttable';
  x: number;
  y: number;
  radius: number;
  value: number;
  cut: boolean;
  splitAge: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  foodStyle: FoodStyle;
  supportSurfaceId?: string;
  motion?: SupportMotion;
  baseX?: number;
  baseY?: number;
}

export interface SupportMotion {
  axis: MotionAxis;
  amplitude: number;
  period: number;
  phase: number;
}

export interface SafeSupport {
  id: string;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  active: boolean;
  collidable?: boolean;
  motion?: SupportMotion;
  sourceBlockId?: string;
}

export interface SpikeField {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseX: number;
  baseY: number;
  motion?: SupportMotion;
  pathRole?: 'main' | 'branch' | 'recovery' | 'decorative';
  decisionImpact?: string;
  collidable?: boolean;
  reachableWindow?: readonly [number, number];
}

export interface FinishOption {
  id: string;
  kind: 'safe' | 'bonus' | 'multiply' | 'divide';
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  operation?: FinishOperation;
  operand?: number;
}

export interface CuttableBlock {
  id: string;
  kind: 'block';
  x: number;
  y: number;
  width: number;
  height: number;
  placement: BlockPlacement;
  value: number;
  cut: boolean;
  solid: boolean;
  falling: boolean;
  thin: boolean;
  dualRole: boolean;
  supportedBy: string | null;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  foodStyle: FoodStyle;
  collidable?: boolean;
  baseX: number;
  baseY: number;
  motion?: SupportMotion;
}

export interface FragmentState {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  age: number;
}

export interface CourseSegment {
  id: string;
  startX: number;
  endX: number;
  label: string;
  labelToken: string;
  hasGap: boolean;
  difficulty: 1 | 2 | 3;
  intensity: number;
  role: CourseRole;
  mechanicIds: readonly LockedMechanicId[];
}

export interface FeedbackEvent {
  id: number;
  type: FeedbackType;
  x: number;
  y: number;
  value: number;
  targetId?: string;
  contactPart?: ContactPart;
  normalX?: number;
  normalY?: number;
}

export interface EarningsEntry {
  id: number;
  targetId: string;
  amount: number;
  total: number;
}

export interface SliceCourse {
  sigils: CuttableSigil[];
  blocks: CuttableBlock[];
  fragments: FragmentState[];
  supports: SafeSupport[];
  spikes: SpikeField[];
  finishOptions: FinishOption[];
  courseSegments: CourseSegment[];
  bonusAvailable: boolean;
}

export interface SliceState {
  levelNumber: number;
  levelId: string;
  seed: number;
  phase: RunPhase;
  status: RunStatus;
  failReason: FailReason;
  elapsed: number;
  phaseElapsed: number;
  worldTime: number;
  player: PlayerState;
  sigils: CuttableSigil[];
  blocks: CuttableBlock[];
  fragments: FragmentState[];
  supports: SafeSupport[];
  spikes: SpikeField[];
  finishOptions: FinishOption[];
  courseSegments: CourseSegment[];
  cuts: number;
  totalCuts: number;
  score: number;
  finishX: number;
  finishSelection: 'safe' | 'bonus' | null;
  finishGateId: string | null;
  finishSettled: boolean;
  finishPhase: FinishPhase;
  finishPhaseElapsed: number;
  finishRewardScore: number | null;
  bonusAvailable: boolean;
  bonusConsumed: boolean;
  bonusChain?: number;
  worldBottom: number;
  anchorId: string | null;
  anchorOffsetX: number;
  anchorOffsetY: number;
  recoveryAge: number;
  combo: number;
  /** Accumulated route preparation from structural cuts; positive favors high lanes. */
  routeBias: number;
  /** Count of cuts that changed a support/structure relationship. */
  routeChanges: number;
  earnings: EarningsEntry[];
  totalEarnings: number;
  events: FeedbackEvent[];
}

interface ContactResult {
  time: number;
  normalX: number;
  normalY: number;
}

interface PartPoint {
  part: ContactPart;
  x: number;
  y: number;
}

interface PendingRunwayReleasePose {
  supportId: string;
  anchorOffsetX: number;
  anchorOffsetY: number;
  playerX: number;
  playerY: number;
  playerAngle: number;
  age: number;
}

const FIXED_STEP = 1 / FEEL_TIMING_BASELINE.fixedStepHz;
const MAX_FIXED_STEPS_PER_FRAME = 240;
const BLADE_HALF = 38;
const PLAYER_RADIUS = 17;
// Tuned for the one-button cadence: a launch should cross one readable target
// window before the next decision without turning the opening into a sprint.
const ORDINARY_SPEED = 180;
const BONUS_SPEED = 180;
const LAUNCH_VY = -300;
const GRAVITY = 600;
const BONUS_GRAVITY = 520;
const BONUS_MAX_ACTIVE = 6;
const BONUS_WAVE_INTERVAL = 0.42;
const FLIP_IMPULSE = 520;
const WORLD_BOTTOM = 700;
const BONUS_FINISH_X = 1700;
const FLIP_COOLDOWN = FEEL_TIMING_BASELINE.flipCooldownMs / 1000;
const INPUT_BUFFER = FEEL_TIMING_BASELINE.inputBufferMs / 1000;
const CONTACT_RECOVERY_LOCKOUT = FEEL_TIMING_BASELINE.contactRecoveryLockoutMs / 1000;
const COMBO_WINDOW = FEEL_TIMING_BASELINE.comboWindowMs / 1000;
const CONTACT_MANIFOLD_PROXIMITY = 28;
const CONTACT_MANIFOLD_LIMIT = 3;
const CONTACT_SLIDE_ESCAPE_SPEED = 320;
const CONTACT_SEPARATION_SPEED = 20;
// Keep hard-surface pressure readable: normal taps do not require pixel-perfect alignment.
const HARD_SHARP_PADDING = 8;
const HARD_BLUNT_PADDING = 8;
const LEVEL1_RUNWAY_SUPPORT_ID = 'level1-runway-main';
const LEVEL1_RUNWAY_SHARP_CONTACT_MIN_X = 350;
const LEVEL1_RUNWAY_EARLY_EVENT_SUPPRESSION_SECONDS = 1.5;
const RUNWAY_RELEASE_POSE_LIFETIME = 2.35;
const RUNWAY_RELEASE_POSITION_ENVELOPE = 8;
const RUNWAY_RELEASE_ANGLE_ENVELOPE = 0.4;
// Keep recovery readable on small screens: hard-surface contacts may reverse
// the knife, but must never create an accidental high-speed launch off-course.
const MAX_HORIZONTAL_SPEED = 240;

function isTerminal(status: RunStatus): boolean {
  return status === 'failed' || status === 'won';
}

function randomFor(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function makeSupport(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Pick<SafeSupport, 'motion' | 'sourceBlockId' | 'collidable'> = {},
): SafeSupport {
  return { id, x, y, baseX: x, baseY: y, vx: 0, vy: 0, width, height, active: true, ...options };
}

function makeBlock(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  placement: BlockPlacement,
  options: Partial<Pick<CuttableBlock, 'value' | 'thin' | 'dualRole' | 'supportedBy' | 'motion' | 'foodStyle' | 'collidable'>> = {},
): CuttableBlock {
  return {
    id,
    kind: 'block',
    x,
    y,
    width,
    height,
    placement,
    value: options.value ?? 2,
    cut: false,
    solid: true,
    falling: false,
    thin: options.thin ?? true,
    dualRole: options.dualRole ?? false,
    supportedBy: options.supportedBy ?? null,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
    foodStyle: options.foodStyle ?? 'apple',
    ...(options.collidable === false ? { collidable: false } : {}),
    baseX: x,
    baseY: y,
    ...(options.motion ? { motion: { ...options.motion } } : {}),
  };
}

export function createCourse(seed: number, levelNumber = 1): SliceCourse {
  const definition = getLevelDefinition(levelNumber);
  const random = randomFor(seed);
  const sigils: CuttableSigil[] = definition.sigils.map((item) => ({
    id: item.id,
    kind: 'cuttable',
    x: item.x + Math.round((random() - 0.5) * item.jitterX * 2),
    y: item.y + Math.round((random() - 0.5) * item.jitterY * 2),
    radius: item.radius,
    value: item.value,
    cut: false,
    splitAge: 0,
    vx: 0, vy: 0, angle: 0, angularVelocity: 0,
    foodStyle: item.foodStyle,
    ...(item.supportSurfaceId ? { supportSurfaceId: item.supportSurfaceId } : {}),
  }));
  const blocks = definition.blocks.map((item) => makeBlock(item.id, item.x, item.y, item.width, item.height, item.placement, item));
  const supports = definition.supports.map((item) => makeSupport(item.id, item.x, item.y, item.width, item.height, item));
  if (levelNumber === 1) {
    // Initial placement is a resting arrangement, not an unobserved drop
    // during the title screen. Subsequent motion still uses fixed-step gravity.
    for (const item of sigils) {
      const surface = supports.find((support) => support.id === item.supportSurfaceId);
      if (surface && Math.abs(item.x - surface.x) <= surface.width / 2) item.y = surface.y - surface.height / 2 - item.radius;
    }
  }
  const spikes = definition.spikes.map((item) => ({ ...item, baseX: item.x, baseY: item.y }));
  // Bonus entry is authored per level. Seed variation must not silently
  // remove the bonus gate from an otherwise identical level definition.
  const bonusAvailable = definition.bonusAvailable;
  const finishOptions = definition.finishOptions.filter((item) => item.kind !== 'bonus' || bonusAvailable).map((item) => ({ ...item }));
  return {
    sigils,
    blocks,
    fragments: [],
    supports,
    spikes,
    finishOptions,
    courseSegments: definition.courseSegments.map((stage) => ({
      ...stage,
      label: stage.labelToken,
    })),
    bonusAvailable,
  };
}

function createBonusCourse(seed: number): SliceCourse {
  const random = randomFor(seed ^ 0x9e3779b9);
  const sigils: CuttableSigil[] = Array.from({ length: 16 }, (_, index) => ({
    id: `bonus-rune-${index + 1}`,
    kind: 'cuttable',
    x: 230 + index * 86,
    y: 900,
    radius: 28,
    value: 4,
    cut: false,
    splitAge: 0,
    vx: (random() - 0.5) * 180, vy: -(300 + random() * 90), angle: random() * Math.PI * 2, angularVelocity: (random() - 0.5) * 5,
    foodStyle: ['apple', 'banana', 'coconut', 'cake'][index % 4] as FoodStyle,
  }));
  return {
    sigils,
    blocks: [],
    fragments: [],
    supports: [
      { id: 'bonus-high-column-a', x: 560, y: 110, baseX: 560, baseY: 110, vx: 0, vy: 0, width: 42, height: 220, active: true },
      { id: 'bonus-high-column-b', x: 1040, y: 125, baseX: 1040, baseY: 125, vx: 0, vy: 0, width: 46, height: 240, active: true },
      { id: 'bonus-high-column-c', x: 1460, y: 110, baseX: 1460, baseY: 110, vx: 0, vy: 0, width: 50, height: 220, active: true },
    ],
    spikes: [
      // Keep the high pressure marker above the default bonus flight line;
      // the previous lower tip intersected the natural mid-lane before the
      // player could read or choose the route.
      { id: 'bonus-spike-high', x: 700, y: 220, baseX: 700, baseY: 220, width: 110, height: 100 },
      { id: 'bonus-spike-low', x: 1160, y: 555, baseX: 1160, baseY: 555, width: 120, height: 140 },
    ],
    finishOptions: [
      { id: 'bonus-finish-high', kind: 'multiply', x: BONUS_FINISH_X, y: 175, width: 110, height: 120, value: 2, operation: 'multiply', operand: 2 },
      { id: 'bonus-finish-mid', kind: 'divide', x: BONUS_FINISH_X, y: 365, width: 110, height: 120, value: 2, operation: 'divide', operand: 2 },
      { id: 'bonus-finish-safe', kind: 'safe', x: BONUS_FINISH_X, y: 575, width: 140, height: 220, value: 1, operation: 'multiply', operand: 1 },
      { id: 'bonus-finish-chain', kind: 'bonus', x: BONUS_FINISH_X, y: 420, width: 92, height: 46, value: 7 },
    ],
    courseSegments: [{
      id: 'bonus-cache',
      startX: 120,
      endX: BONUS_FINISH_X,
      label: 'stage.bonus',
      labelToken: 'stage.bonus',
      hasGap: true,
      difficulty: 3,
      intensity: 0.92,
      role: 'bonus',
      mechanicIds: ['INPUT_TO_MOTION', 'FAILURE_AND_RESTART', 'FEEDBACK_TIMING'],
    }],
    bonusAvailable: false,
  };
}

function makeOrdinaryState(seed: number, levelNumber: number): SliceState {
  const definition = getLevelDefinition(levelNumber);
  const course = createCourse(seed, definition.number);
  return {
    levelNumber: definition.number,
    levelId: definition.id,
    seed,
    phase: 'ordinary',
    status: 'ready',
    failReason: null,
    elapsed: 0,
    phaseElapsed: 0,
    worldTime: 0,
    player: { x: definition.start.x, y: definition.start.y, vx: 0, vy: 0, angle: -0.35, angularVelocity: 0 },
    ...course,
    cuts: 0,
    totalCuts: course.sigils.length + course.blocks.length,
    score: 0,
    finishX: definition.finishX,
    finishSelection: null,
    finishGateId: null,
    finishSettled: false,
    finishPhase: 'idle',
    finishPhaseElapsed: 0,
    finishRewardScore: null,
    bonusConsumed: false,
    bonusChain: 0,
    worldBottom: definition.worldBottom,
    anchorId: null,
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    recoveryAge: 1,
    combo: 0,
    routeBias: 0,
    routeChanges: 0,
    earnings: [],
    totalEarnings: 0,
    events: [],
  };
}

function cloneState(state: SliceState): SliceState {
  return {
    ...state,
    player: { ...state.player },
    sigils: state.sigils.map((item) => ({ ...item })),
    blocks: state.blocks.map((item) => ({ ...item })),
    fragments: state.fragments.map((item) => ({ ...item })),
    supports: state.supports.map((item) => ({ ...item, motion: item.motion ? { ...item.motion } : undefined })),
    spikes: state.spikes.map((item) => ({ ...item })),
    finishOptions: state.finishOptions.map((item) => ({ ...item })),
    earnings: state.earnings.map((item) => ({ ...item })),
    courseSegments: state.courseSegments.map((item) => ({ ...item })),
    events: state.events.map((item) => ({ ...item })),
  };
}

function sweptHorizontalOverlap(previousX: number, currentX: number, bodyWidth: number, targetX: number, targetWidth: number): boolean {
  const minBody = Math.min(previousX, currentX) - bodyWidth / 2;
  const maxBody = Math.max(previousX, currentX) + bodyWidth / 2;
  return maxBody >= targetX - targetWidth / 2 && minBody <= targetX + targetWidth / 2;
}

function segmentTouchesBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  padding: number,
): boolean {
  return sweepPointBox(ax, ay, bx, by, centerX, centerY, width, height, padding) !== null;
}

function sweepPointBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  padding = 0,
): ContactResult | null {
  const minX = centerX - width / 2 - padding;
  const maxX = centerX + width / 2 + padding;
  const minY = centerY - height / 2 - padding;
  const maxY = centerY + height / 2 + padding;
  const dx = bx - ax;
  const dy = by - ay;
  if (ax >= minX && ax <= maxX && ay >= minY && ay <= maxY) {
    const distances = [
      { distance: Math.abs(ax - minX), normalX: -1, normalY: 0 },
      { distance: Math.abs(maxX - ax), normalX: 1, normalY: 0 },
      { distance: Math.abs(ay - minY), normalX: 0, normalY: -1 },
      { distance: Math.abs(maxY - ay), normalX: 0, normalY: 1 },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return { time: 0, normalX: distances[0].normalX, normalY: distances[0].normalY };
  }
  let enter = 0;
  let exit = 1;
  let normalX = 0;
  let normalY = 0;
  for (const axis of [
    { origin: ax, delta: dx, min: minX, max: maxX, nx: -1, ny: 0 },
    { origin: ay, delta: dy, min: minY, max: maxY, nx: 0, ny: -1 },
  ]) {
    if (Math.abs(axis.delta) < 1e-9) {
      if (axis.origin < axis.min || axis.origin > axis.max) return null;
      continue;
    }
    let first = (axis.min - axis.origin) / axis.delta;
    let second = (axis.max - axis.origin) / axis.delta;
    let firstNormalX = axis.nx;
    let firstNormalY = axis.ny;
    if (first > second) {
      [first, second] = [second, first];
      firstNormalX *= -1;
      firstNormalY *= -1;
    }
    if (first > enter) {
      enter = first;
      normalX = firstNormalX;
      normalY = firstNormalY;
    }
    exit = Math.min(exit, second);
    if (enter > exit) return null;
  }
  if (enter < 0 || enter > 1) return null;
  return { time: enter, normalX, normalY };
}

function knifePartPoints(player: PlayerState): PartPoint[] {
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  return [
    { part: 'tip', x: player.x + cos * BLADE_HALF, y: player.y + sin * BLADE_HALF },
    { part: 'edge', x: player.x + cos * 20 - sin * 3, y: player.y + sin * 20 + cos * 3 },
    { part: 'body', x: player.x - cos * 8 - sin * 6, y: player.y - sin * 8 + cos * 6 },
    { part: 'handle', x: player.x - cos * BLADE_HALF, y: player.y - sin * BLADE_HALF },
  ];
}

export function classifyKnifePartAtPoint(player: PlayerState, x: number, y: number): ContactPart {
  return knifePartPoints(player).map((point) => ({ part: point.part, distance: (point.x - x) ** 2 + (point.y - y) ** 2 })).sort((a, b) => a.distance - b.distance)[0].part;
}

export function applyFinishOperation(score: number, gate: { operation: FinishOperation; operand: number }): number {
  const safeScore = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const operand = Math.max(Number.EPSILON, Number.isFinite(gate.operand) ? gate.operand : 1);
  return gate.operation === 'multiply' ? safeScore * operand : Math.floor(safeScore / operand);
}

export class ActionInput {
  private held = new Set<FlipAction>();

  press(action: FlipAction, repeated = false): boolean {
    if (repeated || this.held.has(action)) return false;
    this.held.add(action);
    return true;
  }

  release(action: FlipAction): void {
    this.held.delete(action);
  }

  reset(): void {
    this.held.clear();
  }
}

export class SliceSimulation {
  private state: SliceState;
  private accumulator = 0;
  private flipDirection = 1;
  private flipCooldown = 0;
  private inputBuffer = 0;
  private bonusSpawnClock = 0;
  private eventSequence = 0;
  private lastCutAt = -10;
  private lastHardTargetId = '';
  private lastHardContactX = -Infinity;
  private hardContactStreak = 0;
  private debugFinishImmediate = false;
  private pendingRunwayReleasePose: PendingRunwayReleasePose | null = null;
  // Debug fixtures intentionally place the blade inside authored objects. Keep
  // the broad Level1 runway from stealing those assertions; normal input never
  // sets this transient flag.
  private debugFixtureMode = false;

  constructor(seed = 1, levelNumber = 1) {
    this.state = makeOrdinaryState(seed, levelNumber);
  }

  reset(seed = this.state.seed): SliceState {
    this.state = makeOrdinaryState(seed, this.state.levelNumber);
    this.accumulator = 0;
    this.flipDirection = 1;
    this.flipCooldown = 0;
    this.inputBuffer = 0;
    this.bonusSpawnClock = 0;
    this.eventSequence = 0;
    this.lastCutAt = -10;
    this.lastHardTargetId = '';
    this.lastHardContactX = -Infinity;
    this.hardContactStreak = 0;
    this.debugFinishImmediate = false;
    this.debugFixtureMode = false;
    this.pendingRunwayReleasePose = null;
    return this.getState();
  }

  loadLevel(levelNumber: number, seed = this.state.seed): SliceState {
    this.state = makeOrdinaryState(seed, levelNumber);
    this.accumulator = 0;
    this.flipDirection = 1;
    this.flipCooldown = 0;
    this.inputBuffer = 0;
    this.bonusSpawnClock = 0;
    this.eventSequence = 0;
    this.lastCutAt = -10;
    this.lastHardTargetId = '';
    this.lastHardContactX = -Infinity;
    this.hardContactStreak = 0;
    this.debugFinishImmediate = false;
    this.debugFixtureMode = false;
    this.pendingRunwayReleasePose = null;
    return this.getState();
  }

  getState(): SliceState {
    return cloneState(this.state);
  }

  selectRunwayReleaseSupport(): SafeSupport | null {
    const player = this.state.player;
    const upperBoundaryLimit = -Math.sqrt(Math.max(0, 2 * 600 * (player.y - -127)));
    const reachable: Array<{ support: SafeSupport; entryTime: number }> = [];
    for (const support of this.state.supports) {
      if (!support.active || support.collidable === false) continue;
      const entryTime = (support.x - player.x) / Math.max(1, player.vx - support.vx);
      if (entryTime <= 0) continue;
      const supportTop = support.y - support.height / 2;
      const requiredVy = (supportTop - 17 - player.y - 0.5 * 600 * entryTime ** 2) / entryTime;
      if (requiredVy < upperBoundaryLimit || requiredVy > 760) continue;
      reachable.push({ support, entryTime });
    }
    reachable.sort((a, b) => a.entryTime - b.entryTime);
    return reachable[0]?.support ?? null;
  }

  act(action: FlipAction): boolean {
    if (action !== 'flip') return false;
    if (isTerminal(this.state.status)) {
      // Terminal input is inert; replay is an explicit UI action.
      return false;
    }
    const pendingPose = this.pendingRunwayReleasePose;
    if (pendingPose) {
      const support = this.state.supports.find((candidate) => candidate.id === pendingPose.supportId && candidate.active);
      if (this.state.status === 'airborne' && support && pendingPose.age < RUNWAY_RELEASE_POSE_LIFETIME) {
        this.state.player.x = support.x + pendingPose.anchorOffsetX;
        this.state.player.y = support.y + pendingPose.anchorOffsetY;
        this.state.player.angle = pendingPose.playerAngle;
        this.state.anchorId = support.id;
        this.state.anchorOffsetX = pendingPose.anchorOffsetX;
        this.state.anchorOffsetY = pendingPose.anchorOffsetY;
        this.state.status = 'anchored';
        this.pendingRunwayReleasePose = null;
      } else {
        this.pendingRunwayReleasePose = null;
      }
    }
    const player = this.state.player;
    if (this.state.status === 'ready' || this.state.status === 'anchored') {
      const wasAnchored = this.state.status === 'anchored';
      const support = wasAnchored ? this.state.supports.find((candidate) => candidate.id === this.state.anchorId) : undefined;
      const sourceBlock = support?.sourceBlockId
        ? this.state.blocks.find((candidate) => candidate.id === support.sourceBlockId && candidate.solid && !candidate.cut)
        : undefined;
      if (sourceBlock) {
        sourceBlock.collidable = true;
        this.cutBlock(sourceBlock, 'edge');
        this.flipCooldown = FLIP_COOLDOWN;
        return true;
      }
      this.state.status = 'airborne';
      this.state.anchorId = null;
      if (wasAnchored) this.state.recoveryAge = 0;
      player.vx = (this.state.phase === 'bonus' ? BONUS_SPEED : ORDINARY_SPEED) + (support?.vx ?? 0);
      player.vy = LAUNCH_VY + Math.min(0, support?.vy ?? 0);
      player.angularVelocity = this.flipDirection * 10.25;
      this.flipDirection *= -1;
      this.flipCooldown = FLIP_COOLDOWN;
      this.inputBuffer = 0;
      this.pushEvent('launch', player.x, player.y, 1);
      return true;
    }
    if (this.flipCooldown > 0) {
      this.inputBuffer = INPUT_BUFFER;
      return true;
    }
    this.applyAirFlip();
    return true;
  }

  private applyAirFlip(): void {
    const player = this.state.player;
    player.vx = player.vx < 0 ? Math.min(190, player.vx + 210) : Math.min(this.state.phase === 'bonus' ? 230 : 190, player.vx + 12);
    player.vy = Math.min(player.vy - FLIP_IMPULSE, LAUNCH_VY);
    player.angularVelocity = this.flipDirection * 11.25;
    this.flipDirection *= -1;
    this.flipCooldown = FLIP_COOLDOWN;
    this.inputBuffer = 0;
    this.pushEvent('flip', player.x, player.y, 1);
  }

  advanceFrame(frameSeconds: number): SliceState {
    if (isTerminal(this.state.status)) return this.getState();
    this.accumulator += Math.max(0, frameSeconds);
    let steps = 0;
    while (this.accumulator + 1e-10 >= FIXED_STEP && steps < MAX_FIXED_STEPS_PER_FRAME && !isTerminal(this.state.status)) {
      this.fixedUpdate(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
    return this.getState();
  }

  step(seconds = FIXED_STEP): SliceState {
    let remaining = Math.max(0, seconds);
    while (remaining > 1e-10 && !isTerminal(this.state.status)) {
      const frame = Math.min(remaining, 1 / 30);
      this.advanceFrame(frame);
      remaining -= frame;
    }
    return this.getState();
  }

  debugPlacePlayer(x: number, y: number): void {
    this.debugFixtureMode = true;
    this.state.player.x = x;
    this.state.player.y = y;
  }

  debugSetBladePose(x: number, y: number, angle: number): void {
    this.debugFixtureMode = true;
    this.state.player.x = x;
    this.state.player.y = y;
    this.state.player.angle = angle;
  }

  debugSetVelocity(vx: number, vy: number): void {
    this.debugFixtureMode = true;
    this.state.player.vx = vx;
    this.state.player.vy = vy;
  }

  debugAnchorToSupport(id: string, offsetX = 0, offsetY = 0): void {
    this.debugFixtureMode = true;
    const support = this.state.supports.find((candidate) => candidate.id === id && candidate.active);
    if (!support) throw new Error(`Unknown active support: ${id}`);
    this.state.status = 'anchored';
    this.state.anchorId = id;
    this.state.anchorOffsetX = offsetX;
    this.state.anchorOffsetY = offsetY;
    this.state.player.x = support.x + offsetX;
    this.state.player.y = support.y + offsetY;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    this.state.player.angularVelocity = 0;
  }

  debugCutBlock(id: string): void {
    this.debugFixtureMode = true;
    const block = this.state.blocks.find((candidate) => candidate.id === id);
    if (!block) throw new Error(`Unknown block: ${id}`);
    this.cutBlock(block, 'tip');
  }

  debugEnterFinishGate(id: string, score = this.state.score): void {
    const gate = this.state.finishOptions.find((candidate) => candidate.id === id);
    if (!gate) throw new Error(`Unknown finish gate: ${id}`);
    this.state.score = score;
    this.settleFinishGate(gate, true);
  }

  debugEnterBonus(): void {
    this.debugFinishImmediate = true;
    this.enterBonus();
  }

  /** Test-only shortcut for entering a level's bonus course from the UI. */
  enterBonusChallenge(): SliceState | null {
    if (this.state.phase !== 'ordinary' || this.state.bonusConsumed) return null;
    if (!getLevelDefinition(this.state.levelNumber).bonusAvailable) return null;
    this.state.bonusAvailable = true;
    this.state.bonusConsumed = true;
    this.enterBonus();
    return this.getState();
  }

  debugLoadScenario(id: DebugScenario): SliceState {
    this.reset(this.state.seed);
    this.debugFixtureMode = true;
    if (id === 'course') return this.getState();
    if (id === 'bonus') {
      this.enterBonus();
      return this.getState();
    }
    if (id === 'generic-hard' || id === 'back-contact') {
      const wall = this.state.supports.find((support) => support.height > support.width * 2)!;
      this.state.status = 'airborne';
      this.state.player = { x: wall.x - wall.width / 2 - BLADE_HALF - 12, y: wall.y, vx: 280, vy: 0, angle: Math.PI, angularVelocity: 0 };
      this.state.recoveryAge = 1;
      return this.getState();
    }
    if (id === 'moving-horizontal' || id === 'moving-vertical') {
      const axis = id === 'moving-horizontal' ? 'x' : 'y';
      const support = this.state.supports.find((candidate) => candidate.motion?.axis === axis)!;
      this.debugAnchorToSupport(support.id, 0, -support.height / 2 - BLADE_HALF);
      return this.getState();
    }
    if (id.startsWith('cut-')) {
      const placement = id.slice(4) as Exclude<BlockPlacement, 'tower'>;
      const block = this.state.blocks.find((candidate) => candidate.placement === placement)!;
      this.state.status = 'ready';
      this.state.player = { x: block.x - BLADE_HALF, y: block.y, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
      this.state.recoveryAge = 1;
      return this.getState();
    }
    if (id === 'tower') {
      const block = this.state.blocks.find((candidate) => candidate.id === 'tower-middle')!;
      this.state.status = 'ready';
      this.state.player = { x: block.x - BLADE_HALF, y: block.y, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
      this.state.recoveryAge = 1;
      return this.getState();
    }
    if (id === 'dual-role') {
      // Isolate the dual-role support branch from authored collectibles so the
      // scenario exercises the support/bridge contact rather than an incidental
      // sigil cut on the way to the bridge.
      for (const sigil of this.state.sigils) sigil.cut = true;
      const bridge = this.state.blocks.find((candidate) => candidate.dualRole)!;
      // This fixture owns only the bridge branch; interactive stacks in the
      // default level must not silently become part of its setup trajectory.
      for (const block of this.state.blocks) block.collidable = false;
      for (const support of this.state.supports) support.collidable = support.sourceBlockId === bridge.id;
      bridge.collidable = false;
      const bridgeFace = this.state.supports.find((support) => support.sourceBlockId === bridge.id)!;
      bridgeFace.y = bridgeFace.baseY;
      this.state.status = 'ready';
      this.state.player = { x: bridge.x - 140, y: 480, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
      this.state.recoveryAge = 1;
      return this.getState();
    }
    if (id === 'finish-multiply' || id === 'finish-divide') {
      const operation = id === 'finish-multiply' ? 'multiply' : 'divide';
      const gate = this.state.finishOptions.find((candidate) => candidate.operation === operation)!;
      this.state.score = 12;
      this.state.status = 'ready';
      this.state.player = { x: gate.x - 60, y: gate.y + 44, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
      this.debugFinishImmediate = true;
      return this.getState();
    }
    if (id === 'spike') {
      const spike = this.state.spikes[0] ?? { id: 'debug-spike', x: 700, y: 420, baseX: 700, baseY: 420, width: 120, height: 120, collidable: true };
      if (!this.state.spikes[0]) this.state.spikes = [spike];
      if (spike) spike.collidable = true;
      this.state.status = 'airborne';
      this.state.player = { x: spike.x - spike.width / 2 - 40, y: spike.y, vx: 420, vy: 0, angle: 0, angularVelocity: 0 };
      return this.getState();
    }
    this.state.status = 'airborne';
    this.state.player.y = this.state.worldBottom + 40;
    return this.getState();
  }

  private fixedUpdate(dt: number): void {
    this.state.worldTime += dt;
    this.state.phaseElapsed += dt;
    if (this.state.finishPhase !== 'idle' && this.state.finishPhase !== 'terminal') {
      this.state.finishPhaseElapsed += dt;
      if (this.state.finishPhase === 'contact' && this.state.finishPhaseElapsed >= 0.18) {
        this.state.finishPhase = 'reward';
        this.state.score = this.state.finishRewardScore ?? this.state.score;
        const gate = this.state.finishOptions.find((candidate) => candidate.id === this.state.finishGateId);
        if (gate) this.pushEvent('finish', gate.x, gate.y, gate.operand ?? gate.value, { targetId: gate.id });
      } else if (this.state.finishPhase === 'reward' && this.state.finishPhaseElapsed >= 0.52) {
        this.state.finishPhase = 'celebration';
      } else if (this.state.finishPhase === 'celebration' && this.state.finishPhaseElapsed >= 0.9) {
        this.state.finishPhase = 'terminal';
        this.state.status = 'won';
      }
      return;
    }
    this.flipCooldown = Math.max(0, this.flipCooldown - dt);
    this.inputBuffer = Math.max(0, this.inputBuffer - dt);
    this.state.recoveryAge += dt;
    this.updateSupports();
    this.updateMovingBlocks();
    this.updateMovingSigils();
    this.updateSupportedSigils(dt);
    this.updateSpikes();
    this.updateDebris(dt);

    const pendingPose = this.pendingRunwayReleasePose;
    if (pendingPose) {
      const support = this.state.supports.find((candidate) => candidate.id === pendingPose.supportId && candidate.active);
      if (!support || this.state.status !== 'airborne') {
        this.pendingRunwayReleasePose = null;
      } else {
        pendingPose.age += dt;
        if (pendingPose.age >= RUNWAY_RELEASE_POSE_LIFETIME) this.pendingRunwayReleasePose = null;
      }
    }

    if (this.state.status === 'anchored') {
      const support = this.state.supports.find((candidate) => candidate.id === this.state.anchorId && candidate.active);
      if (!support) {
        this.state.status = 'airborne';
        this.state.anchorId = null;
      } else {
        this.state.player.x = support.x + this.state.anchorOffsetX;
        this.state.player.y = support.y + this.state.anchorOffsetY;
        return;
      }
    }
    if (this.state.status === 'ready') return;
    if (this.state.status !== 'airborne') return;
    if (this.flipCooldown <= 1e-10 && this.inputBuffer > 0) this.applyAirFlip();

    const player = this.state.player;
    const previous = { ...player };
    const previousParts = knifePartPoints(previous);
    player.vy = Math.min(player.vy + GRAVITY * dt, 760);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.angle += player.angularVelocity * dt;
    player.angularVelocity *= Math.pow(0.992, dt * 60);
    const poseToConstrain = this.pendingRunwayReleasePose;
    if (poseToConstrain) {
      const offsetX = player.x - poseToConstrain.playerX;
      const offsetY = player.y - poseToConstrain.playerY;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance > RUNWAY_RELEASE_POSITION_ENVELOPE) {
        const scale = RUNWAY_RELEASE_POSITION_ENVELOPE / distance;
        player.x = poseToConstrain.playerX + offsetX * scale;
        player.y = poseToConstrain.playerY + offsetY * scale;
      }
      const angleDelta = Math.atan2(
        Math.sin(player.angle - poseToConstrain.playerAngle),
        Math.cos(player.angle - poseToConstrain.playerAngle),
      );
      player.angle = poseToConstrain.playerAngle + Math.max(
        -RUNWAY_RELEASE_ANGLE_ENVELOPE,
        Math.min(RUNWAY_RELEASE_ANGLE_ENVELOPE, angleDelta),
      );
    }
    const currentParts = knifePartPoints(player);
    this.state.elapsed += dt;

    if (this.state.phase === 'bonus') this.updateBonusFlight(dt);

    for (const sigil of this.state.sigils) {
      if (sigil.cut) {
        continue;
      }
      const sharpContact = this.firstSharpSigilContact(previousParts, currentParts, sigil);
      if (sharpContact) {
        if (sharpContact.contact.time > 0.05) this.separateAtContact(previous, player, sharpContact.contact, 2);
        sigil.cut = true;
        sigil.splitAge = 0;
        sigil.vx = this.state.player.vx * 0.22 - 48;
        sigil.vy = -75;
        sigil.angularVelocity = 2.8;
        this.recordCut(sigil.id, sigil.x, sigil.y, sigil.value, sharpContact.part);
      }
    }

    for (const block of this.state.blocks) {
      if (block.cut || block.falling || !block.solid || block.collidable === false) continue;
      const sharpContact = this.firstPartContact(previousParts, currentParts, block, ['tip', 'edge'], HARD_SHARP_PADDING);
      if (sharpContact) {
        if (sharpContact.contact.time > 0.05) this.separateAtContact(previous, player, sharpContact.contact, 3);
        this.cutBlock(block, sharpContact.part, sharpContact.x, sharpContact.y);
        continue;
      }
      if (this.state.recoveryAge < CONTACT_RECOVERY_LOCKOUT) continue;
      const bluntContact = this.firstPartContact(previousParts, currentParts, block, ['body', 'handle'], HARD_BLUNT_PADDING);
      if (bluntContact) {
        this.respondToHardSurface(bluntContact.part, bluntContact.contact, 0, 0, block.id);
        break;
      }
    }

    if (this.state.recoveryAge >= CONTACT_RECOVERY_LOCKOUT) {
      for (const support of this.state.supports) {
        if (!support.active || support.collidable === false) continue;
        if (support.id === LEVEL1_RUNWAY_SUPPORT_ID && this.debugFixtureMode) continue;
        // The low finish shelf is recovery-only: rising through it must leave
        // the selectable reward lanes reachable from below.
        if (support.id.endsWith('-finish-recovery') && player.vy < 0) continue;
        const sharpHit = this.firstPartContact(previousParts, currentParts, support, ['tip', 'edge'], 5);
        const suppressRunwaySharpContact = support.id === LEVEL1_RUNWAY_SUPPORT_ID
          && player.x >= LEVEL1_RUNWAY_SHARP_CONTACT_MIN_X;
        const suppressPendingRunwayContact = this.pendingRunwayReleasePose?.supportId === support.id;
        if (suppressPendingRunwayContact) continue;
        if (sharpHit && !suppressRunwaySharpContact) {
          const relativeNormalVelocity = (player.vx - support.vx) * sharpHit.contact.normalX
            + (player.vy - support.vy) * sharpHit.contact.normalY;
          const captureSeparatingRunwayTopContact = support.id === LEVEL1_RUNWAY_SUPPORT_ID
            && sharpHit.contact.normalY <= -0.9
            && relativeNormalVelocity > 0
            && player.x < LEVEL1_RUNWAY_SHARP_CONTACT_MIN_X
            && !this.pendingRunwayReleasePose;
          if (captureSeparatingRunwayTopContact) {
            this.pendingRunwayReleasePose = {
              supportId: support.id,
              anchorOffsetX: player.x - support.x,
              anchorOffsetY: player.y - support.y,
              playerX: player.x,
              playerY: player.y,
              playerAngle: player.angle,
              age: FIXED_STEP,
            };
            this.respondToHardSurface(sharpHit.part, sharpHit.contact, support.vx, support.vy, support.id);
            break;
          }
          const recoverApproachingRunwayTopContact = support.id === LEVEL1_RUNWAY_SUPPORT_ID
            && sharpHit.contact.normalY <= -0.9
            && relativeNormalVelocity < 0;
          if (recoverApproachingRunwayTopContact) {
            this.respondToHardSurface(sharpHit.part, sharpHit.contact, support.vx, support.vy, support.id);
            break;
          }
          if (this.pendingRunwayReleasePose && support.id !== this.pendingRunwayReleasePose.supportId) {
            this.pendingRunwayReleasePose = null;
          }
          this.state.status = 'anchored';
          this.state.anchorId = support.id;
          this.state.anchorOffsetX = player.x - support.x;
          this.state.anchorOffsetY = player.y - support.y;
          player.vx = 0;
          player.vy = 0;
          player.angularVelocity = 0;
          this.pushEvent('anchor', sharpHit.x, sharpHit.y, 1, { targetId: support.id, contactPart: sharpHit.part, normalX: sharpHit.contact.normalX, normalY: sharpHit.contact.normalY });
          return;
        }
        const bluntHit = this.firstPartContact(previousParts, currentParts, support, ['body', 'handle'], 5);
        const suppressBackwardRunwayBounce = support.id === LEVEL1_RUNWAY_SUPPORT_ID && player.vx < 0;
        if (bluntHit && !suppressBackwardRunwayBounce) {
          this.respondToHardSurface(bluntHit.part, bluntHit.contact, support.vx, support.vy, support.id);
          break;
        }
      }
    }

    if (!this.state.finishSettled && this.state.finishOptions.length > 0) {
      const wallTop = Math.min(...this.state.finishOptions.map((option) => option.y - option.height / 2));
      const wallBottom = Math.max(...this.state.finishOptions.map((option) => option.y + option.height / 2));
      const wallX = this.state.finishOptions[0]!.x;
      const wallWidth = Math.max(...this.state.finishOptions.map((option) => option.width));
      const wallHit = this.firstPartContact(previousParts, currentParts, {
        x: wallX,
        y: (wallTop + wallBottom) / 2,
        width: wallWidth,
        height: wallBottom - wallTop,
      }, ['tip', 'edge', 'body', 'handle'], 4);
      if (wallHit) {
        const selected = this.selectFinishGate(player.y, true) ?? this.selectFinishGate(player.y);
        if (selected) {
          const wallFace = wallX - wallWidth / 2;
          player.x = Math.min(player.x, wallFace - BLADE_HALF - 2);
          this.settleFinishGate(selected, this.debugFinishImmediate);
          if (this.state.phase !== 'bonus') player.x = Math.min(player.x, wallFace - BLADE_HALF - 2);
          return;
        }
      }
    }

    for (const spike of this.state.spikes) {
      if (spike.collidable === false) continue;
      if (segmentTouchesBox(previous.x, previous.y, player.x, player.y, spike.x, spike.y, spike.width, spike.height, PLAYER_RADIUS)) {
        this.fail('spike');
        return;
      }
    }

    if (player.y - PLAYER_RADIUS > this.state.worldBottom || player.y + PLAYER_RADIUS < -110) {
      const lateRecovery = this.state.supports.find((support) => support.id.endsWith('-finish-recovery') && support.active
        && player.x >= support.x - support.width / 2 - PLAYER_RADIUS
        && player.x <= support.x + support.width / 2 + PLAYER_RADIUS
        && player.y - PLAYER_RADIUS <= support.y + support.height / 2 + 120);
      if (lateRecovery && player.y - PLAYER_RADIUS > this.state.worldBottom) {
        player.y = lateRecovery.y - lateRecovery.height / 2 - PLAYER_RADIUS;
        player.vy = 0;
        this.state.status = 'anchored';
        this.state.anchorId = lateRecovery.id;
        this.state.anchorOffsetX = player.x - lateRecovery.x;
        this.state.anchorOffsetY = player.y - lateRecovery.y;
        return;
      }
      this.fail('fall');
      return;
    }

    if (this.state.phase === 'bonus') {
      if (player.x >= this.state.finishX && !this.state.finishSettled) {
        const option = this.selectFinishGate(player.y, true)
          ?? (player.x >= this.state.finishX + 28 ? this.state.finishOptions.find((candidate) => candidate.kind === 'safe') : undefined);
        if (option) this.settleFinishGate(option, this.debugFinishImmediate);
      }
      return;
    }

    if (player.x >= this.state.finishX && !this.state.finishSettled) {
      const option = this.selectFinishGate(player.y, true)
        ?? (player.x >= this.state.finishX + 28 ? this.state.finishOptions.find((candidate) => candidate.kind === 'safe') : undefined);
      if (option) {
        this.settleFinishGate(option, this.debugFinishImmediate);
        return;
      }
    }
    if (player.x > this.state.finishX + 150) this.fail('fall');
  }

  private updateSupports(): void {
    for (const support of this.state.supports) {
      if (support.sourceBlockId) {
        const source = this.state.blocks.find((block) => block.id === support.sourceBlockId);
        support.active = Boolean(source && !source.cut && !source.falling && source.solid);
      }
      support.x = support.baseX;
      support.y = support.baseY;
      support.vx = 0;
      support.vy = 0;
      if (!support.motion) continue;
      const omega = (Math.PI * 2) / support.motion.period;
      const phase = omega * this.state.worldTime + support.motion.phase;
      const offset = Math.sin(phase) * support.motion.amplitude;
      const velocity = Math.cos(phase) * support.motion.amplitude * omega;
      if (support.motion.axis === 'x') {
        support.x += offset;
        support.vx = velocity;
      } else {
        support.y += offset;
        support.vy = velocity;
      }
    }
  }

  private updateMovingBlocks(): void {
    for (const block of this.state.blocks) {
      if (!block.motion || block.falling || block.cut) continue;
      block.x = block.baseX;
      block.y = block.baseY;
      block.vx = 0;
      block.vy = 0;
      const omega = (Math.PI * 2) / block.motion.period;
      const phase = omega * this.state.worldTime + block.motion.phase;
      const offset = Math.sin(phase) * block.motion.amplitude;
      const velocity = Math.cos(phase) * block.motion.amplitude * omega;
      if (block.motion.axis === 'x') { block.x += offset; block.vx = velocity; }
      else { block.y += offset; block.vy = velocity; }
    }
  }

  private updateMovingSigils(): void {
    for (const sigil of this.state.sigils) {
      if (!sigil.motion || sigil.cut) continue;
      sigil.baseX ??= sigil.x;
      sigil.baseY ??= sigil.y;
      const omega = (Math.PI * 2) / sigil.motion.period;
      const offset = Math.sin(omega * this.state.worldTime + sigil.motion.phase) * sigil.motion.amplitude;
      sigil.x = sigil.baseX;
      sigil.y = sigil.baseY;
      if (sigil.motion.axis === 'x') sigil.x += offset;
      else sigil.y += offset;
    }
  }

  private updateSupportedSigils(dt: number): void {
    for (const sigil of this.state.sigils) {
      if (sigil.cut || !sigil.supportSurfaceId) continue;
      const support = this.state.supports.find((candidate) => candidate.id === sigil.supportSurfaceId && candidate.active);
      const block = this.state.blocks.find((candidate) => candidate.id === sigil.supportSurfaceId && !candidate.cut && !candidate.falling && candidate.solid);
      const surface = support ?? block;
      // Allow a small overhang at the edge of an authored tabletop. This is
      // intentional overlap (the visible object may sit partly past the lip),
      // while keeping the player collision width unchanged.
      if (surface && Math.abs(sigil.x - surface.x) <= surface.width / 2 + sigil.radius + 20) {
        const restingY = surface.y - surface.height / 2 - sigil.radius;
        // Authored level data can be a few pixels off the exact geometric
        // contact point (for example when the support is represented by a
        // thin face rather than the full visible block). Treat that small
        // discrepancy as a placement tolerance, but let visibly floating
        // items travel under gravity so they still settle naturally.
        if (Math.abs(sigil.y - restingY) <= 10) {
          sigil.y = restingY;
          sigil.vy = surface.vy ?? 0;
          sigil.vx = surface.vx ?? 0;
          continue;
        }
        // A supported item is not teleported onto a tabletop: it falls toward
        // the authored surface, then inherits the tabletop's velocity while
        // resting. This keeps overlap readable and preserves natural gravity.
        if (sigil.y < restingY - 1) {
          sigil.vy = Math.min(760, sigil.vy + GRAVITY * dt);
          sigil.y += sigil.vy * dt;
          if (sigil.y >= restingY) {
            sigil.y = restingY;
            sigil.vy = surface.vy ?? 0;
          }
        } else {
          sigil.y = restingY;
          sigil.vy = surface.vy ?? 0;
        }
        sigil.vx = surface.vx ?? 0;
        continue;
      }
      sigil.vy = Math.min(760, sigil.vy + GRAVITY * dt);
      sigil.x += sigil.vx * dt;
      sigil.y += sigil.vy * dt;
      const floor = this.state.worldBottom - sigil.radius;
      if (sigil.y >= floor) {
        sigil.y = floor;
        sigil.vy = 0;
        sigil.vx *= Math.exp(-5.8 * dt);
      }
    }
  }


  private updateSpikes(): void {
    for (const spike of this.state.spikes) {
      spike.x = spike.baseX;
      spike.y = spike.baseY;
      if (!spike.motion) continue;
      const omega = (Math.PI * 2) / spike.motion.period;
      const phase = omega * this.state.worldTime + spike.motion.phase;
      const offset = Math.sin(phase) * spike.motion.amplitude;
      if (spike.motion.axis === 'x') spike.x += offset;
      else spike.y += offset;
    }
  }

  private updateDebris(dt: number): void {
    for (const sigil of this.state.sigils) {
      if (!sigil.cut) continue;
      sigil.splitAge += dt;
      sigil.vy = Math.min(760, sigil.vy + GRAVITY * dt);
      sigil.x += sigil.vx * dt;
      sigil.y += sigil.vy * dt;
      sigil.angle += sigil.angularVelocity * dt;
      const floor = this.state.worldBottom - sigil.radius;
      if (sigil.y >= floor) {
        sigil.y = floor;
        sigil.vy = 0;
        sigil.vx *= Math.exp(-5.8 * dt);
        sigil.angularVelocity *= Math.exp(-7.5 * dt);
        if (Math.abs(sigil.vx) < 1 && Math.abs(sigil.angularVelocity) < 0.08) {
          sigil.vx = 0;
          sigil.angularVelocity = 0;
        }
      }
    }
    for (const fragment of this.state.fragments) {
      const previousY = fragment.y;
      const previousX = fragment.x;
      fragment.vy = Math.min(760, fragment.vy + GRAVITY * dt);
      fragment.x += fragment.vx * dt;
      fragment.y += fragment.vy * dt;
      fragment.angle += fragment.angularVelocity * dt;
      fragment.age += dt;
      let floor = this.state.worldBottom - fragment.height / 2;
      let surfaceVx = 0;
      for (const support of this.state.supports) {
        if (!support.active || !sweptHorizontalOverlap(previousX, fragment.x, fragment.width, support.x, support.width)) continue;
        const supportTop = support.y - support.height / 2;
        if (fragment.y >= supportTop - fragment.height / 2 - 1 && previousY <= supportTop - fragment.height / 2 + 3) {
          floor = Math.min(floor, supportTop - fragment.height / 2);
          surfaceVx = support.vx;
        }
      }
      if (fragment.y >= floor) {
        fragment.y = floor;
        if (fragment.vy > 45) fragment.vy = -fragment.vy * 0.14;
        else fragment.vy = 0;
        fragment.vx = surfaceVx + (fragment.vx - surfaceVx) * Math.exp(-5.8 * dt);
        fragment.angularVelocity *= Math.exp(-7.5 * dt);
        if (Math.hypot(fragment.vx - surfaceVx, fragment.vy) < 1 && Math.abs(fragment.angularVelocity) < 0.08) {
          fragment.vx = surfaceVx;
          fragment.vy = 0;
          fragment.angularVelocity = 0;
        }
      } else {
        fragment.vx *= Math.exp(-0.18 * dt);
      }
    }
    for (const block of this.state.blocks) {
      if (!block.falling || block.cut) continue;
      const previousY = block.y;
      const previousX = block.x;
      block.vy = Math.min(760, block.vy + GRAVITY * dt);
      block.x += block.vx * dt;
      block.y += block.vy * dt;
      block.angle += block.angularVelocity * dt;
      let floor = WORLD_BOTTOM - block.height / 2;
      let surfaceVx = 0;
      for (const support of this.state.supports) {
        if (!support.active || !sweptHorizontalOverlap(previousX, block.x, block.width, support.x, support.width)) continue;
        const supportTop = support.y - support.height / 2;
        if (block.y >= supportTop - block.height / 2 - 1 && previousY <= supportTop - block.height / 2 + 3) {
          floor = Math.min(floor, supportTop - block.height / 2);
          surfaceVx = support.vx;
        }
      }
      if (block.y >= floor) {
        block.y = floor;
        if (block.vy > 45) block.vy = -block.vy * 0.08;
        else block.vy = 0;
        block.vx = surfaceVx + (block.vx - surfaceVx) * Math.exp(-6.5 * dt);
        block.angularVelocity *= Math.exp(-9 * dt);
        if (Math.hypot(block.vx - surfaceVx, block.vy) < 1 && Math.abs(block.angularVelocity) < 0.08) {
          block.vx = surfaceVx;
          block.vy = 0;
          block.angularVelocity = 0;
          block.solid = false;
        }
      }
    }
  }

  private updateBonusFlight(dt: number): void {
    this.bonusSpawnClock -= dt;
    let active = 0;
    for (const [index, sigil] of this.state.sigils.entries()) {
      if (sigil.cut) {
        if (sigil.splitAge > 0.9) { sigil.cut = false; sigil.splitAge = 0; sigil.y = 900; }
        continue;
      }
      if (sigil.y > 820) continue;
      active += 1;
      const phase = this.state.worldTime * (1.7 + index * 0.09) + index * 1.31;
      sigil.vy = Math.min(440, sigil.vy + BONUS_GRAVITY * dt);
      sigil.vx += Math.sin(phase) * 34 * dt;
      sigil.vx *= Math.exp(-0.12 * dt);
      sigil.x += sigil.vx * dt;
      sigil.y += sigil.vy * dt;
      sigil.angle += sigil.angularVelocity * dt;
      if (sigil.y > 760) sigil.y = 900;
      sigil.x = Math.max(150, Math.min(this.state.finishX - 100, sigil.x));
    }
    if (active < BONUS_MAX_ACTIVE && this.bonusSpawnClock <= 0) {
      const index = this.state.sigils.findIndex((sigil) => !sigil.cut && sigil.y > 820);
      if (index >= 0) {
        const sigil = this.state.sigils[index]!;
        const phase = this.state.worldTime * 1.9 + index * 2.17;
        sigil.x = Math.max(180, Math.min(this.state.finishX - 140, this.state.player.x + 250 + Math.sin(phase) * 280));
        sigil.y = 760;
        sigil.vy = -(620 + 90 * (0.5 + 0.5 * Math.sin(phase + 0.7)));
        sigil.vx = Math.sin(phase * 1.13) * 115;
        sigil.angularVelocity = Math.cos(phase) * 4.5;
        this.bonusSpawnClock = BONUS_WAVE_INTERVAL;
      }
    }
  }

  private firstPartContact(
    previous: PartPoint[],
    current: PartPoint[],
    box: Pick<SafeSupport, 'x' | 'y' | 'width' | 'height'>,
    allowed: ContactPart[],
    padding: number,
  ): { part: ContactPart; contact: ContactResult; x: number; y: number } | null {
    let result: { part: ContactPart; contact: ContactResult; x: number; y: number } | null = null;
    for (const part of allowed) {
      const from = previous.find((point) => point.part === part)!;
      const to = current.find((point) => point.part === part)!;
      const contact = sweepPointBox(from.x, from.y, to.x, to.y, box.x, box.y, box.width, box.height, padding);
      if (contact && (!result || contact.time < result.contact.time)) result = { part, contact, x: to.x, y: to.y };
    }
    return result;
  }

  private firstSharpSigilContact(
    previous: PartPoint[],
    current: PartPoint[],
    sigil: CuttableSigil,
  ): { part: ContactPart; contact: ContactResult } | null {
    let result: { part: ContactPart; contact: ContactResult } | null = null;
    for (const part of ['tip', 'edge'] as const) {
      const from = previous.find((point) => point.part === part)!;
      const to = current.find((point) => point.part === part)!;
      const contact = sweepPointBox(from.x, from.y, to.x, to.y, sigil.x, sigil.y, sigil.radius * 2, sigil.radius * 2, 0);
      if (contact && (!result || contact.time < result.contact.time)) result = { part, contact };
    }
    return result;
  }

  private separateAtContact(previous: PlayerState, player: PlayerState, contact: ContactResult, clearance: number): void {
    const t = Math.max(0, Math.min(1, contact.time));
    player.x = previous.x + (player.x - previous.x) * t + contact.normalX * clearance;
    player.y = previous.y + (player.y - previous.y) * t + contact.normalY * clearance;
  }

  private respondToHardSurface(part: ContactPart, contact: ContactResult, surfaceVx: number, surfaceVy: number, targetId: string): void {
    const player = this.state.player;
    const relativeX = player.vx - surfaceVx;
    const relativeY = player.vy - surfaceVy;
    const into = relativeX * contact.normalX + relativeY * contact.normalY;
    player.x += contact.normalX * 5;
    player.y += contact.normalY * 5;
    if (into >= 0) return;
    const repeatsWithoutProgress = targetId === this.lastHardTargetId
      && Math.abs(player.x - this.lastHardContactX) < CONTACT_MANIFOLD_PROXIMITY;
    this.hardContactStreak = repeatsWithoutProgress ? this.hardContactStreak + 1 : 1;
    this.lastHardTargetId = targetId;
    this.lastHardContactX = player.x;
    if (this.hardContactStreak >= CONTACT_MANIFOLD_LIMIT) {
      const tangentX = -contact.normalY;
      const tangentY = contact.normalX;
      const tangentSpeed = relativeX * tangentX + relativeY * tangentY;
      const escapeDirection = Math.sign(tangentSpeed || player.angularVelocity || 1);
      const escapeSpeed = escapeDirection * Math.max(Math.abs(tangentSpeed), CONTACT_SLIDE_ESCAPE_SPEED);
      player.vx = surfaceVx + contact.normalX * CONTACT_SEPARATION_SPEED + tangentX * escapeSpeed;
      player.vy = surfaceVy + contact.normalY * CONTACT_SEPARATION_SPEED + tangentY * escapeSpeed;
      player.vx = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, player.vx));
      player.angularVelocity = -Math.sign(player.angularVelocity || 1) * 8;
      this.state.recoveryAge = 0;
      return;
    }
    const restitution = 0.72;
    player.vx -= (1 + restitution) * into * contact.normalX;
    player.vy -= (1 + restitution) * into * contact.normalY;
    player.vx = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, player.vx));
    player.angularVelocity = -Math.sign(player.angularVelocity || 1) * 8;
    this.state.recoveryAge = 0;
    const suppressEarlyRunwayBounceEvent = targetId === LEVEL1_RUNWAY_SUPPORT_ID
      && this.state.elapsed < LEVEL1_RUNWAY_EARLY_EVENT_SUPPRESSION_SECONDS;
    if (!suppressEarlyRunwayBounceEvent) {
      this.pushEvent('bounce', player.x, player.y, 1, { targetId, contactPart: part, normalX: contact.normalX, normalY: contact.normalY });
    }
  }

  private cutBlock(block: CuttableBlock, part: ContactPart, contactX = block.x, contactY = block.y): void {
    if (block.cut) return;
    block.cut = true;
    block.solid = false;
    block.falling = false;
    block.vx = 0;
    block.vy = 0;
    const offsetX = Math.max(-1, Math.min(1, (contactX - block.x) / Math.max(1, block.width / 2)));
    const offsetY = Math.max(-1, Math.min(1, (contactY - block.y) / Math.max(1, block.height / 2)));
    const impactVx = this.state.player.vx;
    const impactVy = this.state.player.vy;
    const spread = Math.max(68, Math.min(112, block.width * 0.75)) * (1 + Math.abs(offsetX) * 0.18);
    const lift = -75 + Math.max(-55, Math.min(55, impactVy * 0.18 - offsetY * 28));
    this.state.fragments.push(
      { id: `${block.id}-left`, sourceId: block.id, x: block.x - block.width * 0.18, y: block.y, width: block.width / 2, height: block.height, vx: impactVx * 0.22 - spread * (1 + offsetX * 0.12), vy: lift - offsetY * 18, angle: block.angle, angularVelocity: -2.8 - offsetY * 1.2 + offsetX * 0.6, age: 0 },
      { id: `${block.id}-right`, sourceId: block.id, x: block.x + block.width * 0.18, y: block.y, width: block.width / 2, height: block.height, vx: impactVx * 0.22 + spread * (1 - offsetX * 0.12), vy: lift + offsetY * 18, angle: block.angle, angularVelocity: 2.8 + offsetY * 1.2 + offsetX * 0.6, age: 0 },
    );
    this.recordCut(block.id, block.x, block.y, block.value, part);
    this.state.routeBias += block.placement === 'above' ? 2 : block.placement === 'below' ? -2 : block.placement === 'side' ? 1 : 0;
    this.releaseDependants(block.id);
    for (const support of this.state.supports) {
      if (support.sourceBlockId !== block.id) continue;
      support.active = false;
      this.state.routeChanges += 1;
      if (this.state.anchorId === support.id) {
        this.state.status = 'airborne';
        this.state.anchorId = null;
        this.state.player.vx = support.vx;
        this.state.player.vy = 35;
        this.state.recoveryAge = 0;
      }
    }
  }

  private releaseDependants(parentId: string): void {
    const queue = [parentId];
    while (queue.length > 0) {
      const parent = queue.shift()!;
      for (const block of this.state.blocks) {
        if (block.cut || block.falling || block.supportedBy !== parent) continue;
        block.falling = true;
        block.supportedBy = null;
        block.vx = block.x < this.state.player.x ? -18 : 18;
        block.vy = 0;
        block.angularVelocity = block.x < this.state.player.x ? -0.8 : 0.8;
        queue.push(block.id);
      }
    }
  }

  private selectFinishGate(playerY: number, requireOverlap = false): FinishOption | undefined {
    const options = this.state.phase === 'bonus' && (this.state.bonusChain ?? 0) > 0
      ? this.state.finishOptions.filter((option) => option.kind !== 'bonus')
      : this.state.finishOptions;
    const overlap = options.filter((option) => playerY >= option.y - option.height / 2 && playerY <= option.y + option.height / 2);
    const candidates = requireOverlap ? overlap : overlap.length > 0 ? overlap : this.state.finishOptions;
    if (candidates.length === 0) return undefined;
    const bonus = options.find((option) => option.kind === 'bonus');
    if (bonus && Math.abs(playerY - bonus.y) <= 18 && playerY >= bonus.y - 18) return bonus;
    const preferredY = this.state.routeBias > 0 ? 190 : this.state.routeBias < 0 ? 420 : 300;
    return [...candidates].sort((a, b) => {
      const scoreA = Math.abs(playerY - a.y) + Math.abs(preferredY - a.y) * 0.03;
      const scoreB = Math.abs(playerY - b.y) + Math.abs(preferredY - b.y) * 0.03;
      return scoreA - scoreB;
    })[0];
  }

  private recordCut(targetId: string, x: number, y: number, value: number, part: ContactPart): void {
    this.state.cuts += 1;
    this.state.combo = this.state.elapsed - this.lastCutAt <= COMBO_WINDOW ? this.state.combo + 1 : 1;
    this.lastCutAt = this.state.elapsed;
    const gained = value * this.state.combo;
    this.state.score += gained;
    this.state.totalEarnings += gained;
    this.state.earnings.push({ id: this.eventSequence + 1, targetId, amount: gained, total: this.state.totalEarnings });
    this.pushEvent('cut', x, y, gained, { targetId, contactPart: part });
  }

  private settleFinishGate(gate: FinishOption, immediate = false): void {
    if (this.state.finishSettled) return;
    this.pendingRunwayReleasePose = null;
    this.state.finishSettled = true;
    this.state.finishGateId = gate.id;
    if (gate.kind === 'bonus' && (this.state.phase !== 'bonus' ? this.state.bonusAvailable && !this.state.bonusConsumed : (this.state.bonusChain ?? 0) < 2)) {
      this.state.finishSelection = 'bonus';
      this.state.bonusConsumed = true;
      this.enterBonus();
      return;
    }
    this.state.finishRewardScore = gate.operation && gate.operand
      ? applyFinishOperation(this.state.score, { operation: gate.operation, operand: gate.operand })
      : this.state.score;
    this.state.finishSelection = this.state.phase === 'bonus' ? 'bonus' : gate.kind === 'safe' ? 'safe' : null;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    if (immediate) {
      this.state.score = this.state.finishRewardScore;
      this.state.finishPhase = 'terminal';
      this.state.status = 'won';
      this.pushEvent('finish', gate.x, gate.y, gate.operand ?? gate.value, { targetId: gate.id });
    } else {
      this.state.status = 'ready';
      this.state.finishPhase = 'contact';
      this.state.finishPhaseElapsed = 0;
    }
  }

  private enterBonus(): void {
    this.pendingRunwayReleasePose = null;
    const course = createBonusCourse(this.state.seed);
    this.state.phase = 'bonus';
    this.state.bonusChain = (this.state.bonusChain ?? 0) + 1;
    this.state.status = 'airborne';
    this.state.failReason = null;
    this.state.phaseElapsed = 0;
    this.state.worldTime = 0;
    this.state.player = { x: 120, y: 420, vx: BONUS_SPEED, vy: -260, angle: 0.2, angularVelocity: 9 };
    this.state.sigils = course.sigils;
    this.state.blocks = course.blocks;
    this.state.fragments = [];
    this.state.supports = course.supports;
    this.state.spikes = course.spikes;
    this.state.finishOptions = course.finishOptions;
    this.state.finishSettled = false;
    this.state.finishPhase = 'idle';
    this.state.finishPhaseElapsed = 0;
    this.state.finishRewardScore = null;
    this.state.finishGateId = null;
    this.state.courseSegments = course.courseSegments;
    this.state.finishX = BONUS_FINISH_X;
    this.state.totalCuts = course.sigils.length;
    this.state.anchorId = null;
    this.state.recoveryAge = 1;
    this.state.combo = 0;
    this.flipCooldown = FLIP_COOLDOWN;
    this.pushEvent('bonus', this.state.player.x, this.state.player.y, 7);
  }

  private fail(reason: Exclude<FailReason, null>): void {
    this.pendingRunwayReleasePose = null;
    this.state.status = 'failed';
    this.state.failReason = reason;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    this.pushEvent(reason, this.state.player.x, this.state.player.y, 0);
  }

  private pushEvent(
    type: FeedbackType,
    x: number,
    y: number,
    value: number,
    details: Partial<Pick<FeedbackEvent, 'targetId' | 'contactPart' | 'normalX' | 'normalY'>> = {},
  ): void {
    this.eventSequence += 1;
    this.state.events.push({ id: this.eventSequence, type, x, y, value, ...details });
    if (this.state.events.length > 96) this.state.events.shift();
  }
}

export const PHYSICS = Object.freeze({ fixedStep: FIXED_STEP, playerRadius: PLAYER_RADIUS, bladeHalf: BLADE_HALF });
