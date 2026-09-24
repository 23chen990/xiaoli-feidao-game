import {
  ActionInput,
  SliceSimulation,
  type DebugScenario,
  type FeedbackEvent,
  type FeedbackType,
  type FlipAction,
  type SliceState,
} from './game-core';
import { MAIN_3D_RESOURCE_CONTRACT, ThreePresentationModel, summarizePerformance, type PerformanceResult } from './three-presentation';
import { ThreeWorldRenderer, type ThreeRendererFacts } from './three-world-renderer';
import { MECHANICS_DEMO_THEME, applyThemeTokens, themeContractFacts, type ThemeContractFacts } from './theme';
import { LEVEL_CATALOG, getLevelDefinition } from './game-levels';
import { levelOnePrompt } from './level-one-guidance';
import { LevelProgressStore, nextLevelNumber, type LevelProgress } from './level-progress';
import { clampFinishLabelPosition } from './finish-label-layout';
import { RuntimeLifecycle } from './runtime-lifecycle';
import './style.css';

interface PrototypeTestBridge {
  resetGame(seed?: number): SliceState;
  selectLevel(levelNumber: number): SliceState | null;
  nextLevel(): SliceState | null;
  enterBonusChallenge(): SliceState | null;
  replayLevel(): SliceState;
  getProgress(): LevelProgress;
  getState(): SliceState;
  act(action: FlipAction): boolean;
  step(seconds?: number): SliceState;
  loadScenario(id: DebugScenario): SliceState;
  getMechanicsCatalog(): readonly DebugScenario[];
  getViewState(): { cameraScrollX: number };
  getRenderState(): ThreeRendererFacts;
  getThemeContract(): ThemeContractFacts;
  resetPerformanceSamples(): void;
  getPerformanceReport(): PerformanceResult;
}

