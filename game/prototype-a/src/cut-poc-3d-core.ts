export const CUTTABLE_KINDS = ['crate', 'log', 'crystal'] as const;
export type CuttableKind = (typeof CUTTABLE_KINDS)[number];

export const BLADE_ASSET = {
  id: 'open-game-art-sword-6',
  sourceUrl: 'https://opengameart.org/content/3d-swords-lowpol-cc0',
  localPath: './assets/cc0-weapon/sword-6.glb',
  format: 'glb',
  dracoCompressed: true,
  silhouette: 'curved-saber',
  edgeTreatment: 'additive-curve-rim',
  sha256: '273c7133513bdcf619abb24ffe44e8c642b48f993d8baeb7a6de0473955d488c',
} as const;

export const BLADE_FEEL = {
  windupMs: 78,
  strikeMs: 108,
  hitStopMs: 54,
  recoveryMs: 270,
  trailMs: 240,
  flashMs: 72,
  particleCount: 18,
  cameraTrauma: 0.32,
  feedbackLayers: ['trail', 'flash', 'particles', 'hit-stop', 'camera-trauma'] as const,
} as const;

export type Vec3Tuple = readonly [number, number, number];

export interface CameraRig {
  projection: 'orthographic';
  position: Vec3Tuple;
  target: Vec3Tuple;
  verticalSize: number;
  lookAhead: number;
}

export const OBLIQUE_CAMERA: CameraRig = {
  projection: 'orthographic',
  position: [8.2, 6.4, 12.5],
  target: [4.2, 1.2, 0],
  verticalSize: 7.4,
  lookAhead: 2.4,
};

export interface QuantizedCut {
  bin: number;
  radians: number;
}

export interface CutPieceState {
  id: 'negative' | 'positive';
  capSide: 'front' | 'back';
  capMaterial: string;
  offset: Vec3Tuple;
  rotation: Vec3Tuple;
  launchVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
}

export type GroundedSurface = 'platform' | 'ground' | null;

export interface FallingPieceMotion {
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  rotation: Vec3Tuple;
  angularVelocity: Vec3Tuple;
  groundedSurface: GroundedSurface;
}

export const FALLING_PIECE_PHYSICS = {
  fixedStepSeconds: 1 / 60,
  gravity: -6.8,
  airDrag: 0.24,
  angularDrag: 0.62,
  platformHalfDepth: 1.5,
  platformFloorOffset: { crate: -0.18, log: -0.34, crystal: -0.34 },
  groundFloorOffset: { crate: -0.72, log: -0.75, crystal: -0.72 },
  restitution: 0.16,
  platformFriction: 1.4,
  groundFriction: 7.5,
  sleepSpeed: 0.12,
  baseHalfDepth: { crate: 0.4, log: 0.45, crystal: 0.45 },
} as const;

export function createFallingPieceMotion(_kind: CuttableKind, piece: CutPieceState): FallingPieceMotion {
  return {
    position: [0, 0, 0],
    velocity: [...piece.launchVelocity],
    rotation: [...piece.rotation],
    angularVelocity: [...piece.angularVelocity],
    groundedSurface: null,
  };
}

function supportingSurface(kind: CuttableKind, piece: CutPieceState, relativeZ: number): Exclude<GroundedSurface, null> {
  const side = piece.id === 'negative' ? -1 : 1;
  const worldZ = side * FALLING_PIECE_PHYSICS.baseHalfDepth[kind] + relativeZ;
  return Math.abs(worldZ) <= FALLING_PIECE_PHYSICS.platformHalfDepth ? 'platform' : 'ground';
}

