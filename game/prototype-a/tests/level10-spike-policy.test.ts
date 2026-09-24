import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLevelDefinition } from '../src/game-levels';

test('Level 10 falling-risk spike stays on the low route and leaves the high line readable', () => {
  const spike = getLevelDefinition(10).spikes.find((candidate) => candidate.id === 'l10-falling-risk');
  assert.ok(spike);
  assert.ok(spike!.y >= 550, 'the falling-risk spike should not seal the high route');
  assert.ok(spike!.height <= 60, 'the low-route hazard needs a readable vertical escape');
});
