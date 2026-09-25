export const ACTION_EVENT_TYPES = new Set(['launch', 'flip', 'cut']);
export function newEvents(before, after) {
  const beforeIds = new Set((before?.events ?? []).map((event) => event.id));
  return (after?.events ?? []).filter((event) => !beforeIds.has(event.id));
}
export function actionEvents(events) { return events.filter((event) => ACTION_EVENT_TYPES.has(event.type)); }
export function classify({ targetReached, validObservation, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }) {
  if (assertionFailure && assertionFailureObserved) return 'FAIL';
  if (environmentFailure || (unknownFailure && targetReached)) return 'BLOCKED';
  if (targetReached && validObservation && !assertionFailure) return 'PASS';
  return 'NOT_RUN';
}
export function rawOutcome({ targetReached, validObservation, allAssertionsPass, terminal, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }) {
  if (assertionFailure && assertionFailureObserved) return 'target-checkpoint-assertion-failure';
  if (environmentFailure) return 'environment-or-tool-failure';
  if (unknownFailure) return targetReached ? 'unknown-post-target-script-failure' : 'unknown-pre-target-script-failure';
  if (targetReached && (!validObservation || allAssertionsPass === false)) return 'target-checkpoint-observation-invalid';
  if (targetReached) return 'target-checkpoint-passed';
  if (terminal?.status === 'failed') return 'ordinary-terminal-failed-before-target';
  if (terminal?.status === 'won') return 'terminal-won-without-required-checkpoint';
  return 'schedule-ended-before-target';
}
export function makeCheck(id, executed, validObservation, passed, reason, evidence = null) { return { id, executed, validObservation, passed, reason: reason ?? null, evidence }; }
export function responseEvidence({ before, after, causalEvidence = null, requireCausal = false, inputId }) {
  const eventsAfterInput = newEvents(before, after);
  const newActionEvents = actionEvents(eventsAfterInput);
  const directCausalEvents = causalEvidence?.after?.eventsAfterInput?.filter((event) => ['launch', 'flip'].includes(event.type)) ?? [];
  const automaticCutOnly = newActionEvents.length > 0 && newActionEvents.every((event) => event.type === 'cut') && directCausalEvents.length === 0;
  const hasCausalAction = directCausalEvents.length > 0;
  const hasAction = requireCausal ? hasCausalAction : newActionEvents.length > 0;
  return { newEvents: eventsAfterInput, newActionEvents, actionTypes: newActionEvents.map((event) => event.type), directCausalEvents, hasCausalAction, automaticCutOnly, hasAction, motionOnly: newActionEvents.length === 0 && (after.player.x !== before.player.x || after.player.y !== before.player.y || after.player.vx !== before.player.vx || after.player.vy !== before.player.vy), causalEvidence, inputId };
}
export function buildOrdinaryChecks({ readyState, readyControl, terminal, targetReached, terminalControl, blankCheck, next, reload, postReloadPlay, controlObservations = [], controlObserverWindow = null, dispatches = [] }) {
  const transitionSamples = controlObservations.filter((sample) => ['contact', 'reward', 'celebration'].includes(sample.finishPhase));
  const phaseSamples = (phase) => transitionSamples.filter((sample) => sample.finishPhase === phase);
  const normalSamples = controlObservations.filter((sample) => sample.phase === 'ordinary' && ['airborne', 'anchored'].includes(sample.status) && sample.finishPhase === 'idle');
  const hiddenPhaseCheck = (phase, label) => { const samples = phaseSamples(phase); return makeCheck(`${phase}-controls-hidden`, samples.length > 0, samples.length > 0, samples.length > 0 && samples.every((sample) => sample.hidden && !sample.visible), `${label} terminal actions must remain hidden`, samples); };
  const firstReceipt = dispatches.flatMap((entry) => entry.received ?? []).find((receipt) => Number.isFinite(receipt.epochMs));
  const firstInputMs = firstReceipt?.epochMs ?? null;
  const terminalMs = controlObservations.filter((sample) => sample.finishPhase === 'terminal').map((sample) => sample.epochMs).filter(Number.isFinite).at(-1) ?? null;
  const windowEvidence = { window: controlObserverWindow, firstInputMs, terminalMs, hasNormalCoverage: normalSamples.length > 0 };
  const windowValid = Boolean(controlObserverWindow && controlObserverWindow.startedEpochMs && controlObserverWindow.endedEpochMs && !controlObserverWindow.interrupted && firstInputMs !== null && terminalMs !== null && controlObserverWindow.startedEpochMs <= firstInputMs && controlObserverWindow.endedEpochMs >= terminalMs && normalSamples.length > 0);
  const input = postReloadPlay?.input;
  const observationValid = Boolean(postReloadPlay?.receiptValid && postReloadPlay?.handlerObservationComplete);
  const responsePassed = !postReloadPlay?.expectedImmediateAction || Boolean(postReloadPlay?.actionOccurred && postReloadPlay?.playable);
  return [
    makeCheck('ready-state', true, Boolean(readyState), readyState?.phase === 'ordinary' && readyState?.status === 'ready' && readyControl?.exists && readyControl.hidden && !readyControl.visible, 'ready must be ordinary/ready and terminal actions hidden', { state: readyState, control: readyControl }),
    makeCheck('ordinary-target', targetReached, targetReached, targetReached, 'ordinary terminal must be phase=ordinary/status=won/finishPhase=terminal', terminal),
    makeCheck('normal-running-controls-hidden', normalSamples.length > 0, normalSamples.length > 0, normalSamples.length > 0 && normalSamples.every((sample) => sample.hidden && !sample.visible), 'ordinary airborne/anchored idle samples must keep terminal actions hidden', normalSamples),
    makeCheck('observer-window-covers-first-input-to-terminal', Boolean(controlObserverWindow), windowValid, windowValid, 'observer must cover first input through terminal with valid timestamps', windowEvidence),
    hiddenPhaseCheck('contact', 'contact'), hiddenPhaseCheck('reward', 'reward'), hiddenPhaseCheck('celebration', 'celebration'),
    makeCheck('terminal-controls-visible-after-settlement', targetReached, targetReached && Boolean(terminalControl), targetReached && Boolean(terminalControl?.exists && terminalControl.visible && !terminalControl.hidden), 'terminal controls must become visible only after settlement', terminalControl),
    makeCheck('blank-click-does-not-restart', Boolean(blankCheck), Boolean(blankCheck), Boolean(blankCheck?.unchanged), 'blank click must leave the terminal state unchanged', blankCheck),
    makeCheck('next-level-ready', Boolean(next), Boolean(next), Boolean(next?.state?.levelNumber === 2 && next.state.status === 'ready'), 'next level must be level 2 ready', next),
    makeCheck('reload-level2-ready', Boolean(reload), Boolean(reload), Boolean(reload?.state?.levelNumber === 2 && reload.state.status === 'ready'), 'reload must retain level 2 ready', reload),
    makeCheck('reload-input-response', Boolean(postReloadPlay), observationValid, responsePassed, 'refresh ready input observation and immediate action response', { ...postReloadPlay, input }),
  ];
}
export function summarizeOrdinary({ checks, targetReached, terminal, assertionFailure = null, assertionFailureObserved = false, environmentFailure = null, unknownFailure = null }) {
  const failedCheck = checks.find((check) => check.executed && check.validObservation && !check.passed);
  if (failedCheck && !assertionFailure) { assertionFailure = `${failedCheck.id}: ${failedCheck.reason}`; assertionFailureObserved = true; }
  const validObservation = checks.every((check) => check.executed && check.validObservation);
  const allAssertionsPass = checks.every((check) => check.passed);
  const result = classify({ targetReached, validObservation: validObservation && allAssertionsPass, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure });
  return { checks, validObservation, allAssertionsPass, result, rawOutcome: rawOutcome({ targetReached, validObservation: validObservation && allAssertionsPass, allAssertionsPass, terminal, assertionFailure, assertionFailureObserved, environmentFailure, unknownFailure }), assertionFailure, assertionFailureObserved };
}
