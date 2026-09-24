import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SliceSimulation } from '../src/game-core';

test('bonus hard surfaces occupy reachable mid-lane windows', () => {
  const game = new SliceSimulation(3058, 4);
  game.enterBonusChallenge();
  const spikes = game.getState().spikes;
  assert.equal(spikes.length, 2);
  for (const spike of spikes) {
    assert.ok(spike.y >= 220 && spike.y <= 620, `${spike.id} should be reachable from the active flight lane`);
    assert.ok(spike.height <= 190, `${spike.id} should leave a readable escape lane`);
    assert.notEqual(spike.collidable, false, `${spike.id} must remain a real bonus hazard`);
  }
});

test('ordinary hard surfaces register a deliberate near-edge body contact', () => {
  const game = new SliceSimulation(83);
  const block = game.getState().blocks.find((candidate) => candidate.placement === 'side')!;
  game.act('flip');
  game.debugSetBladePose(block.x - block.width / 2 - 10, block.y, Math.PI);
  game.debugSetVelocity(220, 0);
  game.step(1 / 120);
  assert.ok(game.getState().events.some((event) => event.type === 'bounce' && event.targetId === block.id));
});
