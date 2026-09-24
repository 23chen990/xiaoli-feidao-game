import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'assets/scripts/GameBootstrap.ts'), 'utf8');

test('performance sampling contract separates device FPS from deterministic render work', () => {
  const contract = JSON.parse(readFileSync(path.join(root, 'performance-contract.json'), 'utf8'));
  assert.deepEqual(contract.phases, ['cold-start', 'first-frame', 'steady-10-minute', 'ordinary-touch', 'terminal-replay']);
  assert.equal(contract.backendFpsThreshold, null);
  assert.equal(contract.reportedFpsRootCause, 'UNCONFIRMED');
  assert.deepEqual(contract.frameEvidence, ['rendered-frame-count', 'elapsed-time-ms', 'static-redraw-count', 'dynamic-redraw-count']);
  assert.deepEqual(contract.latestUnboundReport, {
    device: 'PHJ110H1',
    reportedFps: 0.020356234,
    stutterRatePercent: 0,
    averageMemoryMb: 239.28,
    peakMemoryMb: 259.5,
    coldStartSeconds: 2.05,
    packageSha256: null,
    rawRenderedFrameCount: null,
    rawElapsedTimeMs: null,
  });
  assert.deepEqual(contract.decision, {
    remainingPackageBottleneck: 'NOT_DEMONSTRATED',
    optimizationAuthorized: true,
    reason: 'owner-authorized 2026-09-09: wait screen was fully static so change-based samplers report ~0 FPS; dynamic layer now animates every frame (ambient bob) while the static course keeps 1 draw per lifecycle',
  });
});

test('airborne update redraws only dynamic blade and feedback graphics', () => {
  assert.match(source, /private staticGraphics\?: Graphics/);
  assert.match(source, /private dynamicGraphics\?: Graphics/);
  assert.match(source, /private redrawStaticCourse\(\): void/);
  assert.match(source, /private redrawDynamicCourse\(\): void/);
  const updateBody = source.slice(source.indexOf('update(deltaTime'), source.indexOf('onDestroy()'));
  assert.doesNotMatch(updateBody, /redrawCourse\(/);
  assert.match(updateBody, /redrawDynamicCourse\(/);
});

test('idle surface keeps presenting live frames for change-based fps samplers', () => {
  const updateBody = source.slice(source.indexOf('update(deltaTime'), source.indexOf('onDestroy()'));
  assert.match(updateBody, /idlePhase/);
  assert.match(source, /private idlePhase = 0/);
});
