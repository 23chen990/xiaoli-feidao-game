import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyKnifeTriangleMaterial } from '../src/poc-3d-texture-routing';

test('A-KNIFE-UV-006 a single-material blade GLB routes its declared long-axis end to the handle atlas', () => {
  assert.equal(classifyKnifeTriangleMaterial(0, 0, 10, 'minimum'), 'handle');
  assert.equal(classifyKnifeTriangleMaterial(2.7, 0, 10, 'minimum'), 'handle');
  assert.equal(classifyKnifeTriangleMaterial(2.71, 0, 10, 'minimum'), 'blade');
  assert.equal(classifyKnifeTriangleMaterial(7.29, 0, 10, 'maximum'), 'blade');
  assert.equal(classifyKnifeTriangleMaterial(7.3, 0, 10, 'maximum'), 'handle');
  assert.equal(classifyKnifeTriangleMaterial(10, 0, 10, 'maximum'), 'handle');
  assert.equal(classifyKnifeTriangleMaterial(4, 4, 4, 'maximum'), 'blade');
});
