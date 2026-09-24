import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  MECHANICS_DEMO_ASSET_MANIFEST,
  MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA,
  MECHANICS_DEMO_THEME,
  MECHANICS_DEMO_THEME_SCHEMA,
} from '../src/theme';

test('THEME-BOUNDARY-001 mechanics demo theme is explicitly temporary and contains no gameplay rules', () => {
  assert.equal(MECHANICS_DEMO_THEME.id, 'mechanics-demo-placeholder-v1');
  assert.equal(MECHANICS_DEMO_THEME.status, 'placeholder');
  assert.equal(MECHANICS_DEMO_THEME.styleLock, false);
  assert.equal(Object.isFrozen(MECHANICS_DEMO_THEME), true);

  const serialized = JSON.stringify(MECHANICS_DEMO_THEME);
  for (const forbidden of ['gravity', 'velocity', 'collision', 'fixedStep', 'levelData', 'courseBlueprint', 'cutThreshold']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
  }
});

test('THEME-ASSET-002 placeholder asset manifest is original, local and externally swappable', () => {
  assert.deepEqual(MECHANICS_DEMO_ASSET_MANIFEST.map((entry) => entry.role), [
    'knife', 'cuttable', 'terrain', 'hazard', 'feedback',
  ]);
  assert.ok(MECHANICS_DEMO_ASSET_MANIFEST.every((entry) => entry.source === 'programmatic-original'));
  assert.ok(MECHANICS_DEMO_ASSET_MANIFEST.every((entry) => entry.externalUri === null));
  assert.equal(MECHANICS_DEMO_THEME.assets, MECHANICS_DEMO_ASSET_MANIFEST);
});

test('THEME-ZOD-004 production schemas strictly parse the theme and asset manifest', () => {
  assert.deepEqual(MECHANICS_DEMO_THEME_SCHEMA.parse(MECHANICS_DEMO_THEME), MECHANICS_DEMO_THEME);
  assert.deepEqual(MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA.parse(MECHANICS_DEMO_ASSET_MANIFEST), MECHANICS_DEMO_ASSET_MANIFEST);
  assert.throws(() => MECHANICS_DEMO_THEME_SCHEMA.parse({ ...MECHANICS_DEMO_THEME, gravity: 600 }));
  assert.throws(() => MECHANICS_DEMO_ASSET_MANIFEST_SCHEMA.parse([
    ...MECHANICS_DEMO_ASSET_MANIFEST,
    { id: 'remote', role: 'knife', source: 'third-party', implementation: 'three-geometry', externalUri: 'https://example.invalid/a.glb', replaceable: true },
  ]));
});

test('THEME-INTEGRATION-003 UI and Three.js presentation consume the single theme entrypoint', async () => {
  const [main, css, world, cutVisuals, html] = await Promise.all([
    readFile('src/main.ts', 'utf8'),
    readFile('src/style.css', 'utf8'),
    readFile('src/three-world-renderer.ts', 'utf8'),
    readFile('src/three-cut-visuals.ts', 'utf8'),
    readFile('index.html', 'utf8'),
  ]);
  assert.match(main, /MECHANICS_DEMO_THEME/);
  assert.match(main, /applyThemeTokens/);
  assert.match(css, /var\(--theme-/);
  assert.match(world, /MECHANICS_DEMO_THEME/);
  assert.match(cutVisuals, /MECHANICS_DEMO_THEME/);
  assert.match(html, /data-theme-source="src\/theme\.ts"/);
  assert.doesNotMatch(html, /Mechanics Demo|轻触：起跳或空中翻转/);
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.doesNotMatch(rootBlock, /^\s*--theme-[^:]+:/m);
  assert.doesNotMatch(`${main}\n${html}`, /符刃夜行|夜路|奇行/);
});

test('A-STYLE-WORLD-005 presentation tokens provide a bright sky and green outdoor ground behind the A atlases', () => {
  const rgb = (value: number) => ({ red: value >> 16 & 0xff, green: value >> 8 & 0xff, blue: value & 0xff });
  const background = rgb(MECHANICS_DEMO_THEME.world.background);
  const road = rgb(MECHANICS_DEMO_THEME.world.road);
  assert.ok(background.blue >= 190 && background.green >= 180 && background.red >= 120, `background stayed dark: ${JSON.stringify(background)}`);
  assert.ok(road.green > road.red * 1.15 && road.green > road.blue * 1.1, `ground is not fresh green: ${JSON.stringify(road)}`);
});
