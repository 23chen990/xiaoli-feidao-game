import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { levelOnePrompt } from '../src/level-one-guidance';

test('LEVEL-UI-RED-001 placeholder shell exposes numbered selector, replay and next controls without final art decisions', async () => {
  const [html, main, css, theme] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('src/main.ts', 'utf8'),
    readFile('src/style.css', 'utf8'),
    readFile('src/theme.ts', 'utf8'),
  ]);
  assert.match(html, /id="level-selector-toggle"/);
  assert.match(html, /id="level-grid"/);
  assert.match(html, /id="replay-button"/);
  assert.match(html, /id="next-level-button"/);
  assert.match(html, /id="bonus-test-button"/);
  assert.match(main, /LevelProgressStore/);
  assert.match(main, /selectLevel/);
  assert.match(main, /nextLevel/);
  assert.match(main, /replayLevel/);
  assert.match(main, /enterBonusChallenge/);
  assert.match(main, /before\.status === 'won'/);
  assert.match(css, /#level-select/);
  assert.match(css, /env\(safe-area-inset/);
  assert.match(theme, /status: z\.literal\('placeholder'\)/);
  assert.match(theme, /styleLock: z\.literal\(false\)/);
  assert.doesNotMatch(`${html}\n${css}`, /url\([^)]*\.(png|webp|jpg)/i);
});

test('LEVEL-UI-RED-002 Level 1 guidance stages the observed tutorial beats without copying reference wording', () => {
  assert.match(levelOnePrompt(1, 120, 'ready')!, /轻触|起跳/);
  assert.match(levelOnePrompt(1, 700, 'airborne')!, /连续|翻转/);
  assert.match(levelOnePrompt(1, 1450, 'airborne')!, /路线|阶梯/);
  assert.match(levelOnePrompt(1, 2050, 'airborne')!, /尖刺|危险/);
  assert.match(levelOnePrompt(1, 2750, 'airborne')!, /倍率|终点/);
  assert.equal(levelOnePrompt(2, 120, 'ready'), null);
});
