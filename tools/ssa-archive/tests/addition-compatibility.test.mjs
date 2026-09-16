import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddition, groupCandidates } from '../src/editor/addition-compatibility.mjs';
import { compileNativePatch, compileNativeProbe } from '../src/editor/native-patch.mjs';
import { inspectProbe } from '../src/editor/addition-probe.mjs';
import { GameSession } from '../src/experiments/run-game.mjs';
const p=(offset=10,script=null)=>({offset,name:'Barrel',scale:100,model:{offset:200,path:'Objects/barrel.mdl',status:'direct'},behavior:script?{offset:300,path:script}:null,position:[0,0,0],rotation:{heading:0}});
const session=placements=>({placements,archive:'level/Level_027_Tutorial.bld',has_runtime_map:true,original_sha256:'fixture'});
test('macro waits for checkpoint inspection before the next input can change actor lifetime',async()=>{
 const game=new GameSession(()=>{}),events=[];
 game.screenshot=async()=>{events.push('capture');return 'tutorial.png';};
 game.press=async()=>events.push('input');
 await game.runScriptSafe([{shot:'tutorial'},{press:'A'}],{onShot:async()=>{await new Promise(r=>setTimeout(r,5));events.push('inspection');}});
 assert.deepEqual(events,['capture','inspection','input']);
});
test('unknown scripted objects are candidates, not confirmed or incompatible merely because of a script',()=>{
 const row=p(10,'Barrel.ai'),s=session([row]);const r=classifyAddition(s,row);
 assert.equal(r.status,'needs_script_test');assert.equal(r.available,false);assert.equal(r.testable,true);assert.ok(r.checks.some(c=>c.id==='script'&&c.status==='pending'));
});
test('missing model, runtime map and non-original scale have specific blocking reasons',()=>{
 let row=p(),s=session([row]);row.model.offset=null;assert.equal(classifyAddition(s,row).status,'blocked');
 row=p();s=session([row]);s.has_runtime_map=false;assert.match(classifyAddition(s,row).reason,/runtime map/i);
 s.has_runtime_map=true;row.scale=120;assert.match(classifyAddition(s,row).reason,/100%/);
});
test('families share actual model and script resources, not a display name',()=>{
 const a=p(10,'Barrel.ai'),b=p(20,'Barrel.ai'),c=p(30,'Different.ai');c.behavior.offset=400;
 const groups=groupCandidates(session([a,b,c]));assert.equal(groups.length,2);assert.equal(groups[0].members.length,2);
});
test('runtime success alone is never advertised as confirmed Add',()=>{
 const row=p(),s=session([row]);const r=classifyAddition(s,row,{report:{runtime:'passed',visual:'pending'}});
 assert.equal(r.status,'runtime_passed');assert.equal(r.available,false);
});
test('a related source result and a transient object do not become confirmation',()=>{
 const row=p(),s=session([row]);
 assert.equal(classifyAddition(s,row,{report:{source:20,runtime:'passed'}}).status,'family_tested');
 assert.equal(classifyAddition(s,row,{report:{source:10,runtime:'inconclusive',reason:'Object no longer present.'}}).status,'inconclusive');
});
test('scripted recipes retain the exact script pointer and the static recipe stays unchanged',()=>{
 const a={id:-1,source:3983352,model:2794492,script:2739632,position:[90,10.5,48],heading:0,scale:100};
 assert.equal(compileNativePatch([a]).ini,compileNativeProbe([a]).ini);
 const p=compileNativeProbe([a]);assert.equal(p.hooks[0].words[(p.records_offset+0x88)/4],0x80dbc020+a.script);
 assert.throws(()=>compileNativeProbe([{...a,script:-4}]),/script offset/);
});
test('probe reports a disappeared or reused object as inconclusive, never a passed runtime check',async()=>{
 const a={id:-1,source:10,model:20},payload=Buffer.alloc(0x1800),object=Buffer.alloc(0xf8);
 payload.writeUInt32BE(0x50464e41,0);payload.writeUInt32BE(2,4);payload.writeUInt32BE(0x81200000,8);payload.writeInt32BE(-1,0x1c);payload.writeUInt32BE(0x80dbc020+10,0x2c);
 const result=await inspectProbe([a],async(address)=>address===0x80001800?payload:object);
 assert.equal(result[0].runtime,'inconclusive');
});
