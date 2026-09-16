import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit, undo, redo, resetScene, authorisedWords } from '../src/editor/session.mjs';
import { save, patch, launch, buildSavePlan } from '../src/editor/save.mjs';
import { loadAdditionSidecar } from '../src/editor/native-additions.mjs';
import { compileNativePatch, NATIVE_LIMIT } from '../src/editor/native-patch.mjs';
import { installNativePatch, verifyNativeInstances, verifyNativeLifecycle } from '../src/editor/native-run.mjs';
import { createHash } from 'node:crypto';
import { sceneRoles } from '../src/editor/scene-roles.mjs';
import { startupParts } from '../src/editor/scripted-startup.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
test('script lifecycle distinguishes earlier creation from final survival without relaxing static checks', async()=>{
  const scripted={id:-1,script:100},statik={id:-2};
  const earlier=[{verified:true,objects:[{id:-1},{id:-2}],capture:'early.png'}];
  const verify=async rows=>{if(rows.some(a=>a.script))throw Error('actor no longer present');return {verified:true,objects:[{id:-2}]};};
  const result=await verifyNativeLifecycle([scripted,statik],earlier,verify);
  assert.equal(result.lifecycle,'changed_after_creation');assert.equal(result.final_verified,false);
  await assert.rejects(verifyNativeLifecycle([scripted],[],verify),/no longer/);
  await assert.rejects(verifyNativeLifecycle([scripted,statik],earlier,async()=>{throw Error('static missing');}),/static missing/);
});
test('fresh scene interpretation never reads native addition identities as IGZ offsets', () => {
  const buffer=Buffer.alloc(256);buffer.writeUInt32BE(104,0);buffer.writeUInt32BE(1,0x54);
  const behavior={path:'/Level_027/Scripts/Bridge_Spawner.ai'};
  const source={offset:0,name:'Bridge',model:{offset:120},behavior};
  const addition={...source,offset:-1,native_addition:{source:0}};
  const s={buffer,placements:[source,addition]};
  assert.deepEqual(sceneRoles(s).map(r=>r.offset),[0]);
  assert.equal(startupParts(s,addition),null);
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-add-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded'); fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_027_Tutorial.bld', entry: 3, deps: { gates: () => ({ status: 'PASS' }) } });
  // Synthetic resolver row standing in for the narrowly validated template.
  const source = s.placements[0]; source.offset = 3446244; source.model.path = 'models/plant_sunflower_whole.mdl';
  source.model.offset = 3446580; source.behavior = null; source.scale = 100; s.has_runtime_map = true;
  return { s, dir, source, add: position => applyEdit(s, { kind: 'add', source: source.offset, position: position ?? [91, 10, 43] }) };
}
test('native addition preserves bytes and originals; identities, transforms, undo/redo/reset are independent', t => {
  const {s,source,add} = fixture(t), original = Buffer.from(s.buffer), snapshot = structuredClone(source), count = s.placements.length;
  const a = add().placement, b = add([89,10,43]).placement;
  assert.equal(a.offset,-1); assert.equal(b.offset,-2); assert.equal(s.placements.length,count+2);
  applyEdit(s,{kind:'transform',target:a.offset,position:[92,11,44],heading:240});
  assert.deepEqual(source,snapshot); assert.deepEqual(s.buffer,original); assert.equal(authorisedWords(s).size,0);
  undo(s); assert.deepEqual(s.additions[0].position,[91,10,43]);
  redo(s); assert.equal(s.additions[0].heading,240);
  resetScene(s); assert.equal(s.additions.length,0); assert.equal(s.placements.length,count); assert.deepEqual(s.buffer,original);
  redo(s); redo(s); redo(s); assert.equal(s.additions.length,2); assert.equal(s.additions[0].heading,240);
  assert.throws(()=>applyEdit(s,{kind:'transform',target:-1,scale:120}),/scale/);
  assert.throws(()=>applyEdit(s,{kind:'replace',source:source.offset,target:-1}),/same-size|span|SPAN/i);
  assert.throws(()=>applyEdit(s,{kind:'transform',target:source.offset,scale:120}),/source/i);
});
test('additions save beside unchanged IGZ; reopen, stale patch and tampered sidecar are checked', async t => {
  const {s,dir,add} = fixture(t); add();
  assert.equal(buildSavePlan(s).changes.length,0);
  const target = path.join(dir,'saved.decoded'), result = save(s,{out:target}); assert.ok(result.written);
  assert.deepEqual(fs.readFileSync(target),s.buffer);
  const restored = fixture(t).s; restored.file = target; loadAdditionSidecar(restored);
  assert.deepEqual(restored.additions,s.additions); assert.ok(restored.lastSave);
  const deps = {build:()=>({dir,replacements:[]})}; patch(s,{deps});
  assert.ok(fs.readFileSync(s.lastPatch.native_additions.file,'utf8').includes('[Gecko]'));
  applyEdit(s,{kind:'transform',target:-1,heading:240});
  assert.throws(()=>patch(s,{deps}),e=>e.error==='UNSAVED_CHANGES');
  await assert.rejects(launch(s,{mode:'test'}),e=>e.error==='STALE_PATCH');
  save(s,{out:target}); const d=JSON.parse(fs.readFileSync(target+'.portalforge.json'));d.additions[0].heading=30;
  fs.writeFileSync(target+'.portalforge.json',JSON.stringify(d));assert.throws(()=>patch(s,{deps}),e=>e.error==='STALE_ADDITIONS');
  d.base_sha256='wrong';fs.writeFileSync(target+'.portalforge.json',JSON.stringify(d));assert.throws(()=>loadAdditionSidecar(restored),/does not match/);
});
for (const [offset,model,modelPath,script,scriptPath] of [
  [3983352,2794492,'barrel.mdl',2739632,'Barrel.ai'],
  [2390540,1214412,'Chompy.mdl',2348068,'Enemy_Chompy.ai'],
  [3034548,3036352,'Treasure_Coin_A.mdl',3034796,'Placed_Loot_Spinning.ai'],
]) test(`confirmed source ${offset} retains its script and rejects tampered sidecars`, t => {
  const {s,dir,source}=fixture(t);
  source.offset=offset;source.model={offset:model,path:'Objects/'+modelPath};
  source.behavior={offset:script,path:'Scripts/'+scriptPath};
  applyEdit(s,{kind:'add',source:source.offset,position:[90,10.5,48]});
  assert.equal(s.additions[0].script,script);
  const target=path.join(dir,'scripted.decoded');save(s,{out:target});
  const document=JSON.parse(fs.readFileSync(target+'.portalforge.json'));document.additions[0].script=script+4;
  fs.writeFileSync(target+'.portalforge.json',JSON.stringify(document));s.file=target;
  assert.throws(()=>loadAdditionSidecar(s),/script does not match/);
});
test('unsupported templates, nonfinite transforms, scales, duplicate IDs and capacity are refused', t => {
  const {s,source,add}=fixture(t);
  assert.throws(()=>applyEdit(s,{kind:'add',source:7,position:[0,0,0]}),/not been validated/);
  assert.throws(()=>add([NaN,0,0]),/finite/);
  add();const a=s.additions[0];
  assert.throws(()=>compileNativePatch([{...a,id:-4294967297}]),/int32/);
  assert.throws(()=>compileNativePatch([a,a]),/distinct/);
  assert.throws(()=>compileNativePatch([{...a,scale:200}]),/100%/);
  assert.ok(compileNativePatch(Array.from({length:NATIVE_LIMIT},(_,i)=>({...a,id:-i-1}))).bytes<=3256);
  for(let i=1;i<NATIVE_LIMIT;i++)add();assert.throws(()=>add(),/at most/);
  source.scale=200;assert.equal(buildSavePlan(s).status,'INVALID');
});
test('native profile install restores exact files and refuses concurrent use or existing Gecko codes', async t => {
  const {s,dir,add}=fixture(t);add();const code=compileNativePatch(s.additions).ini,file=path.join(dir,'patch.ini');fs.writeFileSync(file,code);
  const native={file,sha256:hash(code),additions:s.additions},directory=path.join(dir,'profile');
  fs.mkdirSync(path.join(directory,'Config'),{recursive:true});const config=path.join(directory,'Config/Dolphin.ini');fs.writeFileSync(config,'[Core]\r\nEnableCheats = False\r\n');
  const before=fs.readFileSync(config);
  await assert.rejects(installNativePatch(native,{directory,occupied:async()=>true}),/previous research/);
  const restore=await installNativePatch(native,{directory,occupied:async()=>false});
  assert.match(fs.readFileSync(config,'utf8'),/EnableCheats = True/);
  await assert.rejects(installNativePatch(native,{directory,occupied:async()=>false}),/already owns/);
  restore();assert.deepEqual(fs.readFileSync(config),before);assert.equal(fs.existsSync(path.join(directory,'GameSettings/SSPP52.ini')),false);
  fs.writeFileSync(path.join(directory,'GameSettings/SSPP52.ini'),'[Gecko]\n$Existing\n');
  await assert.rejects(installNativePatch(native,{directory,occupied:async()=>false}),/already contains/);assert.deepEqual(fs.readFileSync(config),before);
});
test('runtime creation proof refuses absent recipes and a completed flag with null result',async()=>{
  const a={id:-1,source:3446244},memory=Buffer.alloc(0x1800);
  await assert.rejects(verifyNativeInstances([a],async()=>memory),/not uniquely consumed/);
  memory.writeUInt32BE(0x50464e41,0);memory.writeUInt32BE(2,4);memory.writeInt32BE(-1,0x1c);memory.writeUInt32BE(0x80dbc020+a.source,0x2c);
  await assert.rejects(verifyNativeInstances([a],async()=>memory),/did not complete/);
});

