export function bonusResponseCheck({ entered, input }) {
  if (!entered) return { id: 'bonus-entry', executed: false, validObservation: false, passed: false, result: 'NOT_RUN', rawOutcome: 'bonus-checkpoint-not-executed' };
  const receiptValid = Boolean(input?.inputReceiptObserved);
  const causal = input?.response?.causalEvidence;
  const handlerObservationComplete = Boolean(receiptValid && causal?.inputId === input.inputId && causal.before && causal.after);
  const directAction = (input?.response?.directCausalEvents ?? []).some((event) => event.type === 'launch' || event.type === 'flip');
  const automaticCutOnly = Boolean(input?.response?.automaticCutOnly && !directAction);
  const validObservation = receiptValid && handlerObservationComplete;
  const passed = validObservation && directAction && !automaticCutOnly && input.after?.phase === 'bonus';
  return { id: 'bonus-input-response', executed: true, validObservation, passed, result: !validObservation ? 'NOT_RUN' : passed ? 'PASS' : 'FAIL', rawOutcome: !validObservation ? 'bonus-input-observation-invalid' : passed ? 'bonus-input-response-passed' : 'bonus-input-assertion-failure', evidence: { inputId: input?.inputId ?? null, receiptValid, handlerObservationComplete, directAction, automaticCutOnly, after: input?.after ?? null } };
}

export function summarizeBonus({ entered, responseCheck = null, assertionFailure = null, assertionFailureObserved = false, environmentFailure = null, unknownFailure = null, terminal = null }) {
  if (entered && responseCheck?.result === 'FAIL' && !assertionFailure) {
    assertionFailure = `${responseCheck.id}: ${responseCheck.rawOutcome}`;
    assertionFailureObserved = true;
  }
  const validObservation = Boolean(entered && responseCheck?.validObservation);
  const allAssertionsPass = Boolean(entered && responseCheck?.passed);
  const result = assertionFailure && assertionFailureObserved
    ? 'FAIL'
    : environmentFailure || (unknownFailure && entered)
      ? 'BLOCKED'
      : entered && validObservation && allAssertionsPass
        ? 'PASS'
        : 'NOT_RUN';
  const rawOutcome = assertionFailure && assertionFailureObserved
    ? 'bonus-input-assertion-failure'
    : environmentFailure
      ? 'environment-or-tool-failure'
      : unknownFailure
        ? (entered ? 'unknown-post-entry-script-failure' : 'unknown-pre-entry-script-failure')
        : entered && (!validObservation || !allAssertionsPass)
          ? (validObservation ? 'bonus-input-assertion-failure' : 'bonus-input-observation-invalid')
          : entered
            ? 'bonus-input-response-passed'
            : terminal?.status === 'failed'
              ? 'ordinary-terminal-failed-before-target'
              : 'bonus-checkpoint-not-executed';
  return { result, rawOutcome, validObservation, allAssertionsPass, assertionFailure, assertionFailureObserved };
}
