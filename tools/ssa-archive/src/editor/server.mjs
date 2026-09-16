// node:http server for the editor (feature 003 T009, T014, T016).
//
// Two static roots and nothing else: the view directory and the vendored copy of three. A local server that will
// read any path the browser asks for is a file browser for the whole machine, so every request is resolved and
// then checked to still be inside one of those two directories; percent-encoded traversal decodes before the
// check, not after.
//
// The API is the contract in specs/003-placement-editor-3d/contracts/editor-api.md. It returns resolved records,
// never bytes, and it is the only way the view can reach the session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionSummary, findPlacement, applyEdit, undo, redo, resetScene, planReplace, interchangeable } from './session.mjs';
import { meshesPayload } from './meshes.mjs';
import { catalog, prepareDrop, commitDrop } from './catalog.mjs';
import { classifyAddition, familyKey } from './addition-compatibility.mjs';
import { runAdditionProbe, readFamilyReport, reportsDir } from './addition-probe.mjs';
import { assessPlacement } from './safety.mjs';
import { scriptDiagnostics } from './script-diagnostics.mjs';
import {directEntryConfirmed,TUTORIAL} from './level-entry.mjs';
import { buildSavePlan, save, patch, launch, observe, launchState, stopLaunch } from './save.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEW_DIR = path.resolve(here, '../view');
const THREE_DIR = path.resolve(here, '../../node_modules/three');

const TYPES = { '.png':'image/png', '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8' };

const json = (res, status, body) => { const b = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(b) }); res.end(b); };
const notFound = (res, what) => json(res, 404, { error: 'NOT_FOUND', reason: `${what} is not served by this editor` });

// Resolve `rel` under `root` and refuse anything that escapes it or is not a readable file.
function safeFile(root, rel) {
  if (!rel || rel.endsWith('/')) return null;
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try { return fs.statSync(abs).isFile() ? abs : null; } catch { return null; }
}

