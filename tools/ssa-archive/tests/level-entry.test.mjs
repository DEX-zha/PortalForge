import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryManifest, entrySteps, tutorialSteps, readEntryFst, ENTRY_VERSION } from '../src/editor/level-entry.mjs';
import {defaultScript,readScript} from '../src/experiments/run-game.mjs';
import {createHash} from 'node:crypto';

const binding={game:'game-hash',runtime:'runtime-hash',bridge:'bridge-hash',figure:'figure-hash',configuration:'config-hash',layout:'disc-layout-hash'};
const manifest={version:ENTRY_VERSION,archive:'level/level_027_tutorial.bld',phase:'before-level-load',clean_native:true,binding,state_sha256:'state-hash',fst:{address:0x81700000,length:10376,sha256:'a'.repeat(64)}};
test('entry rejects loaded scenes, wrong targets, stale resources and stale state bytes',()=>{
 assert.equal(validateEntryManifest(manifest,{archive:manifest.archive,binding,stateHash:'state-hash'}),true);
 for(const [key,value] of [['version',0],['archive','level/level_000_mining.bld'],['phase','in-level'],['clean_native',false],['state_sha256','old']])
  assert.equal(validateEntryManifest({...manifest,[key]:value},{archive:manifest.archive,binding,stateHash:'state-hash'}),false,key);
 for(const key of Object.keys(binding))assert.equal(validateEntryManifest(manifest,{archive:manifest.archive,binding:{...binding,[key]:'changed'},stateHash:'state-hash'}),false,key);
 for(const fst of [null,{}, {...manifest.fst,address:0x81800000},{...manifest.fst,sha256:'bad'},{...manifest.fst,length:-1}])assert.equal(validateEntryManifest({...manifest,fst},{archive:manifest.archive,binding,stateHash:'state-hash'}),false,'malformed disc table');
});
test('native disc layout is hashed in bounded reads and rejects invalid pointers',async()=>{
 const table=Buffer.alloc(70000,42),header=Buffer.alloc(8);header.writeUInt32BE(0x81700000);header.writeUInt32BE(table.length,4);
 const sizes=[];const result=await readEntryFst(async(address,length)=>{if(address===0x80000038)return header;sizes.push(length);return table.subarray(address-0x81700000,address-0x81700000+length);});
 assert.deepEqual(sizes,[65536,4464]);assert.equal(result.sha256,createHash('sha256').update(table).digest('hex'));
 header.writeUInt32BE(0x817fff00);await assert.rejects(readEntryFst(async()=>header),/Invalid native disc/);
});
test('direct entry begins with the level transition and excludes title/menu navigation',()=>{
 const steps=entrySteps();assert.deepEqual(steps[0],{press:'A',frames:60});
 assert.ok(steps.some(s=>s.wait_monitor==='level/Level_027_Tutorial.arc'));
 assert.ok(!steps.some(s=>s.figure||/title|pick-game-slot|choose-play|strap/.test(s.shot??'')));
 assert.throws(()=>entrySteps('level/Level_000_Mining.bld'),/not.*validated/i);
});
test('intro skip keeps the unchanged path, menus, loading proof and interactive handoff separate',()=>{
 const original=readScript(defaultScript);assert.deepEqual(tutorialSteps(),original);
 assert.deepEqual(entrySteps(undefined,{skipIntro:false}),entrySteps());
 const full=tutorialSteps({skipIntro:true}),direct=entrySteps(undefined,{skipIntro:true});
 assert.deepEqual(full.slice(0,23),original.slice(0,23));
 for(const steps of [full,direct]){
  const skip=steps.findIndex(s=>s.nunchuk?.C);assert.ok(skip>0);assert.equal(steps.filter(s=>s.nunchuk?.C).length,1);
  assert.ok(steps.slice(0,skip).some(s=>s.wait_monitor==='level/Level_027_Tutorial.arc'));assert.ok(!steps.some(s=>s.wait===45));
  assert.equal(steps.at(-1).shot,'tutorial-moved-left');
 }
 for(const skipIntro of [false,true]){const interactive=entrySteps(undefined,{skipIntro,interactive:true});assert.equal(interactive.at(-1).shot,'tutorial-skylander');assert.ok(!interactive.some(s=>s.nunchuk?.StickX));}
 assert.deepEqual(tutorialSteps(),original,'building the skip branch never mutates the original macro');
});
