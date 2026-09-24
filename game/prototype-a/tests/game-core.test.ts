import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionInput, SliceSimulation, createCourse } from '../src/game-core';

function playVisiblePolicy(game: SliceSimulation, finish: 'safe' | 'bonus', maxSeconds = 45): ReturnType<SliceSimulation['getState']> {
  for (let frame = 0; frame < maxSeconds * 60; frame += 1) {
    const state = game.getState();
    if (state.status === 'failed' || state.status === 'won') return state;
    if (state.status === 'ready' || state.status === 'anchored') game.act('flip');
    else {
      const finishApproach = state.phase === 'ordinary' && state.player.x > state.finishX - 720;
      const lane = state.finishOptions.find((option) => option.kind === finish);
      const desiredY = state.phase === 'bonus' ? 380 : finishApproach ? (finish === 'bonus' ? lane!.y + 48 : lane!.y) : 430;
      if (state.player.y > desiredY && state.player.vy > -60) game.act('flip');
    }
    game.advanceFrame(1 / 60);
  }
  return game.getState();
}

function playOpening(game: SliceSimulation, followUpAt: number | null): ReturnType<SliceSimulation['getState']> {
  game.act('flip');
  let followed = false;
  for (let frame = 0; frame < 3 * 60; frame += 1) {
    const state = game.getState();
    if (followUpAt !== null && !followed && state.elapsed >= followUpAt) {
      game.act('flip');
      followed = true;
    }
    if (state.status === 'anchored' || state.events.some((event) => event.type === 'bounce') || state.status === 'failed') return state;
    game.advanceFrame(1 / 60);
  }
  return game.getState();
}

function playWithLateFinishHeight(game: SliceSimulation, finishY: number, maxSeconds = 35): ReturnType<SliceSimulation['getState']> {
  for (let frame = 0; frame < maxSeconds * 60; frame += 1) {
    const state = game.getState();
    if (state.status === 'failed' || state.status === 'won') return state;
    if (state.status === 'ready' || state.status === 'anchored') game.act('flip');
    else {
      const targetY = state.phase === 'bonus' ? 380 : state.player.x > state.finishX - 720 ? finishY : 430;
      if (state.player.y > targetY && state.player.vy > -60) game.act('flip');
    }
    game.advanceFrame(1 / 60);
  }
  return game.getState();
}

function playNoOracle(targetHeight: number, timingOffset = 0): { state: ReturnType<SliceSimulation['getState']>; maxX: number } {
  const game = new SliceSimulation(22);
  let maxX = game.getState().player.x;
  for (let frame = 0; frame < 30 * 60; frame += 1) {
    const state = game.getState();
    maxX = Math.max(maxX, state.player.x);
    if (state.status === 'failed' || state.status === 'won') break;
    if (state.status === 'ready' || state.status === 'anchored') game.act('flip');
    else if (state.player.y > targetHeight && state.player.vy > -60 + timingOffset) game.act('flip');
    game.advanceFrame(1 / 60);
  }
  return { state: game.getState(), maxX };
}

