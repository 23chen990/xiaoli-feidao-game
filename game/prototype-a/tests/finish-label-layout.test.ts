import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampFinishLabelPosition } from '../src/finish-label-layout';

test('finish labels clamp back inside the safe viewport without drifting off their target wall', () => {
  const viewport = { width: 390, height: 844 };
  const clamped = clampFinishLabelPosition({ x: 372, y: 22 }, viewport);
  assert.ok(clamped.x <= viewport.width - 36);
  assert.ok(clamped.y >= 36);
  assert.ok(clamped.x >= 36);
  assert.ok(clamped.y <= viewport.height - 36);
});
