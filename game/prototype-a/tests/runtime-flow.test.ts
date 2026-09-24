import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCourse, SliceSimulation } from '../src/game-core';
import { LEVEL_CATALOG } from '../src/game-levels';
import { LEVEL_PROGRESS_STORAGE_KEY, LevelProgressStore } from '../src/level-progress';
import { RuntimeLifecycle } from '../src/runtime-lifecycle';
import { MECHANICS_DEMO_THEME } from '../src/theme';

class ThrowingStorage implements Storage {
  get length(): number { return 0; }
  clear(): void { throw new Error('storage unavailable'); }
  getItem(): string | null { throw new Error('storage unavailable'); }
  key(): string | null { throw new Error('storage unavailable'); }
  removeItem(): void { throw new Error('storage unavailable'); }
  setItem(): void { throw new Error('storage unavailable'); }
}

class ReadThrowingStorage implements Storage {
  private value: string | null = null;
  get length(): number { return this.value === null ? 0 : 1; }
  clear(): void { this.value = null; }
  getItem(): string | null { throw new Error('storage read unavailable'); }
  key(): string | null { return null; }
  removeItem(): void { this.value = null; }
  setItem(_key: string, value: string): void { this.value = value; }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class WriteThrowingStorage extends MemoryStorage {
  failWrites = false;
  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    super.setItem(key, value);
  }
}

test('bonus availability follows each authored level definition regardless of seed parity', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const seed of [31, 32]) {
      const course = createCourse(seed, level.number);
      assert.equal(course.bonusAvailable, level.bonusAvailable, `level ${level.number} seed ${seed}`);
      assert.equal(course.finishOptions.some((option) => option.kind === 'bonus'), level.bonusAvailable);
    }
  }
});

test('terminal flip input is ignored until an explicit retry action', () => {
  const simulation = new SliceSimulation(31, 1);
  const safe = simulation.getState().finishOptions.find((option) => option.kind === 'safe')!;
  simulation.debugEnterFinishGate(safe.id, 10);
  const terminal = simulation.getState();
  assert.equal(simulation.act('flip'), false);
  assert.deepEqual(simulation.getState(), terminal);
});

test('terminal controls use explicit retry copy without tap-to-restart guidance', () => {
  assert.equal(MECHANICS_DEMO_THEME.copy.level.replay, '重试本关');
  assert.equal(MECHANICS_DEMO_THEME.copy.terminal.restart, '请使用下方按钮重试');
});

test('progress store keeps unlocks in session memory when storage throws and exposes a warning', () => {
  const storage = new ThrowingStorage();
  const store = new LevelProgressStore(storage);
  store.completeLevel(1, { score: 4, elapsedMs: 1000 });
  assert.equal(store.isUnlocked(2), true);
  assert.match(store.getWarning() ?? '', /storage/i);
  const refreshed = new LevelProgressStore(storage);
  assert.equal(refreshed.isUnlocked(2), true);
});

test('progress store accepts an unavailable browser storage object', () => {
  const store = new LevelProgressStore(null);
  assert.equal(store.get().highestUnlockedLevel, 1);
  assert.match(store.getWarning() ?? '', /storage/i);
});

test('progress store retains read-failure session progress even when writes still succeed', () => {
  const storage = new ReadThrowingStorage();
  const store = new LevelProgressStore(storage);
  store.completeLevel(1, { score: 4, elapsedMs: 1000 });
  const refreshed = new LevelProgressStore(storage);
  assert.equal(refreshed.isUnlocked(2), true);
  assert.match(refreshed.getWarning() ?? '', /storage/i);
});

test('progress store resets corrupt serialized data to level one without unlocking levels', () => {
  const storage = new MemoryStorage();
  storage.setItem(LEVEL_PROGRESS_STORAGE_KEY, '{"version":2,"highestUnlockedLevel":999,"records":null}');
  const store = new LevelProgressStore(storage);
  assert.equal(store.get().highestUnlockedLevel, 1);
  assert.equal(store.isUnlocked(2), false);
  assert.match(store.getWarning() ?? '', /reset/i);
});

test('write failure keeps the latest unlock across store recreation in the same session', () => {
  const storage = new WriteThrowingStorage();
  const store = new LevelProgressStore(storage);
  storage.failWrites = true;
  store.completeLevel(1, { score: 4, elapsedMs: 1000 });
  assert.equal(store.isUnlocked(2), true);
  assert.match(store.getWarning() ?? '', /storage/i);
  const recreated = new LevelProgressStore(storage);
  assert.equal(recreated.isUnlocked(2), true);
});

test('runtime lifecycle pauses, releases input, resets wall time, and resumes only from Continue', () => {
  const calls: string[] = [];
  const lifecycle = new RuntimeLifecycle({
    isActive: () => true,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    releaseInput: () => calls.push('release'),
    resetWallTime: () => calls.push('reset'),
    showContinue: (visible) => calls.push(`continue:${visible}`),
  });
  lifecycle.handleVisibility(true);
  lifecycle.handlePageShow();
  assert.equal(lifecycle.isPaused(), true);
  assert.deepEqual(calls, ['pause', 'release', 'reset', 'continue:true']);
  lifecycle.continue();
  assert.equal(lifecycle.isPaused(), false);
  assert.deepEqual(calls, ['pause', 'release', 'reset', 'continue:true', 'resume', 'reset', 'continue:false']);
});

test('runtime lifecycle keeps BFCache renderer alive and unloads only on a real page teardown', () => {
  const calls: string[] = [];
  const lifecycle = new RuntimeLifecycle({
    isActive: () => true,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    releaseInput: () => calls.push('release'),
    resetWallTime: () => calls.push('reset'),
    showContinue: (visible) => calls.push(`continue:${visible}`),
    unload: () => calls.push('unload'),
  });
  lifecycle.handlePageHide(true);
  lifecycle.handlePageHide(true);
  assert.equal(calls.includes('unload'), false);
  assert.equal(calls.filter((call) => call === 'pause').length, 1);
  lifecycle.continue();
  lifecycle.handlePageHide(false);
  assert.equal(calls.at(-1), 'unload');
});

test('runtime lifecycle does not show Continue for an inactive terminal host', () => {
  const calls: string[] = [];
  const lifecycle = new RuntimeLifecycle({
    isActive: () => false,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    releaseInput: () => calls.push('release'),
    resetWallTime: () => calls.push('reset'),
    showContinue: (visible) => calls.push(`continue:${visible}`),
    unload: () => calls.push('unload'),
  });
  lifecycle.handleVisibility(true);
  assert.deepEqual(calls, []);
});
