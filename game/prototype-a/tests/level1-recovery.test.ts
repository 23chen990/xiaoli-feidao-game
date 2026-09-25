import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SliceSimulation } from '../src/game-core';
import { ThreePresentationModel, createCameraSpec, worldPointFromSimulation } from '../src/three-presentation';

const RUNWAY_RELEASE_TRACE_GRAVITY = 600;
const RUNWAY_RELEASE_TRACE_PLAYER_RADIUS = 17;
const RUNWAY_RELEASE_TRACE_TOP = -127;

function traceReleaseCandidates(state: ReturnType<SliceSimulation['getState']>, tapId: string) {
  const player = state.player;
  const upperBoundaryLimit = -Math.sqrt(Math.max(0, 2 * RUNWAY_RELEASE_TRACE_GRAVITY * (player.y - RUNWAY_RELEASE_TRACE_TOP)));
  const evaluated = state.supports.map((support) => {
    const supportTop = support.y - support.height / 2;
    const entryX = support.x;
    const entryTime = (entryX - player.x) / Math.max(1, player.vx - support.vx);
    const predictedY = player.y + player.vy * entryTime + 0.5 * RUNWAY_RELEASE_TRACE_GRAVITY * entryTime ** 2;
    const requiredVy = entryTime > 0
      ? (supportTop - RUNWAY_RELEASE_TRACE_PLAYER_RADIUS - player.y - 0.5 * RUNWAY_RELEASE_TRACE_GRAVITY * entryTime ** 2) / entryTime
      : null;
    const verticalBand = {
      min: supportTop - RUNWAY_RELEASE_TRACE_PLAYER_RADIUS - 20,
      max: supportTop - RUNWAY_RELEASE_TRACE_PLAYER_RADIUS + 20,
    };
    const rejectionReasons: string[] = [];
    if (!support.active) rejectionReasons.push('inactive');
    if (support.collidable === false) rejectionReasons.push('non-collidable');
    if (entryTime <= 0) rejectionReasons.push('not-ahead');
    if (requiredVy === null || requiredVy < upperBoundaryLimit || requiredVy > 760) rejectionReasons.push('vertical-corridor-unreachable');
    return {
      selectedSupportId: null as string | null,
      supportId: support.id,
      entryTime,
      supportTop,
      verticalBand,
      predictedY,
      requiredVy,
      upperBoundaryLimit,
      rejectionReasons,
    };
  });
  const eligible = evaluated.filter((candidate) => candidate.rejectionReasons.length === 0);
  const selected = eligible.sort((a, b) => a.entryTime - b.entryTime)[0];
  if (selected) selected.selectedSupportId = selected.supportId;
  const trace = {
    tapId,
    selectedSupportId: selected?.supportId ?? null,
    player: { ...player },
    candidates: evaluated.map(({ selectedSupportId, ...candidate }) => ({
      ...candidate,
      selected: selectedSupportId === candidate.supportId,
    })),
    rejectionReasons: evaluated.filter((candidate) => candidate.rejectionReasons.length > 0)
      .map(({ supportId, rejectionReasons }) => ({ supportId, rejectionReasons })),
    remainingCandidates: eligible.map((candidate) => candidate.supportId),
  };
  console.log(`RUNWAY_RELEASE_TRACE ${JSON.stringify(trace)}`);
  return trace;
}