function playLowGlobalPolicyAtBrowserCadence(options: {
  inputSampleSeconds?: number;
  inputPhaseSeconds?: number;
  renderFrameSeconds?: number;
  renderPhaseSeconds?: number;
} = {}): {
  maxX: number;
  maxWhiteColumnBounceStreak: number;
  maxNoProgressBounceStreak: number;
  maxNoProgressBounceTarget: string;
} {
  const game = new SliceSimulation(31);
  const inputSampleSeconds = options.inputSampleSeconds ?? 0.02;
  const renderFrameSeconds = options.renderFrameSeconds ?? 0.016;
  let lastTapWorldTime = -10;
  let lastEventId = 0;
  let lastBounceX = -Infinity;
  let lastBounceTarget = '';
  let bounceStreak = 0;
  let maxWhiteColumnBounceStreak = 0;
  let maxNoProgressBounceStreak = 0;
  let maxNoProgressBounceTarget = '';
  let maxX = game.getState().player.x;

  // Browser input polling and requestAnimationFrame run on independent clocks.
  // This deterministic phase reproduces the strict QA trace: x≈1228, 30 blunt
  // contacts, one anchor and a 29-event no-progress streak.
  let wallTime = 0;
  let nextInputSample = options.inputPhaseSeconds ?? 0;
  let nextRenderFrame = options.renderPhaseSeconds ?? 0.005;
  while (wallTime < 36) {
    if (nextInputSample <= nextRenderFrame) {
      wallTime = nextInputSample;
      const state = game.getState();
      maxX = Math.max(maxX, state.player.x);
      for (const event of state.events) {
        if (event.id <= lastEventId) continue;
        lastEventId = event.id;
        if (event.type !== 'bounce') continue;
        bounceStreak = event.targetId === lastBounceTarget && Math.abs(event.x - lastBounceX) < 28 ? bounceStreak + 1 : 1;
        lastBounceTarget = event.targetId ?? '';
        lastBounceX = event.x;
        if (bounceStreak > maxNoProgressBounceStreak) {
          maxNoProgressBounceStreak = bounceStreak;
          maxNoProgressBounceTarget = lastBounceTarget;
        }
        if (event.targetId === 'white-column') maxWhiteColumnBounceStreak = Math.max(maxWhiteColumnBounceStreak, bounceStreak);
      }
      if (state.status === 'failed' || state.status === 'won') break;
      const canTap = state.worldTime - lastTapWorldTime >= 0.14;
      const projectedY = state.player.y + Math.max(0, state.player.vy) * 0.22;
      const shouldTap = state.status === 'ready'
        || state.status === 'anchored'
        || (state.status === 'airborne' && projectedY > 530 && state.player.vy > -128);
      if (canTap && shouldTap) {
        game.act('flip');
        lastTapWorldTime = state.worldTime;
      }
      nextInputSample += inputSampleSeconds;
    } else {
      wallTime = nextRenderFrame;
      game.advanceFrame(renderFrameSeconds);
      nextRenderFrame += renderFrameSeconds;
    }
  }
  return { maxX, maxWhiteColumnBounceStreak, maxNoProgressBounceStreak, maxNoProgressBounceTarget };
}

test('same seed creates the same paced original course and a different seed varies targets', () => {
  const first = createCourse(17);
  assert.deepEqual(first, createCourse(17));
  assert.notDeepEqual(first, createCourse(18));
  assert.ok(first.sigils.length >= 8);
  assert.ok(first.supports.length >= 1);
  assert.ok(first.spikes.length >= 2);
});

test('ready waits safely and one flip immediately launches upward forward and rotating', () => {
  const game = new SliceSimulation(7);
  const before = game.getState();
  game.step(2);
  assert.equal(game.getState().status, 'ready');
  assert.deepEqual(game.getState().player, before.player);
  assert.equal(game.act('flip'), true);
  const launched = game.getState();
  assert.equal(launched.status, 'airborne');
  assert.ok(launched.player.vx > 0 && launched.player.vy < 0);
  assert.ok(Math.abs(launched.player.angularVelocity) > 1);
  assert.equal(launched.events.at(-1)?.type, 'launch');
});

test('seed 31 one real opening edge cuts before danger and reaches a recoverable contact inside three seconds', () => {
  const state = playOpening(new SliceSimulation(31), null);
  const cutIndex = state.events.findIndex((event) => event.type === 'cut');
  const dangerIndex = state.events.findIndex((event) => event.type === 'fall' || event.type === 'spike');
  assert.ok(cutIndex >= 0, 'the opening arc must visibly sharp-cut a generous target');
  assert.ok(dangerIndex < 0 || cutIndex < dangerIndex, 'positive cut feedback must precede beginner failure');
  assert.ok(state.status === 'anchored' || state.events.some((event) => event.type === 'bounce'));
  assert.ok(state.elapsed < 3);
});

test('the first white support teaches sharp anchor and blunt bounce through two simple timing branches', () => {
  const noFollowUp = playOpening(new SliceSimulation(31), null);
  const earlyFollowUp = playOpening(new SliceSimulation(31), 0.42);
  const eventTypes = [noFollowUp, earlyFollowUp].map((state) => state.events.map((event) => event.type));
  assert.ok(eventTypes.some((events) => events.includes('anchor')), 'one opening branch should visibly anchor');
  assert.ok(eventTypes.some((events) => events.includes('bounce')), 'the alternative branch should visibly blunt-bounce');
  for (const state of [noFollowUp, earlyFollowUp]) {
    assert.ok(state.cuts >= 1);
    assert.notEqual(state.status, 'failed');
  }
});

