import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';

test('build is a self-contained single-canvas Three.js playable page', async () => {
  const html = await readFile(resolve('dist/index.html'), 'utf8').catch(() => '');
  assert.ok(html.length > 100_000, 'expected bundled Three.js build');
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/i);
  assert.match(html, /data-action=["']flip["']/);
  assert.match(html, /__PROTOTYPE_TEST__/);
  assert.match(html, /__GAME_TEST__/);
  assert.match(html, /WebGLRenderer/);
  assert.match(html, /PerspectiveCamera/);
  assert.match(html, /PROGRAMMATIC_ORIGINAL/);
  assert.doesNotMatch(html, /Phaser|new [A-Za-z_$][\w$]*\.Game\(/);
  assert.doesNotMatch(html, /GLTFLoader|DRACOLoader|\.glb\b/i);
  assert.match(html, /mechanics-demo-placeholder-v1/);
  assert.match(html, /小李飞刀/);
  assert.match(html, /切中可切物得分，误触硬物或失足即失败。/);
  assert.match(html, /阶段 1 · 观察与切割/);
  assert.match(html, /阶段 2 · 判断与恢复/);
  assert.match(html, /阶段 3 · 结构与终点/);
  assert.match(html, /programmatic-original/);
  assert.doesNotMatch(html, /Mechanics Demo|符刃夜行|夜路|奇行/);
  assert.match(html, /[×÷]/);
  assert.match(html, /AudioContext/);
});

test('3D-MAIN-RELEASE-008 emits one parseable literal inline module without HTML injected into JavaScript', async () => {
  const html = await readFile(resolve('dist/index.html'), 'utf8');
  const modules = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(modules.length, 1);
  assert.equal([...html.matchAll(/<!doctype html>/gi)].length, 1, 'HTML prefix was injected into the replacement string');
  assert.doesNotThrow(() => new Function(modules[0]![1]), 'release inline module must parse before Chromium loads it');
});