declare global {
  interface Window {
    __PROTOTYPE_TEST__: PrototypeTestBridge;
    __GAME_TEST__: PrototypeTestBridge;
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing 3D game element: ${selector}`);
  return element;
}

const shell = requireElement<HTMLElement>('#game-shell');
const hudTitle = requireElement<HTMLElement>('#hud-title');
const counterText = requireElement<HTMLElement>('#counter-text');
const stateText = requireElement<HTMLElement>('#state-text');
const directionText = requireElement<HTMLElement>('#direction-text');
const gateLegend = requireElement<HTMLElement>('#gate-legend');
const earningsBanner = requireElement<HTMLElement>('#earnings-banner');
const finishWallLabels = requireElement<HTMLElement>('#finish-wall-labels');
const levelSelect = requireElement<HTMLElement>('#level-select');
const levelGrid = requireElement<HTMLElement>('#level-grid');
const levelSelectorToggle = requireElement<HTMLButtonElement>('#level-selector-toggle');
const bonusTestButton = requireElement<HTMLButtonElement>('#bonus-test-button');
const instructionText = requireElement<HTMLElement>('#instruction-text');
const terminalText = requireElement<HTMLElement>('#terminal-text');
const terminalActions = requireElement<HTMLElement>('#terminal-actions');
const replayButton = requireElement<HTMLButtonElement>('#replay-button');
const nextLevelButton = requireElement<HTMLButtonElement>('#next-level-button');
const continueButton = requireElement<HTMLButtonElement>('#continue-button');
const progressWarning = requireElement<HTMLElement>('#progress-warning');
const feedbackLayer = requireElement<HTMLElement>('#feedback-layer');
const impactFlash = requireElement<HTMLElement>('#impact-flash');
applyThemeTokens(document.documentElement, MECHANICS_DEMO_THEME);
continueButton.textContent = '点击继续';
document.title = MECHANICS_DEMO_THEME.copy.title;
document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', MECHANICS_DEMO_THEME.css.background);
shell.setAttribute('aria-label', MECHANICS_DEMO_THEME.copy.canvasLabel);
hudTitle.textContent = MECHANICS_DEMO_THEME.copy.title;
instructionText.textContent = MECHANICS_DEMO_THEME.copy.instruction;
  gateLegend.textContent = MECHANICS_DEMO_THEME.copy.gateLegend;
levelSelectorToggle.textContent = MECHANICS_DEMO_THEME.copy.level.select;
levelSelect.setAttribute('aria-label', MECHANICS_DEMO_THEME.copy.level.select);
replayButton.textContent = MECHANICS_DEMO_THEME.copy.level.replay;
nextLevelButton.textContent = MECHANICS_DEMO_THEME.copy.level.next;
  bonusTestButton.textContent = '进入 Bonus 关（测试）';
bonusTestButton.hidden = true;
shell.dataset.resourceContract = MAIN_3D_RESOURCE_CONTRACT.runtimeKind;

class ToneBus {
  private context: AudioContext | null = null;

  unlock(): void {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  play(type: FeedbackType, value: number): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const settings: Record<FeedbackType, [number, number, OscillatorType, number]> = {
      launch: [230, 390, 'sine', 0.1],
      flip: [300, 470, 'triangle', 0.07],
      cut: [520 + Math.min(7, value) * 54, 860 + Math.min(7, value) * 62, 'triangle', 0.1],
      bounce: [165, 110, 'square', 0.11],
      anchor: [280, 280, 'sine', 0.16],
      spike: [105, 48, 'sawtooth', 0.22],
      fall: [170, 55, 'sine', 0.3],
      finish: [520, 780, 'triangle', 0.25],
      bonus: [360, 920, 'sine', 0.32],
    };
    const [from, to, wave, duration] = settings[type];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'spike' ? 0.055 : 0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    if (type === 'bonus' || type === 'finish') this.scheduleBell(now + 0.1, type === 'bonus' ? 720 : 650);
  }

  private scheduleBell(at: number, frequency: number): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.025, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.2);
  }
}

let progressStorage: Pick<Storage, 'getItem' | 'setItem'> | null = null;
try { progressStorage = window.localStorage; } catch { progressStorage = null; }
const progressStore = new LevelProgressStore(progressStorage);
if (progressStore.getWarning()) {
  progressWarning.hidden = false;
  progressWarning.textContent = progressStore.getWarning();
}
const initialProgress = progressStore.get();
const levelSeed = (levelNumber: number) => 31 + (levelNumber - 1) * 1009;
const simulation = new SliceSimulation(levelSeed(initialProgress.lastSelectedLevel), initialProgress.lastSelectedLevel);
const actionInput = new ActionInput();
const tones = new ToneBus();
const presentation = new ThreePresentationModel();
const world = new ThreeWorldRenderer(shell);
let lastEventId = 0;
let lastWallTime = performance.now();
let animationFrame = 0;
let performanceSamples: number[] = [];
let recordedWinKey = '';
let hitStopUntil = 0;
let paused = false;

function refreshLevelButtons(currentLevel: number): void {
  const progress = progressStore.get();
  levelGrid.replaceChildren(...LEVEL_CATALOG.levels.map((level) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(level.number).padStart(2, '0');
    button.disabled = level.number > progress.highestUnlockedLevel;
    button.title = button.disabled ? MECHANICS_DEMO_THEME.copy.level.locked : `${MECHANICS_DEMO_THEME.copy.level.current} ${level.number}`;
    button.setAttribute('aria-current', String(level.number === currentLevel));
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      selectLevel(level.number);
    });
    return button;
  }));
}

function clearFeedback(): void {
  feedbackLayer.replaceChildren();
  impactFlash.classList.remove('is-active');
}

function resetPresentation(): void {
  presentation.reset();
  actionInput.reset();
  lastEventId = 0;
  clearFeedback();
  earningsBanner.textContent = '';
  earningsBanner.classList.remove('is-active');
  hitStopUntil = 0;
}

function renderHud(state: SliceState): void {
  const storageWarning = progressStore.getWarning();
  if (storageWarning) {
    progressWarning.hidden = false;
    progressWarning.textContent = storageWarning;
  }
  const copy = MECHANICS_DEMO_THEME.copy;
  const phaseLabel = state.phase === 'bonus' ? copy.phase.bonus : copy.phase.ordinary;
  hudTitle.textContent = `${copy.title} · ${String(state.levelNumber).padStart(2, '0')}/12`;
  const levelDefinition = getLevelDefinition(state.levelNumber);
  const wallLegend = state.finishOptions
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((option) => option.kind === 'bonus' ? 'BONUS' : option.operation === 'divide' ? `÷${option.operand}` : `×${option.operand}`)
    .join(' · ');
  gateLegend.textContent = wallLegend || copy.gateLegend;
  finishWallLabels.replaceChildren(...state.finishOptions.map((option) => {
    const label = document.createElement('span');
    label.className = `finish-wall-label finish-wall-${option.kind}`;
    label.classList.toggle('is-selected', state.finishGateId === option.id && state.finishPhase !== 'idle');
    label.textContent = option.kind === 'bonus' ? 'BONUS' : option.operation === 'divide' ? `÷${option.operand}` : `×${option.operand}`;
    const screen = world.worldToScreen(worldPoint(option.x, option.y));
    const clamped = clampFinishLabelPosition(screen, { width: window.innerWidth, height: window.innerHeight });
    label.style.left = `${clamped.x}px`;
    label.style.top = `${clamped.y}px`;
    return label;
  }));
  document.body.dataset.levelFamily = levelDefinition.family;
  document.body.dataset.foodTheme = levelDefinition.foodTheme;
  document.body.dataset.pressure = state.blocks.some((block) => block.motion) ? 'moving-hard' : state.spikes.some((spike) => spike.motion) ? 'moving-hazard' : 'readable';
  counterText.textContent = `${phaseLabel}  ${copy.counter.cuts} ${state.cuts}  ${copy.counter.score} ${state.score}  收益 ${state.totalEarnings}`;
  earningsBanner.dataset.total = String(state.totalEarnings);
  const bounced = state.events.at(-1)?.type === 'bounce' && state.recoveryAge < 0.7;
  stateText.textContent = bounced ? (state.player.vx < 0 ? copy.recovery.reverse : copy.recovery.forward) : copy.status[state.status];
  const segment = state.courseSegments.find((candidate) => state.player.x >= candidate.startX && state.player.x < candidate.endX);
  const distance = Math.max(0, Math.ceil((state.finishX - state.player.x) / 100));
  directionText.textContent = terminalRewardLabel(state) ?? (state.phase === 'bonus'
    ? `${copy.stage['stage.bonus']} · ${copy.finishDistance} ${distance} →`
    : `${copy.stage[segment?.labelToken ?? ''] ?? copy.fallbackStage} · ${copy.finishDistance} ${distance} →`);
  instructionText.textContent = levelOnePrompt(state.levelNumber, state.player.x, state.status) ?? copy.instruction;
  document.body.dataset.finishPhase = state.finishPhase;
  const finishTransition = state.finishPhase !== 'idle' && state.finishPhase !== 'terminal';
  const terminal = state.status === 'failed' || state.status === 'won';
  terminalText.hidden = !terminal;
  terminalActions.hidden = !terminal;
  nextLevelButton.hidden = state.status !== 'won' || nextLevelNumber(state.levelNumber) === null;
  bonusTestButton.hidden = true;
  if (finishTransition) {
    const gate = state.finishOptions.find((candidate) => candidate.id === state.finishGateId);
    const reward = gate?.operation ? `${gate.operation === 'multiply' ? '×' : '÷'}${gate.operand}` : 'SAFE ×1';
    terminalText.hidden = false;
    terminalActions.hidden = true;
    terminalText.textContent = state.finishPhase === 'contact' ? '终点墙接触' : state.finishPhase === 'reward' ? `收益揭示 ${reward} · ${state.score}` : '奖励庆祝';
  }
  if (!terminal) return;
  const terminalLines = (lines: string[]): string => lines.filter(Boolean).join('\n');
  if (state.status === 'failed') {
    terminalText.textContent = terminalLines([state.failReason === 'spike' ? copy.terminal.spike : copy.terminal.fall, `${copy.terminal.score} ${state.score}`, copy.terminal.restart]);
  } else if (state.phase === 'bonus') {
    terminalText.textContent = terminalLines([copy.terminal.bonusWin, `${copy.terminal.score} ${state.score}`, copy.terminal.restart]);
  } else {
    const gate = state.finishOptions.find((candidate) => candidate.id === state.finishGateId);
    const reward = gate?.kind === 'bonus' ? 'BONUS +' : gate?.operation ? `${gate.operation === 'multiply' ? '×' : '÷'}${gate.operand}` : 'SAFE ×1';
    terminalText.textContent = terminalLines([copy.terminal.ordinaryWin, reward, `${copy.terminal.score} ${state.score}`, copy.terminal.restart]);
  }
}

function terminalRewardLabel(state: SliceState): string | null {
  if (state.status !== 'won' || state.phase === 'bonus') return null;
  const gate = state.finishOptions.find((candidate) => candidate.id === state.finishGateId);
  if (!gate) return null;
  return `命中 ${gate.kind === 'bonus' ? 'BONUS' : gate.operation ? `${gate.operation === 'multiply' ? '×' : '÷'}${gate.operand}` : 'SAFE ×1'}`;
}

function recordCompletion(state: SliceState): void {
  if (state.status !== 'won') return;
  const key = `${state.levelId}:${state.seed}`;
  if (recordedWinKey === key) return;
  recordedWinKey = key;
  progressStore.completeLevel(state.levelNumber, { score: state.score, elapsedMs: Math.round(state.elapsed * 1000) });
  refreshLevelButtons(state.levelNumber);
}

function spawnFeedback(event: FeedbackEvent): void {
  const labels: Partial<Record<FeedbackType, string>> = { ...MECHANICS_DEMO_THEME.copy.feedback, cut: `+${event.value}` };
  const worldPosition = worldPoint(event.x, event.y);
  const label = labels[event.type];
  if (label) {
    const screen = world.worldToScreen(worldPosition);
    const pop = document.createElement('span');
    pop.className = `feedback-pop feedback-${event.type}${event.type === 'cut' && event.value >= 4 ? ' feedback-cut-high' : ''}`;
    pop.textContent = label;
    pop.style.left = `${screen.x}px`;
    pop.style.top = `${screen.y}px`;
    feedbackLayer.append(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
  }
  if (event.type === 'cut') {
    const rewardFlight = document.createElement('span');
    rewardFlight.className = 'reward-fly';
    rewardFlight.textContent = `+${event.value}`;
    const rewardOrigin = world.worldToScreen(worldPosition);
    const rewardTarget = earningsBanner.getBoundingClientRect();
    rewardFlight.style.left = `${rewardOrigin.x}px`;
    rewardFlight.style.top = `${rewardOrigin.y}px`;
    rewardFlight.style.setProperty('--reward-target-x', `${rewardTarget.left + rewardTarget.width / 2}px`);
    rewardFlight.style.setProperty('--reward-target-y', `${rewardTarget.top + rewardTarget.height / 2}px`);
    feedbackLayer.append(rewardFlight);
    rewardFlight.addEventListener('animationend', () => rewardFlight.remove(), { once: true });
    hitStopUntil = Math.max(hitStopUntil, performance.now() + Math.min(105, 42 + event.value * 7));
    earningsBanner.textContent = `本次收益 +${event.value}  ·  累计 ${simulation.getState().totalEarnings}`;
    earningsBanner.classList.remove('is-active');
    void earningsBanner.offsetWidth;
    earningsBanner.classList.add('is-active');
    impactFlash.classList.remove('is-active');
    void impactFlash.offsetWidth;
    impactFlash.classList.add('is-active');
  }
}

function worldPoint(x: number, y: number): readonly [number, number, number] {
  return [x / 100, (700 - y) / 100, 0];
}

function consumeEvents(state: SliceState): void {
  for (const event of state.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    tones.play(event.type, event.value);
    spawnFeedback(event);
  }
}

function syncAndRender(state: SliceState, deltaSeconds: number): void {
  recordCompletion(state);
  const frame = presentation.sync(state);
  world.sync(state, frame);
  world.render(state, deltaSeconds);
  consumeEvents(state);
  renderHud(state);
}

function loadSelectedLevel(levelNumber: number): SliceState {
  recordedWinKey = '';
  const state = simulation.loadLevel(levelNumber, levelSeed(levelNumber));
  resetPresentation();
  refreshLevelButtons(levelNumber);
  syncAndRender(state, 0);
  return state;
}

function selectLevel(levelNumber: number): SliceState | null {
  if (!progressStore.selectLevel(levelNumber)) return null;
  levelSelect.hidden = true;
  levelSelectorToggle.setAttribute('aria-expanded', 'false');
  return loadSelectedLevel(levelNumber);
}

function replayLevel(): SliceState {
  recordedWinKey = '';
  const state = simulation.reset(simulation.getState().seed);
  resetPresentation();
  syncAndRender(state, 0);
  return state;
}

function nextLevel(): SliceState | null {
  const next = nextLevelNumber(simulation.getState().levelNumber);
  return next === null ? null : selectLevel(next);
}

function terminalActionAvailable(): boolean {
  return !terminalActions.hidden;
}

function enterBonusChallenge(): SliceState | null {
  const state = simulation.enterBonusChallenge();
  if (!state) return null;
  resetPresentation();
  syncAndRender(state, 0);
  return state;
}

function perform(action: FlipAction): boolean {
  const before = simulation.getState();
  if (before.status === 'failed' || before.status === 'won') return false;
  const accepted = simulation.act(action);
  syncAndRender(simulation.getState(), 0);
  return accepted;
}

function onPointerDown(event: PointerEvent): void {
  if ((event.target as Element).closest('button')) return;
  if (lifecycle.isPaused()) return;
  event.preventDefault();
  if (simulation.getState().status === 'failed' || simulation.getState().status === 'won') return;
  tones.unlock();
  if (actionInput.press('flip')) perform('flip');
}

function onPointerUp(event: PointerEvent): void {
  event.preventDefault();
  actionInput.release('flip');
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.code !== 'Space') return;
  if (lifecycle.isPaused()) return;
  event.preventDefault();
  tones.unlock();
  if (actionInput.press('flip', event.repeat)) perform('flip');
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code !== 'Space') return;
  event.preventDefault();
  actionInput.release('flip');
}

function onResize(): void {
  world.resize();
  syncAndRender(simulation.getState(), 0);
}

const lifecycle = new RuntimeLifecycle({
  isActive: () => {
    const status = simulation.getState().status;
    return status === 'airborne' || status === 'anchored';
  },
  pause: () => { paused = true; },
  resume: () => { paused = false; },
  releaseInput: () => actionInput.reset(),
  resetWallTime: () => { lastWallTime = performance.now(); },
  showContinue: (visible) => { continueButton.hidden = !visible; },
  unload: () => {
    cancelAnimationFrame(animationFrame);
    shell.removeEventListener('pointerdown', onPointerDown);
    shell.removeEventListener('pointerup', onPointerUp);
    shell.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    world.dispose();
  },
});

shell.addEventListener('pointerdown', onPointerDown, { passive: false });
shell.addEventListener('pointerup', onPointerUp, { passive: false });
shell.addEventListener('pointercancel', onPointerUp, { passive: false });
window.addEventListener('pointerup', onPointerUp, { passive: false });
window.addEventListener('pointercancel', onPointerUp, { passive: false });
window.addEventListener('keydown', onKeyDown, { passive: false });
window.addEventListener('keyup', onKeyUp, { passive: false });
window.addEventListener('resize', onResize, { passive: true });
levelSelectorToggle.addEventListener('pointerdown', (event) => event.stopPropagation());
levelSelectorToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  levelSelect.hidden = !levelSelect.hidden;
  levelSelectorToggle.setAttribute('aria-expanded', String(!levelSelect.hidden));
});
replayButton.addEventListener('pointerdown', (event) => event.stopPropagation());
replayButton.addEventListener('click', (event) => {
  event.stopPropagation();
  if (terminalActionAvailable()) replayLevel();
});
nextLevelButton.addEventListener('pointerdown', (event) => event.stopPropagation());
nextLevelButton.addEventListener('click', (event) => {
  event.stopPropagation();
  if (terminalActionAvailable()) nextLevel();
});
bonusTestButton.addEventListener('pointerdown', (event) => event.stopPropagation());
bonusTestButton.addEventListener('click', (event) => { event.stopPropagation(); enterBonusChallenge(); });
continueButton.addEventListener('pointerdown', (event) => event.stopPropagation());
continueButton.addEventListener('click', (event) => { event.stopPropagation(); lifecycle.continue(); });
refreshLevelButtons(simulation.getState().levelNumber);

const bridge: PrototypeTestBridge = {
  resetGame: (seed?: number) => {
    const state = simulation.reset(seed ?? simulation.getState().seed);
    recordedWinKey = '';
    resetPresentation();
    syncAndRender(state, 0);
    return state;
  },
  selectLevel,
  nextLevel,
  enterBonusChallenge,
  replayLevel,
  getProgress: () => progressStore.get(),
  getState: () => simulation.getState(),
  act: (action) => perform(action),
  step: (seconds = 1 / 60) => {
    const state = simulation.step(seconds);
    syncAndRender(state, seconds);
    return state;
  },
  loadScenario: (id) => {
    const state = simulation.debugLoadScenario(id);
    resetPresentation();
    syncAndRender(state, 0);
    return state;
  },
  getMechanicsCatalog: () => [
    'course', 'moving-horizontal', 'moving-vertical', 'generic-hard', 'back-contact', 'cut-above', 'cut-side', 'cut-below',
    'tower', 'dual-role', 'finish-multiply', 'finish-divide', 'bonus', 'spike', 'fall',
  ] as const,
  getViewState: () => ({ cameraScrollX: world.facts().cameraScrollX }),
  getRenderState: () => world.facts(),
  getThemeContract: () => themeContractFacts(),
  resetPerformanceSamples: () => { performanceSamples = []; },
  getPerformanceReport: () => {
    const info = world.performanceInfo();
    return summarizePerformance(performanceSamples.slice(-600), info, info.dpr);
  },
};
window.__PROTOTYPE_TEST__ = bridge;
window.__GAME_TEST__ = bridge;

function tick(wallTime: number): void {
  if (paused) {
    lastWallTime = wallTime;
    animationFrame = requestAnimationFrame(tick);
    return;
  }
  const wallDeltaMs = Math.max(0, wallTime - lastWallTime);
  lastWallTime = wallTime;
  performanceSamples.push(wallDeltaMs);
  if (performanceSamples.length > 1_200) performanceSamples.shift();
  const state = wallTime < hitStopUntil ? simulation.getState() : simulation.advanceFrame(wallDeltaMs / 1000);
  syncAndRender(state, wallDeltaMs / 1000);
  animationFrame = requestAnimationFrame(tick);
}

syncAndRender(simulation.getState(), 0);
animationFrame = requestAnimationFrame(tick);

document.addEventListener('visibilitychange', () => lifecycle.handleVisibility(document.visibilityState === 'hidden'));
window.addEventListener('blur', () => lifecycle.handleBlur());
window.addEventListener('pagehide', (event) => lifecycle.handlePageHide(event.persisted));
window.addEventListener('pageshow', () => lifecycle.handlePageShow());