for (const suffix of ['a', 'b']) {
  test(`L1-STACK ${suffix}: actual knife contact cuts the bearing object and releases the overlapping upper object`, () => {
    const game = new SliceSimulation(31, 1);
    const state = game.getState();
    const upper = state.blocks.find((b) => b.id === `level1-ladder-stack-${suffix}`)!;
    const lower = state.blocks.find((b) => b.id === `level1-rainbow-step-${suffix}`)!;
    assert.notEqual(upper.collidable, false);
    assert.notEqual(lower.collidable, false);
    assert.equal(upper.supportedBy, lower.id);
    assert.ok(Math.abs(upper.x - lower.x) < (upper.width + lower.width) / 2);
    assert.equal(upper.y + upper.height / 2, lower.y - lower.height / 2);
    const table = state.supports.find((s) => Math.abs(s.x - lower.x) < s.width / 2 && Math.abs(s.y - s.height / 2 - lower.y - lower.height / 2) < 0.01);
    assert.ok(table, 'lower block must touch an actual visible tabletop');
    game.act('flip');
    game.debugSetBladePose(lower.x - lower.width / 2 - 36, lower.y, 0);
    game.debugSetVelocity(240, 0);
    game.step(1 / 60);
    const cut = game.getState();
    assert.ok(cut.events.some((e) => e.type === 'cut' && e.targetId === lower.id), 'collision path must cut, not a debug cut helper');
    assert.ok(cut.blocks.find((b) => b.id === upper.id)!.falling);
    assert.equal(cut.fragments.filter((f) => f.sourceId === lower.id).length, 2);
    // Isolate only the player's continuing travel, not the object physics.
    game.debugSetBladePose(120, 420, 0);
    game.debugSetVelocity(0, 0);
    game.step(0.2);
    assert.ok(game.getState().blocks.find((b) => b.id === upper.id)!.y > upper.y + 5);
  });

  test(`L1-STACK-VISUAL-EVIDENCE ${suffix}: same target stays visible and separates into two halves after cut`, () => {
    const game = new SliceSimulation(31, 1);
    const model = new ThreePresentationModel();
    const before = model.sync(game.getState()).cuttables.find((v) => v.id === `level1-ladder-stack-${suffix}`)!;
    assert.equal(before.phase, 'intact');
    assert.equal(before.falling, false);
    game.debugCutBlock(`level1-rainbow-step-${suffix}`);
    game.step(0.15);
    const afterState = game.getState();
    const after = model.sync(afterState).cuttables.find((v) => v.id === before.id)!;
    assert.equal(after.phase, 'intact', 'released upper block should remain a visible intact object while falling');
    assert.equal(after.falling, true);
    assert.equal(after.halves.length, 0);
    const released = afterState.blocks.find((b) => b.id === before.id)!;
    assert.ok(released.y > 379 || released.vy > 0);
    const lower = model.sync(afterState).cuttables.find((v) => v.id === `level1-rainbow-step-${suffix}`)!;
    assert.equal(lower.phase, 'cut');
    assert.equal(lower.halves.length, 2);
    assert.notDeepEqual(lower.halves[0]!.position, lower.halves[1]!.position);
  });
}

test('L1-GRAVITY active airborne play does not freeze a hovering supported collectible', () => {
  const game = new SliceSimulation(31, 1);
  // Engineering fixture: lift only the target, not the knife or collision path.
  const internal = game as unknown as { state: ReturnType<SliceSimulation['getState']> };
  internal.state.sigils.find((s) => s.id === 'rune-8')!.y -= 18;
  game.act('flip');
  const item = game.getState().sigils.find((s) => s.id === 'rune-8')!;
  game.step(0.3);
  const now = game.getState().sigils.find((s) => s.id === item.id)!;
  const support = game.getState().supports.find((s) => s.id === now.supportSurfaceId)!;
  assert.ok(Math.abs(now.y + now.radius - (support.y - support.height / 2)) < 0.01, 'airborne knife must not freeze item above its table');
});

