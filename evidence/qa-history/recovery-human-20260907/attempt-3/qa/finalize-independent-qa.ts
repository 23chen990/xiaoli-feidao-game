import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MatrixSchema, ResultSchema} from '../../../qa-recovery-20260907/recovery-schemas.ts';
import {QaReportSchema} from '../../../../../src/schemas/index.ts';
import {NaturalFlowEvidenceSchema} from '../../../../../src/schemas/natural-flow.ts';
import {PerceptualQaReportSchema} from '../../../../../src/schemas/product-experience.ts';
const root='/Users/kker/Documents/ChatGPT/妖怪夜市/runs/mobile-slice-adaptation-20260830', cycle=`${root}/recovery-human-20260907`, qa=`${cycle}/attempt-3/qa`, p=`${qa}/portrait-1`, d=`${qa}/desktop-1`, targetGame='mobile-slice-adaptation-20260830', workspace=`${root}/workspace/prototype-a`, buildHash='e3b8d5721901bae1182e0e407c3f214341195d16d1044335a3183cd713341da1', now=new Date().toISOString();
const pFrame=(n:number)=>`${p}/frames/frame-${String(n).padStart(4,'0')}.png`, dFrame=(n:number)=>`${d}/frames/frame-${String(n).padStart(4,'0')}.png`, pRec=`${p}/recording.json`, dRec=`${d}/recording.json`;
const cells=[
 ['L1-INPUT-390','FAIL',[pFrame(0),pRec],'完整首个目标被高白色结构遮去大半，刀与目标不能同时清楚辨认。'],
 ['L1-GROUND-390','PASS',[pFrame(0)],'开场白色基座有厚度并接到可见地面。'],
 ['L1-STACK-390','BLOCKED',[pRec],'本轮自然路线在危险前结束，未取得指定 stack-a/b 同一对象的散开、掉落、落地像素链。'],
 ['L1-REWARD-390','BLOCKED',[pRec],'本轮虽观察到一次切割分数变化，但未取得足够清晰的局部奖励附着与分离连续画面。'],
 ['L1-PRESSURE-390','PASS',[pFrame(6),`${qa}/portrait-1/frames/terminal.png`],'尖刺在接近前可见，碰撞后显示可归因失败与重试入口。'],
 ['L1-FINISH-390','BLOCKED',[pRec],'固定节奏在危险处失败，未取得本构建的终点结算与重玩像素证据。'],
 ['L1-INPUT-1100','FAIL',[dFrame(0),dRec],'完整首个目标被高白色结构遮去大半，刀与目标不能同时清楚辨认。'],
 ['L1-GROUND-1100','PASS',[dFrame(0)],'开场白色基座有厚度并接到可见地面。'],
 ['L1-STACK-1100','BLOCKED',[dRec],'本轮自然路线在前段结束，未取得指定 stack-a/b 同一对象的散开、掉落、落地像素链。'],
 ['L1-REWARD-1100','BLOCKED',[dRec],'本轮没有足够清晰的局部奖励附着与分离连续画面。'],
 ['L1-PRESSURE-1100','PASS',[dFrame(6),`${qa}/desktop-1/frames/terminal.png`],'尖刺在接近前可见，失败面板给出碰撞/跌落结果和重试入口。'],
 ['L1-FINISH-1100','BLOCKED',[dRec],'固定节奏在前段失败，未取得本构建的终点结算与重玩像素证据。'],
] as const;
const matrix=MatrixSchema.parse({schemaVersion:1,targetGame,workspace,cells:cells.map(([id,status,evidence,notes])=>({id,objectType:id.includes('STACK')?'overlapping cuttable stack and support':id.includes('FINISH')?'finish outcome lanes + settlement + replay':id.includes('PRESSURE')?'spike hazard + failure/recovery affordance':id.includes('REWARD')?'cut object + local reward + cumulative HUD':id.includes('GROUND')?'visible tabletop base':'blade + first cuttable',stateBranch:'active Level1 branch',renderer:'Three.js runtime',viewport:id.endsWith('390')?'390x844':'1100x720',acceptance:'active-slice-contract.json',status,evidence,notes}))});
const matrixPath=`${qa}/reproduction-matrix.json`;writeFileSync(matrixPath,JSON.stringify(matrix,null,2)+'\n');
const natural=NaturalFlowEvidenceSchema.parse({schemaVersion:1,startedFromReset:true,actions:['两种视口从新浏览器上下文开始，使用正常 touch/mouse 输入；实际时间见 recording.json。','未注入状态、存储、debug 或 fixture；只读状态仅用于观察终点。'],transitions:[{name:'startup-to-core',changed:true,evidence:pRec},{name:'visible-failure-and-replay-phone',changed:true,evidence:`${qa}/portrait-1/frames/terminal.png`},{name:'visible-failure-and-replay-desktop',changed:true,evidence:`${qa}/desktop-1/frames/terminal.png`}],completion:'terminal',replayObserved:true,forbiddenOperations:[],screenshots:[pFrame(0),pFrame(6),`${qa}/portrait-1/frames/terminal.png`,dFrame(0),dFrame(6),`${qa}/desktop-1/frames/terminal.png`],passed:false,blockers:['本轮两种视口均在前段进入失败终点，未自然到达结算/重玩完成态。','首个目标在两个视口均被高白色结构遮挡，L1-INPUT FAIL。','堆叠、奖励、终点分支缺少本构建的自然像素覆盖。'],runner:'independent-QA-normal-input-recorder',buildHash,runtime:'Chromium against unchanged dist/index.html; no rebuild during QA',device:{width:390,height:844,label:'390x844 and 1100x720 sequential captures'},observedAt:now});
const naturalPath=`${qa}/qa-natural-journey-report.json`;writeFileSync(naturalPath,JSON.stringify(natural,null,2)+'\n');
const perceptual=PerceptualQaReportSchema.parse({schemaVersion:1,artifactType:'perceptual-qa-report',game:targetGame,passed:false,checkedAt:now,features:cells.map(([id,status,evidence,notes])=>({featureId:id,playerVisible:status==='PASS',naturalTriggerVerified:status==='PASS',screenshotEvidence:evidence.filter(x=>/\.(png|jpg|jpeg)$/u.test(x)),evidence,notes:[`${status}: ${notes}`]}))});
const perceptualPath=`${qa}/perceptual-qa-report.json`;writeFileSync(perceptualPath,JSON.stringify(perceptual,null,2)+'\n');
const issues=[{id:'L1-FIRST-TARGET-VISIBILITY',severity:'error' as const,message:'第3次构建两个视口的 startup 截图都显示首个完整目标被高白色结构遮去大半，刀与目标不能同时清楚辨认。',evidence:pFrame(0)},{id:'L1-STACK-NATURAL-EVIDENCE-GAP',severity:'error' as const,message:'本构建自然录制未覆盖同一 stack-a/b 的承托→切开→散开→掉落→落地连续画面。',evidence:pRec}];
const qaReport=QaReportSchema.parse({schemaVersion:1,passed:false,checks:[{name:'exact build and source unchanged during sequential normal-input QA',passed:true,evidence:pRec},{name:'normal input reaches a cut or attributable failure',passed:true,evidence:pRec},{name:'all contract cells independently player-visible',passed:false,evidence:matrixPath}],issues,screenshots:natural.screenshots,consoleLog:pRec,testedAt:now,naturalFlow:natural});
const qaPath=`${qa}/qa-report.json`;writeFileSync(qaPath,JSON.stringify(qaReport,null,2)+'\n');
const blockers=cells.filter(([,s])=>s!=='PASS').map(([id,, ,notes])=>`${id}: ${notes}`);const result=ResultSchema.parse({schemaVersion:1,role:'QAAgent',targetGame,workspace,status:'BLOCKED',reportPaths:[matrixPath,naturalPath,perceptualPath,qaPath],blockers,sourceModified:false,summary:'第3次构建的独立正常输入复核在两个视口均观察到可归因失败；首个目标被高白色结构遮挡，堆叠/奖励/终点自然画面未覆盖。保留所有证据缺口，不能宣称通过。'});const resultPath=`${qa}/result.json`;writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');const hash=(x:string)=>createHash('sha256').update(readFileSync(x)).digest('hex');writeFileSync(`${qa}/evidence-sha256.json`,JSON.stringify({schemaVersion:1,targetGame,workspace,expectedBuildSha256:buildHash,files:[matrixPath,naturalPath,perceptualPath,qaPath,resultPath].map(path=>({path,sha256:hash(path)}))},null,2)+'\n');console.log(JSON.stringify({validated:true,status:result.status,blockers:blockers.length}));
