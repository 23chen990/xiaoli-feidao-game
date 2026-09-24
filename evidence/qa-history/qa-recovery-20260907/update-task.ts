import { readFileSync,writeFileSync } from 'node:fs';
import { TaskSchema } from './recovery-schemas.ts';
const base='runs/mobile-slice-adaptation-20260830/qa-recovery-20260907/';
const old=TaskSchema.parse(JSON.parse(readFileSync(base+'qa-task.json','utf8')));
const next=TaskSchema.parse({...old,instructions:[...old.instructions,'Parent completed active-slice-contract.json and reproduction-matrix.json in the parent of outputDirectory (12 ReferenceBehaviorCheckSchema cases). Read these for the consolidated currently effective acceptance rules; report missing coverage BLOCKED rather than expanding QA indefinitely.','Evidence quality note: portrait-1 trace label terminal has status airborne, so that screenshot/label is not a terminal observation. Keep it explicitly non-terminal and do not let a permanently visible replay button prove settlement.','Runtime dependency fallback for reference video decoding exists at /Users/kker/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3. If decoding remains unsupported, preserve reference pixel comparison BLOCKED; no need to install new dependencies.']});
writeFileSync(base+'qa-task-update.json',JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({validated:true,path:base+'qa-task-update.json'}));
