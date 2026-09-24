import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SliceSimulation } from '../src/game-core';
import {
  FORMAL_CUT_ASSET_CONTRACT,
  MAIN_3D_RESOURCE_CONTRACT,
  type CuttablePresentation,
  ThreePresentationModel,
  capFacingScore,
  createCameraSpec,
  cameraLeadSimulation,
  createFogSpec,
  knifeTransformFromState,
  summarizePerformance,
  worldPointFromSimulation,
  sigilCutMotion,
} from '../src/three-presentation';
import { CutVisualEntity, ProgrammaticOriginalProvider, ThreeCutVisualManager, createSharedCutResources, disposeSharedCutResources } from '../src/three-cut-visuals';
import { GROUND_VISUAL_TOP_Y } from '../src/three-presentation';
import * as THREE from 'three';

test('3D-MAIN-RESOURCE-001 declares only original programmatic runtime resources', () => {
  assert.equal(MAIN_3D_RESOURCE_CONTRACT.runtimeKind, 'PROGRAMMATIC_ORIGINAL');
  assert.deepEqual(MAIN_3D_RESOURCE_CONTRACT.externalAssets, []);
  assert.equal(MAIN_3D_RESOURCE_CONTRACT.glbLoadedAtRuntime, false);
  assert.equal(MAIN_3D_RESOURCE_CONTRACT.dracoLoadedAtRuntime, false);
  assert.match(MAIN_3D_RESOURCE_CONTRACT.futureFormalAssetContract, /Blender.*GLB.*intact.*halfA.*halfB.*capMaterial/i);
  assert.deepEqual(FORMAL_CUT_ASSET_CONTRACT, {
    sourceBlend: null,
    lowPolyGlb: null,
    intact: null,
    halfA: null,
    halfB: null,
    capMaterial: null,
    status: 'NOT_PRODUCED',
  });
  const provider = new ProgrammaticOriginalProvider();
  assert.equal(provider.kind, 'PROGRAMMATIC_ORIGINAL');
  assert.equal(provider.formalAssetContract.status, 'NOT_PRODUCED');
});

test('3D-MAIN-CAMERA-002 uses a low-FOV oblique perspective while gameplay stays on one plane', () => {
  const camera = createCameraSpec(1180, 720);
  const portrait = createCameraSpec(390, 844);
  assert.equal(camera.projection, 'perspective');
  assert.ok(camera.fov >= 20 && camera.fov <= 34);
  assert.ok(camera.position[2] > 0 && camera.position[1] > camera.target[1]);
  assert.ok(portrait.position[2] > camera.position[2] * 1.5, 'portrait view must preserve the horizontal reaction corridor');
  const portraitFog = createFogSpec(390, 844);
  assert.ok(portraitFog.near >= portrait.position[2], 'portrait gameplay must not be obscured by distance fog');
  assert.ok(portraitFog.far >= portraitFog.near + 30);
  const point = worldPointFromSimulation(700, 350);
  assert.equal(point[2], 0);
});

test('3D-MAIN-CAMERA-003 reduces portrait camera lead so the startup knife remains inside the viewport', () => {
  assert.equal(cameraLeadSimulation(390, 844), 120);
  assert.equal(cameraLeadSimulation(1180, 720), 255);
});

test('3D-CUT-FALL-010 simulation floor and rendered ground share the same top plane', () => {
  assert.equal(GROUND_VISUAL_TOP_Y, worldPointFromSimulation(0, 700)[1]);
});

test('3D-MAIN-KNIFE-003 maps the deterministic player pose to a thick 3D rig transform', () => {
  const simulation = new SliceSimulation(31);
  simulation.act('flip');
  simulation.step(0.35);
  const state = simulation.getState();
  const transform = knifeTransformFromState(state);
  const world = worldPointFromSimulation(state.player.x, state.player.y);
  assert.deepEqual(transform.position, world);
  assert.equal(transform.rotationZ, -state.player.angle);
  assert.ok(transform.depth > 0);
});

test('A-BASECOLOR-003 presentation deterministically covers crate, log and crystal skins without changing collision kinds', () => {
  const frame = new ThreePresentationModel().sync(new SliceSimulation(31).getState());
  const visuals = frame.cuttables as Array<(typeof frame.cuttables)[number] & { skinKind?: string }>;
  assert.deepEqual(new Set(visuals.map(({ skinKind }) => skinKind)), new Set(['crate', 'log', 'crystal']));
  const sigils = visuals.filter(({ kind }) => kind === 'sigil');
  assert.ok(sigils.some(({ foodStyle, skinKind }) => foodStyle === 'banana' && skinKind === 'log'));
  assert.ok(sigils.some(({ foodStyle, skinKind }) => foodStyle === 'apple' && skinKind === 'crystal'));
  assert.ok(sigils.some(({ foodStyle, skinKind }) => foodStyle === 'coconut' && skinKind === 'crate'));
  assert.ok(visuals.filter(({ kind }) => kind === 'block').every(({ skinKind }) => skinKind === 'crate' || skinKind === 'log'));
});

