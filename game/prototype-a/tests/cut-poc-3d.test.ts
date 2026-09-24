import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  CUTTABLE_KINDS,
  BLADE_ASSET,
  BLADE_FEEL,
  FALLING_PIECE_PHYSICS,
  CutPocController,
  OBLIQUE_CAMERA,
  capVisibilityScore,
  createFallingPieceMotion,
  createCutTransition,
  quantizeCutAngle,
  sampleFallingPieceMotion,
  stepFallingPieceMotion,
} from '../src/cut-poc-3d-core';
import { DIORAMA_SKIN } from '../src/poc-3d-skin';

test('diorama skin is original, mobile-budgeted and covers every visible surface family', () => {
  assert.equal(DIORAMA_SKIN.id, 'fresh-a-bitmap-v1');
  assert.equal(DIORAMA_SKIN.provenance, 'ai-generated-original');
  assert.deepEqual(
    DIORAMA_SKIN.textures.map((texture) => texture.id),
    ['a-crate-basecolor', 'a-log-basecolor', 'a-knife-basecolor', 'a-crystal-basecolor'],
  );
  assert.ok(DIORAMA_SKIN.textures.every((texture) => texture.size <= 512));
  assert.ok(DIORAMA_SKIN.textures.every((texture) => texture.uvLayout === 'quadrant-2x2'));
  assert.ok(DIORAMA_SKIN.textures.every((texture) => !('url' in texture)), 'skin must not pull unreviewed external images');
  assert.deepEqual(
    Object.keys(DIORAMA_SKIN.materials).sort(),
    ['bark', 'blade', 'crate', 'crystal', 'ground', 'platform', 'woodCap'].sort(),
  );
  assert.ok(DIORAMA_SKIN.materials.blade.metalness >= 0.8);
  assert.ok(DIORAMA_SKIN.materials.crystal.clearcoat >= 0.7);
  assert.ok(DIORAMA_SKIN.materials.bark.roughness >= 0.85);
});

test('A-BASECOLOR-POC-004 the UV cut POC consumes the same formal bitmap atlases instead of procedural target textures', async () => {
  const source = await readFile('src/poc-3d.ts', 'utf8');
  assert.match(source, /createAStyleTextureSet/);
  assert.match(source, /maps\.crate\.(outer|band|cap)/);
  assert.match(source, /maps\.log\.(bark|end|cap)/);
  assert.match(source, /maps\.knife\.(blade|handle)/);
  assert.match(source, /maps\.crystal\.(outer|frost|cap)/);
  assert.doesNotMatch(source, /const (woodGrainTexture|barkTexture|layeredWoodTexture|growthRingTexture|crystalCoreTexture)\s*=\s*makeCanvasTexture/);
});

test('selected curved blade and feedback profile read as a fast sharp cut', () => {
  assert.equal(BLADE_ASSET.format, 'glb');
  assert.equal(BLADE_ASSET.dracoCompressed, true);
  assert.equal(BLADE_ASSET.silhouette, 'curved-saber');
  assert.equal(BLADE_ASSET.edgeTreatment, 'additive-curve-rim');
  assert.ok(BLADE_FEEL.feedbackLayers.length >= 5);
  assert.ok(BLADE_FEEL.windupMs <= 90);
  assert.ok(BLADE_FEEL.strikeMs <= 120);
  assert.ok(BLADE_FEEL.hitStopMs >= 35 && BLADE_FEEL.hitStopMs <= 80);
  assert.ok(BLADE_FEEL.trailMs > BLADE_FEEL.strikeMs);
  assert.ok(BLADE_FEEL.particleCount >= 16);
  assert.ok(BLADE_FEEL.cameraTrauma > 0.2 && BLADE_FEEL.cameraTrauma < 0.5);
});

test('quantizes arbitrary cuts into eight stable directions', () => {
  assert.deepEqual(quantizeCutAngle(0), { bin: 0, radians: 0 });
  assert.equal(quantizeCutAngle(Math.PI * 2 - 0.01).bin, 0);
  assert.equal(quantizeCutAngle(Math.PI / 2).bin, 2);
  assert.equal(quantizeCutAngle(Math.PI).bin, 4);
  assert.equal(quantizeCutAngle(-Math.PI / 2).bin, 6);
});

