import {createServer} from 'node:http';
import {createReadStream,readFileSync,writeFileSync,readdirSync,statSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const run=resolve('runs/mobile-slice-adaptation-20260830'),out=`${run}/recovery-human-20260907/attempt-1-evidence-analysis`;
const viewportName=process.argv[2]||'portrait',times=(process.argv[3]||'0.6,1,1.4,1.8,2.2').split(',').map(Number);
const original=`${run}/recovery-human-20260907/attempt-1/qa/${viewportName}-1`,recording=JSON.parse(readFileSync(`${original}/recording.json`));
const videoPath=`${original}/video/${readdirSync(`${original}/video`).find(n=>n.endsWith('.webm'))}`;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const originalManifest=JSON.parse(readFileSync(`${original}/evidence-sha256.json`));
if(originalManifest.files.find(f=>f.path===videoPath)?.sha256!==hash(videoPath))throw new Error('Sealed video hash mismatch');
mkdirSync(`${out}/${viewportName}`,{recursive:true});
const server=createServer((req,res)=>{if(req.url==='/video.webm'){const size=statSync(videoPath).size,range=req.headers.range;res.setHeader('Content-Type','video/webm');res.setHeader('Accept-Ranges','bytes');if(range){const [a,b]=range.replace('bytes=','').split('-'),start=Number(a),end=b?Number(b):size-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});createReadStream(videoPath,{start,end}).pipe(res);}else{res.setHeader('Content-Length',size);createReadStream(videoPath).pipe(res);}return;}if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>html,body{margin:0;background:black}video{display:block;width:100vw;height:100vh;object-fit:contain}</style><video muted preload="auto" src="/video.webm"></video>');return;}res.statusCode=404;res.end();});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const require=createRequire(`${run}/workspace/prototype-a/package.json`),{chromium}=require('@playwright/test');let browser;
const manifestPath=`${out}/${viewportName}/frames.json`,frames=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath)).frames:[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:recording.viewport});await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('video').evaluate(v=>new Promise((resolve,reject)=>{if(v.readyState>=1)return resolve();v.onloadedmetadata=resolve;v.onerror=reject;setTimeout(()=>reject(new Error('metadata timeout')),15000);}));
 const metadata=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));console.log(JSON.stringify({viewportName,metadata}));
 for(const seconds of times){const path=`${out}/${viewportName}/t-${seconds.toFixed(3)}.png`;if(existsSync(path))continue;
  const actual=await page.locator('video').evaluate((v,t)=>new Promise((resolve,reject)=>{v.pause();let timeout=setTimeout(()=>reject(new Error('frame timeout')),10000);v.requestVideoFrameCallback((now,meta)=>{clearTimeout(timeout);resolve({mediaTime:meta.mediaTime,presentedFrames:meta.presentedFrames,width:meta.width,height:meta.height})});v.currentTime=t;}),seconds);
  await page.screenshot({path});frames.push({requestedSeconds:seconds,actual,path,sha256:hash(path)});
 }
 const result={schemaVersion:1,targetGame:recording.targetGame,workspace:recording.workspace,buildSha256:recording.expectedBuildSha256,videoPath,videoSha256:hash(videoPath),originalManifest:`${original}/evidence-sha256.json`,historicalRecording:`${original}/recording.json`,historicalRecordingSha256:hash(`${original}/recording.json`),method:'Chromium video-only localhost page; paused seek + requestVideoFrameCallback mediaTime; screenshot of actual decoded frame; no gameplay page served',metadata,frames:frames.sort((a,b)=>a.requestedSeconds-b.requestedSeconds)};
 writeFileSync(manifestPath,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifestPath,frameCount:frames.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