test('L1-REWARD intact has zero earnings; a real cut names the separated target and replay clears earnings', () => {
  const game = new SliceSimulation(31, 1);
  const model = new ThreePresentationModel();
  assert.equal(game.getState().totalEarnings, 0);
  assert.equal(model.sync(game.getState()).cuttables.find((v) => v.id === 'rune-1')!.phase, 'intact');
  game.act('flip');
  for (let i = 0; i < 240 && game.getState().cuts === 0; i++) game.step(1 / 120);
  const state = game.getState();
  const event = state.events.find((e) => e.type === 'cut')!;
  assert.ok(event);
  const visual = model.sync(state).cuttables.find((v) => v.id === event.targetId)!;
  assert.equal(visual.phase, 'cut');
  assert.equal(visual.halves.length, 2);
  assert.notDeepEqual(visual.halves[0]!.position, visual.halves[1]!.position);
  assert.equal(state.earnings[0]!.targetId, event.targetId);
  assert.equal(state.totalEarnings, event.value);
  assert.ok(Math.abs(visual.position[0] - event.x / 100) < 0.1);
  game.reset(31);
  model.reset();
  assert.equal(game.getState().totalEarnings, 0);
  assert.equal(game.getState().earnings.length, 0);
});

test('L1-PLACEMENT every initial collectible has a touching support, including the late and bridge targets', () => {
  const state = new SliceSimulation(31, 1).getState();
  for (const item of state.sigils) {
    const surface = state.supports.find((s) => s.id === item.supportSurfaceId)!;
    assert.ok(surface, `${item.id} has no real support`);
    assert.ok(Math.abs(item.x - surface.x) <= surface.width / 2, `${item.id} center overhangs its assigned surface`);
    assert.ok(Math.abs(item.y + item.radius - surface.y + surface.height / 2) < 0.01, `${item.id} starts hovering or penetrating`);
  }
});

test('L1-RUNWAY visible support stays collidable through the new forward replay', () => {
  const game = new SliceSimulation(31, 1);
  const runway = game.getState().supports.find((support) => support.id === 'level1-runway-main');
  assert.ok(runway, 'Level 1 must expose the authored runway support');
  assert.notEqual(runway!.collidable, false, 'the visible runway cannot be decorative when it carries runway targets');
  const tapTimesMs = [0, 1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600, 10800, 12000, 13200, 14400, 15600, 16800, 18000, 19000];
  let nextTap = 0;
  let state = game.getState();
  for (let frame = 0; frame < 21 * 120 && state.status !== 'failed' && state.status !== 'won'; frame += 1) {
    const wallTimeMs = frame * 1000 / 120;
    while (nextTap < tapTimesMs.length && tapTimesMs[nextTap]! <= wallTimeMs + 1e-9) {
      game.act('flip');
      nextTap += 1;
    }
    state = game.step(1 / 120);
  }
  assert.ok(state.events.filter((event) => event.type === 'cut').length >= 3);
  assert.ok(state.status === 'won' || state.player.x > 2_700, `replay stopped at x=${state.player.x}`);
});

test('L1-RUNWAY main path stays playable without requiring a recovery anchor', () => {
  const game = new SliceSimulation(31, 1);
  const tapTimesMs = [0, 1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600, 10800, 12000, 13200, 14400, 15600, 16800, 18000, 19000];
  let nextTap = 0;
  let state = game.getState();
  for (let frame = 0; frame < 21 * 120 && state.status !== 'failed' && state.status !== 'won'; frame += 1) {
    const wallTimeMs = frame * 1000 / 120;
    while (nextTap < tapTimesMs.length && tapTimesMs[nextTap]! <= wallTimeMs + 1e-9) {
      game.act('flip');
      nextTap += 1;
    }
    state = game.step(1 / 120);
  }
  assert.ok(state.events.filter((event) => event.type === 'cut').length >= 3);
  assert.ok(state.status === 'won' || state.player.x > 2_700, `main path stopped at x=${state.player.x}`);
  assert.equal(state.events.some((event) => event.type === 'anchor' && event.targetId === 'white-column'), false);
});

