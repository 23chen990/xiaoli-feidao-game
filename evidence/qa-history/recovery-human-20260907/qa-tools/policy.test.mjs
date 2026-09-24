import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyTerminal,makeSchedule,assertConfig} from './policy.mjs';
test('transient reward and visible replay are not terminal; explicit outcome is required',()=>{
 assert.equal(classifyTerminal('收益揭示 ×1 · 20',true),null);
 assert.equal(classifyTerminal('重玩',true),null);
 assert.equal(classifyTerminal('关卡完成\n×1\n分数23',false),null);
 assert.equal(classifyTerminal('关卡完成\n×1\n分数23',true),'won');
 assert.equal(classifyTerminal('碰到危险物\n分数8\n再次轻触',true),'failed');
 assert.equal(classifyTerminal('跌出路线\n分数4\n再次轻触',true),'failed');
});
test('declared input deadlines are absolute and independent of observation/capture latency',()=>{
 assert.deepEqual(makeSchedule(800,2500),[0,800,1600,2400]);
 assert.throws(()=>makeSchedule(0,2500));
});
test('recorder must have exact hash, isolated output and bounded declared run before launch',()=>{
 const config={outputDirectory:'/tmp/qa-attempt-1',expectedBuildSha256:'a'.repeat(64),viewport:'portrait',cadenceMs:800,activeMs:45000};
 assert.equal(assertConfig(config),true);
 assert.throws(()=>assertConfig({...config,expectedBuildSha256:''}));
 assert.throws(()=>assertConfig({...config,activeMs:999999}));
 assert.throws(()=>assertConfig({...config,outputDirectory:'relative'}));
});
