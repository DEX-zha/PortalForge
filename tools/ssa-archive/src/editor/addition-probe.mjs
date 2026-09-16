// Bounded research run, independent of the edited scene. Technical results never
// mark a candidate CONFIRMED; rendering and gameplay evidence remain separate.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {GameSession,gameFromConfig,defaultScript,readScript,local} from '../experiments/run-game.mjs';
import {defaultFigure} from './dolphin-run.mjs';
import {compileNativeProbe,NATIVE_BASE,NATIVE_MAGIC,NATIVE_STRIDE} from './native-patch.mjs';
import {installNativePatch,verifyNativeFactory,readNativeBytes} from './native-run.mjs';
import {classifyAddition,PROBE_VERSION} from './addition-compatibility.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const reportsDir=path.join(local,'addition-validation');
export function readFamilyReport(family) {
 if(!/^[a-f0-9]{64}$/.test(family??''))return null;
 try{return JSON.parse(fs.readFileSync(path.join(reportsDir,family+'.json'),'utf8').replace(/^\uFEFF/,''));}catch{return null;}
}
export async function inspectProbe(additions,read=readNativeBytes){
 const memory=await read(0x80001800,0x1800),results=[];
 for(const a of additions){
   const row={source:a.source,id:a.id,runtime:'failed',visual:'pending',gameplay:'pending'};
   let at=-1;for(let o=0;o+NATIVE_STRIDE<=memory.length;o+=4)if(memory.readUInt32BE(o)===NATIVE_MAGIC&&memory.readInt32BE(o+0x1c)===a.id&&memory.readUInt32BE(o+0x2c)===NATIVE_BASE+a.source){at=o;break;}
   if(at<0){results.push({...row,reason:'Probe payload was not consumed.'});continue;}
   row.attempt=memory.readUInt32BE(at+4);row.pointer=memory.readUInt32BE(at+8);
   if(row.attempt!==2||row.pointer<0x80003000||row.pointer>0x817fff00){results.push({...row,reason:row.attempt?'Native factory returned no valid instance.':'Source guards have not passed yet.'});continue;}
   const b=await read(row.pointer,0xf8);row.bytes_hex=b.toString('hex');row.state=b.readUInt32BE(0x54);row.actor=b.readUInt32BE(0xf4);row.position=[0,4,8].map(o=>b.readFloatBE(0x24+o));row.heading=b.readFloatBE(0x34);row.parent=b.readUInt32BE(0x5c);row.model=b.readUInt32BE(0xdc);row.script=b.readUInt32BE(0xa8);
   row.runtime=b.readUInt32BE(0)===0x80481674&&row.parent===NATIVE_BASE+a.source&&row.model===NATIVE_BASE+a.model&&row.actor>=0x80003000&&row.actor<0x81800000&&row.position.every(Number.isFinite)?'passed':'inconclusive';
   row.reason=row.runtime==='passed'?'Distinct native instance and actor observed; visual and behavior checks pending.':'No matching live actor remains at capture time. The script may have transformed or destroyed the object; this does not prove incompatibility.';
   results.push(row);
 }
 return results;
}
export async function runAdditionProbe(s,sources,{signal,onProgress=()=>{},repeat=2,gameFactory=()=>new GameSession()}={}) {
 if(s.original_sha256!=='2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f')throw Error('This probe currently requires the original tutorial level. Open the unmodified tutorial to test its source families.');
 if(!Array.isArray(sources)||!sources.length||sources.length>2||new Set(sources).size!==sources.length)throw Error('Choose one or two source objects for a test batch.');
 if(![1,2].includes(repeat))throw Error('A test batch supports one or two cold boots.');
 const candidates=sources.map(offset=>{const p=s.placements.find(p=>p.offset===offset);if(!p)throw Error('Source missing.');const c=classifyAddition(s,p);if(!c.testable)throw Error(c.reason);return {p,c};});
 const additions=candidates.map(({p},i)=>({id:-i-1,source:p.offset,model:p.model.offset,script:p.behavior?.offset??null,position:[[90,10.5,48],[88,10.5,43]][i],heading:p.rotation.heading,scale:100}));
 const code=compileNativeProbe(additions),id='batch-'+Date.now()+'-'+randomUUID().slice(0,8),dir=path.join(reportsDir,id);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'probe.ini');fs.writeFileSync(file,code.ini);
 const record={id,version:PROBE_VERSION,started:new Date().toISOString(),source_sha256:s.original_sha256,additions,candidates:candidates.map(({p,c})=>({source:p.offset,name:p.name,family:c.family})),sha256:hash(code.ini),runs:[],status:'running'};
 const persist=()=>fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(record,null,2));persist();
 try{
  for(let n=0;n<repeat;n++){
   signal?.throwIfAborted();const game=gameFactory();game.signal=signal;let restore;const run={started:new Date().toISOString(),screenshots:[],samples:[]};record.runs.push(run);
   try{
    await game.connect();restore=await installNativePatch({file,sha256:record.sha256,additions},{compiler:compileNativeProbe});
    onProgress({phase:'booting',run:n+1,runs:repeat});await game.launch(gameFromConfig(),id);run.pid=game.pid;await verifyNativeFactory();
    run.trace=await game.runScriptSafe(readScript(defaultScript),{figure:defaultFigure(),labelPrefix:id+'-'+n,onShot:async f=>{run.screenshots.push(f);if(/tutorial/.test(f)){const rows=await inspectProbe(additions);run.samples.push(rows.map(row=>({...row,capture:f})));}},onStep:step=>onProgress({phase:'macro',run:n+1,runs:repeat,step:step.step+1})});
    run.samples.push(await inspectProbe(additions));run.status='completed';
    run.monitor_lines=game.monitorLines('level/Level_027_Tutorial.bld');
   }catch(e){run.status=signal?.aborted?'cancelled':'failed';run.error=e.message;run.trace=e.trace??run.trace;throw e;}
   finally{run.stop=await game.stop();await game.close();if(restore&&(!game.pid||run.stop?.stopped)){restore();run.profile_restored=true;}run.finished=new Date().toISOString();persist();}
   if(restore&&!run.profile_restored)throw Error('The test Dolphin did not stop cleanly; its temporary profile has been retained for recovery.');
  }
  record.status='completed';
 }catch(e){record.status=signal?.aborted?'cancelled':'failed';record.error=e.message;}
 finally{
  record.finished=new Date().toISOString();persist();
  for(const {p,c}of candidates){const rows=record.runs.map(r=>r.samples.at(-1)?.find(x=>x.source===p.offset));const passed=record.status==='completed'&&rows.length===repeat&&rows.every(r=>r?.runtime==='passed');
   const observed=record.runs.some(r=>r.samples.some(sample=>sample.some(row=>row.source===p.offset&&row.runtime==='passed')));
   const report={version:PROBE_VERSION,family:c.family,source:p.offset,name:p.name,runtime:passed?'passed':record.status==='cancelled'?'cancelled':rows.some(r=>r?.runtime==='inconclusive')?'inconclusive':'failed',observed_live:observed,visual:'pending',gameplay:'pending',runs:record.runs.length,reason:passed?'Native creation passed in every run; visual and gameplay review pending.':observed?'A matching live actor was observed earlier, but did not survive the full macro. Review the capture timeline and object lifecycle.':rows.find(r=>r?.runtime!=='passed')?.reason??record.error??'No complete native result.',batch:id,updated:record.finished};
   fs.writeFileSync(path.join(reportsDir,c.family+'.json'),JSON.stringify(report,null,2));
  }
 }
 return record;
}
