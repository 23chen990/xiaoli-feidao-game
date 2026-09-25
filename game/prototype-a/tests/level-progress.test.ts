import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEVEL_PROGRESS_STORAGE_KEY,
  LevelProgressStore,
  createDefaultProgress,
  migrateLevelProgress,
  nextLevelNumber,
} from '../src/level-progress';
import { SliceSimulation } from '../src/game-core';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test('LEVEL-PROGRESS-RED-001 completion unlocks only the next level and records neutral best results', () => {
  const storage = new MemoryStorage();
  const store = new LevelProgressStore(storage);
  assert.equal(store.get().highestUnlockedLevel, 1);
  assert.equal(store.isUnlocked(2), false);
  store.completeLevel(1, { score: 18, elapsedMs: 31_000 });
  assert.equal(store.get().highestUnlockedLevel, 2);
  assert.equal(store.isUnlocked(2), true);
  assert.equal(store.isUnlocked(3), false);
  store.completeLevel(1, { score: 12, elapsedMs: 35_000 });
  assert.deepEqual(store.get().records['level-01'], { bestScore: 18, bestTimeMs: 31_000, completions: 2 });
  assert.doesNotMatch(storage.getItem(LEVEL_PROGRESS_STORAGE_KEY)!, /color|copy|asset|theme|\.png|\.webp/i);
});

test('LEVEL-PROGRESS-RED-002 locked selection is refused, next level is ordered, and replay keeps the same level', () => {
  const store = new LevelProgressStore(new MemoryStorage());
  assert.equal(store.selectLevel(2), false);
  assert.equal(store.selectLevel(1), true);
  assert.equal(store.get().lastSelectedLevel, 1);
  assert.equal(nextLevelNumber(1), 2);
  assert.equal(nextLevelNumber(12), null);
  const simulation = new SliceSimulation(91, 4);
  const before = simulation.getState();
  const gate = before.finishOptions.find((candidate) => candidate.kind === 'safe')!;
  simulation.debugEnterFinishGate(gate.id, 9);
  assert.equal(simulation.getState().status, 'won');
  simulation.reset(simulation.getState().seed);
  const replayed = simulation.getState();
  assert.equal(replayed.levelNumber, 4);
  assert.equal(replayed.seed, 91);
  assert.equal(replayed.status, 'ready');
});

test('LEVEL-PROGRESS-RED-003 version 1 save migrates, clamps bounds and rejects corrupt or future data', () => {
  const migrated = migrateLevelProgress({
    version: 1,
    unlockedLevel: 5,
    selectedLevel: 4,
    bestScores: { '1': 7, '4': 22 },
    soundEnabled: false,
  });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.highestUnlockedLevel, 5);
  assert.equal(migrated.lastSelectedLevel, 4);
  assert.equal(migrated.records['level-04']?.bestScore, 22);
  assert.equal(migrated.settings.soundEnabled, false);
  assert.deepEqual(migrateLevelProgress({ version: 99 }), createDefaultProgress());
  assert.deepEqual(migrateLevelProgress('{bad json'), createDefaultProgress());
  assert.equal(migrateLevelProgress({ version: 1, unlockedLevel: 999 }).highestUnlockedLevel, 12);
});

test('LEVEL-PROGRESS-RED-004 refresh restores highest unlocked level without cross-level failure leakage', () => {
  const storage = new MemoryStorage();
  const firstSession = new LevelProgressStore(storage);
  firstSession.completeLevel(1, { score: 3, elapsedMs: 25_000 });
  firstSession.completeLevel(2, { score: 5, elapsedMs: 28_000 });
  firstSession.selectLevel(3);
  const refreshed = new LevelProgressStore(storage);
  assert.equal(refreshed.get().highestUnlockedLevel, 3);
  assert.equal(refreshed.get().lastSelectedLevel, 3);

  const failed = new SliceSimulation(15, 3);
  failed.debugLoadScenario('spike');
  failed.step(0.25);
  assert.equal(failed.getState().status, 'failed');
  failed.reset(failed.getState().seed);
  const restarted = failed.getState();
  assert.equal(restarted.levelNumber, 3);
  assert.equal(restarted.status, 'ready');
  assert.equal(restarted.failReason, null);
  assert.equal(restarted.cuts, 0);
});