test('the opening blunt-bounce branch tolerates a broad second-tap window', () => {
  for (const followUpAt of [0.35, 0.45, 0.55, 0.65]) {
    const state = playOpening(new SliceSimulation(31), followUpAt);
    assert.ok(state.events.some((event) => event.type === 'bounce'), `second tap at ${followUpAt}s should blunt-bounce`);
    assert.ok(state.cuts >= 1);
    assert.notEqual(state.status, 'failed');
  }
});

test('INPUT-EDGE-001 input emits one flip edge for a long or repeated press', () => {
  const input = new ActionInput();
  assert.equal(input.press('flip'), true);
  assert.equal(input.press('flip'), false);
  assert.equal(input.press('flip', true), false);
  input.release('flip');
  assert.equal(input.press('flip'), true);
});

test('INPUT-BUFFER-002 a slightly early airborne tap executes when flip cooldown ends', () => {
  const game = new SliceSimulation(18);
  assert.equal(game.act('flip'), true);
  game.advanceFrame(0.06);
  assert.equal(game.act('flip'), true, 'early discrete tap should enter the input buffer');
  assert.equal(game.getState().events.filter((event) => event.type === 'flip').length, 0, 'buffered tap must not bypass cooldown');
  game.advanceFrame(0.08);
  const state = game.getState();
  assert.equal(state.events.filter((event) => event.type === 'flip').length, 1);
  assert.ok(state.player.vy < -600, `buffered flip did not apply its impulse: ${state.player.vy}`);
});

test('different mid-air flip timing produces a visibly different predicted landing path', () => {
  const early = new SliceSimulation(9);
  const late = new SliceSimulation(9);
  early.act('flip');
  late.act('flip');
  early.step(0.35);
  early.act('flip');
  early.step(0.6);
  late.step(0.7);
  late.act('flip');
  late.step(0.25);
  assert.ok(Math.abs(early.getState().player.y - late.getState().player.y) > 25);
});

test('only sharp-edge sweep cuts and blunt-side overlap never counts', () => {
  const blunt = new SliceSimulation(31);
  const bluntTarget = blunt.getState().sigils[0];
  blunt.act('flip');
  blunt.debugSetBladePose(bluntTarget.x + 38, bluntTarget.y, 0);
  blunt.debugSetVelocity(0, 0);
  blunt.step(1 / 120);
  assert.equal(blunt.getState().cuts, 0);

  const sharp = new SliceSimulation(31);
  const sharpTarget = sharp.getState().sigils[0];
  sharp.act('flip');
  sharp.debugSetBladePose(sharpTarget.x - 38, sharpTarget.y, 0);
  sharp.debugSetVelocity(0, 0);
  sharp.step(1 / 120);
  assert.equal(sharp.getState().cuts, 1);
  sharp.step(0.1);
  assert.equal(sharp.getState().cuts, 1);
});

test('sigil body-only overlap never cuts and sharp contact is separated at the hit plane', () => {
  const bodyOnly = new SliceSimulation(31);
  const target = bodyOnly.getState().sigils[0]!;
  bodyOnly.act('flip');
  // At angle 0 the body point overlaps the target while the edge and tip
  // remain outside the target radius.
  bodyOnly.debugSetBladePose(target.x + 35, target.y, 0);
  bodyOnly.debugSetVelocity(0, 0);
  bodyOnly.step(1 / 120);
  assert.equal(bodyOnly.getState().cuts, 0);

  const sharp = new SliceSimulation(31);
  const sharpTarget = sharp.getState().sigils[0]!;
  sharp.act('flip');
  sharp.debugSetBladePose(sharpTarget.x - 38, sharpTarget.y, 0);
  sharp.debugSetVelocity(0, 0);
  sharp.step(1 / 120);
  assert.equal(sharp.getState().cuts, 1);
  assert.ok(sharp.getState().player.x < sharpTarget.x, 'sharp contact must stop before the target center');
});

