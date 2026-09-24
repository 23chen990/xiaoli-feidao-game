import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleDecision} from './visible-policy.mjs';
test('normal input is driven only by visible handle below threshold and cooldown',()=>{
 assert.equal(visibleDecision({pixelY:.6,confidence:true,elapsedSinceTap:900,threshold:.5}),true);
 assert.equal(visibleDecision({pixelY:.3,confidence:true,elapsedSinceTap:900,threshold:.5}),false);
 assert.equal(visibleDecision({pixelY:.6,confidence:false,elapsedSinceTap:900,threshold:.5}),false);
 assert.equal(visibleDecision({pixelY:.6,confidence:true,elapsedSinceTap:200,threshold:.5}),false);
});
