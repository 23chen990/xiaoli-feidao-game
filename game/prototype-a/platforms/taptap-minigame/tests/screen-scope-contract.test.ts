import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('TapTap runtime contract scopes exactFitScreen to Web and retains portrait fixed-width controls', () => {
  const contract = JSON.parse(readFileSync(path.join(root, 'runtime-contract.json'), 'utf8'));
  assert.deepEqual(contract.screenContract, {
    designResolution: { width: 390, height: 844, policy: 4, mode: 'fixed-width' },
    runtimePolicy: 'ResolutionPolicy.FIXED_WIDTH',
    safeAreaSource: 'screen.safeArea',
    exactFitScreen: {
      scope: 'web-only',
      packagedNonWebDefault: true,
      blocksTapTapMiniGame: false,
    },
  });
});