test('blunt-side collision with a neutral support bounces and a subsequent flip saves it', () => {
  const game = new SliceSimulation(32);
  const support = game.getState().supports[0];
  game.act('flip');
  game.debugSetBladePose(support.x, support.y - support.height / 2 - 37, -Math.PI / 2);
  game.debugSetVelocity(0, 240);
  game.step(0.08);
  const bounced = game.getState();
  assert.equal(bounced.status, 'airborne');
  assert.ok(bounced.player.vy < 0);
  assert.ok(bounced.events.some((event) => event.type === 'bounce'));
  game.step(0.1);
  const beforeSave = game.getState().player.vy;
  game.act('flip');
  assert.ok(game.getState().player.vy < beforeSave);
});

test('hard-surface recovery never launches the knife beyond the readable course speed budget', () => {
  const game = new SliceSimulation(31);
  game.debugLoadScenario('generic-hard');
  for (let i = 0; i < 240; i += 1) {
    game.step(1 / 120);
    const state = game.getState();
    if (state.events.some((event) => event.type === 'bounce')) {
      assert.ok(Math.abs(state.player.vx) <= 240, `unexpected horizontal escape speed ${state.player.vx}`);
      break;
    }
    if (state.status === 'failed' || state.status === 'won') break;
  }
});

test('released structural blocks fall with gravity, collide with the floor, and settle instead of tunneling through it', () => {
  const game = new SliceSimulation(31);
  const top = game.getState().blocks.find((block) => block.id === 'tower-top')!;
  game.debugCutBlock('tower-middle');
  game.step(2.4);
  const landed = game.getState().blocks.find((block) => block.id === top.id)!;
  assert.equal(landed.falling, true);
  assert.ok(landed.y <= 700 - landed.height / 2 + 1e-6, `block tunneled below floor: ${landed.y}`);
  assert.ok(Math.abs(landed.vy) < 0.01, `block did not settle: ${landed.vy}`);
});

test('sharp-edge support contact anchors and one tap deliberately relaunches', () => {
  const game = new SliceSimulation(33);
  const support = game.getState().supports[0];
  game.act('flip');
  game.debugSetBladePose(support.x, support.y - support.height / 2 - 37, Math.PI / 2);
  game.debugSetVelocity(0, 180);
  game.step(0.08);
  assert.equal(game.getState().status, 'anchored');
  assert.equal(game.getState().anchorId, support.id);
  assert.equal(game.getState().events.at(-1)?.type, 'anchor');
  game.act('flip');
  assert.equal(game.getState().status, 'airborne');
  assert.ok(game.getState().player.vy < 0);
});

test('magenta spike and abyss emit distinct fatal reasons and events', () => {
  const spikeGame = new SliceSimulation(4);
  const spike = spikeGame.getState().spikes[0];
  spikeGame.act('flip');
  spikeGame.debugPlacePlayer(spike.x - 80, spike.y);
  spikeGame.debugSetVelocity(900, 0);
  spikeGame.step(0.2);
  assert.equal(spikeGame.getState().failReason, 'spike');
  assert.equal(spikeGame.getState().events.at(-1)?.type, 'spike');

  const fallGame = new SliceSimulation(5);
  fallGame.act('flip');
  fallGame.debugPlacePlayer(400, fallGame.getState().worldBottom + 30);
  fallGame.step(0.1);
  assert.equal(fallGame.getState().failReason, 'fall');
  assert.equal(fallGame.getState().events.at(-1)?.type, 'fall');
});

test('terminal one tap is inert until an explicit retry resets the same deterministic level', () => {
  const game = new SliceSimulation(11);
  game.act('flip');
  game.debugPlacePlayer(400, game.getState().worldBottom + 30);
  game.step(0.1);
  game.act('flip');
  const terminal = game.getState();
  assert.equal(terminal.status, 'failed');
  game.reset(game.getState().seed);
  const restarted = game.getState();
  assert.equal(restarted.seed, 11);
  assert.equal(restarted.levelNumber, 1);
  assert.equal(restarted.phase, 'ordinary');
  assert.equal(restarted.status, 'ready');
});

