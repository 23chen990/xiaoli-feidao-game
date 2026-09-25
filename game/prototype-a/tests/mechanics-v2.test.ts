import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SliceSimulation,
  applyFinishOperation,
  classifyKnifePartAtPoint,
  createCourse,
  type CuttableBlock,
  type DebugScenario,
} from '../src/game-core';

function sharpTouch(game: SliceSimulation, block: CuttableBlock): void {
  game.act('flip');
  game.debugSetBladePose(block.x - 38, block.y, 0);
  game.debugSetVelocity(0, 0);
  game.step(1 / 120);
}

test('CONTACT-001 classifies tip, edge, body and handle as four deterministic knife parts', () => {
  const pose = { x: 100, y: 100, vx: 0, vy: 0, angle: 0, angularVelocity: 0 };
  assert.equal(classifyKnifePartAtPoint(pose, 138, 100), 'tip');
  assert.equal(classifyKnifePartAtPoint(pose, 118, 100), 'edge');
  assert.equal(classifyKnifePartAtPoint(pose, 92, 94), 'body');
  assert.equal(classifyKnifePartAtPoint(pose, 62, 100), 'handle');
});

test('CONTACT-002 only tip or edge contact cuts a rectangular target and it scores once', () => {
  const sharp = new SliceSimulation(80);
  const target = sharp.getState().blocks.find((block) => block.placement === 'above')!;
  sharpTouch(sharp, target);
  assert.equal(sharp.getState().blocks.find((block) => block.id === target.id)?.cut, true);
  assert.equal(sharp.getState().events.filter((event) => event.type === 'cut' && event.targetId === target.id).length, 1);
  sharp.step(0.2);
  assert.equal(sharp.getState().events.filter((event) => event.type === 'cut' && event.targetId === target.id).length, 1);

  const blunt = new SliceSimulation(80);
  const bluntTarget = blunt.getState().blocks.find((block) => block.placement === 'above')!;
  blunt.act('flip');
  blunt.debugSetBladePose(bluntTarget.x + 38, bluntTarget.y, 0);
  blunt.debugSetVelocity(0, 0);
  blunt.step(1 / 120);
  assert.equal(blunt.getState().blocks.find((block) => block.id === bluntTarget.id)?.cut, false);
});

test('MOV-001 moving support positions are seeded, bounded and frame-split deterministic', () => {
  const course = createCourse(81);
  const horizontal = course.supports.find((support) => support.motion?.axis === 'x')!;
  const vertical = course.supports.find((support) => support.motion?.axis === 'y')!;
  assert.ok(horizontal && vertical);
  const coarse = new SliceSimulation(81);
  const fine = new SliceSimulation(81);
  coarse.step(0.75);
  for (let index = 0; index < 90; index += 1) fine.step(1 / 120);
  for (const id of [horizontal.id, vertical.id]) {
    const a = coarse.getState().supports.find((support) => support.id === id)!;
    const b = fine.getState().supports.find((support) => support.id === id)!;
    assert.ok(Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001);
    if (a.motion?.axis === 'x') assert.ok(Math.abs(a.x - a.baseX) <= a.motion.amplitude + 0.001);
    if (a.motion?.axis === 'y') assert.ok(Math.abs(a.y - a.baseY) <= a.motion.amplitude + 0.001);
  }
});

test('MOV-002 MOV-003 an anchored knife rides a moving support and inherits its velocity at launch', () => {
  const game = new SliceSimulation(82);
  const support = game.getState().supports.find((candidate) => candidate.motion?.axis === 'x')!;
  game.debugAnchorToSupport(support.id, 0, -support.height / 2 - 38);
  const before = game.getState();
  game.step(0.35);
  const carried = game.getState();
  const movedSupport = carried.supports.find((candidate) => candidate.id === support.id)!;
  assert.equal(carried.status, 'anchored');
  assert.ok(Math.abs((carried.player.x - before.player.x) - (movedSupport.x - support.x)) < 0.01);
  const inheritedVx = movedSupport.vx;
  game.act('flip');
  const launched = game.getState();
  assert.equal(launched.status, 'airborne');
  assert.equal(launched.anchorId, null);
  assert.ok(Math.abs(launched.player.vx - (180 + inheritedVx)) < 0.01);
});

test('HARD-IDENTITY-001 course has no dedicated rebound identity', () => {
  const course = createCourse(83);
  for (const support of course.supports) {
    assert.equal(Object.prototype.hasOwnProperty.call(support, 'recoil'), false);
    assert.notEqual(support.id, 'recoil-wall');
  }
});