test('dessert level cuttables use a dessert skin in intact and cut phases', () => {
  const simulation = new SliceSimulation(42, 4);
  const presentation = new ThreePresentationModel();
  const intact = presentation.sync(simulation.getState());
  const dessertIntact = intact.cuttables.filter((visual) => visual.foodStyle === 'cake' || visual.foodStyle === 'pastry' || visual.foodStyle === 'cheesecake');
  assert.ok(dessertIntact.length >= 3);
  assert.ok(dessertIntact.every((visual) => visual.skinKind === 'dessert'));

  const target = simulation.getState().sigils[0]!;
  simulation.act('flip');
  simulation.debugSetBladePose(target.x - 38, target.y, 0);
  simulation.debugSetVelocity(0, 0);
  simulation.step(1 / 120);
  const cut = presentation.sync(simulation.getState()).cuttables.find((visual) => visual.id === target.id)!;
  assert.equal(cut.phase, 'cut');
  assert.equal(cut.skinKind, 'dessert');
  assert.equal(cut.halves.length, 2);
});

test('cut half meshes use one-sided silhouettes and cropped dessert icing for each authored skin', () => {
  const resources = createSharedCutResources();
  const makeVisual = (skinKind: 'dessert' | 'log' | 'crate', foodStyle: 'cake' | 'banana' | 'dumpling'): CuttablePresentation => ({
    id: `geometry-${skinKind}`,
    kind: skinKind === 'dessert' ? 'sigil' : 'block',
    skinKind,
    foodStyle,
    phase: 'cut',
    position: [0, 0, 0],
    width: 2,
    height: 2,
    depth: 1,
    radius: skinKind === 'dessert' ? 1 : null,
    falling: true,
    rotationZ: 0,
    halves: [
      { id: 'halfA', position: [-0.5, 0, 0], rotationZ: 0, rotationDepth: 0, capMaterialId: 'cap-a', closedGeometry: true },
      { id: 'halfB', position: [0.5, 0, 0], rotationZ: 0, rotationDepth: 0, capMaterialId: 'cap-b', closedGeometry: true },
    ],
  });
  const assertOneSided = (geometry: THREE.BufferGeometry, side: 'A' | 'B') => {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    if (side === 'A') assert.ok(bounds.max.x <= 1e-4, `halfA geometry must end at the cut plane (max.x=${bounds.max.x})`);
    else assert.ok(bounds.min.x >= -1e-4, `halfB geometry must start at the cut plane (min.x=${bounds.min.x})`);
  };
  for (const [skinKind, foodStyle] of [['dessert', 'cake'], ['log', 'banana'], ['crate', 'dumpling']] as const) {
    const entity = new CutVisualEntity(makeVisual(skinKind, foodStyle), resources);
    for (const [index, side] of [[0, 'A'], [1, 'B']] as const) {
      const halfRoot = entity.root.children[index + 1] as THREE.Group;
      assertOneSided((halfRoot.children[0] as THREE.Mesh).geometry, side);
      if (skinKind === 'dessert') {
        const icing = halfRoot.children.find((child) => child.name.startsWith('dessert-icing:')) as THREE.Mesh;
        assert.ok(icing, 'dessert half should retain an icing accent');
        assert.equal(icing.geometry, (halfRoot.children[0] as THREE.Mesh).geometry, 'icing must share the dessert half silhouette');
        assertOneSided(icing.geometry, side);
      }
      const cap = halfRoot.children.find((child) => child.name.startsWith('capMaterial:')) as THREE.Mesh;
      if (skinKind === 'dessert' || skinKind === 'log') {
        assert.equal(cap.visible, false, `${skinKind} must not render a detached generic cap overlay`);
      }
      const capNormal = new THREE.Vector3(0, 0, 1).applyEuler(cap.rotation);
      assert.ok(Math.abs(capNormal.x) > 0.99, `${skinKind} cut cap must seal the X-axis split plane`);
    }
    entity.dispose();
  }
  disposeSharedCutResources(resources);
});

test('runtime cut facts expose skin identity and falling-to-landed lifecycle', () => {
  const simulation = new SliceSimulation(42, 4);
  const target = simulation.getState().sigils.find((sigil) => sigil.id === 'l4-entry')!;
  simulation.act('flip');
  simulation.debugSetBladePose(target.x - 38, target.y, 0);
  simulation.debugSetVelocity(0, 0);
  simulation.step(0.05);
  const presentation = new ThreePresentationModel();
  const manager = new ThreeCutVisualManager(new ProgrammaticOriginalProvider());
  const fallingFrame = presentation.sync(simulation.getState());
  manager.sync(fallingFrame);
  const fallingFacts = manager.facts().find((fact) => fact.id === 'l4-entry')!;
  assert.equal(fallingFacts.skinKind, 'dessert');
  assert.equal(fallingFacts.lifecycle, 'falling');
  manager.sync({ ...fallingFrame, cuttables: fallingFrame.cuttables.map((visual) => ({ ...visual, falling: false })) });
  const landedFacts = manager.facts().find((fact) => fact.id === 'l4-entry')!;
  assert.equal(landedFacts.lifecycle, 'landed');
  manager.dispose();
});

