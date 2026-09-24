import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createReadStream,readFileSync,writeFileSync,readdirSync,statSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {classifyTerminal,makeSchedule,assertConfig} from './policy.mjs';
const toolDirectory=dirname(fileURLToPath(import.meta.url));
const run=resolve(toolDirectory,'../..'),workspace=`${run}/workspace/prototype-a`;
const usage='node record.mjs --outputDirectory ABSOLUTE_NEW_DIRECTORY --expectedBuildSha256 DIST_INDEX_SHA256 --viewport portrait|desktop --cadenceMs 800 [--activeMs 45000]';
if(process.argv.includes('--help')){console.log(usage);process.exit(0);}
const args=Object.fromEntries(process.argv.slice(2).reduce((all,value,index,list)=>index%2===0?[...all,[value.replace(/^--/u,''),list[index+1]]]:all,[]));
const config={outputDirectory:args.outputDirectory||'',expectedBuildSha256:args.expectedBuildSha256||'',viewport:args.viewport||'portrait',cadenceMs:Number(args.cadenceMs||800),activeMs:Number(args.activeMs||45000)};
assertConfig(config);
const out=resolve(config.outputDirectory);
if(!out.startsWith(`${run}/recovery-human-20260907/`)||out.startsWith(toolDirectory)||existsSync(out))throw new Error('Output must be a new immutable directory inside this recovery cycle, outside qa-tools');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(hash(`${workspace}/dist/index.html`)!==config.expectedBuildSha256)throw new Error('Build hash mismatch; no browser launched');
function files(dir){return readdirSync(dir).sort().flatMap(name=>statSync(`${dir}/${name}`).isDirectory()?files(`${dir}/${name}`):[`${dir}/${name}`]);}
const snapshot=[...files(`${workspace}/dist`),...files(`${workspace}/src`),`${workspace}/index.html`,`${workspace}/package.json`].map(path=>({path,sha256:hash(path)}));
mkdirSync(dirname(out),{recursive:true});mkdirSync(out);mkdirSync(`${out}/frames`);
const save=(name,value)=>writeFileSync(`${out}/${name}`,JSON.stringify(value,null,2)+'\n');
save('source-before.json',{targetGame:'mobile-slice-adaptation-20260830',workspace,files:snapshot});
save('policy.json',{...config,settlingAllowanceMs:30000,denseFrameIntervalMs:75,denseWindowMs:2400,observationsIntervalMs:100,inputPolicy:'absolute wall deadlines; independent input, observations and frame tasks; late deadlines skipped, never burst; actual dispatch/completion timestamps retained',terminalPolicy:'visible exact completed/failed copy, then read-only status cross-check; reward reveal and replay button never terminal',plannedInputOffsetsMs:makeSchedule(config.cadenceMs,config.activeMs),forbiddenOperations:[]});
const server=createServer((req,res)=>{const relative=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\//u,'')||'index.html',path=resolve(workspace,'dist',relative);if(!path.startsWith(`${workspace}/dist/`)){res.statusCode=403;res.end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm'})[extname(path)]||'application/octet-stream');createReadStream(path).pipe(res);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
const require=createRequire(`${workspace}/package.json`),{chromium}=require('@playwright/test');
const viewport=config.viewport==='portrait'?{width:390,height:844}:{width:1100,height:720};
const inputs=[],observations=[],frames=[],errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
let browser,context,page,cdp,t0,terminal=null,replay=null,finished=false,runError=null;
const screenshot=async(label)=>{const startedMs=performance.now()-t0,path=`${out}/frames/${label}.png`;await page.screenshot({path,timeout:15000});frames.push({path,startedMs,completedMs:performance.now()-t0});return path;};
try{
 browser=await chromium.launch({headless:true});context=await browser.newContext({viewport,hasTouch:config.viewport==='portrait',isMobile:config.viewport==='portrait',recordVideo:{dir:`${out}/video`,size:viewport}});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});page=await context.newPage();
 page.on('pageerror',e=>errors.push({kind:'pageerror',text:String(e)}));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push({kind:m.type(),text:m.text()});});
 await page.goto(url);await page.waitForTimeout(1000);t0=performance.now();await screenshot('startup');
 const initial=await page.evaluate(()=>window.__GAME_TEST__?.getState());observations.push({atMs:performance.now()-t0,label:'startup',state:initial});
 t0=performance.now();
 cdp=await context.newCDPSession(page);let denseIndex=0;
 cdp.on('Page.screencastFrame',event=>{const atMs=performance.now()-t0;cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});if(atMs>2400)return;const path=`${out}/frames/dense-${String(denseIndex++).padStart(4,'0')}.jpg`;writeFileSync(path,Buffer.from(event.data,'base64'));frames.push({path,startedMs:atMs,completedMs:performance.now()-t0,browserTimestampSeconds:event.metadata.timestamp});});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,everyNthFrame:1});
 const inputTask=(async()=>{for(const plannedMs of makeSchedule(config.cadenceMs,config.activeMs)){
  await sleep(t0+plannedMs-performance.now());if(terminal||finished)break;
  const dispatchedMs=performance.now()-t0;
  if(dispatchedMs-plannedMs>config.cadenceMs){inputs.push({plannedMs,dispatchedMs,kind:'skipped-late-deadline'});continue;}
  if(config.viewport==='portrait')await page.touchscreen.tap(viewport.width*.5,viewport.height*.72);else await page.mouse.click(viewport.width*.5,viewport.height*.72);
  inputs.push({plannedMs,dispatchedMs,completedMs:performance.now()-t0,kind:config.viewport==='portrait'?'touch':'mouse'});
 }})().catch(error=>{errors.push({kind:'input-runner-error',text:String(error)});finished=true;});
 const observeTask=(async()=>{while(!finished){const observation=await page.evaluate(()=>{const el=document.querySelector('#terminal-text'),style=el?getComputedStyle(el):null;return {state:window.__GAME_TEST__?.getState(),terminalCopy:el?.textContent||'',terminalVisible:!!el&&!!el.getClientRects().length&&style?.visibility!=='hidden',bodyText:document.body.innerText};});
  const atMs=performance.now()-t0;observations.push({atMs,...observation});const visibleOutcome=classifyTerminal(observation.terminalCopy,observation.terminalVisible);
  if(visibleOutcome&&observation.state?.status===visibleOutcome){terminal={atMs,outcome:visibleOutcome,copy:observation.terminalCopy};break;}
  if(atMs>=config.activeMs+30000)break;await sleep(100);
 }})();
 const frameTask=(async()=>{await sleep(2400);await cdp.send('Page.stopScreencast');let nextMs=2400,index=0;while(!finished&&!terminal){await sleep(t0+nextMs-performance.now());if(finished||terminal)break;await screenshot(`frame-${String(index++).padStart(4,'0')}`);nextMs=performance.now()-t0+1000;}})().catch(error=>{errors.push({kind:'frame-runner-error',text:String(error)});finished=true;});
 await observeTask;finished=true;await Promise.allSettled([inputTask,frameTask]);
 if(terminal){await screenshot('terminal');await page.locator('#replay-button').click();await sleep(350);await screenshot('replay');replay={atMs:performance.now()-t0,state:await page.evaluate(()=>window.__GAME_TEST__?.getState())};}
 await screenshot('end');
}catch(error){runError=String(error);errors.push({kind:'runner-error',text:runError});}
finally{
 finished=true;
 if(cdp)await cdp.send('Page.stopScreencast').catch(()=>{});
 if(context){try{await context.tracing.stop({path:`${out}/playwright-trace.zip`});}catch(e){errors.push({kind:'trace-cleanup',text:String(e)});}await context.close();}
 await browser?.close();await new Promise(r=>server.close(r));
 const after=snapshot.map(item=>({...item,afterSha256:existsSync(item.path)?hash(item.path):null}));
 const unchanged=after.every(item=>item.sha256===item.afterSha256)&&hash(`${workspace}/dist/index.html`)===config.expectedBuildSha256;
 save('source-after.json',{unchanged,files:after});
 const dense=frames.filter(x=>x.path.includes('/dense-')&&x.startedMs>=0&&x.startedMs<2400);const denseMaxGapMs=dense.length<2?null:dense.slice(1).reduce((max,f,i)=>Math.max(max,f.startedMs-dense[i].startedMs),0);
 save('recording.json',{schemaVersion:1,targetGame:'mobile-slice-adaptation-20260830',workspace,outputDirectory:out,expectedBuildSha256:config.expectedBuildSha256,url,viewport,observedAt:new Date().toISOString(),startedFromFreshContext:true,inputs,observations,frames,terminal,replay,errors,runError,unchanged,forbiddenOperations:[],denseMaxGapMs,limitations:denseMaxGapMs===null||denseMaxGapMs>100?['Dense browser frame interval exceeded 100ms or missing; exact timing requires video frame inspection and remains unverified.']:[]});
 save('evidence-sha256.json',{targetGame:'mobile-slice-adaptation-20260830',workspace,expectedBuildSha256:config.expectedBuildSha256,files:files(out).filter(x=>!x.endsWith('/evidence-sha256.json')).map(path=>({path,sha256:hash(path)}))});
 console.log(JSON.stringify({outputDirectory:out,terminal,unchanged,runError}));
}
