import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { SliceSimulation } from '../../game/prototype-a/src/game-core';

const seed = 31;
const levelNumber = 1;
const bonusLaneOffset = 56;
const game = new SliceSimulation(seed, levelNumber);
const actions: Array<Record<string, unknown>> = [];
let previousEvents = new Set<number>();
for (let step = 0; step < 35 * 60; step += 1) {
  const before = game.getState();
  if (before.status === 'failed' || before.status === 'won') break;
  let shouldAct = false;
  let trigger = '';
  if (before.status === 'ready' || before.status === 'anchored') {
    shouldAct = true;
    trigger = 'visible ready/anchored release cue';
  } else {
    const approachingFinish = before.phase === 'ordinary' && before.player.x > before.finishX - 720;
    const bonus = before.finishOptions.find((option) => option.kind === 'bonus');
    const desiredY = before.phase === 'bonus' ? 380 : approachingFinish ? (bonus!.y + bonusLaneOffset) : 430;
    if (before.player.y > desiredY && before.player.vy > -60) {
      shouldAct = true;
      trigger = `visible lane height above ${desiredY}`;
    }
  }
  if (shouldAct) {
    const inputBefore = { step, elapsed: before.elapsed, phase: before.phase, status: before.status, player: { x: before.player.x, y: before.player.y, vx: before.player.vx, vy: before.player.vy }, anchorId: before.anchorId, finishPhase: before.finishPhase };
    game.act('flip');
    const afterInput = game.getState();
    const newEvents = afterInput.events.filter((event) => !previousEvents.has(event.id));
    actions.push({ inputIndex: actions.length + 1, trigger, inputStep: step, inputBefore, inputAfter: { phase: afterInput.phase, status: afterInput.status, player: { x: afterInput.player.x, y: afterInput.player.y, vx: afterInput.player.vx, vy: afterInput.player.vy }, anchorId: afterInput.anchorId }, newEvents: newEvents.map((event) => ({ id: event.id, type: event.type, targetId: event.targetId ?? null })) });
  }
  previousEvents = new Set(game.getState().events.map((event) => event.id));
  game.advanceFrame(1 / 60);
}
const final = game.getState();
const schedule = actions.map((action) => Math.round((Number(action.inputStep) / 60) * 1000));
const scriptPath = new URL('./r2-bonus-diagnostic-seed31-v01.ts', import.meta.url);
const scriptSha256 = createHash('sha256').update(readFileSync(scriptPath)).digest('hex');
const report = { artifactType: 'B01BonusDiagnosticTrajectory', diagnosticOnly: true, seed, levelNumber, bonusLaneOffset, script: 'r2-bonus-diagnostic-seed31-v01.ts', scriptSha256, inputPolicy: 'ready/anchored release; ordinary mid-lane y=430; finish approach y=bonus.y+56; bonus y=380', actions, fixedScheduleMs: schedule, final: { phase: final.phase, status: final.status, finishSelection: final.finishSelection, finishGateId: final.finishGateId, failReason: final.failReason, elapsed: final.elapsed, player: { x: final.player.x, y: final.player.y, vx: final.player.vx, vy: final.player.vy }, events: final.events.slice(-6) } };
writeFileSync(new URL('./r2-bonus-diagnostic-seed31-v01.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