test('L1-RUNWAY test-only release trace records early and late support candidates before correction', () => {
  const early = new SliceSimulation(31, 1);
  const earlyInternal = early as unknown as { state: ReturnType<SliceSimulation['getState']> };
  earlyInternal.state.status = 'airborne';
  earlyInternal.state.anchorId = null;
  Object.assign(earlyInternal.state.player, { x: 332.7, y: 494.1, vx: 180, vy: -80 });
  const earlyTrace = traceReleaseCandidates(early.getState(), 'early-runway-release');
  assert.ok(earlyTrace.candidates.length > 0);
  assert.ok(earlyTrace.candidates.every((candidate) => 'entryTime' in candidate && 'supportTop' in candidate
    && 'verticalBand' in candidate && 'predictedY' in candidate && 'requiredVy' in candidate && 'upperBoundaryLimit' in candidate));
  assert.ok(earlyTrace.rejectionReasons.length > 0, 'trace must explain rejected candidates');
  assert.equal((early as unknown as { selectRunwayReleaseSupport?: () => { id: string } | null }).selectRunwayReleaseSupport?.()?.id, earlyTrace.selectedSupportId, 'runtime selector must agree with the recorded early trace');

  const late = new SliceSimulation(31, 1);
  const lateInternal = late as unknown as { state: ReturnType<SliceSimulation['getState']> };
  lateInternal.state.status = 'airborne';
  lateInternal.state.anchorId = null;
  lateInternal.state.worldTime = 7.5;
  Object.assign(lateInternal.state.player, { x: 1750, y: 450, vx: 180, vy: 0 });
  const lateTrace = traceReleaseCandidates(late.getState(), 'late-lift-plank-release');
  assert.ok(lateTrace.candidates.some((candidate) => candidate.supportId === 'lift-plank'), 'late trace must retain lift-plank as a candidate');
  assert.equal((late as unknown as { selectRunwayReleaseSupport?: () => { id: string } | null }).selectRunwayReleaseSupport?.()?.id, 'tower-approach', 'runtime selector must preserve the reachable late recovery branch');
});

test('L1-RUNWAY later sharp contact stays airborne while body contact still bounces', () => {
  const sharp = new SliceSimulation(31, 1);
  sharp.act('flip');
  // This normal airborne pose crosses the runway with the blade tip first.
  sharp.debugSetBladePose(1100, 500, 0);
  sharp.debugSetVelocity(240, 0);
  (sharp as unknown as { debugFixtureMode: boolean }).debugFixtureMode = false;
  const sharpState = sharp.step(0.2);
  assert.notEqual(sharpState.status, 'anchored', 'a later runway tip contact must not trap the knife');
  assert.equal(sharpState.anchorId, null);

  const body = new SliceSimulation(31, 1);
  body.act('flip');
  // Rotating the blade presents the body/handle to the same hard surface.
  body.debugSetBladePose(1100, 480, Math.PI / 2);
  body.debugSetVelocity(0, 240);
  // Engineering fixture: start after the opening event suppression window so
  // this assertion observes the normal player-visible bounce event.
  const internal = body as unknown as { state: { recoveryAge: number; elapsed: number; worldTime: number } };
  internal.state.recoveryAge = 1;
  internal.state.elapsed = 2;
  internal.state.worldTime = 2;
  (body as unknown as { debugFixtureMode: boolean }).debugFixtureMode = false;
  const bodyState = body.step(0.2);
  assert.equal(bodyState.status, 'airborne');
  assert.ok(bodyState.events.some((event) => event.type === 'bounce' && event.targetId === 'level1-runway-main'));
});

test('L1-RUNWAY early approaching top-face tip contact recovers without removing side anchors', () => {
  const prepareRunwayContact = (x: number, y: number, vx: number, vy: number) => {
    const game = new SliceSimulation(31, 1);
    game.act('flip');
    game.debugSetBladePose(x, y, 0);
    game.debugSetVelocity(vx, vy);
    const internal = game as unknown as {
      debugFixtureMode: boolean;
      state: { recoveryAge: number; elapsed: number; worldTime: number };
    };
    internal.debugFixtureMode = false;
    internal.state.recoveryAge = 1;
    internal.state.elapsed = 2;
    internal.state.worldTime = 2;
    return game;
  };

  const top = prepareRunwayContact(302, 440, 120, 200);
  const topState = top.step(0.2);
  assert.equal(topState.status, 'airborne', 'approaching top-face contact should use hard-surface recovery');
  assert.equal(topState.anchorId, null);
  assert.ok(topState.player.vx > 0 || topState.player.vy < 0, 'recovery should retain forward travel or move upward');

  const side = prepareRunwayContact(265, 500, 200, 0);
  const sideState = side.step(0.2);
  assert.equal(sideState.status, 'anchored', 'non-top sharp contact must retain its authored anchor behavior');
  assert.equal(sideState.anchorId, 'level1-runway-main');
});

