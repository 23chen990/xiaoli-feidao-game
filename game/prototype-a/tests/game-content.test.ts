import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FEEL_TIMING_BASELINE, MECHANICS_TRACE_MATRIX, ORIGINAL_COURSE_BLUEPRINT } from '../src/game-content';
import { createCourse } from '../src/game-core';

test('COURSE-STAGE-001 three original stages are contiguous and rise from teach to test', () => {
  assert.equal(ORIGINAL_COURSE_BLUEPRINT.length, 3);
  assert.deepEqual(ORIGINAL_COURSE_BLUEPRINT.map((stage) => stage.role), ['teach', 'develop', 'test']);
  assert.deepEqual(ORIGINAL_COURSE_BLUEPRINT.map((stage) => stage.difficulty), [1, 2, 3]);
  for (let index = 1; index < ORIGINAL_COURSE_BLUEPRINT.length; index += 1) {
    assert.equal(ORIGINAL_COURSE_BLUEPRINT[index - 1]!.endX, ORIGINAL_COURSE_BLUEPRINT[index]!.startX);
    assert.ok(ORIGINAL_COURSE_BLUEPRINT[index]!.intensity > ORIGINAL_COURSE_BLUEPRINT[index - 1]!.intensity);
  }
  assert.ok(ORIGINAL_COURSE_BLUEPRINT.every((stage) => stage.mechanicIds.length >= 2));
  assert.ok(ORIGINAL_COURSE_BLUEPRINT.every((stage) => stage.expression === 'original'));
});

test('COURSE-STAGE-002 runtime course segments are derived from the independent blueprint', () => {
  const segments = createCourse(31).courseSegments;
  assert.deepEqual(segments.map(({ id, startX, endX, difficulty, role }) => ({ id, startX, endX, difficulty, role })),
    ORIGINAL_COURSE_BLUEPRINT.map(({ id, startX, endX, difficulty, role }) => ({ id, startX, endX, difficulty, role })));
});

test('TRACE-001 every locked mechanic points to executable regression evidence', async () => {
  assert.deepEqual(MECHANICS_TRACE_MATRIX.map((entry) => entry.id), [
    'INPUT_TO_MOTION',
    'CONTACT_TAXONOMY',
    'CUT_OR_REFLECT',
    'FAILURE_AND_RESTART',
    'STAGED_DIFFICULTY',
    'FEEDBACK_TIMING',
  ]);
  const regressionSource = `${await readFile('tests/game-core.test.ts', 'utf8')}\n${await readFile('tests/mechanics-v2.test.ts', 'utf8')}\n${await readFile('tests/game-content.test.ts', 'utf8')}`;
  for (const entry of MECHANICS_TRACE_MATRIX) {
    assert.ok(entry.sourceBasis.length > 0);
    assert.equal(entry.expressionBoundary, 'generic-mechanic-only');
    assert.ok(entry.regressionIds.length > 0);
    for (const regressionId of entry.regressionIds) {
      assert.match(regressionSource, new RegExp(regressionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('FEEDBACK-TIMING-001 timing baseline is responsive and ordered for one-touch play', () => {
  assert.equal(FEEL_TIMING_BASELINE.fixedStepHz, 120);
  assert.ok(FEEL_TIMING_BASELINE.inputBufferMs > 0);
  assert.ok(FEEL_TIMING_BASELINE.inputBufferMs < FEEL_TIMING_BASELINE.flipCooldownMs);
  assert.ok(FEEL_TIMING_BASELINE.contactRecoveryLockoutMs > FEEL_TIMING_BASELINE.flipCooldownMs);
  assert.ok(FEEL_TIMING_BASELINE.comboWindowMs > FEEL_TIMING_BASELINE.contactRecoveryLockoutMs);
  assert.deepEqual(FEEL_TIMING_BASELINE.feedbackOrder, ['motion', 'contact', 'cut-or-reflect', 'visual-feedback']);
});
