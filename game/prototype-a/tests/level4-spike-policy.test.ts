import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SliceSimulation } from '../src/game-core';
import { getLevelDefinition } from '../src/game-levels';

test('Level 04 authors a safe recovery support before l4-gap-risk', () => {
  const level = getLevelDefinition(4);
  const support = level.supports.find((candidate) => candidate.id === 'l4-safe-recovery');
  assert.ok(support, 'safe recovery bridge is required before the spike');
  assert.ok(support!.x < 1300 && support!.x + support!.width / 2 > 1080);
  assert.equal(support!.pathRole, 'recovery');
  assert.match(support!.decisionImpact ?? '', /recover|safe/i);
});

test('Level 04 keeps the spike window narrow enough to leave a visible high-line escape', () => {
  const spike = getLevelDefinition(4).spikes.find((candidate) => candidate.id === 'l4-gap-risk');
  assert.ok(spike);
  assert.ok(spike!.width <= 200, 'spike should pressure the low route without sealing the whole crossing');
  assert.ok(spike!.width <= 220 && spike!.height <= 80, 'natural default timing needs a clearly readable low-route gap');
});

test('Level 04 authors an early recovery shelf before the moving ferry', () => {
  const level = getLevelDefinition(4);
  const support = level.supports.find((candidate) => candidate.id === 'l4-early-recovery');
  assert.ok(support, 'early recovery shelf is required before the ferry');
  assert.ok(support!.x <= 560 && support!.x + support!.width / 2 >= 680);
  assert.ok(support!.y - support!.height / 2 <= 610, 'shelf must catch a low miss before the world-bottom fall');
  assert.equal(support!.pathRole, 'recovery');
});

test('Level 10 falling-risk spike starts after the tower exit decision window', () => {
  const spike = getLevelDefinition(10).spikes.find((candidate) => candidate.id === 'l10-falling-risk');
  assert.ok(spike);
  assert.ok(spike!.x >= 2300, 'the late hazard must not overlap the tower approach');
});

test('Level 04 keeps a final recovery shelf under the finish approach', () => {
  const level = getLevelDefinition(4);
  const support = level.supports.find((candidate) => candidate.id === 'l4-finish-recovery');
  assert.ok(support, 'late misses need a recoverable landing before the finish gate');
  assert.ok(support!.x + support!.width / 2 >= level.finishX - 40);
  assert.ok(support!.y + support!.height / 2 >= level.worldBottom, 'finish recovery must catch misses before they cross world bottom');
  assert.equal(support!.pathRole, 'recovery');
});

test('Level 04 finish recovery keeps a late low miss from failing before gate settlement', () => {
  const game = new SliceSimulation(42, 4);
  game.act('flip');
  game.debugPlacePlayer(3420, 760);
  game.debugSetVelocity(180, 0);
  const result = game.step(0.4);
  assert.notEqual(result.failReason, 'fall');
  assert.ok(result.status === 'anchored' || result.status === 'won');
});

function playLevel4(targetHeight: number): ReturnType<SliceSimulation['getState']> {
  const game = new SliceSimulation(42, 4);
  for (let frame = 0; frame < 35 * 60; frame += 1) {
    const state = game.getState();
    if (state.status === 'failed' || state.status === 'won') return state;
    const projectedY = state.player.y + Math.max(0, state.player.vy) * 0.2;
    if (state.status === 'ready' || state.status === 'anchored' || (projectedY > targetHeight && state.player.vy > -125)) game.act('flip');
    game.advanceFrame(1 / 60);
  }
  return game.getState();
}

test('Level 04 safe-height policy avoids l4-gap-risk and reaches terminal win', () => {
  const result = playLevel4(430);
  assert.equal(result.status, 'won');
  assert.equal(result.failReason, null);
});

test('Level 04 risk-height policy keeps l4-gap-risk as a readable avoidable hazard', () => {
  const result = playLevel4(580);
  assert.ok(result.status === 'won' || (result.status === 'failed' && result.failReason === 'spike'));
});
