import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_CATALOG } from '../src/game-levels';
import { createCourse } from '../src/game-core';
import { createSharedCutResources, disposeSharedCutResources } from '../src/three-cut-visuals';

test('FOOD-THEME-RED-001 locks level families to one food theme without cross-theme mixing', () => {
  const expected = [
    'fruit', 'fruit', 'fruit',
    'dessert', 'dessert', 'dessert',
    'savory', 'savory', 'savory',
    'mystic', 'mystic', 'mystic',
  ];
  assert.deepEqual(LEVEL_CATALOG.levels.map((level) => level.foodTheme), expected);
  for (const level of LEVEL_CATALOG.levels) {
    assert.ok(level.foodStyles.length >= 2, `level ${level.number} needs multiple cuttable styles`);
    assert.ok(new Set(level.foodStyles).size >= 2);
    assert.ok(level.blocks.every((block) => block.pathRole), `level ${level.number} hard blocks need path roles`);
  }
});

test('FOOD-THEME-RED-002 runtime course carries authored style ids to every cuttable object', () => {
  for (const level of LEVEL_CATALOG.levels) {
    const course = createCourse(31 + level.number, level.number);
    const styles = new Set([...course.sigils, ...course.blocks].map((item) => item.foodStyle));
    assert.ok(styles.size >= 2, `level ${level.number} runtime styles collapsed`);
    for (const style of styles) assert.ok(level.foodStyles.includes(style));
  }
});

test('FOOD-THEME-RED-003 authored lengths increase world distance, not only timer labels', () => {
  const finishes = LEVEL_CATALOG.levels.map((level) => level.finishX);
  assert.ok(finishes[11]! > finishes[0]! * 1.3, 'late course must be materially longer');
  assert.ok(finishes.every((x, index) => index === 0 || x >= finishes[index - 1]!));
  assert.ok(LEVEL_CATALOG.levels.every((level) => level.courseSegments.at(-1)!.endX === level.finishX));
});

test('FOOD-THEME-RED-004 dessert presentation uses a cake-slice profile, not circular sigil geometry', () => {
  const resources = createSharedCutResources();
  resources.dessertBase.computeBoundingBox();
  resources.dessertHalfA.computeBoundingBox();
  resources.dessertHalfB.computeBoundingBox();
  const bounds = resources.dessertBase.boundingBox!;
  assert.ok(bounds.max.x - bounds.min.x > (bounds.max.y - bounds.min.y) * 1.05, 'dessert profile should have a distinct slice silhouette');
  assert.ok(resources.dessertHalfA.boundingBox!.max.x - resources.dessertHalfA.boundingBox!.min.x > 0.8);
  assert.ok(resources.dessertHalfB.boundingBox!.max.x - resources.dessertHalfB.boundingBox!.min.x > 0.6);
  disposeSharedCutResources(resources);
});
