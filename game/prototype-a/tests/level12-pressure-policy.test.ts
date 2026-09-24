import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLevelDefinition } from '../src/game-levels';

test('Level 12 floor-risk spike stays below the main route and leaves a readable upper escape', () => {
  const spike = getLevelDefinition(12).spikes.find((candidate) => candidate.id === 'l12-floor-risk');
  assert.ok(spike);
  assert.ok(spike!.y >= 600, 'floor-risk should pressure the low lane without sealing the route');
  assert.ok(spike!.height <= 60);
});

test('Level 12 authors a final recovery shelf before the finish gate', () => {
  const level = getLevelDefinition(12);
  const support = level.supports.find((candidate) => candidate.id === 'l12-finish-recovery');
  assert.ok(support);
  assert.ok(support!.x + support!.width / 2 >= level.finishX - 40);
  assert.ok(support!.y + support!.height / 2 >= level.worldBottom);
  assert.equal(support!.pathRole, 'recovery');
});
