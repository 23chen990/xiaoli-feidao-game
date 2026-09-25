import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { buildOrdinaryChecks, summarizeOrdinary, responseEvidence } from './r2-acceptance-checks-v23.mjs';

const dir = new URL('./', import.meta.url);
const sources = ['r2-ordinary-formal-r2patch-v22.json', 'r2-ordinary-independent-qa-r2patch-v22.json'];
const offlineProgramVersion = 'B01-R2-offline-recheck-v2.3';
const scriptText = await readFile(new URL('./r2-acceptance-offline-recheck-v23.mjs', dir));
const offlineProgramSha256 = createHash('sha256').update(scriptText).digest('hex');

function reconstruct(report) {
  const o = report.results?.ordinary ?? report.ordinary ?? report;
  const oldResponse = o.postReloadPlay?.visibleResponse ?? o.postReloadPlay?.input?.response ?? null;
  const input = o.postReloadPlay?.input;
  const receiptValid = Boolean(input?.inputReceiptObserved);
  const handlerObservationComplete = Boolean(receiptValid && oldResponse?.causalEvidence?.inputId === input?.inputId && oldResponse.causalEvidence.before && oldResponse.causalEvidence.after);
  const expectedImmediateAction = o.reload?.state?.phase === 'ordinary' && o.reload?.state?.status === 'ready';
  const actionOccurred = Boolean(oldResponse?.hasCausalAction);
  const postReloadPlay = { ...o.postReloadPlay, receiptValid, handlerObservationComplete, expectedImmediateAction, actionOccurred, playerInputPathHit: receiptValid && handlerObservationComplete, playable: Boolean(actionOccurred && (input?.after?.status === 'airborne' || input?.after?.status === 'anchored')) };
  const terminalControl = o.checks?.find((check) => check.id === 'terminal-controls-visible-after-settlement')?.evidence ?? null;
  const ready = o.checks?.find((check) => check.id === 'ready-state')?.evidence ?? {};
  const checks = buildOrdinaryChecks({ readyState: ready.state, readyControl: ready.control, terminal: o.terminal, targetReached: o.targetReached, terminalControl, blankCheck: o.blankCheck, next: o.next, reload: o.reload, postReloadPlay, controlObservations: o.controlObservations, controlObserverWindow: o.controlObserverWindow, dispatches: o.dispatches });
  return { original: { result: o.result, rawOutcome: o.rawOutcome, validObservation: o.validObservation, allAssertionsPass: o.allAssertionsPass }, recomputed: summarizeOrdinary({ checks, targetReached: o.targetReached, terminal: o.terminal, assertionFailure: o.assertionFailure, assertionFailureObserved: o.assertionFailureObserved, environmentFailure: o.environmentFailure, unknownFailure: o.unknownFailure }) };
}

const reports = [];
for (const file of sources) {
  const report = JSON.parse(await readFile(new URL(`./${file}`, dir), 'utf8'));
  const rec = reconstruct(report);
  reports.push({ source: file, browserScriptVersion: report.scriptVersion, browserScriptSha256: report.scriptSha256, original: rec.original, recomputed: rec.recomputed, consistent: rec.original.result === rec.recomputed.result && rec.original.rawOutcome === rec.recomputed.rawOutcome });
}

const base = { readyState: { phase: 'ordinary', status: 'ready' }, readyControl: { exists: true, hidden: true, visible: false }, terminal: { phase: 'ordinary', status: 'won', finishPhase: 'terminal' }, targetReached: true, terminalControl: { exists: true, hidden: false, visible: true }, blankCheck: { unchanged: true }, next: { state: { levelNumber: 2, status: 'ready' } }, reload: { state: { phase: 'ordinary', levelNumber: 2, status: 'ready' } }, controlObserverWindow: { startedEpochMs: 1, endedEpochMs: 10, interrupted: false }, dispatches: [{ received: [{ epochMs: 2 }] }], controlObservations: [{ phase: 'ordinary', status: 'airborne', finishPhase: 'idle', hidden: true, visible: false, epochMs: 3 }, { phase: 'ordinary', status: 'ready', finishPhase: 'contact', hidden: true, visible: false, epochMs: 4 }, { phase: 'ordinary', status: 'ready', finishPhase: 'reward', hidden: true, visible: false, epochMs: 5 }, { phase: 'ordinary', status: 'ready', finishPhase: 'celebration', hidden: true, visible: false, epochMs: 6 }, { phase: 'ordinary', status: 'won', finishPhase: 'terminal', hidden: false, visible: true, epochMs: 7 }] };
function runFixture(name, postReloadPlay, observations = base.controlObservations) {
  const fixture = { ...base, postReloadPlay, controlObservations: observations };
  const checks = buildOrdinaryChecks(fixture);
  const summary = summarizeOrdinary({ ...fixture, checks });
  return { name, result: summary.result, rawOutcome: summary.rawOutcome, validObservation: summary.validObservation, allAssertionsPass: summary.allAssertionsPass, checks: checks.map(({ id, executed, validObservation, passed }) => ({ id, executed, validObservation, passed })) };
}
const causal = { inputReceiptObserved: true, after: { status: 'airborne' }, response: { hasCausalAction: true, causalEvidence: { inputId: 'reload-input-1', before: {}, after: {} } } };
const counterexamples = [
  runFixture('mutation-idle-visible-normal-phase', { playable: true, receiptValid: true, handlerObservationComplete: true, expectedImmediateAction: true, actionOccurred: true, input: causal }, [{ phase: 'ordinary', status: 'airborne', finishPhase: 'idle', hidden: false, visible: true, reason: 'mutation', coverage: 'transition', epochMs: 3 }, ...base.controlObservations.slice(1)]),
  runFixture('complete-observation-no-immediate-launch', { playable: false, receiptValid: true, handlerObservationComplete: true, expectedImmediateAction: true, actionOccurred: false, input: { inputReceiptObserved: true, after: { status: 'ready' }, response: { hasCausalAction: false, causalEvidence: { inputId: 'reload-input-1', before: {}, after: {} } } } }),
  runFixture('missing-receipt-or-handler-observation', { playable: false, receiptValid: false, handlerObservationComplete: false, expectedImmediateAction: true, actionOccurred: false, input: { inputReceiptObserved: false, after: { status: 'ready' }, response: null } }),
  (() => { const checks = buildOrdinaryChecks(base); const summary = summarizeOrdinary({ ...base, checks, targetReached: true, controlObservations: [] }); return { name: 'target-reached-observation-invalid', result: summary.result, rawOutcome: summary.rawOutcome }; })(),
  (() => { const checks = buildOrdinaryChecks(base); const summary = summarizeOrdinary({ ...base, checks, assertionFailure: 'product assertion', assertionFailureObserved: true, environmentFailure: 'later tool close' }); return { name: 'product-fail-preserved-after-tool-error', result: summary.result, rawOutcome: summary.rawOutcome }; })(),
];
const output = { artifactType: 'B01R2OfflineAcceptanceRecheck', offlineProgramVersion, offlineProgramSha256, sourceReports: reports, counterexamples, browserRunsPerformed: 0, originalsUnmodified: true, notes: ['Offline recomputation is distinct from the v2.2 browser runs; source JSON results were not edited.'] };
await writeFile(new URL('./r2-acceptance-offline-recheck-v23.json', dir), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
