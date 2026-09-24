import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

test('3D POC build contains the local scene, renderer bridge and pinned GLB assets', async () => {
  const html = await readFile('dist-3d/poc-3d.html', 'utf8').catch(() => '');
  assert.ok(html.length > 400, 'expected built 3D POC HTML');
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(html, /3D CUT SURFACE POC/);
  assert.match(html, /assets\/[^"]+\.js/);
  assert.ok((await stat('dist-3d/assets/kenney-nature/tree_simple.glb')).size > 6_000);
  assert.ok((await stat('dist-3d/assets/kenney-nature/log_stack.glb')).size > 10_000);
  assert.ok((await stat('dist-3d/assets/kenney-nature/License.txt')).size > 100);
  assert.ok((await stat('dist-3d/assets/cc0-weapon/sword-6.glb')).size > 6_000);
  assert.ok((await stat('dist-3d/assets/draco/draco_decoder.wasm')).size > 190_000);
  assert.ok((await stat('dist-3d/assets/draco/draco_wasm_wrapper.js')).size > 58_000);
});