test('Level 1 teaches supported cuts before interactive stacks, hazard pressure and original finish choice', () => {
  const state = new SliceSimulation(42).getState();
  assert.ok(state.sigils.some((sigil) => sigil.x <= 260));
  const firstStack = state.blocks.find((block) => block.id === 'level1-ladder-stack-a')!;
  const teachingTargets = state.sigils.filter((sigil) => sigil.x < firstStack.x);
  assert.ok(teachingTargets.length >= 5);
  assert.ok(teachingTargets.every((item) => state.supports.some((surface) => surface.id === item.supportSurfaceId)));
  assert.ok(state.spikes.some((spike) => spike.x > firstStack.x && spike.x < state.finishX));
  assert.ok(state.supports.some((support) => support.x <= 620));
  assert.ok(state.spikes.length >= 2);
  assert.ok(state.spikes.some((spike) => spike.x <= 1800));
  assert.ok(state.finishOptions.some((option) => option.kind === 'bonus'));
  assert.ok(state.finishOptions.some((option) => option.kind === 'safe'));
  assert.ok(state.finishOptions.filter((option) => option.operation === 'multiply').length >= 2);
  assert.ok(state.finishOptions.some((option) => option.operation === 'divide'));
  const safe = state.finishOptions.find((option) => option.kind === 'safe')!;
  const bonus = state.finishOptions.find((option) => option.kind === 'bonus')!;
  assert.ok(safe.height > bonus.height);
  assert.ok(bonus.value > safe.value);
});

test('CHOKE-REACTION-005 hard-column exit leaves a reaction cycle and two visible routes', () => {
  const state = new SliceSimulation(42).getState();
  const column = state.supports.find((support) => support.height > support.width * 2)!;
  const nextSpike = state.spikes
    .filter((spike) => spike.x - spike.width / 2 > column.x + column.width / 2)
    .sort((a, b) => a.x - b.x)[0];
  assert.ok(column && nextSpike);
  const reactionGap = nextSpike.x - nextSpike.width / 2 - (column.x + column.width / 2);
  assert.ok(reactionGap >= 190, `only ${reactionGap}px between hard terrain and the next lethal region`);
  const bladeDiameter = 34;
  const topRoute = column.y - column.height / 2 - bladeDiameter;
  const bottomRoute = state.worldBottom - (column.y + column.height / 2) - bladeDiameter;
  assert.ok(topRoute >= 80 && bottomRoute >= 80, `visible route clearances were ${topRoute}/${bottomRoute}`);
});

test('COURSE-NO-ORACLE-006 global-height policies pass the choke without obstacle coordinates', () => {
  const results = [410, 450, 490].map((height, index) => playNoOracle(height, (index - 1) * 8));
  assert.ok(results.filter((result) => result.maxX > 1600).length >= 2, results.map((result) => `${result.maxX.toFixed(1)}:${result.state.status}`).join(', '));
  assert.ok(results.some((result) => result.state.status === 'won' && result.state.elapsed <= 30));
});

test('NATURAL-CHOKE-007 low global input escapes a vertical surface without repeated no-progress rebounds', () => {
  const result = playLowGlobalPolicyAtBrowserCadence();
  assert.ok(result.maxX > 1650, `low global policy stopped at x=${result.maxX.toFixed(1)}`);
  assert.ok(result.maxWhiteColumnBounceStreak < 3, `low global policy repeated ${result.maxWhiteColumnBounceStreak} white-column rebounds`);
});

test('NATURAL-CHOKE-008 independent input cadence does not repeat three no-progress impacts on one body', () => {
  const result = playLowGlobalPolicyAtBrowserCadence({
    inputSampleSeconds: 0.024,
    inputPhaseSeconds: 0.01,
    renderFrameSeconds: 0.016,
    renderPhaseSeconds: 0,
  });
  assert.ok(result.maxX > 1650, `low global policy stopped at x=${result.maxX.toFixed(1)}`);
  assert.ok(
    result.maxNoProgressBounceStreak < 3,
    `low global policy repeated ${result.maxNoProgressBounceStreak} ${result.maxNoProgressBounceTarget} rebounds`,
  );
});

