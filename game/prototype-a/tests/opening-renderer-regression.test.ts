import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SliceSimulation, type SafeSupport } from '../src/game-core';
import { ProgrammaticOriginalProvider } from '../src/three-cut-visuals';
import { ThreePresentationModel, createCameraSpec, cameraLeadSimulation, GROUND_VISUAL_TOP_Y, worldPointFromSimulation } from '../src/three-presentation';

// Resolve the renderer's real Vite inline PNG imports in the Node test runner.
const assetLoader = registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.png?inline')) {
    const data = readFileSync(new URL(url)).toString('base64');
    return { format: 'module', source: `export default ${JSON.stringify(`data:image/png;base64,${data}`)}`, shortCircuit: true };
  }
  return nextLoad(url, context);
} });
const { ThreeWorldRenderer } = await import('../src/three-world-renderer');
assetLoader.deregister();

// Only the WebGL context is omitted. Execute the production support sync on
// real Three meshes, transforms and bounds, without a parallel geometry helper.
function supportScene() {
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const harness = Object.assign(Object.create(ThreeWorldRenderer.prototype), {
    scene: new THREE.Scene(), unitBox: geometry,
    supports: new Map(), supportBases: new Map(), routeOpenings: new Map(), openedRouteIds: new Set(),
    supportMaterial: material, supportActiveMaterial: material, supportBaseMaterial: material, routeOpeningMaterial: material,
  }) as { scene: THREE.Scene; syncSupports(supports: SafeSupport[], anchor: string | null): void };
  return { harness, dispose: () => { material.dispose(); geometry.dispose(); } };
}

for (const id of ['opening-table-a', 'opening-table-b', 'level1-reward-shelf', 'bridge-table', 'lift-table', 'tower-table', 'late-table', 'white-bumper', 'white-branch']) {
  test(`L1-OPENING-TABLE-BRANCH ${id} joins its underside to the actual floor`, () => {
    const { harness, dispose } = supportScene();
    try {
      const supports = new SliceSimulation(31, 1).getState().supports;
      const support = supports.find((item) => item.id === id)!;
      harness.syncSupports(supports, null);
      const base = harness.scene.getObjectByName(`support-base:${id}`);
      assert.ok(base, `${id} never entered the runtime grounded-base branch`);
      const bounds = new THREE.Box3().setFromObject(base);
      assert.ok(Math.abs(bounds.min.y - GROUND_VISUAL_TOP_Y) < 1e-6, 'base bottom must touch rendered floor');
      assert.ok(Math.abs(bounds.max.y - worldPointFromSimulation(support.x, support.y + support.height / 2)[1]) < 1e-6, 'base top must touch tabletop underside');
      harness.syncSupports(supports, null);
      assert.equal(harness.scene.children.filter((item) => item.name === base.name).length, 1);
      if (id === 'white-bumper' || id === 'white-branch') {
        assert.ok(base.position.z < 0, `${id} floor base must stay behind the first visible target`);
        assert.ok(base.scale.z <= 0.5, `${id} floor base must not become the foreground blocker`);
      }
      support.active = false;
      harness.syncSupports(supports, null);
      assert.equal(harness.scene.getObjectByName(base.name), undefined);
    } finally { dispose(); }
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1100, height: 720 }]) {
  test(`L1-FIRST-TARGET-VISIBILITY rune-1 intact submits triangles at ${viewport.width}x${viewport.height}`, () => {
    const game = new SliceSimulation(31, 1);
    game.step(1 / 60);
    const state = game.getState();
    const visual = new ThreePresentationModel().sync(state).cuttables.find((item) => item.id === 'rune-1')!;
    assert.equal(visual.phase, 'intact');
    const provider = new ProgrammaticOriginalProvider();
    const resources = provider.createSharedResources();
    const entity = provider.createEntity(visual, resources);
    try {
      const mesh = entity.root.getObjectByName('intact:rune-1') as THREE.Mesh;
      assert.ok(mesh.visible);
      // WebGLRenderer renders an array material only through geometry groups.
      const submittedIndices = Array.isArray(mesh.material)
        ? mesh.geometry.groups.reduce((sum, group) => sum + Number((mesh.material as THREE.Material[])[group.materialIndex ?? 0]!.visible) * group.count, 0)
        : mesh.geometry.index!.count;
      assert.ok(submittedIndices >= 36, 'intact sphere has no drawable material groups: zero triangles submitted');
      const targetX = (state.player.x + cameraLeadSimulation(viewport.width, viewport.height)) / 100;
      const spec = createCameraSpec(viewport.width, viewport.height, targetX);
      const camera = new THREE.PerspectiveCamera(spec.fov, spec.aspect, spec.near, spec.far);
      camera.position.fromArray(spec.position);
      camera.lookAt(new THREE.Vector3().fromArray(spec.target));
      camera.updateMatrixWorld();
      const projection = entity.facts(camera, viewport).targetProjection!;
      assert.ok(projection.width > 20 && projection.height > 20);
      assert.ok(projection.x >= 0 && projection.x + projection.width < viewport.width);
      assert.ok(projection.y >= 100 && projection.y + projection.height < viewport.height - 70);
      const table = state.supports.find((item) => item.id === 'opening-table-a')!;
      const bottom = new THREE.Box3().setFromObject(mesh).min.y;
      assert.ok(Math.abs(bottom - worldPointFromSimulation(table.x, table.y - table.height / 2)[1]) < 1e-6);
    } finally { entity.dispose(); provider.disposeSharedResources(resources); }
  });
}