test('HARD-REFLECT-002 ordinary static, vertical, moving and block surfaces share incident reflection', () => {
  const ratios: number[] = [];
  const impact = (
    game: SliceSimulation,
    target: { id: string; x: number; y: number; width: number; height: number; vx?: number; vy?: number },
    side: 'top' | 'left',
    velocity: { vx: number; vy: number },
  ) => {
    game.act('flip');
    const angle = side === 'top' ? -Math.PI / 2 : Math.PI;
    const x = side === 'top' ? target.x : target.x - target.width / 2 - 35;
    const y = side === 'top' ? target.y - target.height / 2 - 35 : target.y;
    game.debugSetBladePose(x, y, angle);
    game.debugSetVelocity(velocity.vx, velocity.vy);
    game.step(1 / 120);
    const state = game.getState();
    const event = [...state.events].reverse().find((candidate) => candidate.type === 'bounce' && candidate.targetId === target.id);
    assert.ok(event, `${target.id} should emit a blunt hard-surface reflection`);
    assert.ok(event.contactPart === 'body' || event.contactPart === 'handle');
    const surfaceVx = target.vx ?? 0;
    const surfaceVy = target.vy ?? 0;
    const incidentX = velocity.vx - surfaceVx;
    const incidentY = velocity.vy + 600 / 120 - surfaceVy;
    const outgoingX = state.player.vx - surfaceVx;
    const outgoingY = state.player.vy - surfaceVy;
    const into = incidentX * event.normalX! + incidentY * event.normalY!;
    const out = outgoingX * event.normalX! + outgoingY * event.normalY!;
    assert.ok(into < 0 && out > 0, `${target.id} should reverse relative normal velocity`);
    ratios.push(out / -into);
  };

  const staticGame = new SliceSimulation(83);
  impact(staticGame, staticGame.getState().supports.find((support) => !support.motion && support.width > support.height)!, 'top', { vx: 31, vy: 240 });

  const verticalGame = new SliceSimulation(83);
  const genericStart = verticalGame.debugLoadScenario('generic-hard' as DebugScenario);
  assert.equal(genericStart.status, 'airborne', 'generic hard-contact scenario should start with an incident blunt trajectory');
  const vertical = genericStart.supports.find((support) => support.height > support.width * 2)!;
  assert.ok(Math.abs(genericStart.player.x - vertical.x) < 200, 'generic hard-contact scenario should begin beside ordinary terrain');
  impact(verticalGame, vertical, 'left', { vx: 220, vy: 27 });

  const movingGame = new SliceSimulation(83);
  movingGame.step(0.3);
  const moving = movingGame.getState().supports.find((support) => support.motion?.axis === 'x')!;
  impact(movingGame, moving, 'top', { vx: moving.vx + 31, vy: 240 });

  const blockGame = new SliceSimulation(83);
  const block = blockGame.getState().blocks.find((candidate) => candidate.placement === 'side')!;
  impact(blockGame, block, 'left', { vx: 220, vy: 27 });

  assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.03, `restitution ratios should match: ${ratios.join(', ')}`);
});

test('HARD-SEPARATING-003 separating overlap only depenetrates without minimum-speed injection', () => {
  const game = new SliceSimulation(84);
  const column = game.getState().supports.find((support) => support.height > support.width * 2)!;
  game.act('flip');
  game.debugSetBladePose(column.x - column.width / 2 - 41, column.y, Math.PI);
  game.debugSetVelocity(-18, 7);
  game.step(1 / 120);
  const state = game.getState();
  assert.equal(state.events.some((event) => event.type === 'bounce' && event.targetId === column.id), false);
  assert.ok(state.player.vx >= -18.01, `separating contact injected speed: ${state.player.vx}`);
  assert.ok(Math.abs(state.player.vy - 12) < 0.1, `tangential velocity should remain physical: ${state.player.vy}`);
});

test('SHARP-STABLE-004 sharp semantics stay stable after a generic hard-surface bounce', () => {
  const game = new SliceSimulation(84);
  const state = game.debugLoadScenario('generic-hard' as DebugScenario);
  const column = state.supports.find((support) => support.height > support.width * 2)!;
  game.step(0.16);
  assert.ok(game.getState().events.some((event) => event.type === 'bounce' && event.targetId === column.id));
  game.debugSetBladePose(column.x - column.width / 2 - 35, column.y, 0);
  game.debugSetVelocity(220, 0);
  game.step(0.08);
  assert.equal(game.getState().status, 'anchored');
  assert.equal(game.getState().anchorId, column.id);

  const cutGame = new SliceSimulation(84);
  const block = cutGame.getState().blocks.find((candidate) => candidate.placement === 'side')!;
  sharpTouch(cutGame, block);
  assert.equal(cutGame.getState().blocks.find((candidate) => candidate.id === block.id)?.cut, true);
});

