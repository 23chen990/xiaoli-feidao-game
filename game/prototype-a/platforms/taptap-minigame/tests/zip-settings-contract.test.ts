import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = path.join(root, 'build/TapBuild/game.zip');

test('official TapTap ZIP retains the non-Web portrait fixed-width screen contract', () => {
  const serialized = execFileSync('unzip', ['-p', zipPath, 'src/settings.json'], { encoding: 'utf8' });
  const settings = JSON.parse(serialized) as {
    screen: { exactFitScreen: boolean; designResolution: { width: number; height: number; policy: number } };
  };
  assert.deepEqual(settings.screen, {
    exactFitScreen: true,
    designResolution: { width: 390, height: 844, policy: 4 },
  });
});