test('LEVEL-PROGRESS-005 all twelve levels enter, complete, replay deterministically and unlock in order', () => {
  const store = new LevelProgressStore(new MemoryStorage());
  for (let levelNumber = 1; levelNumber <= 12; levelNumber += 1) {
    assert.equal(store.isUnlocked(levelNumber), true);
    const simulation = new SliceSimulation(700 + levelNumber, levelNumber);
    const entered = simulation.getState();
    assert.equal(entered.levelNumber, levelNumber);
    assert.equal(entered.status, 'ready');
    const gate = entered.finishOptions.find((candidate) => candidate.kind === 'safe')!;
    simulation.debugEnterFinishGate(gate.id, levelNumber * 3);
    const completed = simulation.getState();
    assert.equal(completed.status, 'won');
    store.completeLevel(levelNumber, { score: completed.score, elapsedMs: 30_000 });
    simulation.reset(simulation.getState().seed);
    const replayed = simulation.getState();
    assert.equal(replayed.levelNumber, levelNumber);
    assert.equal(replayed.seed, 700 + levelNumber);
    assert.equal(replayed.status, 'ready');
    if (levelNumber < 12) assert.equal(store.isUnlocked(levelNumber + 1), true);
  }
  assert.equal(store.get().highestUnlockedLevel, 12);
  assert.equal(Object.keys(store.get().records).length, 12);
});

test('LEVEL-PROGRESS-006 bonus entry is an explicit one-shot transition', () => {
  const simulation = new SliceSimulation(3058, 4);
  const before = simulation.getState();
  assert.equal(before.phase, 'ordinary');
  assert.equal(before.bonusAvailable, true);
  const entered = simulation.enterBonusChallenge();
  assert.equal(entered?.phase, 'bonus');
  assert.equal(entered?.status, 'airborne');
  assert.equal(entered?.bonusConsumed, true);
  assert.ok(entered?.sigils.every((sigil) => sigil.y > 820), 'bonus should start with an empty launch field');
  simulation.step(0.1);
  assert.ok(simulation.getState().sigils.some((sigil) => !sigil.cut && sigil.y <= 820 && sigil.vy < 0), 'bonus target should launch upward');
  let sawDescending = false;
  for (let sample = 0; sample < 24; sample += 1) {
    simulation.step(0.1);
    sawDescending ||= simulation.getState().sigils.some((sigil) => !sigil.cut && sigil.y <= 820 && sigil.vy > 0);
  }
  assert.ok(sawDescending, 'bonus target should arc back down under gravity');
  assert.equal(simulation.enterBonusChallenge(), null);
});

test('LEVEL-PROGRESS-007 bonus course has multiplier settlement and a capped chain gate', () => {
  const simulation = new SliceSimulation(3058, 4);
  simulation.enterBonusChallenge();
  const first = simulation.getState().finishOptions.find((option) => option.kind === 'multiply')!;
  simulation.debugEnterFinishGate(first.id, 10);
  assert.equal(simulation.getState().status, 'won');
  assert.equal(simulation.getState().score, 20);
  const chained = new SliceSimulation(3058, 4);
  chained.enterBonusChallenge();
  chained.debugEnterFinishGate('bonus-finish-chain', 10);
  assert.equal(chained.getState().phase, 'bonus');
  assert.equal(chained.getState().bonusChain, 2);
});

test('LEVEL-PROGRESS-008 bonus high columns are active reachable hard supports', () => {
  const simulation = new SliceSimulation(3058, 4);
  const entered = simulation.enterBonusChallenge()!;
  assert.equal(entered.supports.length, 3);
  assert.ok(entered.supports.every((support) => support.active && support.height >= 200));
  assert.ok(entered.supports.every((support) => support.x > entered.player.x && support.x < entered.finishX));
});