test('a deliberately extreme high-line rhythm still reaches visible magenta pressure before ten seconds', () => {
  const game = new SliceSimulation(31);
  game.act('flip');
  for (let frame = 0; frame < 10 * 60 && game.getState().status !== 'failed'; frame += 1) {
    const state = game.getState();
    if (state.status === 'anchored' || (state.player.y > 150 && state.player.vy > -40)) game.act('flip');
    game.advanceFrame(1 / 60);
  }
  const state = game.getState();
  assert.equal(state.failReason, 'spike');
  assert.ok(state.elapsed < 10);
  assert.ok(state.events.some((event) => event.type === 'cut'));
  assert.equal(state.events.at(-1)?.type, 'spike');
});

test('visible-state play produces its first self-attributed cut inside five seconds', () => {
  const game = new SliceSimulation(42);
  for (let frame = 0; frame < 5 * 60 && game.getState().cuts === 0; frame += 1) {
    const state = game.getState();
    if (state.status === 'ready' || (state.player.y > 385 && state.player.vy > -60)) game.act('flip');
    game.advanceFrame(1 / 60);
  }
  assert.ok(game.getState().cuts >= 1);
  assert.ok(game.getState().elapsed < 5);
});

test('successive actual collectible contacts multiply each target value by the live combo', () => {
  const game = new SliceSimulation(43);
  game.act('flip');
  const cluster = game.getState().sigils.filter((sigil) => ['rune-2', 'rune-3', 'rune-4'].includes(sigil.id));
  for (const entry of cluster) {
    const target = game.getState().sigils.find((sigil) => sigil.id === entry.id)!;
    game.debugSetBladePose(target.x - target.radius - 35, target.y, 0);
    game.debugSetVelocity(0, 0);
    game.step(1 / 120);
  }
  const cutEvents = game.getState().events.filter((event) => event.type === 'cut');
  assert.equal(cutEvents.length, cluster.length);
  assert.deepEqual(cutEvents.map((event) => event.targetId), cluster.map((item) => item.id));
  assert.deepEqual(cutEvents.map((event) => event.value), cluster.map((item, index) => item.value * (index + 1)));
  assert.equal(game.getState().score, cutEvents.reduce((sum, event) => sum + event.value, 0));
});

test('TABLETOP-GRAVITY-001 supported Level 1 items rest on their surface and fall after support loss', () => {
  const game = new SliceSimulation(31, 1);
  game.step(1 / 120);
  const before = game.getState();
  const token = before.sigils.find((sigil) => sigil.id === 'level1-hazard-approach-token')!;
  const bridge = before.blocks.find((block) => block.id === 'dual-bridge')!;
  assert.equal(token.supportSurfaceId, 'dual-bridge-face');
  assert.ok(Math.abs(token.y - (bridge.y - bridge.height / 2 - token.radius)) < 1);
  game.debugCutBlock(bridge.id);
  const detachedY = game.getState().sigils.find((sigil) => sigil.id === token.id)!.y;
  game.step(0.35);
  const fallen = game.getState().sigils.find((sigil) => sigil.id === token.id)!;
  assert.ok(fallen.y > detachedY + 20, `supported item did not fall after support loss: ${detachedY} -> ${fallen.y}`);
});

test('a visible-state policy finishes the ordinary route through the wider safe gate in 12-25 seconds', () => {
  const result = playVisiblePolicy(new SliceSimulation(21), 'safe');
  assert.equal(result.status, 'won');
  assert.equal(result.finishSelection, 'safe');
  assert.ok(result.elapsed >= 12 && result.elapsed <= 25);
  assert.ok(result.cuts >= 1);
});

test('a visible-state policy can choose the narrow rich gate and enter dense one-chance bonus', () => {
  const game = new SliceSimulation(22);
  const entered = playVisiblePolicy(game, 'bonus', 36);
  assert.equal(entered.phase, 'bonus');
  assert.ok(entered.sigils.length >= 12);
  assert.equal(entered.finishSelection, 'bonus');
  assert.ok(entered.events.some((event) => event.type === 'bonus'));
});

test('finish wall contact settles a lane before the knife crosses the wall plane', () => {
  const game = new SliceSimulation(31, 2);
  const scenario = game.debugLoadScenario('finish-multiply');
  const wallX = scenario.finishX;
  game.act('flip');
  const state = game.step(0.55);
  assert.equal(state.status, 'won');
  assert.equal(state.finishSettled, true);
  assert.ok(state.player.x <= wallX - 35, `knife must stop at the wall face, got x=${state.player.x}`);
});