test('L1-RUNWAY early separating top-face tip contact creates and consumes one airborne release pose', () => {
  const game = new SliceSimulation(31, 1);
  game.act('flip');
  // Reproduce the natural trace immediately before its first runway anchor.
  game.debugSetBladePose(298.95, 536.875, 5.348642717407897);
  game.debugSetVelocity(150, -200);
  const internal = game as unknown as {
    debugFixtureMode: boolean;
    state: { recoveryAge: number; elapsed: number; worldTime: number };
  };
  internal.debugFixtureMode = false;
  internal.state.recoveryAge = 1;
  internal.state.elapsed = 3.7;
  internal.state.worldTime = 3.7;

  let state = game.getState();
  const pending = game as unknown as {
    pendingRunwayReleasePose: {
      supportId: string;
      anchorOffsetX: number;
      anchorOffsetY: number;
      playerX: number;
      playerY: number;
      playerAngle: number;
      age: number;
    } | null;
  };
  for (let frame = 0; frame < 24 && !pending.pendingRunwayReleasePose; frame += 1) {
    state = game.step(1 / 120);
  }
  assert.equal(state.status, 'airborne', 'an upward top-face contact must not become an authored anchor');
  assert.equal(state.anchorId, null);
  assert.equal(pending.pendingRunwayReleasePose?.supportId, 'level1-runway-main');
  assert.ok(Number.isFinite(pending.pendingRunwayReleasePose?.anchorOffsetX));
  assert.ok(Number.isFinite(pending.pendingRunwayReleasePose?.anchorOffsetY));
  assert.ok(Number.isFinite(pending.pendingRunwayReleasePose?.playerX));
  assert.ok(Number.isFinite(pending.pendingRunwayReleasePose?.playerY));
  assert.ok(Number.isFinite(pending.pendingRunwayReleasePose?.playerAngle));
  assert.ok(pending.pendingRunwayReleasePose!.age >= 0 && pending.pendingRunwayReleasePose!.age < 2.35);
  assert.ok(state.player.y < 536.875, 'separating recovery should move the blade clear of the runway');
  assert.equal(state.events.some((event) => event.type === 'anchor' && event.targetId === 'level1-runway-main'), false);

  const releasePose = { ...pending.pendingRunwayReleasePose! };
  game.step(0.2);
  const beforeTap = game.getState();
  assert.ok(Math.hypot(beforeTap.player.x - releasePose.playerX, beforeTap.player.y - releasePose.playerY) > 2,
    'the airborne pose should continue moving before release');

  const internalAfterRecovery = game as unknown as { flipCooldown: number; inputBuffer: number };
  internalAfterRecovery.inputBuffer = 0.05;
  assert.equal(game.act('flip'), true);
  const released = game.getState();
  assert.equal(released.status, 'airborne');
  assert.equal(released.anchorId, null);
  assert.ok(released.events.some((event) => event.type === 'launch' && Math.abs(event.x - releasePose.playerX) < 0.001));
  assert.ok(Math.abs(released.player.x - releasePose.playerX) < 0.001);
  assert.ok(Math.abs(released.player.y - releasePose.playerY) < 0.001);
  assert.ok(Math.abs(released.player.angle - releasePose.playerAngle) < 1e-6);
  assert.equal(released.player.vx, 180, 'release should use standard anchored horizontal launch speed');
  assert.equal(released.player.vy, -300, 'release should use standard anchored vertical launch speed');
  assert.equal(pending.pendingRunwayReleasePose, null, 'the pending pose is consumed exactly once');
  assert.ok(internalAfterRecovery.flipCooldown > 0.12, 'release should reset the 130ms flip cooldown');
  assert.equal(internalAfterRecovery.inputBuffer, 0, 'release should clear buffered input');

  game.step(0.14);
  game.act('flip');
  assert.equal(game.getState().events.at(-1)?.type, 'flip', 'a consumed pose must not relaunch on another airborne tap');
});

