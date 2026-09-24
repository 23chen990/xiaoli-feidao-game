import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const EXPECTED_ATLASES = [
  ['crate', 'src/assets/a-style/crate-basecolor.png'],
  ['log', 'src/assets/a-style/log-basecolor.png'],
  ['knife', 'src/assets/a-style/knife-basecolor.png'],
  ['crystal', 'src/assets/a-style/crystal-basecolor.png'],
] as const;

test('A-BASECOLOR-001 four original A-direction PNG atlases are square, mobile-budgeted and unique', async () => {
  const hashes = new Set<string>();
  for (const [model, path] of EXPECTED_ATLASES) {
    const bytes = await readFile(path).catch(() => Buffer.alloc(0));
    assert.ok(bytes.length >= 40_000, `${model} Base Color atlas is missing or too small (${bytes.length} bytes)`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${model} must be a PNG`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    const colorType = bytes[25];
    assert.equal(width, height, `${model} atlas must be square`);
    assert.ok(width >= 512 && width <= 1024, `${model} atlas is outside the 512-1024 mobile budget (${width})`);
    assert.ok(colorType === 2 || colorType === 6, `${model} atlas must contain RGB color data`);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, EXPECTED_ATLASES.length, 'every model needs a distinct Base Color bitmap');
});

test('A-BASECOLOR-002 strict production manifest maps the four atlases to real UV quadrants', async () => {
  const modulePath = '../src/a-style-basecolor.ts';
  const loaded = await import(modulePath).catch(() => null) as null | Record<string, unknown>;
  assert.ok(loaded, 'A-style Base Color production module is missing');
  const manifest = loaded.A_STYLE_BASECOLOR_MANIFEST as Array<Record<string, unknown>>;
  const schema = loaded.A_STYLE_BASECOLOR_MANIFEST_SCHEMA as { parse(value: unknown): unknown };
  assert.ok(schema && Array.isArray(manifest), 'strict manifest exports are missing');
  assert.doesNotThrow(() => schema.parse(manifest));
  assert.deepEqual(manifest.map(({ model }) => model), ['crate', 'log', 'knife', 'crystal']);
  assert.ok(manifest.every(({ source, styleDirection, uvLayout }) => source === 'ai-generated-original'
    && styleDirection === 'A'
    && uvLayout === 'quadrant-2x2'));
  assert.throws(() => schema.parse([...manifest, { ...manifest[0], model: 'terrain' }]));
});
