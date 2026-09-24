import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('perceptual pressure HUD exposes authored family, moving-hard warning and finish reward', () => {
  assert.match(main, /dataset\.levelFamily/);
  assert.match(main, /dataset\.pressure/);
  assert.match(css, /MOVING HARD/);
  assert.match(main, /state\.finishGateId/);
  assert.match(main, /gate\?\.operation/);
  assert.match(css, /data-level-family='moving-supports'/);
  assert.match(css, /data-pressure='moving-hard'/);
});

test('perceptual delta requires a distinct earnings hierarchy and finish-phase presentation hooks', () => {
  const [html, main, css, world] = [
    readFileSync('index.html', 'utf8'),
    readFileSync('src/main.ts', 'utf8'),
    readFileSync('src/style.css', 'utf8'),
    readFileSync('src/three-world-renderer.ts', 'utf8'),
  ];
  assert.match(html, /id="earnings-banner"/);
  assert.match(main, /earnings-banner/);
  assert.match(main, /totalEarnings/);
  assert.match(css, /#earnings-banner/);
  assert.match(world, /routeOpenings/);
  assert.match(world, /finishPhase/);
});

test('competitive feel keeps five cut feedback layers and finish wall as visual lead', () => {
  assert.match(main, /hitStopUntil/);
  assert.match(main, /feedback-cut-high/);
  assert.match(main, /impactFlash/);
  assert.match(main, /earningsBanner/);
  assert.match(css, /feedback-cut-high/);
  assert.match(css, /finish-wall-label\.is-selected/);
  assert.match(css, /safe-area-inset/);
});

test('terminal settlement keeps the selected finish wall visible beside the overlay', () => {
  const terminalBlock = css.match(/#terminal-text\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(terminalBlock, /top:\s*max\(150px/);
  assert.match(terminalBlock, /bottom:\s*auto/);
  assert.match(terminalBlock, /left:\s*max\(12px/);
  assert.match(terminalBlock, /transform:\s*none/);
});

test('finish wall labels are projected onto the world wall instead of detached HUD rail', () => {
  assert.match(main, /world\.worldToScreen\(worldPoint\(option\.x, option\.y\)\)/);
  assert.match(main, /label\.style\.left/);
  assert.match(main, /label\.style\.top/);
  assert.match(css, /#finish-wall-labels[\s\S]*position:\s*fixed/);
  assert.match(css, /\.finish-wall-label[\s\S]*position:\s*absolute/);
});

test('cut rewards fly from the world object before global settlement', () => {
  assert.match(main, /reward-fly/);
  assert.match(css, /\.reward-fly/);
  assert.match(css, /reward-flight/);
});

test('food theme is player-visible and follows the current level', () => {
  assert.match(main, /dataset\.foodTheme/);
  assert.match(css, /data-food-theme='fruit'/);
  assert.match(css, /data-food-theme='dessert'/);
  assert.match(css, /data-food-theme='savory'/);
  assert.match(css, /data-food-theme='mystic'/);
});
