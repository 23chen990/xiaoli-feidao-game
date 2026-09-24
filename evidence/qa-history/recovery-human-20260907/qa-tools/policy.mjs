import {isAbsolute} from 'node:path';
export function classifyTerminal(text,visible){
 if(!visible)return null;
 if(/^关卡完成(?:\s|$)/u.test(text.trim()))return 'won';
 if(/^(碰到危险物|跌出路线|失足|跌落|挑战失败)(?:\s|$)/u.test(text.trim()))return 'failed';
 return null;
}
export function makeSchedule(cadenceMs,durationMs){
 if(!Number.isFinite(cadenceMs)||cadenceMs<=0||!Number.isFinite(durationMs)||durationMs<0)throw new Error('Invalid schedule');
 return Array.from({length:Math.ceil(durationMs/cadenceMs)},(_,i)=>i*cadenceMs);
}
export function assertConfig(config){
 if(!isAbsolute(config.outputDirectory)||!/^[a-f0-9]{64}$/u.test(config.expectedBuildSha256))throw new Error('Absolute outputDirectory and exact SHA-256 required');
 if(!['portrait','desktop'].includes(config.viewport))throw new Error('Unsupported viewport');
 if(![550,650,750,800,950].includes(config.cadenceMs))throw new Error('Undeclared cadence');
 if(config.activeMs<1000||config.activeMs>60000)throw new Error('Active duration outside bounded policy');
 return true;
}