test('late inputs aimed at the current safe/bonus lanes preserve both complete outcomes', () => {
  const options = new SliceSimulation(22).getState().finishOptions;
  const safe = playWithLateFinishHeight(new SliceSimulation(22), options.find((option) => option.kind === 'safe')!.y);
  const bonus = playWithLateFinishHeight(new SliceSimulation(22), options.find((option) => option.kind === 'bonus')!.y + 48);
  assert.equal(safe.phase, 'ordinary');
  assert.equal(safe.status, 'won');
  assert.equal(safe.finishSelection, 'safe');
  assert.equal(bonus.phase, 'bonus');
  assert.equal(bonus.status, 'won');
  assert.equal(bonus.finishSelection, 'bonus');
  assert.ok(bonus.phaseElapsed > 1);
});

test('bonus failure remains terminal until an explicit retry resets the level', () => {
  const game = new SliceSimulation(44);
  game.debugEnterBonus();
  game.debugPlacePlayer(300, game.getState().worldBottom + 40);
  game.step(0.1);
  assert.equal(game.getState().phase, 'bonus');
  assert.equal(game.getState().status, 'failed');
  game.reset(game.getState().seed);
  assert.equal(game.getState().phase, 'ordinary');
  assert.equal(game.getState().status, 'ready');
  assert.equal(game.getState().seed, 44);
});

test('bonus success remains terminal until an explicit retry resets the level', () => {
  const game = new SliceSimulation(45);
  game.debugEnterBonus();
  const state = game.getState();
  game.debugPlacePlayer(state.finishX - 20, 350);
  game.debugSetVelocity(240, 0);
  game.step(0.1);
  assert.equal(game.getState().status, 'won');
  assert.equal(game.getState().phase, 'bonus');
  game.reset(game.getState().seed);
  assert.equal(game.getState().phase, 'ordinary');
  assert.equal(game.getState().seed, 45);
});

test('30 60 and 120 Hz render cadence converge on the same fixed-step state', () => {
  const snapshots = [30, 60, 120].map((cadence) => {
    const game = new SliceSimulation(14);
    game.act('flip');
    for (let frame = 0; frame < cadence * 0.7; frame += 1) game.advanceFrame(1 / cadence);
    return game.getState().player;
  });
  for (const player of snapshots.slice(1)) {
    assert.ok(Math.abs(player.x - snapshots[0].x) < 0.5);
    assert.ok(Math.abs(player.y - snapshots[0].y) < 0.5);
    assert.ok(Math.abs(player.angle - snapshots[0].angle) < 0.02);
  }
});

test('a 420ms low frame preserves elapsed time and converges with split frames', () => {
  const lowFrame = new SliceSimulation(61);
  const splitFrames = new SliceSimulation(61);
  lowFrame.act('flip');
  splitFrames.act('flip');

  lowFrame.advanceFrame(0.42);
  for (let frame = 0; frame < 42; frame += 1) splitFrames.advanceFrame(0.01);

  const lowState = lowFrame.getState();
  const splitState = splitFrames.getState();
  assert.ok(lowState.elapsed > 0.4, 'normal low-frame wall time must not be silently discarded');
  assert.ok(Math.abs(lowState.elapsed - splitState.elapsed) < 1 / 120);
  assert.ok(Math.abs(lowState.player.x - splitState.player.x) < 0.5);
  assert.ok(Math.abs(lowState.player.y - splitState.player.y) < 0.5);
  assert.ok(Math.abs(lowState.player.angle - splitState.player.angle) < 0.02);
});

