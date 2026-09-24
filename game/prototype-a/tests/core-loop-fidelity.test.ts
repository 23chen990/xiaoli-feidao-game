import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_CATALOG } from '../src/game-levels';
import { SliceSimulation } from '../src/game-core';

test('CORE-DECISION-001 early levels expose three distinct authored decision beats', () => {
  for (const level of LEVEL_CATALOG.levels.slice(0, 3)) {
    const meaningful = [
      ...level.blocks.filter((item) => item.pathRole !== 'decorative'),
      ...level.supports.filter((item) => item.pathRole !== 'decorative'),
      ...level.spikes.filter((item) => item.pathRole !== 'decorative'),
    ];
    assert.ok(meaningful.length >= 3, `${level.id} needs at least three decision objects`);
    assert.ok(new Set(meaningful.map((item) => item.decisionImpact)).size >= 3, `${level.id} needs distinct timing/route pressures`);
  }
});

test('CORE-CUT-ROUTE-002 cutting authored route blocks changes support reachability', () => {
  const sourceLinked = LEVEL_CATALOG.levels.slice(0, 3).flatMap((level) => level.supports.filter((support) => support.sourceBlockId));
  assert.ok(sourceLinked.length >= 2, 'early game needs at least two cut-controlled supports');
  for (const level of LEVEL_CATALOG.levels.slice(0, 3)) {
    const linked = level.supports.find((support) => support.sourceBlockId);
    if (!linked) continue;
    const simulation = new SliceSimulation(101, level.number);
    const before = simulation.getState();
    const block = before.blocks.find((candidate) => candidate.id === linked.sourceBlockId)!;
    simulation.debugCutBlock(block.id);
    const after = simulation.getState();
    assert.equal(after.supports.find((support) => support.id === linked.id)?.active, false, `${level.id}/${linked.id} should close after cut`);
    assert.ok(after.routeChanges >= 1, `${level.id} should record a route change`);
  }
});

test('CORE-FINISH-004 route preparation is carried into finish selection', () => {
  const simulation = new SliceSimulation(102, 1);
  const initial = simulation.getState();
  const routeBlock = initial.blocks.find((block) => block.id === 'dual-bridge')!;
  simulation.debugCutBlock(routeBlock.id);
  const prepared = simulation.getState();
  assert.notEqual(prepared.routeBias, 0, 'cut route should prepare a finish preference');
});