test('A-CUT-FEEL-007 sigil halves ease apart, arc briefly, then settle below the cut line', () => {
  const early = sigilCutMotion(0.12, -1);
  const mid = sigilCutMotion(0.42, -1);
  const late = sigilCutMotion(1.2, -1);
  assert.ok(Math.abs(early.position[0]) < 0.3);
  assert.ok(early.position[1] > -0.03, 'freshly cut half should not snap downward');
  assert.ok(mid.position[1] < early.position[1], 'gravity should take over after the short arc');
  assert.ok(late.position[1] >= -1.11, 'falling visual must settle at a bounded floor');
  assert.ok(Math.abs(mid.position[2]) > Math.abs(early.position[2]));
});

test('3D-MAIN-CUT-004 creates one idempotent capped half pair for a real cut event', () => {
  const simulation = new SliceSimulation(85);
  const block = simulation.getState().blocks.find((candidate) => candidate.placement === 'above')!;
  simulation.act('flip');
  simulation.debugSetBladePose(block.x - 38, block.y, 0);
  simulation.debugSetVelocity(0, 0);
  simulation.step(1 / 120);
  const state = simulation.getState();
  const presentation = new ThreePresentationModel();
  const first = presentation.sync(state);
  const second = presentation.sync(state);
  const visual = first.cuttables.find((candidate) => candidate.id === block.id)!;
  assert.equal(visual.phase, 'cut');
  assert.equal(visual.halves.length, 2);
  assert.notEqual(visual.halves[0].capMaterialId, visual.halves[1].capMaterialId);
  assert.ok(visual.halves.every((half) => half.closedGeometry));
  assert.equal(second.newCutIds.length, 0);
  assert.deepEqual(second.cuttables.find((candidate) => candidate.id === block.id), visual);
});

test('3D-MAIN-CAP-005 both cap normals remain visible from the oblique camera', () => {
  const camera = createCameraSpec(390, 844);
  assert.ok(capFacingScore(camera, [0, 0, 1]) > 0.2);
  assert.ok(capFacingScore(camera, [0, 0, -1]) > 0.2);
});

test('3D-MAIN-STRUCTURE-006 preserves per-segment identity and maps fragment separation into depth', () => {
  const simulation = new SliceSimulation(87);
  simulation.debugCutBlock('tower-middle');
  simulation.step(0.25);
  const frame = new ThreePresentationModel().sync(simulation.getState());
  const middle = frame.cuttables.find((candidate) => candidate.id === 'tower-middle')!;
  const top = frame.cuttables.find((candidate) => candidate.id === 'tower-top')!;
  assert.equal(middle.phase, 'cut');
  assert.equal(top.falling, true);
  assert.equal(top.rotationZ, -simulation.getState().blocks.find((block) => block.id === 'tower-top')!.angle);
  assert.ok(middle.halves[0].position[2] * middle.halves[1].position[2] < 0);
});

test('3D-MAIN-CAP-NORMAL-009 reports each cap actual transformed world normal', () => {
  const simulation = new SliceSimulation(87);
  simulation.debugCutBlock('tower-middle');
  simulation.step(0.3);
  const frame = new ThreePresentationModel().sync(simulation.getState());
  const camera = new THREE.PerspectiveCamera(28, 390 / 844, 0.1, 90);
  camera.position.fromArray(createCameraSpec(390, 844).position);
  camera.lookAt(new THREE.Vector3().fromArray(createCameraSpec(390, 844).target));
  camera.updateMatrixWorld(true);
  const manager = new ThreeCutVisualManager(new ProgrammaticOriginalProvider());
  manager.sync(frame);
  const visual = manager.facts(camera).find((candidate) => candidate.id === 'tower-middle')!;
  assert.equal(visual.caps.length, 2);
  assert.deepEqual(visual.caps.map((cap) => cap.half), ['halfA', 'halfB']);
  assert.ok(visual.caps.every((cap) => Math.abs(cap.worldNormal[0]) + Math.abs(cap.worldNormal[1]) > 0.1));
  assert.notDeepEqual(visual.caps[0].worldNormal, visual.caps[1].worldNormal);
  assert.ok(visual.caps.every((cap) => cap.cameraFacingScore > 0.2));
  manager.dispose();
});

test('3D-MAIN-PERF-007 reports release-frame thresholds without hiding long frames', () => {
  const samples = [...Array.from({ length: 594 }, () => 16), ...Array.from({ length: 6 }, () => 52)];
  const result = summarizePerformance(samples, { drawCalls: 64, triangles: 42_000, geometries: 18, textures: 0 }, 1.5);
  assert.equal(result.frames, 600);
  assert.equal(result.medianMs, 16);
  assert.equal(result.p95Ms, 16);
  assert.equal(result.over50Percent, 1);
  assert.equal(result.geometries, 18);
  assert.equal(result.textures, 0);
  assert.equal(result.withinTargets, true);
});