test('a 1.394s main-thread stall catches up without losing simulation time', () => {
  const stalled = new SliceSimulation(62);
  const splitFrames = new SliceSimulation(62);
  stalled.act('flip');
  splitFrames.act('flip');

  stalled.advanceFrame(1.394);
  for (let frame = 0; frame < 1394; frame += 1) splitFrames.advanceFrame(0.001);

  const stalledState = stalled.getState();
  const splitState = splitFrames.getState();
  assert.ok(stalledState.elapsed > 1.2, 'a normal long frame must advance to the same recoverable opening contact');
  assert.equal(stalledState.status, splitState.status);
  assert.equal(stalledState.anchorId, splitState.anchorId);
  assert.ok(Math.abs(stalledState.elapsed - splitState.elapsed) < 1 / 120);
  assert.ok(Math.abs(stalledState.player.x - splitState.player.x) < 0.5);
  assert.ok(Math.abs(stalledState.player.y - splitState.player.y) < 0.5);
});

test('ACTION-FEEL fragments inherit cut contact and settle with damping', () => {
  const left = new SliceSimulation(84);
  const right = new SliceSimulation(84);
  const leftBlock = left.getState().blocks.find((candidate) => candidate.placement === 'above')!;
  const rightBlock = right.getState().blocks.find((candidate) => candidate.placement === 'above')!;
  left.act('flip');
  left.debugSetBladePose(leftBlock.x - 38, leftBlock.y - 12, 0);
  left.debugSetVelocity(180, 60);
  left.step(1 / 120);
  right.act('flip');
  right.debugSetBladePose(rightBlock.x - 38, rightBlock.y + 12, 0);
  right.debugSetVelocity(180, -60);
  right.step(1 / 120);
  const leftPieces = left.getState().fragments.filter((fragment) => fragment.sourceId === leftBlock.id);
  const rightPieces = right.getState().fragments.filter((fragment) => fragment.sourceId === rightBlock.id);
  assert.equal(leftPieces.length, 2);
  assert.notDeepEqual(leftPieces.map((piece) => [piece.vx, piece.vy, piece.angularVelocity]), rightPieces.map((piece) => [piece.vx, piece.vy, piece.angularVelocity]));
  left.step(3);
  assert.ok(left.getState().fragments.every((piece) => Math.abs(piece.vy) < 0.01 && Math.abs(piece.angularVelocity) < 0.08));
});

test('CUT-SIGIL-FALL-011 cut sigil halves descend to the simulation floor and settle', () => {
  const game = new SliceSimulation(84);
  const sigil = game.getState().sigils[0]!;
  game.act('flip');
  game.debugSetBladePose(sigil.x - 38, sigil.y, 0);
  game.debugSetVelocity(0, 0);
  game.step(1 / 120);
  assert.equal(game.getState().sigils[0]!.cut, true);
  const startY = game.getState().sigils[0]!.y;
  game.step(0.4);
  assert.ok(game.getState().sigils[0]!.y > startY, 'cut sigil should fall under gravity');
  game.step(3);
  const landed = game.getState().sigils[0]!;
  assert.ok(Math.abs(landed.y - (game.getState().worldBottom - landed.radius)) < 0.01);
});

test('experience chain records cut earnings in a persistent run ledger', () => {
  const game = new SliceSimulation(31);
  const sigil = game.getState().sigils[0]!;
  game.act('flip');
  game.debugSetBladePose(sigil.x - 38, sigil.y, 0);
  game.debugSetVelocity(180, 0);
  game.step(1 / 60);
  const state = game.getState();
  assert.ok(state.earnings.length >= 1);
  const lastCut = [...state.events].reverse().find((event) => event.type === 'cut');
  assert.equal(state.earnings.at(-1)?.amount, lastCut?.value);
  assert.equal(state.totalEarnings, state.earnings.reduce((sum, entry) => sum + entry.amount, 0));
});

test('finish reward reveal precedes terminal win and settles the selected wall lane', () => {
  const game = new SliceSimulation(12);
  const gate = game.getState().finishOptions.find((option) => option.kind === 'safe')!;
  game.act('flip');
  game.debugPlacePlayer(gate.x - 60, gate.y);
  game.debugSetVelocity(240, 0);
  game.step(0.1);
  const contact = game.getState();
  assert.equal(contact.finishPhase, 'contact');
  assert.notEqual(contact.status, 'won');
  game.step(0.2);
  assert.equal(game.getState().finishPhase, 'reward');
  assert.notEqual(game.getState().status, 'won');
  game.step(0.9);
  assert.equal(game.getState().finishPhase, 'terminal');
  assert.equal(game.getState().status, 'won');
});
