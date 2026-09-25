import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CATALOG, getLevelDefinition } from '../src/game-levels';
import { createCourse } from '../src/game-core';

test('later levels expose moving hard blocks with increasing density', () => {
  const early = LEVEL_CATALOG.levels.slice(0, 3).flatMap((level) => level.blocks);
  const mid = LEVEL_CATALOG.levels.slice(3, 6).flatMap((level) => level.blocks);
  const late = LEVEL_CATALOG.levels.slice(6).flatMap((level) => level.blocks);
  assert.equal(early.some((block) => block.motion), false);
  assert.ok(mid.some((block) => block.motion), 'mid game introduces moving hard blocks');
  assert.ok(late.filter((block) => block.motion).length >= mid.filter((block) => block.motion).length);
  const course = createCourse(7, 9);
  const moving = course.blocks.find((block) => block.motion);
  assert.ok(moving);
  const x = moving!.x;
  assert.notEqual(moving!.motion!.axis, undefined);
  assert.equal(moving!.baseX, x);
});

test('every moving object has an authored interaction meaning and reachable route role', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const object of [...level.supports, ...level.blocks, ...level.spikes]) {
      if (!object.motion) continue;
      assert.ok(object.pathRole && object.pathRole !== 'decorative', `${level.id}/${object.id} moving object cannot be decorative`);
      assert.ok(object.decisionImpact && object.decisionImpact.length > 8, `${level.id}/${object.id} needs a concrete decision impact`);
    }
  }
});

test('course beats and finish rewards vary across archetypes', () => {
  const roles = new Set(LEVEL_CATALOG.levels.map((level) => level.courseSegments.map((beat) => beat.role).join(',')));
  assert.ok(roles.size >= 3);
  assert.ok(LEVEL_CATALOG.levels.some((level) => level.finishOptions.filter((gate) => gate.operation === 'multiply').length >= 2));
  assert.ok(LEVEL_CATALOG.levels.some((level) => level.finishOptions.some((gate) => gate.kind === 'bonus')));
  assert.ok(LEVEL_CATALOG.levels.filter((level) => level.targetDurationSeconds[0] >= 35).length >= 8);
});

test('bonus availability follows the authored level regardless of seed', () => {
  const definition = getLevelDefinition(11);
  assert.equal(definition.bonusAvailable, true);
  assert.equal(createCourse(42, 11).bonusAvailable, true);
  assert.equal(createCourse(43, 11).bonusAvailable, true);
});

test('finish rewards form a contiguous multiplier wall with a broad x0.5 recovery lane', () => {
  const level = LEVEL_CATALOG.levels[1]!;
  const options = [...level.finishOptions].sort((a, b) => a.y - a.height / 2 - (b.y - b.height / 2));
  for (let index = 1; index < options.length; index += 1) {
    const previous = options[index - 1]!;
    const current = options[index]!;
    assert.equal(current.y - current.height / 2, previous.y + previous.height / 2, 'reward wall lanes must touch with no gaps');
  }
  const half = options.find((option) => option.operation === 'multiply' && option.operand === 0.5);
  const high = options.find((option) => option.operation === 'multiply' && option.operand === 4);
  assert.ok(half, 'wall must expose a x0.5 recovery multiplier');
  assert.ok(high, 'wall must expose a high multiplier');
  assert.ok(half!.height > high!.height, 'higher multipliers must be narrower and harder to reach');
});

test('level 4 keeps a recoverable finish landing window after moving-hard pressure', () => {
  const level = getLevelDefinition(4);
  const safe = level.finishOptions.find((gate) => gate.kind === 'safe');
  assert.ok(safe);
  assert.ok(safe!.y + safe!.height / 2 >= 690, 'safe gate must cover the late recovery band');
  assert.ok(level.blocks.some((block) => block.motion && block.x < level.finishX - 500), 'moving hard block stays upstream of finish');
});

test('level 1 keeps a broad mid-course recovery shelf for the default natural route', () => {
  const level = getLevelDefinition(1);
  const shelf = level.supports.find((support) => support.id === 'white-recovery-shelf');
  assert.ok(shelf, 'opening course needs an authored recovery shelf');
  assert.ok(shelf!.x > 2200 && shelf!.x < 2800, 'recovery shelf follows the post-hazard rhythm change');
  assert.ok(shelf!.width >= 300 && shelf!.y >= 540);
});
