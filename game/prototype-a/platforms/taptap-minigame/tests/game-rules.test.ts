import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface RulesModule {
  createGameState(seed?: number): Record<string, any>;
  tap(state: Record<string, any>): Record<string, any>;
  resolveContact(state: Record<string, any>, contact: 'sharp' | 'blunt' | 'hazard' | 'fall', targetId?: string): Record<string, any>;
  resolveFinish(state: Record<string, any>): Record<string, any>;
}

async function loadRules(): Promise<RulesModule> {
  const modulePath = pathToFileURL(resolve(root, 'assets/scripts/core/game-rules.ts')).href;
  const module = await import(modulePath).catch(() => null) as RulesModule | null;
  assert.ok(module, 'game-rules module must exist');
  return module;
}

test('one touch deterministically launches and then flips the blade', async () => {
  const rules = await loadRules();
  const first = rules.tap(rules.createGameState(928932));
  const repeated = rules.tap(rules.createGameState(928932));
  assert.equal(first.status, 'airborne');
  assert.equal(first.motion.vy, -300);
  assert.notEqual(first.motion.angularVelocity, 0);
  assert.deepEqual(first, repeated);

  const flipped = rules.tap(first);
  assert.equal(flipped.status, 'airborne');
  assert.ok(flipped.motion.vy < first.motion.vy);
  assert.equal(Math.sign(flipped.motion.angularVelocity), -Math.sign(first.motion.angularVelocity));
});

test('sharp contact cuts once and blunt contact visibly reflects', async () => {
  const rules = await loadRules();
  const airborne = rules.tap(rules.createGameState());
  const cut = rules.resolveContact(airborne, 'sharp', 'fruit-1');
  assert.equal(cut.cuts, 1);
  assert.equal(cut.score, 10);
  assert.deepEqual(cut.cutTargets, ['fruit-1']);
  assert.equal(cut.lastFeedback, 'cut');
  assert.equal(rules.resolveContact(cut, 'sharp', 'fruit-1').cuts, 1);

  const reflected = rules.resolveContact(cut, 'blunt', 'stone-1');
  assert.ok(reflected.motion.vx < 0);
  assert.ok(reflected.motion.vy < 0);
  assert.equal(reflected.lastFeedback, 'reflect');
});

test('hazard and fall failures are attributable and touch replays from ready', async () => {
  const rules = await loadRules();
  for (const reason of ['hazard', 'fall'] as const) {
    const failed = rules.resolveContact(rules.tap(rules.createGameState()), reason);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failReason, reason);
    const replayed = rules.tap(failed);
    assert.equal(replayed.status, 'ready');
    assert.equal(replayed.failReason, null);
    assert.equal(replayed.cuts, 0);
  }
});

test('finish produces a settlement and touch starts a clean replay', async () => {
  const rules = await loadRules();
  const cut = rules.resolveContact(rules.tap(rules.createGameState()), 'sharp', 'fruit-1');
  const won = rules.resolveFinish(cut);
  assert.equal(won.status, 'won');
  assert.equal(won.settlement.complete, true);
  assert.equal(won.settlement.score, 10);
  assert.equal(won.lastFeedback, 'finish');

  const replayed = rules.tap(won);
  assert.equal(replayed.status, 'ready');
  assert.equal(replayed.score, 0);
  assert.equal(replayed.settlement.complete, false);
});