export function stepFallingPieceMotion(
  kind: CuttableKind,
  piece: CutPieceState,
  motion: FallingPieceMotion,
): FallingPieceMotion {
  const dt = FALLING_PIECE_PHYSICS.fixedStepSeconds;
  const velocity = [...motion.velocity] as [number, number, number];
  const angularVelocity = [...motion.angularVelocity] as [number, number, number];
  const position = [...motion.position] as [number, number, number];
  const rotation = [...motion.rotation] as [number, number, number];

  const airDamping = Math.exp(-FALLING_PIECE_PHYSICS.airDrag * dt);
  velocity[0] *= airDamping;
  velocity[2] *= airDamping;
  velocity[1] += FALLING_PIECE_PHYSICS.gravity * dt;
  for (let axis = 0; axis < 3; axis += 1) {
    position[axis] += velocity[axis]! * dt;
    rotation[axis] += angularVelocity[axis]! * dt;
  }
  const angularDamping = Math.exp(-FALLING_PIECE_PHYSICS.angularDrag * dt);
  angularVelocity[0] *= angularDamping;
  angularVelocity[1] *= angularDamping;
  angularVelocity[2] *= angularDamping;

  const surface = supportingSurface(kind, piece, position[2]);
  const floor = surface === 'platform'
    ? FALLING_PIECE_PHYSICS.platformFloorOffset[kind]
    : FALLING_PIECE_PHYSICS.groundFloorOffset[kind];
  let groundedSurface: GroundedSurface = null;
  if (position[1] <= floor) {
    position[1] = floor;
    velocity[1] = velocity[1] < -0.45 ? -velocity[1] * FALLING_PIECE_PHYSICS.restitution : 0;
    const friction = surface === 'platform'
      ? FALLING_PIECE_PHYSICS.platformFriction
      : FALLING_PIECE_PHYSICS.groundFriction;
    const frictionDamping = Math.exp(-friction * dt);
    velocity[0] *= frictionDamping;
    velocity[2] *= frictionDamping;
    angularVelocity[0] *= frictionDamping;
    angularVelocity[1] *= frictionDamping;
    angularVelocity[2] *= frictionDamping;
    groundedSurface = surface;
    if (Math.hypot(...velocity) < FALLING_PIECE_PHYSICS.sleepSpeed) {
      velocity.fill(0);
      angularVelocity.fill(0);
    }
  }

  return { position, velocity, rotation, angularVelocity, groundedSurface };
}