test('L1-RUNWAY recovery release snapshot does not change ordinary non-runway support launches', () => {
  const game = new SliceSimulation(31, 1);
  game.debugAnchorToSupport('white-landing');
  assert.equal(game.act('flip'), true);
  const state = game.getState();
  assert.equal(state.events.at(-1)?.type, 'launch');
  assert.equal(state.player.vy, -300);
  assert.equal(state.player.vx, 180);
});

test('L1-RUNWAY pending runway pose expires at its bounded lifetime', () => {
  const game = new SliceSimulation(31, 1);
  game.act('flip');
  game.debugSetBladePose(298.95, 536.875, 5.348642717407897);
  game.debugSetVelocity(150, -200);
  const internal = game as unknown as {
    debugFixtureMode: boolean;
    pendingRunwayReleasePose: { age: number } | null;
    state: { recoveryAge: number; elapsed: number; worldTime: number; status: string; anchorId: string | null };
  };
  internal.debugFixtureMode = false;
  internal.state.recoveryAge = 1;
  internal.state.elapsed = 3.7;
  internal.state.worldTime = 3.7;
  const contact = game.step(0.2);
  assert.equal(contact.status, 'airborne');
  assert.ok(internal.pendingRunwayReleasePose);
  internal.pendingRunwayReleasePose!.age = 2.35 - 1 / 120;
  game.step(1 / 120);
  assert.equal(internal.pendingRunwayReleasePose, null);

  game.debugSetBladePose(320, 450, 0);
  game.debugSetVelocity(120, 0);
  internal.state.status = 'airborne';
  internal.state.anchorId = null;
  const eventCount = game.getState().events.length;
  game.act('flip');
  const afterTap = game.getState();
  assert.equal(afterTap.anchorId, null);
  assert.equal(afterTap.events.length, eventCount + 1);
  assert.equal(afterTap.events.at(-1)?.type, 'flip', 'expired pose should leave an ordinary airborne flip');
});