function sendFile(res, abs) {
  const body = fs.readFileSync(abs);
  res.writeHead(200, { 'content-type': TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  res.end(body);
}

export function startServer({ session, port = 7378, host = '127.0.0.1', deps = {} } = {}) {
  let validation = null;
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return notFound(res, 'that path'); }

    try {
      const reportPage=/^\/addition-report\/([a-f0-9]{64})$/.exec(pathname);
      if(req.method==='GET'&&reportPage){
        const report=readFamilyReport(reportPage[1]);if(!report||!/^batch-[0-9]+-[a-f0-9]{8}$/.test(report.batch))return notFound(res,'that test report');
        const record=JSON.parse(fs.readFileSync(path.join(reportsDir,report.batch,'result.json'),'utf8'));
        const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const body=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Addition test</title><style>body{background:#20242b;color:#eee;font:16px system-ui;max-width:1100px;margin:30px auto;padding:20px}img{max-width:100%;display:block;margin:14px 0}a{color:#9ed4ff}</style><h1>${esc(report.name)}: ${esc(report.runtime)}</h1><p>${esc(report.reason)}</p><p>Visual: ${esc(report.visual)}. Gameplay: ${esc(report.gameplay)}. A technical pass alone does not enable Add.</p>${record.runs.map((r,i)=>`<h2>Run ${i+1}: ${esc(r.status)}</h2>${(r.screenshots??[]).map((file,j)=>({file,j})).filter(x=>/tutorial/.test(x.file)).map(x=>`<p>${esc(path.basename(x.file))}</p><img loading="lazy" alt="Tutorial capture, run ${i+1}" src="/api/addition-report/${reportPage[1]}/shot/${i}/${x.j}">`).join('')}`).join('')}<a href="/api/addition-report/${reportPage[1]}">Technical report</a></html>`;
        res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(body);
      }
      if (pathname.startsWith('/api/')) return route(req, res, pathname, session);
      if (pathname === '/' || pathname === '/index.html') {
        const f = safeFile(VIEW_DIR, 'index.html');
        return f ? sendFile(res, f) : notFound(res, 'the view');
      }
      if (pathname.startsWith('/view/')) {
        const f = safeFile(VIEW_DIR, pathname.slice('/view/'.length));
        return f ? sendFile(res, f) : notFound(res, pathname);
      }
      if (pathname.startsWith('/vendor/three/')) {
        const f = safeFile(THREE_DIR, pathname.slice('/vendor/three/'.length));
        return f ? sendFile(res, f) : notFound(res, pathname);
      }
      return notFound(res, pathname);
    } catch (e) {
      return json(res, 500, { error: 'INTERNAL', reason: e.message });
    }
  });

  const route = (req, res, pathname, s) => (req.method === 'GET' ? api(req, res, pathname, s) : post(req, res, pathname, s));

  function api(req, res, pathname, s) {
    if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED', reason: `${req.method} is not accepted on ${pathname}` });
    if (pathname === '/api/session') return json(res, 200, sessionSummary(s));
    if (pathname === '/api/catalog') return json(res, 200, catalog(s));
    if (pathname === '/api/level-entry') return json(res,200,{supported:s.archive?.toLowerCase()===TUTORIAL&&directEntryConfirmed(),preparation:'A checkpoint is prepared once for each compatible disc layout. Changed level bytes are loaded after restoration.'});
    if (pathname === '/api/addition-validation') return json(res,200,validation ? {running:validation.running,progress:validation.progress,result:validation.result,error:validation.error}: {running:false});
    const reportMatch=/^\/api\/addition-report\/([a-f0-9]{64})(?:\/shot\/(\d+)\/(\d+))?$/.exec(pathname);
    if(reportMatch){
      const report=readFamilyReport(reportMatch[1]);if(!report||!/^batch-[0-9]+-[a-f0-9]{8}$/.test(report.batch))return notFound(res,'that test report');
      const record=JSON.parse(fs.readFileSync(path.join(reportsDir,report.batch,'result.json'),'utf8'));
      if(reportMatch[2]!==undefined){
        const shot=record.runs[Number(reportMatch[2])]?.screenshots?.[Number(reportMatch[3])],root=path.resolve(reportsDir,'../dolphin-evidence');
        if(!shot||!path.resolve(shot).startsWith(root+path.sep)||path.extname(shot)!=='.png')return notFound(res,'that test screenshot');
        return sendFile(res,path.resolve(shot));
      }
      return json(res,200,{report,record,screenshots:record.runs.flatMap((r,i)=>(r.screenshots??[]).map((_,j)=>({run:i+1,url:`/api/addition-report/${reportMatch[1]}/shot/${i}/${j}`})))});
    }
    if (pathname === '/api/placements') return json(res, 200, { placements: s.placements, layers: s.layers });
    // Real geometry, decoded once per session from the two geometry sections and cached (feature 004).
    if (pathname === '/api/meshes') return json(res, 200, meshesPayload(s));
    // A run is polled, never awaited over HTTP: two boots outlast every client's header timeout.
    if (pathname === '/api/launch') return json(res, 200, launchState(s));
    const m = /^\/api\/placement\/(0x[0-9a-fA-F]+|-?\d+)$/.exec(pathname);
    if (m) {
      const offset = Number(m[1]);
      const placement = findPlacement(s, offset);
      if (!placement) return json(res, 404, { error: 'NO_SUCH_PLACEMENT', reason: `no placement at 0x${offset.toString(16)} in this level` });
      return json(res, 200, {
        placement,
        addition: classifyAddition(s,placement,{report:readFamilyReport(familyKey(s,placement))}),
        script: placement.native_addition ? null : scriptDiagnostics(s, placement),
        safety: assessPlacement(placement, { hasRuntimeMap: s.has_runtime_map }),
        replace_targets: replaceTargets(s, placement),
      });
    }
    return notFound(res, pathname);
  }


  // POST routes (feature 003 T029). Every one of them changes the session only; `/api/save` is the single
  // place a file is produced, and a refusal answers 409 with the rule or reason that caused it.
  async function readJson(req) {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { const err = new Error('the request body is not JSON'); err.error = 'BAD_BODY'; throw err; }
  }

  async function post(req, res, pathname, s) {
    let body;
    try { body = await readJson(req); } catch (e) { return json(res, 400, { error: e.error ?? 'BAD_BODY', reason: e.message }); }
    const state = extra => ({ dirty: s.dirty, undo_depth: s.edits.length, redo_depth: s.undone.length, locked: s.locked,
      saved: s.lastSave ? { file: s.lastSave.file, sha256: s.lastSave.sha256 } : null, patched: s.lastPatch ?? null, ...extra });
    try {
      if (pathname === '/api/addition-validation/stop') { validation?.controller.abort(); return json(res,200,{stopping:!!validation?.running}); }
      if (pathname === '/api/addition-validation') {
        if(s.locked || s.lastLaunch?.running || validation?.running) return json(res,409,{error:'SESSION_LOCKED',reason:'Stop the current editor-owned run before starting a validation batch.'});
        const sources=body.sources;
        if(!Array.isArray(sources)||!sources.length||sources.length>2||sources.some(o=>!Number.isInteger(o)))return json(res,409,{error:'BAD_BATCH',reason:'Choose one or two source objects.'});
        const controller=new AbortController();validation={controller,running:true,progress:null,result:null,error:null};const current=validation;
        s.locked=true;
        Promise.resolve().then(()=>(deps.probe??runAdditionProbe)(s,sources,{repeat:2,signal:controller.signal,onProgress:p=>current.progress=p}))
          .then(r=>current.result={id:r.id,status:r.status,candidates:r.candidates,error:r.error??null})
          .catch(e=>current.error=e.message).finally(()=>{current.running=false;s.locked=false;});
        return json(res,200,{running:true});
      }
      if (pathname === '/api/edit') return json(res, 200, state(applyEdit(s, body)));
      if (pathname === '/api/catalog/prepare') return json(res, 200, prepareDrop(s, body));
      if (pathname === '/api/catalog/commit') return json(res, 200, state(commitDrop(s, body)));
      if (pathname === '/api/undo') { const r = undo(s); return r ? json(res, 200, state(r)) : json(res, 409, { error: 'NOTHING_TO_UNDO', reason: 'no edit left to undo' }); }
      if (pathname === '/api/redo') { const r = redo(s); return r ? json(res, 200, state(r)) : json(res, 409, { error: 'NOTHING_TO_REDO', reason: 'nothing was undone' }); }
      if (pathname === '/api/reset') return json(res, 200, state(resetScene(s)));
      if (pathname === '/api/plan') return json(res, 200, { plan: buildSavePlan(s) });
      // Prepare a duplication without applying it: the refusal IS the answer, because it carries the rules the
      // researcher has to read before anything can be confirmed.
      if (pathname === '/api/duplicate/plan') return json(res, 200, planReplace(s, body));
      if (pathname === '/api/save') { const r = save(s, { out: body.out ?? null }); return json(res, r.written ? 200 : 409, state({ plan: r.plan, written: r.written })); }
      if (pathname === '/api/patch') return json(res, 200, state(patch(s, { deps })));
      if (pathname === '/api/launch') return json(res, 200, state(await launch(s, { ...body, deps })));
      if (pathname === '/api/launch/stop') return json(res, 200, state(stopLaunch(s)));
      if (pathname === '/api/observe') return json(res, 200, state(observe(s, { ...body, deps })));
      return notFound(res, pathname);
    } catch (e) {
      return json(res, e.error ? 409 : 500, { error: e.error ?? 'INTERNAL', reason: e.message.replace(/^[A-Z_]+: /, ''), rules: e.rules ?? [] });
    }
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server, address,
        url: `http://${address.address}:${address.port}`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

// Duplication targets: same span, never the source itself. The size must match exactly, because only a same-size
// replacement keeps the count-bounded walk aligned (finding igz.loader.head-span-count-walk).
export function replaceTargets(session, placement) {
  return session.placements
    .filter(p => p.offset !== placement.offset && interchangeable(session, placement.offset, p.offset))
    .map(p => ({ offset: p.offset, name: p.name, span: p.span, copies: session.copy?.get(p.offset)?.size ?? p.span,
      layers: p.layers, model: p.model.path }));
}