test('every supported target creates two capped pieces that separate in depth', () => {
  for (const kind of CUTTABLE_KINDS) {
    const transition = createCutTransition(kind, Math.PI / 5);
    assert.equal(transition.pieces.length, 2, `${kind} must split into two pieces`);
    assert.equal(transition.cut.bin, 1);
    assert.ok(transition.pieces.every((piece) => piece.capMaterial.length > 0));
    assert.ok(transition.pieces.every((piece) => piece.capSide === 'front' || piece.capSide === 'back'));
    assert.ok(transition.pieces[0]!.offset[2] < 0);
    assert.ok(transition.pieces[1]!.offset[2] > 0);
    assert.ok(transition.pieces[0]!.rotation[1] * transition.pieces[1]!.rotation[1] < 0);
    assert.ok(Math.abs(transition.pieces[0]!.offset[0]) >= 0.3, 'halves must separate laterally for the oblique camera');
    assert.ok(transition.pieces[1]!.rotation[1] > Math.PI * 0.8, 'near half must turn its inner cap toward camera');
  }
});

test('cut halves launch outward, leave the platform edges and settle on the ground', () => {
  for (const kind of CUTTABLE_KINDS) {
    const transition = createCutTransition(kind, 0);
    const [negativePiece, positivePiece] = transition.pieces;
    assert.ok(negativePiece.launchVelocity[0] < 0 && positivePiece.launchVelocity[0] > 0);
    assert.ok(negativePiece.launchVelocity[2] < 0 && positivePiece.launchVelocity[2] > 0);
    assert.ok(negativePiece.launchVelocity[1] > 0 && positivePiece.launchVelocity[1] > 0);

    const earlyNegative = sampleFallingPieceMotion(kind, negativePiece, 0.18);
    const earlyPositive = sampleFallingPieceMotion(kind, positivePiece, 0.18);
    assert.ok(earlyNegative.position[0] < 0 && earlyPositive.position[0] > 0);
    assert.ok(earlyNegative.position[2] < 0 && earlyPositive.position[2] > 0);
    assert.ok(earlyNegative.position[1] > 0 && earlyPositive.position[1] > 0, `${kind} should arc before falling`);

    const settledNegative = sampleFallingPieceMotion(kind, negativePiece, 2.4);
    const settledPositive = sampleFallingPieceMotion(kind, positivePiece, 2.4);
    for (const settled of [settledNegative, settledPositive]) {
      assert.ok(settled.groundedSurface === 'platform' || settled.groundedSurface === 'ground');
      const floor = settled.groundedSurface === 'platform'
        ? FALLING_PIECE_PHYSICS.platformFloorOffset[kind]
        : FALLING_PIECE_PHYSICS.groundFloorOffset[kind];
      assert.ok(settled.position[1] <= floor + 1e-6);
      assert.ok(Math.abs(settled.velocity[1]) < 0.01);
    }
  }
});

test('cut direction and contact point shape each half trajectory and spin', () => {
  const horizontal = createCutTransition('crate', 0, { x: -0.4, y: 0.2, z: 0 });
  const vertical = createCutTransition('crate', Math.PI / 2, { x: 0.4, y: -0.2, z: 0 });
  assert.notDeepEqual(horizontal.pieces.map((piece) => piece.launchVelocity), vertical.pieces.map((piece) => piece.launchVelocity));
  assert.notDeepEqual(horizontal.pieces.map((piece) => piece.angularVelocity), vertical.pieces.map((piece) => piece.angularVelocity));
  assert.ok(horizontal.pieces[0]!.launchVelocity[0] < 0 && horizontal.pieces[1]!.launchVelocity[0] > 0);
  assert.ok(vertical.pieces[0]!.launchVelocity[1] < vertical.pieces[1]!.launchVelocity[1]);
});

test('falling-piece presentation preserves the authored cut twist at impact', () => {
  for (const kind of CUTTABLE_KINDS) {
    const piece = createCutTransition(kind, Math.PI / 5).pieces[0];
    assert.deepEqual(sampleFallingPieceMotion(kind, piece, 0).rotation, piece.rotation);
  }
});

