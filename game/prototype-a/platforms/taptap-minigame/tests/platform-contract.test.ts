import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

test('declares a Cocos Creator 3.8.8 project for 疯狂切割', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.name, 'crazy-cut-taptap-minigame');
  assert.equal(pkg.version, '1.0.0');
});

test('uses the object-shaped Creator manifest required by the Cocos dependency scanner', async () => {
  const pkg = await readJson('package.json');
  assert.deepEqual(pkg.creator, { version: '3.8.8' });
});

test('locks the TapTap intermediate build to portrait and the reviewed AppID', async () => {
  const config = await readJson('platforms/taptap-minigame/build-config.json');
  assert.equal(config.platform, 'wechatgame');
  assert.equal(config.orientation, 'portrait');
  assert.equal(config.appId, '928932');
  assert.equal(config.convertToTapMiniGame, true);
});

test('rejects missing and placeholder AppIDs while accepting the reviewed AppID', async () => {
  const modulePath = pathToFileURL(resolve(root, 'assets/scripts/core/tap-config.ts')).href;
  const module = await import(modulePath).catch(() => null) as null | {
    validateTapAppId(value: string): string;
  };
  assert.ok(module, 'tap-config module must exist');
  assert.throws(() => module.validateTapAppId(''), /AppID/);
  assert.throws(() => module.validateTapAppId('your-app-id'), /AppID/);
  assert.throws(() => module.validateTapAppId('000000'), /AppID/);
  assert.equal(module.validateTapAppId('928932'), '928932');
});