function interpolateMotion(current: FallingPieceMotion, next: FallingPieceMotion, alpha: number): FallingPieceMotion {
  const interpolateTuple = (from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple => [
    from[0] + (to[0] - from[0]) * alpha,
    from[1] + (to[1] - from[1]) * alpha,
    from[2] + (to[2] - from[2]) * alpha,
  ];
  return {
    position: interpolateTuple(current.position, next.position),
    velocity: interpolateTuple(current.velocity, next.velocity),
    rotation: interpolateTuple(current.rotation, next.rotation),
    angularVelocity: interpolateTuple(current.angularVelocity, next.angularVelocity),
    groundedSurface: alpha < 0.5 ? current.groundedSurface : next.groundedSurface,
  };
}

export function sampleFallingPieceMotion(
  kind: CuttableKind,
  piece: CutPieceState,
  elapsedSeconds: number,
): FallingPieceMotion {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new RangeError('elapsedSeconds must be finite and non-negative');
  const dt = FALLING_PIECE_PHYSICS.fixedStepSeconds;
  const steps = Math.floor((elapsedSeconds + 1e-10) / dt);
  let motion = createFallingPieceMotion(kind, piece);
  for (let step = 0; step < steps; step += 1) motion = stepFallingPieceMotion(kind, piece, motion);
  const remainder = elapsedSeconds - steps * dt;
  if (remainder <= 1e-10) return motion;
  return interpolateMotion(motion, stepFallingPieceMotion(kind, piece, motion), remainder / dt);
}

export interface CutTransition {
  kind: CuttableKind;
  cut: QuantizedCut;
  durationMs: number;
  pieces: readonly [CutPieceState, CutPieceState];
}

export interface CutContactPoint {
  /** Normalized contact offset across the target, retained in the range [-1, 1]. */
  x: number;
  y: number;
  z?: number;
}

export interface CutPocState {
  kind: CuttableKind;
  index: number;
  phase: 'intact' | 'cut';
  cutCount: number;
  cut: CutTransition | null;
}

const TAU = Math.PI * 2;

export function quantizeCutAngle(angle: number, bins = 8): QuantizedCut {
  if (!Number.isFinite(angle)) throw new TypeError('cut angle must be finite');
  if (!Number.isInteger(bins) || bins < 2) throw new RangeError('cut bins must be an integer >= 2');
  const step = TAU / bins;
  const normalized = ((angle % TAU) + TAU) % TAU;
  const bin = Math.round(normalized / step) % bins;
  return { bin, radians: bin * step };
}

const CAP_MATERIAL: Record<CuttableKind, string> = {
  crate: 'layered-wood',
  log: 'growth-rings',
  crystal: 'luminous-core',
};

export function createCutTransition(kind: CuttableKind, angle: number, contact: CutContactPoint = { x: 0, y: 0, z: 0 }): CutTransition {
  const cut = quantizeCutAngle(angle);
  const contactX = Math.max(-1, Math.min(1, Number.isFinite(contact.x) ? contact.x : 0));
  const contactY = Math.max(-1, Math.min(1, Number.isFinite(contact.y) ? contact.y : 0));
  const contactZ = Math.max(-1, Math.min(1, Number.isFinite(contact.z ?? 0) ? contact.z ?? 0 : 0));
  const twist = (cut.bin % 2 === 0 ? 1 : -1) * (0.12 + Math.abs(contactX) * 0.08 + Math.abs(contactY) * 0.04);
  const cutCos = Math.cos(cut.radians);
  const cutSin = Math.sin(cut.radians);
  const sideVelocity = (side: -1 | 1): Vec3Tuple => [
    side * (0.74 * cutCos - 1.06 * cutSin) + contactX * 0.16,
    1.425 - side * 0.025 - side * contactY * 0.18,
    side * (0.74 * cutSin + 1.06 * cutCos) + contactZ * 0.12,
  ];
  return {
    kind,
    cut,
    durationMs: 720,
    pieces: [
      {
        id: 'negative',
        capSide: 'front',
        capMaterial: CAP_MATERIAL[kind],
        offset: [-0.34, 0.08, -0.38],
        rotation: [twist, -0.12, -0.08],
        launchVelocity: sideVelocity(-1),
        angularVelocity: [0.7 + contactY * 0.35, -0.9 + contactX * 0.45, -0.5 + contactZ * 0.3],
      },
      {
        id: 'positive',
        capSide: 'back',
        capMaterial: CAP_MATERIAL[kind],
        offset: [0.34, 0.02, 0.38],
        rotation: [-twist, Math.PI + 0.25, 0.08],
        launchVelocity: sideVelocity(1),
        angularVelocity: [-0.65 - contactY * 0.35, 1.05 + contactX * 0.45, 0.55 - contactZ * 0.3],
      },
    ],
  };
}

export function capVisibilityScore(camera: CameraRig, capNormal: Vec3Tuple): number {
  const view: [number, number, number] = [
    camera.position[0] - camera.target[0],
    camera.position[1] - camera.target[1],
    camera.position[2] - camera.target[2],
  ];
  const viewLength = Math.hypot(...view);
  const normalLength = Math.hypot(...capNormal);
  if (viewLength === 0 || normalLength === 0) return 0;
  const dot = view[0] * capNormal[0] + view[1] * capNormal[1] + view[2] * capNormal[2];
  return Math.abs(dot / (viewLength * normalLength));
}

export class CutPocController {
  private state: CutPocState = { kind: 'crate', index: 0, phase: 'intact', cutCount: 0, cut: null };

  getState(): CutPocState {
    return structuredClone(this.state);
  }

  act(angle = 0): CutPocState {
    if (this.state.phase === 'intact') {
      this.state = { ...this.state, phase: 'cut', cut: createCutTransition(this.state.kind, angle) };
      return this.getState();
    }
    const index = (this.state.index + 1) % CUTTABLE_KINDS.length;
    this.state = {
      kind: CUTTABLE_KINDS[index]!,
      index,
      phase: 'intact',
      cutCount: this.state.cutCount + 1,
      cut: null,
    };
    return this.getState();
  }

  reset(): CutPocState {
    this.state = { kind: 'crate', index: 0, phase: 'intact', cutCount: 0, cut: null };
    return this.getState();
  }
}
