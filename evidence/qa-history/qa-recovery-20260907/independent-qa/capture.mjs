import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd(), run=resolve(root,'runs/mobile-slice-adaptation-20260830');
const task=JSON.parse(readFileSync(`${run}/qa-recovery-20260907/qa-task.json`));
const out=task.outputDirectory, ws=task.workspace;
const require=createRequire(`${ws}/package.json`), {chromium}=require('@playwright/test');
mkdirSync(out,{recursive:true});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function files(p){return readdirSync(p).sort().flatMap(n=>statSync(`${p}/${n}`).isDirectory()?files(`${p}/${n}`):[`${p}/${n}`]);}
const snapshot=[...files(`${ws}/dist`),...files(`${ws}/src`),`${ws}/index.html`,`${ws}/package.json`].map(path=>({path,sha256:hash(path)}));
const buildHash=createHash('sha256').update(JSON.stringify(snapshot.filter(x=>x.path.includes('/dist/')))).digest('hex');
writeFileSync(`${out}/source-snapshot.json`,JSON.stringify({targetGame:task.targetGame,workspace:ws,buildHash,files:snapshot},null,2));
const video=`${run}/reference-evidence/incoming/_2026-09-06-135548-3781e4dcd3d2.mp4`;
const server=createServer((req,res)=>{let path=req.url==='/reference.mp4'?video:resolve(ws,'dist',decodeURIComponent(req.url?.split('?')[0]||'/').replace(/^\//,'')||'index.html');if(req.url==='/reference.html'){res.setHeader('Content-Type','text/html');res.end('<video controls src="/reference.mp4" style="width:100%;height:100vh;object-fit:contain"></video>');return;}try{const size=statSync(path).size,range=req.headers.range;res.setHeader('Content-Type',extname(path)==='.mp4'?'video/mp4':extname(path)==='.html'?'text/html':extname(path)==='.js'?'text/javascript':'application/octet-stream');if(range){const [a,b]=range.replace('bytes=','').split('-'),start=Number(a),end=b?Number(b):size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});createReadStream(path,{start,end}).pipe(res);}else{res.setHeader('Content-Length',size);createReadStream(path).pipe(res);}}catch{res.statusCode=404;res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;let browser;
const summaries=[];
try{
 browser=await chromium.launch({headless:true});
 if(process.argv.includes('--reference')){
  const page=await browser.newPage({viewport:{width:1100,height:720}});await page.goto(`${url}/reference.html`);
  let result={sha256:hash(video),path:video};try{await page.locator('video').evaluate(async v=>{await new Promise((resolve,reject)=>{if(v.readyState>=1)return resolve();v.onloadedmetadata=resolve;v.onerror=reject;setTimeout(()=>reject('metadata timeout'),10000)});});result.duration=await page.locator('video').evaluate(v=>v.duration);for(const t of [0,Math.min(8,result.duration/3),Math.min(18,result.duration*0.7)]){await page.locator('video').evaluate((v,t)=>{v.currentTime=t;},t);await page.waitForTimeout(500);await page.screenshot({path:`${out}/reference-${t.toFixed(1)}.png`});}result.inspection='screenshots captured';}catch(e){result.error=String(e);}writeFileSync(`${out}/reference-observation.json`,JSON.stringify(result,null,2));
 }else{
 const mode=process.argv[2]||'portrait',width=mode==='desktop'?1100:390,height=mode==='desktop'?720:844,cadence=Number(process.argv[3]||550),attempt=process.argv[4]||'1',prefix=`${mode}-${attempt}`;
 const context=await browser.newContext({viewport:{width,height},hasTouch:mode==='portrait',isMobile:mode==='portrait',recordVideo:{dir:`${out}/videos`,size:{width,height}}});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});const page=await context.newPage(),logs=[],trace=[];
 page.on('pageerror',e=>logs.push({kind:'pageerror',text:String(e)}));page.on('console',m=>logs.push({kind:m.type(),text:m.text()}));
 await page.goto(`${url}/index.html`);await page.waitForTimeout(1000);
 const capture=async(label)=>{const path=`${out}/${prefix}-${label}.png`;await page.screenshot({path});return path;};
 const observe=async(label)=>{const state=await page.evaluate(()=>window.__GAME_TEST__?.getState());const dom=await page.locator('body').innerText();trace.push({label,wallTime:Date.now(),state,dom});};
 await capture('startup');await observe('startup');console.log(JSON.stringify({checkpoint:'startup',prefix,path:`${out}/${prefix}-startup.png`}));
 for(let i=0;i<65;i++){
  if(mode==='portrait')await page.touchscreen.tap(width/2,height*.7);else await page.mouse.click(width/2,height*.7);
  await page.waitForTimeout(cadence);await observe(`tap-${i+1}`);
  if(i%3===0)await capture(`tap-${String(i+1).padStart(2,'0')}`);
  const terminalCopy=(await page.locator('#terminal-text').innerText()).trim();
  if(/关卡完成|碰到危险物|失足|跌落/.test(terminalCopy) && await page.locator('#terminal-text').isVisible()){
   await capture('terminal');await observe('terminal');await page.locator('#replay-button').click();await page.waitForTimeout(300);await capture('replay');await observe('replay');break;
  }
 }
 await capture('end');await observe('end');writeFileSync(`${out}/${prefix}-trace.json`,JSON.stringify({schemaVersion:1,targetGame:task.targetGame,workspace:ws,buildHash,url,device:{width,height},inputPolicy:`fixed ${cadence}ms interval normal ${mode==='portrait'?'touch':'mouse'}; no state used to decide taps; terminal replay uses visible DOM button`,forbiddenOperations:[],observations:trace},null,2));
 writeFileSync(`${out}/${prefix}-console.json`,JSON.stringify(logs,null,2));await context.tracing.stop({path:`${out}/${prefix}-playwright-trace.zip`});await context.close();console.log(JSON.stringify({prefix,observations:trace.length,states:trace.map(x=>({label:x.label,status:x.state?.status,cuts:x.state?.cuts,x:x.state?.player.x,reason:x.state?.failReason})),logs}));
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
