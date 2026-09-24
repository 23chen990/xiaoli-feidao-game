import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CATALOG } from '../src/game-levels';

function pathYAtX(level: (typeof LEVEL_CATALOG.levels)[number], x: number): number {
  const points = level.completionPath;
  const right = points.findIndex((point) => point.x >= x);
  if (right <= 0) return points[0]!.y;
  const a = points[right - 1]!;
  const b = points[right]!;
  const ratio = (x - a.x) / Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * ratio;
}

test('later authored spikes sit in the declared route pressure corridor', () => {
  for (const level of LEVEL_CATALOG.levels.filter((candidate) => candidate.number >= 4)) {
    for (const spike of level.spikes) {
      const routeY = pathYAtX(level, spike.x);
      assert.ok(Math.abs(spike.y - routeY) <= 190, `${level.id}/${spike.id} is outside route pressure corridor`);
      assert.ok((spike.reachableWindow?.[1] ?? 0) - (spike.reachableWindow?.[0] ?? 0) >= 200);
      assert.notEqual(spike.collidable, false, `${level.id}/${spike.id} must remain a gameplay hazard`);
    }
  }
});

test('fundamentals spikes retain their accepted teaching semantics', () => {
  for (const level of LEVEL_CATALOG.levels.filter((candidate) => candidate.number <= 2)) {
    for (const spike of level.spikes) {
      assert.equal(spike.pathRole, 'main');
      assert.ok(spike.decisionImpact);
      assert.ok(spike.reachableWindow);
      assert.notEqual(spike.collidable, false);
    }
  }
});

test('bonus and safe finish gates do not overlap in the bonus-enabled levels', () => {
  for (const level of LEVEL_CATALOG.levels.filter((candidate) => candidate.number >= 4)) {
    const bonus = level.finishOptions.find((option) => option.kind === 'bonus');
    const safe = level.finishOptions.find((option) => option.kind === 'safe');
    assert.ok(bonus && safe, `${level.id} must expose bonus and safe choices`);
    const bonusTop = bonus!.y - bonus!.height / 2;
    const bonusBottom = bonus!.y + bonus!.height / 2;
    const safeTop = safe!.y - safe!.height / 2;
    const safeBottom = safe!.y + safe!.height / 2;
    assert.ok(bonusBottom <= safeTop || safeBottom <= bonusTop, `${level.id} bonus/safe gates overlap`);
  }
});

test('finish recovery shelves stay below the selectable reward lanes', () => {
  for (const level of LEVEL_CATALOG.levels.filter((candidate) => candidate.number >= 4)) {
    const recovery = level.supports.find((support) => support.id.endsWith('-finish-recovery'));
    if (!recovery) continue;
    const recoveryTop = recovery.y - recovery.height / 2;
    assert.ok(recovery.height <= 80, `${level.id} finish recovery must be a thin low shelf`);
    assert.ok(recoveryTop >= level.worldBottom - recovery.height, `${level.id} finish recovery must stay at the floor edge`);
  }
});

test('grounded supports terminate at the simulation floor instead of intersecting it', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const support of level.supports) {
      assert.ok(support.y + support.height / 2 <= level.worldBottom,
        `${level.id}/${support.id} extends below the ground plane`);
    }
  }
});

test('moving route spikes keep their motion inside a readable timing band', () => {
  for (const level of LEVEL_CATALOG.levels.filter((candidate) => candidate.number >= 4)) {
    for (const spike of level.spikes) {
      if (!spike.motion) continue;
      assert.ok(spike.motion.amplitude <= 24, `${level.id}/${spike.id} motion can leave the route band`);
    }
  }
});
