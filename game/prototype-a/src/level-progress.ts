import { z } from 'zod';

const LEVEL_COUNT = 12;
export const LEVEL_PROGRESS_STORAGE_KEY = 'slice-master-neutral-progress-v2';

const LevelRecordSchema = z.object({
  bestScore: z.number().int().nonnegative(),
  bestTimeMs: z.number().int().nonnegative(),
  completions: z.number().int().positive(),
}).strict();

export const LEVEL_PROGRESS_SCHEMA = z.object({
  version: z.literal(2),
  highestUnlockedLevel: z.number().int().min(1).max(LEVEL_COUNT),
  lastSelectedLevel: z.number().int().min(1).max(LEVEL_COUNT),
  records: z.record(z.string().regex(/^level-\d{2}$/), LevelRecordSchema),
  settings: z.object({ soundEnabled: z.boolean(), reducedMotion: z.boolean() }).strict(),
}).strict();

export type LevelProgress = z.infer<typeof LEVEL_PROGRESS_SCHEMA>;

export function createDefaultProgress(): LevelProgress {
  return { version: 2, highestUnlockedLevel: 1, lastSelectedLevel: 1, records: {}, settings: { soundEnabled: true, reducedMotion: false } };
}

function clampLevel(value: unknown, fallback = 1): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(LEVEL_COUNT, numeric));
}

export function migrateLevelProgress(input: unknown): LevelProgress {
  let value = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return createDefaultProgress(); }
  }
  const current = LEVEL_PROGRESS_SCHEMA.safeParse(value);
  if (current.success) {
    const highestUnlockedLevel = clampLevel(current.data.highestUnlockedLevel);
    return { ...current.data, highestUnlockedLevel, lastSelectedLevel: Math.min(clampLevel(current.data.lastSelectedLevel), highestUnlockedLevel) };
  }
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return createDefaultProgress();
  const legacy = value as { unlockedLevel?: unknown; selectedLevel?: unknown; bestScores?: unknown; soundEnabled?: unknown };
  const highestUnlockedLevel = clampLevel(legacy.unlockedLevel);
  const lastSelectedLevel = Math.min(clampLevel(legacy.selectedLevel), highestUnlockedLevel);
  const records: LevelProgress['records'] = {};
  if (legacy.bestScores && typeof legacy.bestScores === 'object') {
    for (const [key, score] of Object.entries(legacy.bestScores)) {
      const number = clampLevel(Number(key), 0);
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) continue;
      records[`level-${String(number).padStart(2, '0')}`] = { bestScore: Math.floor(score), bestTimeMs: 0, completions: 1 };
    }
  }
  return LEVEL_PROGRESS_SCHEMA.parse({
    version: 2,
    highestUnlockedLevel,
    lastSelectedLevel,
    records,
    settings: { soundEnabled: legacy.soundEnabled !== false, reducedMotion: false },
  });
}

export function nextLevelNumber(levelNumber: number): number | null {
  const normalized = clampLevel(levelNumber);
  return normalized < LEVEL_COUNT ? normalized + 1 : null;
}

export class LevelProgressStore {
  private progress: LevelProgress;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.progress = migrateLevelProgress(storage.getItem(LEVEL_PROGRESS_STORAGE_KEY));
    this.persist();
  }

  get(): LevelProgress {
    return structuredClone(this.progress);
  }

  isUnlocked(levelNumber: number): boolean {
    return Number.isInteger(levelNumber) && levelNumber >= 1 && levelNumber <= this.progress.highestUnlockedLevel;
  }

  selectLevel(levelNumber: number): boolean {
    if (!this.isUnlocked(levelNumber)) return false;
    this.progress.lastSelectedLevel = levelNumber;
    this.persist();
    return true;
  }

  completeLevel(levelNumber: number, result: { score: number; elapsedMs: number }): LevelProgress {
    if (!this.isUnlocked(levelNumber)) return this.get();
    const id = `level-${String(levelNumber).padStart(2, '0')}`;
    const previous = this.progress.records[id];
    const score = Math.max(0, Math.floor(result.score));
    const elapsedMs = Math.max(0, Math.floor(result.elapsedMs));
    this.progress.records[id] = {
      bestScore: Math.max(previous?.bestScore ?? 0, score),
      bestTimeMs: previous?.bestTimeMs ? Math.min(previous.bestTimeMs, elapsedMs) : elapsedMs,
      completions: (previous?.completions ?? 0) + 1,
    };
    this.progress.highestUnlockedLevel = Math.max(this.progress.highestUnlockedLevel, Math.min(LEVEL_COUNT, levelNumber + 1));
    this.persist();
    return this.get();
  }

  private persist(): void {
    this.storage.setItem(LEVEL_PROGRESS_STORAGE_KEY, JSON.stringify(this.progress));
  }
}

