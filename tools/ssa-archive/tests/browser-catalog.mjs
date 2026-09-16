import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import { save, patch } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli-commands.mjs';
import { directEntryConfirmed } from '../src/editor/level-entry.mjs';
const out = path.resolve('.local/object-workflow/browser-' + Date.now()); fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'level.decoded'); fs.copyFileSync('.local/workspaces/tutorial-bld/entries/3-level.bld.decoded', file);
const session = openSession(file, { archive: 'level/Level_027_Tutorial.bld', entry: 3, fixups: JSON.parse(fs.readFileSync('.local/dolphin-evidence/ptr-scan3-fixups.json')) });
const server = await startServer({ session, port: 0 });
const profile = path.join(out, 'profile');
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking', '--remote-debugging-port=0', '--remote-allow-origins=*', '--window-size=1600,1000', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, launchError; browser.on('error', e => launchError = e);
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) { if (launchError) throw launchError; await sleep(100); }
  assert.ok(fs.existsSync(portFile));
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0; const pending = new Map(), errors = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails); if (!m.id) return; const p = pending.get(m.id); if (!p) return; clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => reject(new Error('CDP timeout ' + method)), 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100); } throw new Error('Timeout: ' + expression + '\n' + JSON.stringify(errors)); };
  const shot = async name => fs.writeFileSync(path.join(out, name + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url: server.url });
  await waitFor(`document.querySelectorAll('[data-object]').length === 673`);
  await waitFor(`document.querySelectorAll('.asset-preview img').length > 0`);
  assert.equal(await evaluate(`document.getElementById('launch-mode').value`),directEntryConfirmed()?'direct-test':'test');
  assert.equal(await evaluate(`document.querySelector('#launch-mode [value="direct-play"]').disabled`),!directEntryConfirmed());
  const capacity=await evaluate(`(async()=>{const b=await(await fetch('/api/catalog')).json();return {capacity:b.addition_capacity,available:b.entries.filter(e=>e.addition.available).length};})()`);
  assert.deepEqual(capacity,{capacity:{used:0,limit:8},available:9});
  assert.equal(await evaluate(`document.getElementById('skip-intro').checked`),false,'opening is kept by default');
  await evaluate(`document.getElementById('skip-intro').click()`);
  await send('Page.reload');
  await waitFor(`document.querySelectorAll('[data-object]').length === 673 && document.getElementById('skip-intro').checked`);
  await evaluate(`window.skipRequests=[];window.originalFetch=window.fetch;window.fetch=async(url,options)=>{if(url==='/api/launch'&&options?.method==='POST'){window.skipRequests.push(JSON.parse(options.body));return new Response('{}',{headers:{'Content-Type':'application/json'}});}return window.originalFetch(url,options);};`);
  for(const [mode,expected] of [['play',false],['test',true],['direct-play',true]]){
    await evaluate(`document.getElementById('launch-mode').value=${JSON.stringify(mode)};document.getElementById('launch-mode').dispatchEvent(new Event('change'));`);
    assert.equal(await evaluate(`document.getElementById('skip-intro').disabled`),mode==='play');
    await evaluate(`document.getElementById('do-launch').disabled=false;document.getElementById('do-launch').click()`);
    await waitFor(`window.skipRequests.at(-1)?.mode===${JSON.stringify(mode)} && document.getElementById('launch-mode').disabled===false`);
    assert.equal(await evaluate(`window.skipRequests.at(-1).skip_intro`),expected,'effective option follows mode');
  }
  await evaluate(`document.getElementById('skip-intro').click();document.getElementById('do-launch').disabled=false;document.getElementById('do-launch').click()`);
  await waitFor(`window.skipRequests.length===4 && !document.getElementById('launch-mode').disabled`);
  assert.equal(await evaluate(`window.skipRequests.at(-1).skip_intro`),false,'unchecked choice reaches launch');
  await evaluate(`window.fetch=window.originalFetch;document.getElementById('launch-mode').value=${JSON.stringify(directEntryConfirmed()?'direct-test':'test')};document.getElementById('launch-mode').dispatchEvent(new Event('change'));`);
  await shot('workspace-overview');
  const compatibility = await evaluate(`(async()=>{const b=await(await fetch('/api/catalog')).json();return {counts:b.compatibility.counts,families:b.compatibility.families.length,barrel:b.entries.find(p=>p.name==='Barrel').addition,coin:b.entries.find(p=>p.name==='1_Coper(1)').addition,chompy:b.entries.find(p=>p.name==='Enemy_ChompyNipper').addition};})()`);
  assert.ok(compatibility.families>1);assert.equal(compatibility.barrel.testable,true);assert.equal(compatibility.coin.testable,true);assert.equal(compatibility.chompy.testable,true);
  assert.ok(await evaluate(`document.getElementById('test-addition') && document.getElementById('test-addition-batch') && document.getElementById('stop-addition-test')`));
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await sleep(300);
  assert.equal(await evaluate(`document.querySelector('header').getBoundingClientRect().top`),0);
  assert.ok(await evaluate(`document.getElementById('stop-launch').getBoundingClientRect().right <= innerWidth`),'toolbar fits 1280px');
  assert.ok(await evaluate(`document.getElementById('c').getBoundingClientRect().height >= 200`));
  await shot('workspace-1280');
  await send('Emulation.clearDeviceMetricsOverride');await sleep(300);
  assert.equal(await evaluate(`document.querySelectorAll('summary button, summary a, summary input, summary select, summary textarea, summary [tabindex], summary [role="button"]').length`),0,'summaries contain no nested interactive controls');
  await evaluate(`document.querySelector('#folder-tree summary').focus()`);
  const initiallyOpen=await evaluate(`document.querySelector('#folder-tree details').open`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert.equal(await evaluate(`document.querySelector('#folder-tree details').open`),!initiallyOpen,'Space toggles a folder');
  assert.ok(await evaluate(`document.querySelectorAll('[data-object]').length < 673`),'keyboard folder selection filters the grid');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate(`document.querySelector('#folder-tree details').open`),initiallyOpen,'Enter toggles a folder');
  await evaluate(`document.querySelector('#folder-tree [data-folder="[]"]').click()`);
  const uiChecks = await evaluate(`(() => {
    const $=id=>document.getElementById(id), c=$('c').getBoundingClientRect(), project=$('project-panel').getBoundingClientRect(), inspector=$('inspector-panel').getBoundingClientRect(), thumbnails=document.querySelectorAll('.asset-preview img').length;
    if(project.top<c.bottom||inspector.left<c.right-1)throw Error('workspace arrangement');
    if(document.querySelectorAll('[data-hierarchy]').length!==673)throw Error('hierarchy missing records');
    const folder=[...document.querySelectorAll('#folder-tree [data-folder]')].find(e=>e.dataset.folder===JSON.stringify(['Vegetation','Flowers']));
    if(!folder)throw Error('subfolder missing');folder.click();
    const count=document.querySelectorAll('[data-object]').length;if(!count||count>=673)throw Error('folder filter');
    if(!$('folder-breadcrumb').textContent.includes('Flowers'))throw Error('breadcrumb');
    $('folder-breadcrumb').querySelector('[data-folder="[]"]').click();
    const start=Number($('project-splitter').getAttribute('aria-valuenow'));$('project-splitter').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    if(Number($('project-splitter').getAttribute('aria-valuenow'))!==start+20)throw Error('splitter');
    $('project-splitter').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    $('tab-layers').click();if($('layers-pane').hidden)throw Error('layers tab');$('tab-hierarchy').click();
    return {folderCount:count,thumbnails,layout:true,resize:true};
  })()`);
  const before = Buffer.from(session.buffer);
  const subject=process.argv.includes('--clamper')?{source:2357236,search:'Enemy_ChompyClamper',label:'chompy',script:2348068}
    :process.argv.includes('--weed')?{source:3452000,search:'weed_2_Template(8)',label:'weed',script:null}
    :process.argv.includes('--chompy')?{source:2390540,search:'Enemy_ChompyNipper',label:'chompy',script:2348068}
    :process.argv.includes('--coin')?{source:3034548,search:'1_Coper',label:'coper',script:3034796}
    :process.argv.includes('--barrel')?{source:3983352,search:'Barrel',label:'barrel',script:2739632}
    :{source:3446244,search:'SUNFLOWER',label:'sunflower',script:null};
  const search=subject.search;
  const filterMs = await evaluate(`(() => { const t=performance.now(), e=document.getElementById('object-search'); e.value=${JSON.stringify(search)}; e.dispatchEvent(new Event('input')); return performance.now()-t; })()`);
  assert.ok(filterMs < 300);
  const source = subject.source;
  assert.equal(await evaluate(`document.querySelector('[data-object="${source}"]').draggable`), true);
  await evaluate(`document.querySelector('[data-object="${source}"]').click()`);
  await waitFor(`document.querySelector('#inspector b')?.textContent?.toLowerCase().includes('${subject.label}')`);
  await waitFor(`document.querySelector('[data-object="${source}"] .asset-preview img')?.naturalWidth > 0`);
  assert.equal(await evaluate(`document.querySelector('[data-hierarchy="${source}"]').classList.contains('selected')`),true);
  await shot('workspace-'+subject.label);
  assert.equal(await evaluate(`document.querySelector('header').getBoundingClientRect().top`),0);
  await sleep(500);
  // Real browser mouse input: no synthetic DragEvent or API prepare/commit shortcut.
  const drop = async ({part='.asset-preview',x=.65,y=.60,cancel=false,outside=false}={}) => {
    const coords=await evaluate(`(() => {const el=document.querySelector('[data-object="${source}"] ${part}');el.scrollIntoView({block:'nearest'});const b=el.getBoundingClientRect(),r=document.getElementById('c').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,dx:${outside?'50':`r.left+r.width*${x}`},dy:${outside?'120':`r.top+r.height*${y}`}};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:coords.x,y:coords.y});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:coords.x,y:coords.y});
    for(let i=1;i<=12;i++) {
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:coords.x+(coords.dx-coords.x)*i/12,y:coords.y+(coords.dy-coords.y)*i/12}); await sleep(20);
    }
    const hint=await evaluate(`document.getElementById('drop-hint').textContent`);
    if(cancel) await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:coords.dx,y:coords.dy});
    if(cancel) await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    return hint;
  };
  await drop({cancel:true});assert.equal(await evaluate(`document.getElementById('drop-dialog').open`),false);
  await drop({outside:true});assert.equal(await evaluate(`document.getElementById('drop-dialog').open`),false);
  assert.deepEqual(session.buffer,before);
  const hint = await drop();
  await waitFor("document.querySelector('[data-hierarchy=\"-1\"]') && !document.getElementById('undo').disabled");
  assert.equal(session.edits.length,1);assert.equal(session.placements.length,674);assert.deepEqual(session.buffer,before);
  assert.equal(await evaluate("document.getElementById('drop-dialog').open"),false);
  assert.ok(session.additions[0].position.every(Number.isFinite));
  await shot('first-addition');
  const secondHint=await drop({part:'.object-name',x:.45,y:.7});
  await waitFor("document.querySelector('[data-hierarchy=\"-2\"]') && document.getElementById('dirty').textContent.startsWith('2 ')");
  assert.equal(session.placements.length,675);assert.equal(session.additions.length,2);assert.deepEqual(session.buffer,before);
  assert.notDeepEqual(session.additions[0].position,session.additions[1].position);
  assert.notEqual(secondHint,hint);
  const placed=session.placements.find(p=>p.offset===-2);
  await waitFor("document.querySelector('[data-edit=\"scale\"]')?.disabled");
  await evaluate("const f=document.querySelector('[data-edit=\"heading\"]');f.value=240;f.dispatchEvent(new Event('change',{bubbles:true}));");
  await waitFor("document.getElementById('dirty').textContent.startsWith('3 ')");
  assert.equal(session.additions[1].heading,240);
  await shot('two-additions');
  for(let i=2;i>=0;i--){await evaluate("document.getElementById('undo').click()");await waitFor(i===0?"document.getElementById('undo').disabled && !document.getElementById('redo').disabled":"!document.getElementById('undo').disabled && document.getElementById('dirty').textContent.startsWith('"+i+" ')");}
  assert.equal(session.additions.length,0);assert.equal(session.placements.length,673);assert.deepEqual(session.buffer,before);
  for(let i=1;i<=3;i++){await evaluate("document.getElementById('redo').click()");await waitFor("!document.getElementById('undo').disabled && document.getElementById('dirty').textContent.startsWith('"+i+" ')");}
  const recipe=structuredClone(session.additions);
  await evaluate("document.getElementById('save').click()");
  await waitFor("document.getElementById('save').disabled && !document.getElementById('reset-scene').disabled");
  const savedFile=session.lastSave.file,savedBytes=fs.readFileSync(savedFile),savedSidecar=fs.readFileSync(savedFile+'.portalforge.json');
  await evaluate("document.getElementById('reset-scene').click();document.getElementById('reset-cancel').click()");
  assert.deepEqual(session.additions,recipe);
  await evaluate("document.getElementById('reset-scene').click();document.getElementById('reset-confirm').click()");
  await waitFor("document.getElementById('status-tip').textContent.startsWith('Scene reset:')");
  assert.equal(session.additions.length,0);assert.equal(session.undone.length,3);assert.deepEqual(session.buffer,before);
  assert.equal(session.lastSave,null);assert.equal(session.lastPatch,null);assert.deepEqual(fs.readFileSync(savedFile),savedBytes);assert.deepEqual(fs.readFileSync(savedFile+'.portalforge.json'),savedSidecar);
  assert.equal(await evaluate("document.getElementById('do-launch').disabled && document.getElementById('do-patch').disabled"),true);
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  await shot('reset-complete');
  for(let i=1;i<=3;i++){await evaluate("document.getElementById('redo').click()");await waitFor("!document.getElementById('undo').disabled && document.getElementById('dirty').textContent.startsWith('"+i+" ')");}
  assert.deepEqual(session.additions,recipe);assert.deepEqual(errors,[]);
  if(process.argv.includes('--eight')){
    for(let count=3;count<=8;count++){
      await drop({x:.35+(count%3)*.12,y:.50+(count%2)*.18});
      await waitFor(`document.querySelector('[data-hierarchy="-${count}"]') && document.getElementById('object-count').textContent.includes('${count}/8 added')`);
      assert.equal(session.additions.length,count);
    }
    const full=structuredClone(session.additions);await drop();
    await waitFor("document.getElementById('status-tip').textContent.includes('at most 8')");assert.deepEqual(session.additions,full);
    await evaluate("document.getElementById('undo').click()");await waitFor("!document.querySelector('[data-hierarchy=\"-8\"]')");assert.equal(session.additions.length,7);
    await evaluate("document.getElementById('redo').click()");await waitFor("document.querySelector('[data-hierarchy=\"-8\"]')");assert.deepEqual(session.additions,full);
    await shot('eight-additions');
  }
  const geometryChecks = await evaluate(`(async () => {
    const {createScene}=await import('/view/scene.mjs');
    const wrap=document.createElement('div');wrap.style.cssText='position:fixed;inset:100px auto auto 300px;width:512px;height:512px';
    const canvas=document.createElement('canvas');wrap.append(canvas);document.body.append(wrap);
    const s=createScene(canvas), p={offset:1,name:'surface',position:[0,5,0],rotation:{heading:0},scale:100,model:{offset:12},layers:[]};
    const models=new Map([[12,{positions:new Float32Array([-2,0,-2,2,0,-2,2,0,2,-2,0,2]),indices:new Uint32Array([0,1,2,0,2,3]),bounds:{min:[-2,0,-2],max:[2,0,2]}}]]);
    s.build([p],new Map(),models);s.setVisible(new Set([1]));s.select(1);s.frameSelection();
    await new Promise(r=>setTimeout(r,150));const r=canvas.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const surface=s.dropPosition(x,y,2);if(surface?.mode!=='surface'||Math.abs(surface.position[1]-5)>.01)throw Error('surface ray failed '+JSON.stringify(surface));
    s.setWireframe(true);if(s.dropPosition(x,y,2)?.mode!=='surface')throw Error('wireframe ray failed');
    s.setVisible(new Set());const plane=s.dropPosition(x,y,2);if(plane?.mode!=='plane'||plane.position[1]!==2)throw Error('hidden mesh ray failed '+JSON.stringify(plane));
    s.previewDrop(1,plane.position);if(s.dropPosition(x,y,2)?.mode!=='plane')throw Error('ghost intercepts drop');
    if(s.dropPosition(r.left-1,y,2)!==null||s.dropPosition(x,y,NaN)!==null)throw Error('invalid drop accepted');
    const camera=s.diagnostics().camera,target=s.diagnostics().target;s.build([{...p,position:[90,30,20]}],new Map(),models,null,{preserveCamera:true});
    if(JSON.stringify(s.diagnostics().camera)!==JSON.stringify(camera)||JSON.stringify(s.diagnostics().target)!==JSON.stringify(target))throw Error('camera changed during rebuild');
    wrap.remove();return {surface,plane,wireframe:true,hidden:true,ghostExcluded:true,cameraPreserved:true};
  })()`);
  save(session, { out: path.join(out, 'level.edited.decoded') });
  const reopened=openSession(session.lastSave.file,{archive:session.archive,entry:3,fixups:session.fixups});
  assert.deepEqual(reopened.additions,session.additions);
  assert.equal(reopened.placements.length,673+session.additions.length);
  assert.ok(reopened.additions.every(a=>(a.script??null)===subject.script));
  const built = process.argv.includes('--no-patch') ? null : patch(session, { deps: editorDeps(session, {}) }).patch;
  const result = { out, filterMs, hint, source, additions:session.additions, patch:built, geometryChecks,uiChecks,browser_errors:errors,checks:['673 original objects preserved','two mouse drops at distinct destinations','no victim','negative identity selection','rotation','scale disabled','undo removes additions','redo recreates additions','reset restores opened scene','saved sidecar preserved','real model thumbnails','accessible folder summaries','English interface'] };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync('.local/object-workflow/latest-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({out,filterMs,position:placed.position,patch:built?.dir,errors}));
  await send('Browser.close').catch(()=>{});
} finally { ws?.close(); browser.kill(); await server.close(); }