test('cut halves have a readable weighted arc instead of an explosive sideways launch', () => {
  const piece = createCutTransition('crate', 0).pieces[0];
  const early = sampleFallingPieceMotion('crate', piece, 0.36);
  assert.ok(Math.abs(early.position[0]) < 0.35, 'lateral separation must stay readable during the first third-second');
  assert.ok(Math.abs(early.position[2]) < 0.62, 'depth separation must stay readable during the first third-second');
  assert.ok(early.position[1] > 0.05, 'piece should still be visibly airborne before its weighted fall');
  assert.ok(Math.max(...early.rotation.map(Math.abs)) < 1.2, 'piece should not spin like a pinwheel immediately');
});

test('falling-piece integration is fixed-step and matches explicit 60 Hz stepping', () => {
  const piece = createCutTransition('crate', 0).pieces[0];
  let stepped = createFallingPieceMotion('crate', piece);
  for (let frame = 0; frame < 72; frame += 1) stepped = stepFallingPieceMotion('crate', piece, stepped);
  const sampled = sampleFallingPieceMotion('crate', piece, 72 * FALLING_PIECE_PHYSICS.fixedStepSeconds);
  assert.deepEqual(stepped, sampled);
});

test('oblique orthographic camera exposes thickness and the cut cap', () => {
  assert.equal(OBLIQUE_CAMERA.projection, 'orthographic');
  assert.ok(OBLIQUE_CAMERA.position[1] > OBLIQUE_CAMERA.target[1], 'camera must look slightly downward');
  assert.ok(OBLIQUE_CAMERA.position[2] > 0, 'camera must be offset from the gameplay plane');
  assert.ok(capVisibilityScore(OBLIQUE_CAMERA, [0, 0, 1]) >= 0.7, 'cross-section must substantially face the camera');
});

test('online Kenney GLB assets and bundled license remain hash pinned', async () => {
  const expected = new Map([
    ['public/assets/kenney-nature/tree_simple.glb', '93891ea740447634930de19c31a7c1c9f4add94122e6db03aca9f75aea32f9d6'],
    ['public/assets/kenney-nature/log_stack.glb', '90eaae4a01ba1f25c2f0c6d83087e4a7a8fac684f2452615245333968d118d68'],
    ['public/assets/kenney-nature/License.txt', 'cb96b75e3560ac78d7a53ce6f083f4cdb5c53faea6141b62d63458dcfe1e4b9d'],
  ]);
  for (const [path, sha256] of expected) {
    const bytes = await readFile(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, path);
  }
});

test('selected online sword and local Three.js Draco decoder remain hash pinned', async () => {
  const expected = new Map([
    ['public/assets/cc0-weapon/sword-6.glb', '273c7133513bdcf619abb24ffe44e8c642b48f993d8baeb7a6de0473955d488c'],
    ['public/assets/draco/draco_decoder.wasm', 'a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac'],
    ['public/assets/draco/draco_wasm_wrapper.js', '8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6'],
  ]);
  for (const [path, sha256] of expected) {
    const bytes = await readFile(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, path);
  }
});

test('3D POC page declares the isolated cut-cross-section entrypoint', async () => {
  const html = await readFile('poc-3d.html', 'utf8');
  assert.match(html, /data-poc=["']cut-cross-section["']/);
  assert.match(html, /src=["']\/src\/poc-3d\.ts["']/);
  assert.match(html, /木箱/);
  assert.match(html, /原木/);
  assert.match(html, /水晶/);
});

test('one action cuts and the next action advances through all three targets', () => {
  const controller = new CutPocController();
  assert.deepEqual(controller.getState(), { kind: 'crate', index: 0, phase: 'intact', cutCount: 0, cut: null });

  const crateCut = controller.act(Math.PI / 5);
  assert.equal(crateCut.phase, 'cut');
  assert.equal(crateCut.kind, 'crate');
  assert.equal(crateCut.cut?.pieces.length, 2);

  assert.deepEqual(controller.act(), { kind: 'log', index: 1, phase: 'intact', cutCount: 1, cut: null });
  controller.act(Math.PI / 2);
  assert.deepEqual(controller.act(), { kind: 'crystal', index: 2, phase: 'intact', cutCount: 2, cut: null });
  controller.act(Math.PI);
  assert.deepEqual(controller.act(), { kind: 'crate', index: 0, phase: 'intact', cutCount: 3, cut: null });
});
