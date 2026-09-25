import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { bonusResponseCheck, summarizeBonus } from './r2-bonus-acceptance-v01.mjs';

const source = await readFile(new URL('./r2-bonus-acceptance-v01.mjs', import.meta.url));
const moduleSha256 = createHash('sha256').update(source).digest('hex');
const causal = (inputId, events = [{ type: 'flip' }]) => ({ inputId, inputReceiptObserved: true, after: { phase: 'bonus' }, response: { causalEvidence: { inputId, before: { phase: 'bonus' }, after: { phase: 'bonus' } }, directCausalEvents: events, automaticCutOnly: false } });
function run(name, entered, input, environmentFailure = null) {
  const responseCheck = bonusResponseCheck({ entered, input });
  const summary = summarizeBonus({ entered, responseCheck, environmentFailure, terminal: input?.after ?? null });
  return { name, responseCheck, summary: { result: summary.result, rawOutcome: summary.rawOutcome, validObservation: summary.validObservation, allAssertionsPass: summary.allAssertionsPass, assertionFailure: summary.assertionFailure } };
}
const cases = [
  run('entered-bonus-missing-handler', true, { inputId: 'bonus-2', inputReceiptObserved: true, after: { phase: 'bonus' }, response: null }),
  run('only-previous-input-causal-record', true, { ...causal('bonus-1'), inputId: 'bonus-2' }),
  run('product-fail-then-tool-error', true, { inputId: 'bonus-2', ...causal('bonus-2', []) }, 'later browser context close'),
  run('automatic-cut-only', true, { inputId: 'bonus-2', ...causal('bonus-2', [{ type: 'cut' }]), response: { causalEvidence: { inputId: 'bonus-2', before: { phase: 'bonus' }, after: { phase: 'bonus' } }, directCausalEvents: [], automaticCutOnly: true } }),
  run('not-entered', false, null),
];
const report = { artifactType: 'B01BonusAcceptanceRecheck', moduleSha256, browserRunsPerformed: 0, sourceScriptVersion: 'B01-R2-acceptance-v2.4', cases };
await writeFile(new URL('./r2-bonus-recheck-v01.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
