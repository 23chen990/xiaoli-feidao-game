import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CATALOG, LEVEL_CATALOG_SCHEMA, courseCoreTrace, getLevelDefinition } from '../src/game-levels';
import { createCourse, SliceSimulation } from '../src/game-core';
import { MECHANICS_DEMO_THEME } from '../src/theme';

test('LEVEL-CATALOG-RED-001 catalog strictly validates twelve sequential original levels', () => {
  assert.deepEqual(LEVEL_CATALOG_SCHEMA.parse(LEVEL_CATALOG), LEVEL_CATALOG);
  assert.equal(LEVEL_CATALOG.version, 1);
  assert.equal(LEVEL_CATALOG.levels.length, 12);
  assert.deepEqual(LEVEL_CATALOG.levels.map((level) => level.number), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(new Set(LEVEL_CATALOG.levels.map((level) => level.id)).size, 12);
  assert.ok(LEVEL_CATALOG.levels.every((level) => level.expression === 'original'));
});

test('LEVEL-CATALOG-RED-002 every level has a distinct authored relationship and a completable structural path', () => {
  const featured = new Set<string>();
  const signatures = new Set<string>();
  for (const level of LEVEL_CATALOG.levels) {
    assert.ok(level.targetDurationSeconds[0] >= 20);
    assert.ok(level.targetDurationSeconds[1] <= 45);
    assert.ok(level.finishX > level.start.x);
    assert.ok(level.finishOptions.length >= 2);
    assert.ok(level.mechanicTags.length >= 2);
    assert.ok(level.requiredRelations.length >= 1);
    assert.ok(level.completionPath.length >= 2);
    assert.equal(level.completionPath[0]?.x, level.start.x);
    assert.equal(level.completionPath.at(-1)?.x, level.finishX);
    assert.ok(level.completionPath.every((point, index, path) => index === 0 || point.x > path[index - 1]!.x));
    assert.ok(level.completionPath.every((point) => point.y > 90 && point.y < 680));
    assert.ok(!featured.has(level.featuredMechanic), `duplicate featured mechanic: ${level.featuredMechanic}`);
    featured.add(level.featuredMechanic);
    const signature = JSON.stringify({
      sigils: level.sigils.map(({ x, y, radius }) => [x, y, radius]),
      blocks: level.blocks.map(({ x, y, width, height, placement, dualRole, supportedBy }) => [x, y, width, height, placement, dualRole, supportedBy]),
      supports: level.supports.map(({ x, y, width, height, motion, sourceBlockId }) => [x, y, width, height, motion, sourceBlockId]),
      spikes: level.spikes.map(({ x, y, width, height }) => [x, y, width, height]),
      finish: level.finishOptions.map(({ kind, y, height, operation, operand }) => [kind, y, height, operation, operand]),
    });
    assert.ok(!signatures.has(signature), `level ${level.number} only duplicates an existing structure`);
    signatures.add(signature);
  }
  assert.equal(featured.size, 12);
  assert.ok(new Set(LEVEL_CATALOG.levels.map((level) => level.family)).size >= 4);
});

test('LEVEL-CATALOG-RED-003 recommended progression maps teach, movement, chains and synthesis to 1-3, 4-6, 7-9 and 10-12', () => {
  assert.deepEqual(LEVEL_CATALOG.levels.map((level) => level.family), [
    'fundamentals', 'fundamentals', 'fundamentals',
    'moving-supports', 'moving-supports', 'moving-supports',
    'cut-chains', 'cut-chains', 'cut-chains',
    'synthesis', 'synthesis', 'synthesis',
  ]);
  assert.deepEqual(getLevelDefinition(1).courseSegments.map((segment) => segment.role), ['teach', 'develop', 'test']);
  assert.ok(getLevelDefinition(4).supports.some((support) => support.motion?.axis === 'x'));
  assert.ok(getLevelDefinition(6).supports.some((support) => support.motion?.axis === 'y'));
  assert.ok(getLevelDefinition(7).sigils.length >= 7);
  assert.ok(getLevelDefinition(10).blocks.some((block) => block.supportedBy));
  assert.ok(getLevelDefinition(12).blocks.some((block) => block.dualRole));
});

test('LEVEL-CATALOG-RED-004 courses are deterministic per seed and level while Level 1 preserves the accepted demo fixtures', () => {
  assert.deepEqual(createCourse(31, 12), createCourse(31, 12));
  assert.notDeepEqual(createCourse(31, 4), createCourse(31, 7));
  const first = createCourse(31, 1);
  assert.ok(first.supports.some((support) => support.id === 'white-column'));
  assert.ok(first.blocks.some((block) => block.id === 'dual-bridge'));
  assert.ok(first.blocks.some((block) => block.id === 'tower-middle'));
});

test('LEVEL-CATALOG-RED-006 Level 1 presents an original vertical cut-chain with a readable side reward beat', () => {
  const level = getLevelDefinition(1);
  const tower = level.blocks.filter((block) => block.placement === 'tower');
  const rewardShelf = level.supports.find((support) => support.id === 'level1-reward-shelf');
  const rewardToken = level.sigils.find((sigil) => sigil.id === 'level1-reward-token');
  assert.ok(tower.length >= 3, 'the opening level should read as a vertical cut-chain');
  assert.ok(tower.every((block) => block.supportedBy || block.id === 'tower-base'));
  assert.ok(rewardShelf, 'the side reward beat needs a visible landing shelf');
  assert.ok(rewardToken, 'the side reward beat needs a visible collectible');
  assert.ok(rewardToken!.x > rewardShelf!.x && rewardToken!.x < rewardShelf!.x + rewardShelf!.width + 120);
  assert.ok(Math.abs(rewardToken!.y - (rewardShelf!.y - rewardShelf!.height / 2 - rewardToken!.radius)) < 16);
});

test('LEVEL-CATALOG-RED-007 Level 1 preserves teaching targets then real stacked support interactions', () => {
  const level = getLevelDefinition(1);
  const ladderStacks = level.blocks.filter((block) => block.id === 'level1-ladder-stack-a' || block.id === 'level1-ladder-stack-b');
  const opening = level.sigils.filter((sigil) => sigil.x < Math.min(...ladderStacks.map((stack) => stack.x))).sort((a, b) => a.x - b.x);
  const hazard = level.spikes.find((spike) => spike.id === 'spike-high');
  const lateCollectible = level.sigils.find((sigil) => sigil.id === 'level1-hazard-approach-token');
  assert.ok(opening.length >= 5, 'opening route needs a continuous collectible line');
  assert.ok(opening.every((sigil, index) => index === 0 || sigil.x > opening[index - 1]!.x));
  assert.equal(ladderStacks.length, 2, 'mid-route needs two distinct stacked obstacle groups');
  for (const stack of ladderStacks) {
    const parent = level.blocks.find((block) => block.id === stack.supportedBy);
    assert.ok(parent, 'each stack must be held by an actual cuttable parent');
    assert.notEqual(stack.collidable, false);
    assert.notEqual(parent.collidable, false);
    assert.equal(stack.y + stack.height / 2, parent.y - parent.height / 2);
    assert.ok(Math.abs(stack.x - parent.x) < (stack.width + parent.width) / 2);
  }
  assert.ok(hazard && lateCollectible && lateCollectible.x < hazard.x, 'a collectible must telegraph the spike approach');
  assert.ok(hazard!.x < level.finishX - 240, 'the spike must precede the finish wall by a readable runway');
});

test('LEVEL-CATALOG-RED-008 Level 1 tabletop items are supported and include intentional overlap', () => {
  const level = getLevelDefinition(1);
  const surfaces = [
    ...level.supports.map((surface) => ({ id: surface.id, x: surface.x, width: surface.width, top: surface.y - surface.height / 2 })),
    ...level.blocks.map((surface) => ({ id: surface.id, x: surface.x, width: surface.width, top: surface.y - surface.height / 2 })),
  ];
  const supported = level.sigils.filter((item) => surfaces.some((surface) => {
    const overlapsX = Math.abs(item.x - surface.x) <= surface.width / 2 + item.radius;
    const gap = surface.top - (item.y + item.radius);
    return overlapsX && gap >= -4 && gap <= 18;
  }));
  assert.ok(supported.length >= 6, `only ${supported.length} Level 1 items are tabletop-supported`);
  const overlapPair = level.sigils.find((a, index) => level.sigils.slice(index + 1).some((b) => {
    const aRight = a.x + a.radius;
    return Math.max(a.x - a.radius, b.x - b.radius) < Math.min(aRight, b.x + b.radius);
  }));
  assert.ok(overlapPair, 'Level 1 needs an intentional horizontal overlap pair');
});

test('LEVEL-CATALOG-RED-009 Level 1 presentation contract has a bright runway and fruit-like target cadence', () => {
  const level = getLevelDefinition(1);
  assert.ok(level.supports.some((support) => support.id === 'level1-runway-main' && support.width >= 700), 'Level 1 needs a long white runway surface');
  assert.ok(level.sigils.some((sigil) => sigil.foodStyle === 'apple') && level.sigils.some((sigil) => sigil.foodStyle === 'banana'), 'Level 1 needs contrasting fruit silhouettes');
  assert.ok(level.blocks.some((block) => block.id === 'level1-rainbow-step-a' && block.width <= 80), 'Level 1 needs compact colorful step obstacles');
});

test('LEVEL-CATALOG-RED-010 Level 1 tabletop bases terminate at the shared ground plane', () => {
  const level = getLevelDefinition(1);
  const groundedIds = new Set(['level1-runway-main', 'opening-table-a', 'opening-table-b', 'bridge-table', 'lift-table', 'tower-table', 'late-table']);
  const grounded = level.supports.filter((support) => groundedIds.has(support.id));
  assert.equal(grounded.length, groundedIds.size);
  assert.ok(grounded.every((support) => support.y + support.height / 2 < level.worldBottom), 'tabletops need visible base volume down to the ground plane');
  assert.ok(grounded.every((support) => support.width >= 100), 'grounded tabletop bases must be readable platforms, not slivers');
});

test('LEVEL-CATALOG-RED-005 same seed and input produce the same core trace across theme replacement', () => {
  const baseline = new SliceSimulation(44, 12);
  baseline.act('flip');
  const baselineTrace = [courseCoreTrace(baseline.getState())];
  for (let index = 0; index < 180; index += 1) {
    if (index === 48 || index === 104) baseline.act('flip');
    baselineTrace.push(courseCoreTrace(baseline.step(1 / 120)));
  }

  const replacement = structuredClone(MECHANICS_DEMO_THEME);
  replacement.css.background = '#ffffff';
  replacement.copy.title = 'Replaceable Placeholder';
  const themed = new SliceSimulation(44, 12);
  themed.act('flip');
  const themedTrace = [courseCoreTrace(themed.getState())];
  for (let index = 0; index < 180; index += 1) {
    if (index === 48 || index === 104) themed.act('flip');
    themedTrace.push(courseCoreTrace(themed.step(1 / 120)));
  }
  assert.notEqual(replacement.css.background, MECHANICS_DEMO_THEME.css.background);
  assert.deepEqual(themedTrace, baselineTrace);
});

test('later levels make hazards move while early levels keep a readable fixed hazard', () => {
  const early = LEVEL_CATALOG.levels[0]!;
  const later = LEVEL_CATALOG.levels[6]!;
  assert.equal(early.spikes.every((spike) => !spike.motion), true);
  assert.equal(later.spikes.some((spike) => Boolean(spike.motion)), true);
});