test('scripted creation verifies initial placement while allowing live AI movement and rejects shared state', async()=>{
  const base=0x80dbc020, a={id:-1,source:2390540,model:1214412,script:2348068,position:[90,10.5,48],heading:0};
  const memory=Buffer.alloc(0x1800), copy=Buffer.alloc(0xf8), source=Buffer.alloc(0xf8), pointer=0x81220000;
  memory.writeUInt32BE(0x50464e41,0);memory.writeUInt32BE(2,4);memory.writeUInt32BE(pointer,8);
  memory.writeInt32BE(a.id,0x1c);memory.writeUInt32BE(base+a.source,0x2c);
  for(const b of [copy,source]){b.writeUInt32BE(0x80481674,0);b.writeUInt32BE(base+a.script,0xa8);}
  copy.writeUInt32BE(1,0x54);copy.writeUInt32BE(base+a.source,0x5c);copy.writeUInt32BE(base+a.model,0xdc);
  copy.writeUInt32BE(0x81230000,0xf4);copy.writeUInt32BE(0x81240000,0xe0);source.writeUInt32BE(0x81250000,0xe0);
  a.position.forEach((v,i)=>copy.writeFloatBE(v,0x24+i*4));
  [93,11,44].forEach((v,i)=>copy.writeFloatBE(v,0x3c+i*4));copy.writeFloatBE(80,0x4c);
  const read=async address=>address===0x80001800?memory:address===pointer?copy:source;
  const result=await verifyNativeInstances([a],read);
  assert.deepEqual(result.objects[0].position,a.position);assert.deepEqual(result.objects[0].current_position,[93,11,44]);
  copy.writeFloatBE(89,0x24);await assert.rejects(verifyNativeInstances([a],read),/does not match/);copy.writeFloatBE(90,0x24);
  copy.writeUInt32BE(0x81250000,0xe0);await assert.rejects(verifyNativeInstances([a],read),/parameters are not independent/);copy.writeUInt32BE(0x81240000,0xe0);
  copy.writeUInt32BE(base+a.script+4,0xa8);await assert.rejects(verifyNativeInstances([a],read),/script was not retained/);
  copy.writeUInt32BE(base+a.script,0xa8);source.writeUInt32BE(0x81260000,0xb0);copy.writeUInt32BE(0x81260000,0xb0);
  await assert.rejects(verifyNativeInstances([a],read),/variables are shared/);
  copy.writeUInt32BE(0x81270000,0xb0);assert.equal((await verifyNativeInstances([a],read)).verified,true);
});
