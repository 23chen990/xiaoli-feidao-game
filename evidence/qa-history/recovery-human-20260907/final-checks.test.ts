import test from 'node:test';
import assert from 'node:assert/strict';
import {finalChecksPass} from './final-checks.ts';
const t=(command:string,phase:string,exitCode:number)=>({command,phase,exitCode,logPath:'/evidence/log'});
test('final full suite supersedes an intermediate suite failure',()=>assert.equal(finalChecksPass([t('pnpm test (intermediate)','GREEN',1),t('pnpm test (final)','GREEN',0),t('pnpm lint','LINT',0),t('pnpm typecheck','TYPECHECK',0)]),true));
test('failed final suite cannot pass from prior success',()=>assert.equal(finalChecksPass([t('pnpm test','GREEN',0),t('pnpm test (final)','GREEN',1),t('pnpm lint','LINT',0),t('pnpm typecheck','TYPECHECK',0)]),false));
test('targeted success does not replace full suite or missing lint',()=>assert.equal(finalChecksPass([t('tsx --test tests/one.ts','GREEN',0),t('pnpm typecheck','TYPECHECK',0)]),false));
test('a failed distinct final check stays blocking',()=>assert.equal(finalChecksPass([t('pnpm test','GREEN',0),t('pnpm lint','LINT',1),t('pnpm typecheck','TYPECHECK',0)]),false));
