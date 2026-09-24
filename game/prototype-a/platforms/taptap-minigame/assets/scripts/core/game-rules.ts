export type RunStatus = 'ready' | 'airborne' | 'failed' | 'won';
export type FailReason = 'hazard' | 'fall' | null;
export type ContactKind = 'sharp' | 'blunt' | 'hazard' | 'fall';

export interface GameState {
  readonly seed: number;
  readonly status: RunStatus;
  readonly failReason: FailReason;
  readonly motion: Readonly<{ vx: number; vy: number; angularVelocity: number }>;
  readonly cuts: number;
  readonly score: number;
  readonly cutTargets: readonly string[];
  readonly lastFeedback: 'ready' | 'launch' | 'flip' | 'cut' | 'reflect' | 'hazard' | 'fall' | 'finish';
  readonly settlement: Readonly<{ complete: boolean; score: number }>;
}

export function createGameState(seed = 928932): GameState {
  return {
    seed,
    status: 'ready',
    failReason: null,
    motion: { vx: 150, vy: 0, angularVelocity: 0 },
    cuts: 0,
    score: 0,
    cutTargets: [],
    lastFeedback: 'ready',
    settlement: { complete: false, score: 0 },
  };
}

export function tap(state: GameState): GameState {
  if (state.status === 'failed' || state.status === 'won') return createGameState(state.seed);
  if (state.status === 'ready') {
    return { ...state, status: 'airborne', motion: { vx: 150, vy: -300, angularVelocity: 9.5 }, lastFeedback: 'launch' };
  }
  return {
    ...state,
    motion: {
      vx: Math.max(150, state.motion.vx),
      vy: Math.min(-300, state.motion.vy - 220),
      angularVelocity: -Math.sign(state.motion.angularVelocity || 1) * 10.5,
    },
    lastFeedback: 'flip',
  };
}

export function resolveContact(state: GameState, contact: ContactKind, targetId = contact): GameState {
  if (state.status !== 'airborne') return state;
  if (contact === 'hazard' || contact === 'fall') {
    return {
      ...state,
      status: 'failed',
      failReason: contact,
      motion: { vx: 0, vy: 0, angularVelocity: 0 },
      lastFeedback: contact,
    };
  }
  if (contact === 'blunt') {
    return {
      ...state,
      motion: { vx: -Math.max(90, Math.abs(state.motion.vx) * 0.72), vy: -180, angularVelocity: -state.motion.angularVelocity },
      lastFeedback: 'reflect',
    };
  }
  if (state.cutTargets.includes(targetId)) return state;
  return {
    ...state,
    cuts: state.cuts + 1,
    score: state.score + 10,
    cutTargets: [...state.cutTargets, targetId],
    lastFeedback: 'cut',
  };
}

export function resolveFinish(state: GameState): GameState {
  if (state.status !== 'airborne') return state;
  return {
    ...state,
    status: 'won',
    motion: { vx: 0, vy: 0, angularVelocity: 0 },
    lastFeedback: 'finish',
    settlement: { complete: true, score: state.score },
  };
}
