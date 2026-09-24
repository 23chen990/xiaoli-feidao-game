import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('startup contract separates host Activity availability from package first frame', () => {
  const contract = JSON.parse(readFileSync(path.join(root, 'startup-contract.json'), 'utf8'));
  assert.equal(contract.packageShaBoundToFailureReport, null);
  assert.deepEqual(contract.ownership, {
    host: ['com.taptap process', 'PageProxyActivity', 'InstantGameActivity availability'],
    package: ['game.js', 'game.json', 'project.config.json', 'Cocos Graphics first frame'],
  });
  assert.equal(contract.classification, 'EXTERNAL_HOST_CRASH_UNRESOLVED');
});

test('startup evidence keeps PDBM00, A2022P and PKB110 as separate branches', () => {
  const contract = JSON.parse(readFileSync(path.join(root, 'startup-contract.json'), 'utf8'));
  assert.deepEqual(contract.deviceBranches, [
    { model: 'OPPO PDBM00', os: 'Android 9', evidence: 'backend-only', rawTrace: false },
    { model: 'ZTE A2022P', os: 'Android 13', evidence: 'host-fatal-exception', rawTrace: true },
    { model: 'OPPO PKB110', os: 'Android 16', evidence: 'adjacent-model-mismatch', rawTrace: true },
  ]);
  assert.equal(contract.requiresExactShaNaturalRetest, true);
});