test('L1-RUNWAY pending pose clears on reset, level load, terminal, inactive support, and non-runway contact', () => {
  type PendingPose = {
    supportId: string;
    anchorOffsetX: number;
    anchorOffsetY: number;
    playerX: number;
    playerY: number;
    playerAngle: number;
    age: number;
  };
  const installPose = (game: SliceSimulation, x = 120, y = 420, angle = 0, age = 0) => {
    const internal = game as unknown as {
      pendingRunwayReleasePose: PendingPose | null;
      state: ReturnType<SliceSimulation['getState']>;
    };
    const support = internal.state.supports.find((candidate) => candidate.id === 'level1-runway-main')!;
    internal.state.status = 'airborne';
    internal.state.anchorId = null;
    internal.state.recoveryAge = 1;
    internal.state.player = { x, y, vx: 0, vy: 0, angle, angularVelocity: 0 };
    internal.pendingRunwayReleasePose = {
      supportId: support.id,
      anchorOffsetX: x - support.x,
      anchorOffsetY: y - support.y,
      playerX: x,
      playerY: y,
      playerAngle: angle,
      age,
    };
    return internal;
  };

  const resetGame = new SliceSimulation(31, 1);
  installPose(resetGame);
  resetGame.reset(31);
  assert.equal((resetGame as unknown as { pendingRunwayReleasePose: PendingPose | null }).pendingRunwayReleasePose, null);

  const loadedGame = new SliceSimulation(31, 1);
  installPose(loadedGame);
  loadedGame.loadLevel(1, 31);
  assert.equal((loadedGame as unknown as { pendingRunwayReleasePose: PendingPose | null }).pendingRunwayReleasePose, null);

  const terminalGame = new SliceSimulation(31, 1);
  const terminalInternal = installPose(terminalGame);
  const safeGate = terminalInternal.state.finishOptions.find((option) => option.kind === 'safe')!;
  terminalGame.debugEnterFinishGate(safeGate.id);
  assert.equal(terminalInternal.pendingRunwayReleasePose, null);

  const inactiveGame = new SliceSimulation(31, 1);
  const inactiveInternal = installPose(inactiveGame);
  inactiveInternal.state.supports.find((support) => support.id === 'level1-runway-main')!.active = false;
  inactiveGame.step(1 / 120);
  assert.equal(inactiveInternal.pendingRunwayReleasePose, null);

  const nonRunwayGame = new SliceSimulation(31, 1);
  const nonRunwayInternal = installPose(nonRunwayGame, 273.95, 578.125, 6.873113989450405);
  nonRunwayInternal.state.player.vy = 120;
  nonRunwayInternal.state.elapsed = 2;
  nonRunwayInternal.state.worldTime = 2;
  (nonRunwayGame as unknown as { debugFixtureMode: boolean }).debugFixtureMode = false;
  const nonRunwayState = nonRunwayGame.step(0.1);
  assert.ok(nonRunwayState.events.some((event) => event.type === 'anchor' && event.targetId === 'white-landing'));
  assert.equal(nonRunwayInternal.pendingRunwayReleasePose, null);
});

test('L1-RUNWAY opening no longer requires the authored white landing anchor', () => {
  const game = new SliceSimulation(31, 1);
  game.act('flip');
  for (let frame = 0; frame < 3 * 60; frame += 1) {
    const state = game.getState();
    if (state.status === 'anchored' || state.status === 'failed') break;
    game.advanceFrame(1 / 60);
  }
  const state = game.getState();
  assert.ok(state.cuts >= 1, 'opening should teach a cut before optional recovery structures');
  assert.equal(state.events.some((event) => event.type === 'anchor' && event.targetId === 'white-landing'), false);
});

test('L1-FINISH labels use viewport coordinates without a second offset', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = css.match(/#finish-wall-labels\s*\{([^}]+)\}/)![1]!;
  assert.match(rule, /inset:\s*0/);
  assert.doesNotMatch(rule, /translateY|top:\s*50%/);
});

for (const [width, height] of [[390, 844], [1100, 720]]) {
  test(`L1-FINISH all band corners fit the safe viewport on approach at ${width}x${height}`, () => {
    const state = new SliceSimulation(22, 1).getState();
    // The finish-aware spec is also used by the production renderer.
    const spec = createCameraSpec(width, height, 28.5, state.finishOptions);
    const camera = new THREE.PerspectiveCamera(spec.fov, spec.aspect, spec.near, spec.far);
    camera.position.fromArray(spec.position);
    camera.lookAt(new THREE.Vector3().fromArray(spec.target));
    camera.updateMatrixWorld();
    for (const lane of state.finishOptions) {
      for (const x of [lane.x - lane.width / 2, lane.x + lane.width / 2]) {
        for (const y of [lane.y - lane.height / 2, lane.y + lane.height / 2]) {
          const p = new THREE.Vector3().fromArray(worldPointFromSimulation(x, y, -0.1)).project(camera);
          const sx = (p.x + 1) * width / 2, sy = (1 - p.y) * height / 2;
          assert.ok(sx >= 36 && sx <= width - 36 && sy >= 100 && sy <= height - 80, `${lane.id} clipped at ${sx},${sy}`);
        }
      }
    }
  });
}
