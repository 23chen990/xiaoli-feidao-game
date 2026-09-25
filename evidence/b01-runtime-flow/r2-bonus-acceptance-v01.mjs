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
