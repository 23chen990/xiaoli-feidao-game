import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {QaReportSchema} from '../../../../src/schemas/index.ts';
import {TaskSchema,ResultSchema} from '../../qa-recovery-20260907/recovery-schemas.ts';
const run=resolve('runs/mobile-slice-adaptation-20260830'),base=`${run}/recovery-human-20260907`,out=`${base}/attempt-1-evidence-analysis`;
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const task=TaskSchema.parse(read(`${base}/evidence-analysis-task.json`));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(name:string,data:unknown)=>{const path=`${out}/${name}`;writeFileSync(path,JSON.stringify(data,null,2)+'\n');return path;};
const buildHash='c8f24a360b3dc8963beccc87bc1db10e62f2dda4276afdf0ffb6074240d4636c';
const FrameSchema=z.object({requestedSeconds:z.number(),actual:z.object({mediaTime:z.number(),presentedFrames:z.number(),width:z.number(),height:z.number()}),path:z.string(),sha256:z.string()});
const ManifestSchema=z.object({schemaVersion:z.literal(1),targetGame:z.string(),workspace:z.string(),buildSha256:z.string(),videoPath:z.string(),videoSha256:z.string(),originalManifest:z.string(),historicalRecording:z.string(),historicalRecordingSha256:z.string(),method:z.string(),metadata:z.object({duration:z.number(),width:z.number(),height:z.number()}),frames:z.array(FrameSchema)});
const sequences=['portrait','desktop'].map(device=>{
 const manifest=ManifestSchema.parse(read(`${out}/${device}/frames.json`));
 if(manifest.targetGame!==task.targetGame||manifest.workspace!==task.workspace||manifest.buildSha256!==buildHash||hash(manifest.videoPath)!==manifest.videoSha256||hash(manifest.historicalRecording)!==manifest.historicalRecordingSha256||manifest.frames.some(f=>hash(f.path)!==f.sha256))throw new Error('Evidence identity/hash mismatch');
 const history=read(manifest.historicalRecording),i=history.observations.findIndex((o:any)=>o.state?.sigils?.find((s:any)=>s.id==='rune-1')?.cut);
 const historicalStates=history.observations.slice(i-1,i+1).map((o:any)=>({atMs:o.atMs,cuts:o.state.cuts,totalEarnings:o.state.totalEarnings,rune1:o.state.sigils.find((s:any)=>s.id==='rune-1'),events:o.state.events}));
 const lastIntact=device==='portrait'?'2.660':'2.540',firstCut=device==='portrait'?'2.680':'2.560',later=device==='portrait'?'2.720':'2.660';
 const paths=[`${out}/${device}/t-${lastIntact}.png`,`${out}/${device}/t-${firstCut}.png`,`${out}/${device}/t-${later}.png`];
 return {device,manifestPath:`${out}/${device}/frames.json`,buildHash,videoSha256:manifest.videoSha256,lastIntactFrame:manifest.frames.find(f=>f.path===paths[0]),firstObservedCutRewardFrame:manifest.frames.find(f=>f.path===paths[1]),laterFrame:manifest.frames.find(f=>f.path===paths[2]),directPixels:{intactPhase:'刀已接触或在屏幕投影上与球体重叠，物体仍完整时，切割/分数/收益均为0，没有局部+1。',cutRewardPhase:device==='portrait'?'实际2.68s首张变化帧可见完整球体已变为两侧切片，中央出现亮色切面/分缝，局部+1位于原球体，HUD收益变1；后续2.72s两半明显向外分离。':'实际2.56s首张变化帧中完整球体已分成两个有切面的半球，间隙可辨；局部+1位于原球体附近，HUD收益变1；后续继续分离。',bladeInterpretation:'奖励帧中刀仍可能在两片之间或与其投影重叠，这不代表原物体仍处于intact。未观察到完整态持续涨收益。',localRewardVisible:true,hudChangesOnlyOnObservedPostCutFrames:true,concreteContradictionObserved:false},historicalReadOnlyStates:historicalStates,unknowns:['视频25fps，帧间约40ms；最后完整态与首张切开/奖励帧之间不能解析同一帧内部执行先后。','没有证明一个独立的“已经分开但奖励尚未开始”的必需空档；用户并未要求这种空档，也未给出最小分离距离或延迟。'],evidence:paths};
});
const chronologyPath=save('chronology.json',{schemaVersion:1,targetGame:task.targetGame,workspace:task.workspace,buildHash,sourceCorrection:`${run}/artifacts/gameplay-retro-missed-topology-v2.json#corrections[0]`,sourceCorrectionSha256:hash(`${run}/artifacts/gameplay-retro-missed-topology-v2.json`),interpretation:'按用户纠正核验切后物体的局部奖励和累计更新，不添加动画必须完全不重叠或强制延迟要求。',sequences,answers:{cutBeforeReward:'首次有奖励的已解码帧已经呈现切面/两片；没有奖励出现在完整态的反例。同帧内是否先完成分离再触发局部奖励不能由25fps视频独立解析。',hudDuringIntact:'未观察到。完整态且刀投影重叠时HUD仍0；切开与局部+1首次出现时HUD变1。',localAtTarget:'两个视口均是；+1从首个目标附近出现，然后继续上浮。',repairImplication:'本分析没有发现可据以新增奖励修复的具体矛盾。保留采样未知，不要求为了把动画分成互不重叠阶段而修改产品。'}});
const diagnostics=QaReportSchema.parse({schemaVersion:1,passed:false,checks:sequences.flatMap(s=>[
 {name:`${s.device}: intact with blade overlap does not increase HUD`,passed:true,evidence:s.evidence[0]},
 {name:`${s.device}: local reward appears at already cut target; HUD updates with it`,passed:true,evidence:s.evidence[1]},
 {name:`${s.device}: resolve within-frame precedence between initial separation and reward`,passed:false,evidence:chronologyPath}
]),issues:[{id:'REWARD-VIDEO-SAMPLING-LIMIT',severity:'warning',message:'现有25fps归档视频首次变化帧同时包含切开、局部奖励和累计更新，无法证明同帧内先后；没有观察到完整态涨收益或奖励脱离目标的新错误，不因此提出产品修复。',evidence:chronologyPath}],screenshots:sequences.flatMap(s=>s.evidence),consoleLog:`${out}/analysis-log.json`,testedAt:new Date().toISOString()});
const diagnosticPath=save('diagnostic-report.json',diagnostics);
save('analysis-log.json',{gameRuns:0,gameServers:0,videoOnlyServers:8,sourceOrDistRead:false,sealedEvidenceModified:false,oldVideoHashesVerified:true,scope:'one first rune-1 cut sequence per viewport; coarse seek locating plus40–80ms decoded source frame steps',cleanup:'all video-only Chromium pages and localhost servers closed',strictTemporalInterpretationRejected:'No requirement that phases cannot overlap, no invented delay, no hidden-state product verdict'});
const result=ResultSchema.parse({schemaVersion:1,role:'QAAgent',targetGame:task.targetGame,workspace:task.workspace,status:'BLOCKED',reportPaths:[diagnosticPath,chronologyPath,`${out}/portrait/frames.json`,`${out}/desktop/frames.json`,`${out}/evidence-sha256.json`],blockers:['既有25fps视频无法分辨首张切开/局部奖励帧内部的先后；这是采样限制，没有新增产品错误。'],sourceModified:false,summary:'两个视口均未见完整态涨收益：刀接触完整球时HUD为0，首次奖励帧已有切面/两片，局部+1位于目标，HUD同步为1。分离与奖励在同帧内的先后未知；不添加动画必须互不重叠的要求，不据此建议奖励修复。仅解码归档视频，未运行游戏或改动旧证据。'});
save('result.json',result);
function files(p:string):string[]{return readdirSync(p).sort().flatMap(n=>statSync(`${p}/${n}`).isDirectory()?files(`${p}/${n}`):[`${p}/${n}`]);}
save('evidence-sha256.json',{schemaVersion:1,targetGame:task.targetGame,workspace:task.workspace,buildHash,files:files(out).filter(p=>p!==`${out}/evidence-sha256.json`).map(path=>({path,sha256:hash(path)}))});
console.log(JSON.stringify(result));
