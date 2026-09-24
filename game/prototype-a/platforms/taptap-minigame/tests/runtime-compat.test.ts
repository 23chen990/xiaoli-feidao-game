import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'assets/scripts/GameBootstrap.ts'), 'utf8');

test('OPPO launch contract records native host ownership and package entrypoints', () => {
  const contract = JSON.parse(readFileSync(path.join(root, 'runtime-contract.json'), 'utf8'));
  assert.equal(contract.hostActivity, 'com.taptap.instantgame.container.InstantGameActivity');
  assert.equal(contract.hostActivityOwner, 'TapTap Android container');
  assert.deepEqual(contract.packageRootEntrypoints, ['game.js', 'game.json', 'project.config.json']);
  assert.equal(contract.requiresExactShaDeviceRerun, true);
});

test('vivo scene construction avoids runtime MeshRenderer and Material activation', () => {
  assert.doesNotMatch(source, /\bMeshRenderer\b|\bMaterial\b|\bprimitives\b|\butils\.createMesh\b/);
  assert.match(source, /\bGraphics\b/);
  assert.match(source, /redrawStaticCourse\(/);
  assert.match(source, /redrawDynamicCourse\(/);
});

test('portrait runtime uses a 390x844 fixed-width design and safe-area layout', () => {
  const build = JSON.parse(readFileSync(path.join(root, 'cocos-build-config.json'), 'utf8'));
  const project = JSON.parse(readFileSync(path.join(root, 'settings/v2/packages/project.json'), 'utf8'));
  assert.equal(build.exactFitScreen, undefined);
  assert.deepEqual(build.designResolution, {
    width: 390, height: 844, fitWidth: true, fitHeight: false, policy: 4,
  });
  assert.deepEqual(project.general.designResolution, {
    width: 390, height: 844, fitWidth: true, fitHeight: false,
  });
  assert.match(source, /setDesignResolutionSize\(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy\.FIXED_WIDTH\)/);
  assert.match(source, /screen\.safeArea/);
  assert.match(source, /exactFitScreen[^\n]*false/);
});

test('first frame draws a non-monochrome, non-empty visible field', () => {
  assert.match(source, /FIRST_FRAME_PALETTE/);
  assert.match(source, /graphics\.fill\(\)/);
  assert.match(source, /graphics\.stroke\(\)/);
  assert.match(source, /drawFirstFrameBackground\(/);
});
