import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { z } from 'zod';

const runRoot = new URL('../../../', import.meta.url);
const manifestPath = new URL('artifacts/asset-manifest.json', runRoot);
const schema = z.object({
  schemaVersion: z.literal(1),
  artifactType: z.literal('AssetManifest'),
  targetGame: z.string().min(1),
  workspace: z.string().min(1),
  sourceResearch: z.string().min(1),
  sourceLicense: z.literal('CC0-1.0'),
  assets: z.array(z.object({ id: z.string(), path: z.string(), sha256: z.string().length(64), status: z.literal('generated'), theme: z.enum(['fruit', 'dessert', 'savory']) }).strict()).length(6),
  licenseEvidence: z.object({ path: z.string(), sha256: z.string().length(64) }).strict(),
  runtimePolicy: z.string().min(1),
  status: z.literal('APPROVED_AND_COPIED'),
}).strict();

test('ASSET-MANIFEST-001 validates and hashes every approved local Kenney Food Kit asset', () => {
  const manifest = schema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  for (const asset of [...manifest.assets, manifest.licenseEvidence]) {
    const bytes = readFileSync(new URL(`workspace/prototype-a/${asset.path}`, runRoot));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.path);
  }
  assert.deepEqual(new Set(manifest.assets.map(({ id }) => id)), new Set(['food-apple', 'food-banana', 'food-coconut', 'food-cake', 'food-bread', 'food-cheese']));
});