test('CUT-001 CUT-002 course exposes above, side and below rectangular cuts with no invisible post-cut collider', () => {
  for (const placement of ['above', 'side', 'below'] as const) {
    const game = new SliceSimulation(85);
    const block = game.getState().blocks.find((candidate) => candidate.placement === placement)!;
    sharpTouch(game, block);
    const after = game.getState();
    assert.equal(after.blocks.find((candidate) => candidate.id === block.id)?.cut, true);
    assert.equal(after.fragments.filter((fragment) => fragment.sourceId === block.id).length, 2);
    game.debugSetBladePose(block.x, block.y, 0);
    game.debugSetVelocity(80, 0);
    game.step(0.08);
    assert.ok(game.getState().player.vx >= 0, `${placement} should not leave an invisible solid collider`);
  }
});

test('CUT-003 a high-speed sharp sweep cuts the same block at 30 and 120 Hz', () => {
  const run = (frames: number) => {
    const game = new SliceSimulation(86);
    const target = game.getState().blocks.find((block) => block.placement === 'side')!;
    game.act('flip');
    game.debugSetBladePose(target.x - 130, target.y, 0);
    game.debugSetVelocity(900, 0);
    for (let frame = 0; frame < frames; frame += 1) game.advanceFrame(1 / frames);
    return game.getState().blocks.find((block) => block.id === target.id)?.cut;
  };
  assert.equal(run(30), true);
  assert.equal(run(120), true);
});

test('STRUCT-001 STRUCT-002 cutting the middle tower segment opens a gap, drops dependants and separates two fragments', () => {
  const game = new SliceSimulation(87);
  const middle = game.getState().blocks.find((block) => block.id === 'tower-middle')!;
  sharpTouch(game, middle);
  const split = game.getState();
  const top = split.blocks.find((block) => block.id === 'tower-top')!;
  const fragments = split.fragments.filter((fragment) => fragment.sourceId === middle.id);
  assert.equal(top.falling, true);
  assert.equal(fragments.length, 2);
  assert.ok(fragments[0].vx * fragments[1].vx < 0);
  const firstY = fragments[0].y;
  game.step(0.3);
  const later = game.getState();
  assert.ok(later.fragments.find((fragment) => fragment.id === fragments[0].id)!.y > firstY);
  assert.equal(later.blocks.find((block) => block.id === middle.id)?.solid, false);
});

test('DUAL-001 DUAL-002 a dual-role block supports before cutting and its landing face disappears after cutting', () => {
  const game = new SliceSimulation(88);
  const bridge = game.getState().blocks.find((block) => block.dualRole)!;
  const support = game.getState().supports.find((candidate) => candidate.sourceBlockId === bridge.id)!;
  assert.equal(support.active, true);
  game.debugAnchorToSupport(support.id, 0, -support.height / 2 - 38);
  assert.equal(game.getState().status, 'anchored');
  game.debugCutBlock(bridge.id);
  const state = game.getState();
  assert.equal(state.supports.find((candidate) => candidate.id === support.id)?.active, false);
  assert.equal(state.status, 'airborne');
  assert.equal(state.anchorId, null);
  assert.ok(state.blocks.some((block) => !block.dualRole && block.thin));
});

test('DUAL-001-PRECUT-SUPPORT-NOT-REPRODUCIBLE real input has stable support and cut branches', () => {
  const playBranch = (followUpAt: number | null) => {
    const game = new SliceSimulation(89);
    game.debugLoadScenario('dual-role');
    game.act('flip');
    let followUpUsed = false;
    for (let frame = 0; frame < 3 * 120; frame += 1) {
      const state = game.getState();
      if (followUpAt !== null && !followUpUsed && state.elapsed >= followUpAt) {
        game.act('flip');
        followUpUsed = true;
      }
      const bridge = state.blocks.find((block) => block.dualRole)!;
      if (bridge.cut || state.anchorId === 'dual-bridge-face' || state.status === 'failed') return state;
      game.advanceFrame(1 / 120);
    }
    return game.getState();
  };

  const supported = playBranch(null);
  assert.equal(supported.anchorId, 'dual-bridge-face');
  assert.equal(supported.blocks.find((block) => block.dualRole)?.cut, false);

  const cutGame = new SliceSimulation(89);
  cutGame.debugLoadScenario('dual-role');
  cutGame.act('flip');
  for (let frame = 0; frame < 3 * 120 && cutGame.getState().anchorId !== 'dual-bridge-face'; frame += 1) {
    cutGame.advanceFrame(1 / 120);
  }
  assert.equal(cutGame.getState().anchorId, 'dual-bridge-face');
  cutGame.act('flip');
  const cut = cutGame.getState();
  assert.equal(cut.blocks.find((block) => block.dualRole)?.cut, true);
  assert.equal(cut.supports.find((support) => support.id === 'dual-bridge-face')?.active, false);
  assert.equal(cut.status, 'airborne');
  assert.equal(cut.anchorId, null);
});

