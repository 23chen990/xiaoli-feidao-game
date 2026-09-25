import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLevelDefinition } from '../src/game-levels';
import { SliceSimulation } from '../src/game-core';

test('FIDELITY-UPLIFT L1 opens with a readable cut rhythm and one clear hazard beat', () => {
  const level = getLevelDefinition(1);
  const openingTargets = level.sigils.filter((item) => item.x >= 240 && item.x <= 1_250).sort((a, b) => a.x - b.x);
  const gaps = openingTargets.slice(1).map((item, index) => item.x - openingTargets[index]!.x);
  assert.ok(openingTargets.length >= 7, 'first 20 seconds need at least seven authored targets');
  assert.ok(gaps.slice(0, 5).every((gap) => gap >= 120 && gap <= 240), `opening gaps were ${gaps.join(',')}`);
  const hazards = level.spikes.filter((spike) => spike.x > 1_250 && spike.x < level.finishX - 240);
  assert.equal(hazards.length, 1, 'the opening should teach one clearly signaled lethal hazard');
  assert.ok(hazards[0]!.x >= 1_500 && hazards[0]!.x <= 1_900);
  assert.ok(level.supports.filter((support) => support.id.includes('white-column') || support.id.includes('recovery')).every((support) => support.pathRole !== 'main'), 'white-column/recovery supports must stay off the main route');
});

test('FIDELITY-UPLIFT launch reaches a readable apex near one second and carries a useful distance', () => {
  const game = new SliceSimulation(31, 1);
  assert.equal(game.act('flip'), true);
  const launch = game.getState();
  assert.ok(launch.player.vx >= 170 && launch.player.vx <= 200, `launch vx=${launch.player.vx}`);
  let apex = launch;
  for (let frame = 0; frame < 120; frame += 1) {
    const state = game.step(1 / 120);
    if (state.player.y < apex.player.y) apex = state;
  }
  assert.ok(apex.player.y < launch.player.y - 70, `apex rise=${launch.player.y - apex.player.y}`);
  assert.ok(apex.elapsed >= 0.42 && apex.elapsed <= 0.62, `apex elapsed=${apex.elapsed}`);
  assert.ok(apex.player.x - launch.player.x >= 70, `apex travel=${apex.player.x - launch.player.x}`);
});
