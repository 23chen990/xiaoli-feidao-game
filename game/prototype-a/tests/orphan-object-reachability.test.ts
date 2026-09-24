import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLevelDefinition, LEVEL_CATALOG } from '../src/game-levels';
import { SliceSimulation } from '../src/game-core';

test('level 3 interactive objects declare reachable route roles and decision impact', () => {
  const level = getLevelDefinition(3);
  const objects = [...level.supports, ...level.spikes];
  assert.ok(objects.length >= 3);
  for (const object of objects) {
    assert.ok(object.pathRole, `${object.id} missing path role`);
    assert.ok(object.decisionImpact, `${object.id} missing decision impact`);
  }
  const ramp = level.supports.find((support) => support.id === 'l3-ramp')!;
  const rebound = level.supports.find((support) => support.id === 'l3-rebound')!;
  const recovery = level.supports.find((support) => support.id === 'l3-recovery-pad')!;
  assert.ok(ramp.y >= 380 && ramp.y <= 520);
  assert.ok(rebound.y >= 380 && rebound.y <= 560);
  assert.ok(recovery.y >= 480 && recovery.y <= 640);
});

test('level 3 low-risk spike is explicit decorative art when not a fair hazard', () => {
  assert.equal(getLevelDefinition(3).spikes.find((item) => item.id === 'l3-low-risk'), undefined);
});

test('level 3 has no decorative spike rendered as a gameplay hazard', () => {
  assert.equal(getLevelDefinition(3).spikes.some((item) => item.id === 'l3-low-risk'), false);
});

test('all authored spikes carry explicit pressure semantics', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const spike of level.spikes) { assert.ok(spike.pathRole); assert.ok(spike.decisionImpact); assert.ok(spike.reachableWindow); }
  }
});

test('all twelve levels place hard objects inside a declared reachable decision corridor', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const block of level.blocks) {
      const right = level.completionPath.findIndex((point) => point.x >= block.x);
      assert.ok(right > 0, `${level.id}/${block.id} lies outside completion path`);
      const a = level.completionPath[right - 1]!;
      const b = level.completionPath[right]!;
      const ratio = (block.x - a.x) / (b.x - a.x);
      const pathY = a.y + (b.y - a.y) * ratio;
      const corridor = Math.max(190, block.height / 2 + 120);
      assert.ok(Math.abs(block.y - pathY) <= corridor, `${level.id}/${block.id} is ${Math.round(Math.abs(block.y - pathY))}px outside its route corridor`);
      assert.notEqual(block.pathRole, 'decorative');
      assert.ok(block.decisionImpact);
    }
  }
});

test('all authored white supports are floor-valid, route-reachable, and player-effective', () => {
  for (const level of LEVEL_CATALOG.levels) {
    for (const support of level.supports) {
      assert.ok(support.pathRole && support.pathRole !== 'decorative', `${level.id}/${support.id} must have a gameplay role`);
      assert.ok(support.decisionImpact, `${level.id}/${support.id} must declare player impact`);
      assert.ok(support.y + support.height / 2 <= level.worldBottom, `${level.id}/${support.id} penetrates ground`);
      const right = level.completionPath.findIndex((point) => point.x >= support.x);
      assert.ok(right > 0, `${level.id}/${support.id} lies outside the authored route`);
      const a = level.completionPath[right - 1]!;
      const b = level.completionPath[right]!;
      const routeY = a.y + ((support.x - a.x) / Math.max(1, b.x - a.x)) * (b.y - a.y);
      assert.ok(Math.abs(support.y - routeY) <= Math.max(260, support.height / 2 + 180), `${level.id}/${support.id} is unreachable from route`);

      const simulation = new SliceSimulation(42, level.number);
      simulation.debugAnchorToSupport(support.id);
      assert.equal(simulation.getState().status, 'anchored', `${level.id}/${support.id} cannot affect the player`);
      simulation.act('flip');
      assert.equal(simulation.getState().status, 'airborne', `${level.id}/${support.id} cannot release the player`);
    }
  }
});