test('FINISH-001 FINISH-002 math operations are integer-safe and deterministic', () => {
  assert.equal(applyFinishOperation(17, { operation: 'multiply', operand: 4 }), 68);
  assert.equal(applyFinishOperation(17, { operation: 'divide', operand: 3 }), 5);
  assert.equal(applyFinishOperation(2, { operation: 'divide', operand: 9 }), 0);
});

test('FINISH-003 course has two original multipliers and one divisor, and a gate settles only once', () => {
  const game = new SliceSimulation(90);
  const state = game.getState();
  assert.ok(state.finishOptions.filter((gate) => gate.operation === 'multiply').length >= 2);
  assert.ok(state.finishOptions.some((gate) => gate.operation === 'divide'));
  const gate = state.finishOptions.find((candidate) => candidate.operation === 'multiply')!;
  game.debugEnterFinishGate(gate.id, 12);
  const settled = game.getState();
  assert.equal(settled.status, 'won');
  assert.equal(settled.finishGateId, gate.id);
  const score = settled.score;
  game.step(1);
  assert.equal(game.getState().score, score);
});

test('BONUS-001 BONUS-002 bonus availability follows the authored level and terminal retry is explicit', () => {
  const availability = [100, 101, 102, 103].map((seed) => new SliceSimulation(seed).getState().bonusAvailable);
  assert.ok(availability.every(Boolean));
  const bonusSeed = [100, 101, 102, 103].find((seed) => new SliceSimulation(seed).getState().bonusAvailable)!;
  const game = new SliceSimulation(bonusSeed);
  game.debugEnterBonus();
  game.debugPlacePlayer(300, game.getState().worldBottom + 50);
  game.step(0.1);
  assert.equal(game.getState().status, 'failed');
  game.reset(game.getState().seed);
  assert.equal(game.getState().phase, 'ordinary');
  assert.equal(game.getState().seed, bonusSeed);
  assert.equal(game.getState().status, 'ready');
});

test('COURSE-001 COURSE-002 COURSE-003 route data covers three spatial cuts, both moving axes, hard terrain, collapse, spike and gaps', () => {
  const course = createCourse(91);
  assert.deepEqual([...new Set(course.blocks.map((block) => block.placement))].sort(), ['above', 'below', 'side', 'tower']);
  assert.ok(course.supports.some((support) => support.motion?.axis === 'x'));
  assert.ok(course.supports.some((support) => support.motion?.axis === 'y'));
  assert.ok(course.supports.some((support) => support.height > support.width * 2));
  assert.ok(course.blocks.some((block) => block.supportedBy));
  assert.ok(course.spikes.length >= 2);
  assert.ok(course.courseSegments.length === 3 && course.courseSegments.some((segment) => segment.hasGap));
});

test('FAIL-001 FAIL-002 fall and spike are distinct and explicit retry restores motion phase, structure, fragments and score', () => {
  const game = new SliceSimulation(92);
  const moving = game.getState().supports.find((support) => support.motion)!;
  game.step(0.4);
  const shifted = game.getState().supports.find((support) => support.id === moving.id)!;
  assert.notEqual(shifted.x + shifted.y, moving.x + moving.y);
  game.debugCutBlock('tower-middle');
  game.act('flip');
  game.debugPlacePlayer(300, game.getState().worldBottom + 60);
  game.step(0.1);
  assert.equal(game.getState().failReason, 'fall');
  game.reset(game.getState().seed);
  const reset = game.getState();
  assert.equal(reset.seed, 92);
  assert.equal(reset.score, 0);
  assert.equal(reset.fragments.length, 0);
  assert.ok(reset.blocks.every((block) => !block.cut && !block.falling));
  assert.equal(reset.worldTime, 0);
});

test('FIXED-001 moving supports, collision events, fragments and collapse converge across frame cadences and a long frame', () => {
  const snapshots = [30, 60, 120].map((cadence) => {
    const game = new SliceSimulation(94);
    game.debugCutBlock('tower-middle');
    for (let frame = 0; frame < cadence; frame += 1) game.advanceFrame(1 / cadence);
    return game.getState();
  });
  const longFrame = new SliceSimulation(94);
  longFrame.debugCutBlock('tower-middle');
  longFrame.advanceFrame(1);
  snapshots.push(longFrame.getState());
  for (const state of snapshots.slice(1)) {
    assert.deepEqual(state.events.map((event) => [event.type, event.targetId]), snapshots[0].events.map((event) => [event.type, event.targetId]));
    assert.ok(Math.abs(state.supports[0].x - snapshots[0].supports[0].x) < 0.01);
    assert.ok(Math.abs(state.fragments[0].x - snapshots[0].fragments[0].x) < 0.01);
    assert.ok(Math.abs(state.fragments[0].y - snapshots[0].fragments[0].y) < 0.01);
  }
});
