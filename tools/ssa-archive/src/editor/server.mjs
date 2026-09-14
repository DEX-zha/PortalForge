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
import { sessionSummary, findPlacement, applyEdit, undo, redo, planReplace, interchangeable } from './session.mjs';
import { meshesPayload } from './meshes.mjs';
import { assessPlacement } from './safety.mjs';
import { scriptDiagnostics } from './script-diagnostics.mjs';
import { buildSavePlan, save, patch, launch, observe, launchState, stopLaunch } from './save.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEW_DIR = path.resolve(here, '../view');
const THREE_DIR = path.resolve(here, '../../node_modules/three');

const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8' };

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
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return notFound(res, 'that path'); }

    try {
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
    if (pathname === '/api/placements') return json(res, 200, { placements: s.placements, layers: s.layers });
    // Real geometry, decoded once per session from the two geometry sections and cached (feature 004).
    if (pathname === '/api/meshes') return json(res, 200, meshesPayload(s));
    // A run is polled, never awaited over HTTP: two boots outlast every client's header timeout.
    if (pathname === '/api/launch') return json(res, 200, launchState(s));
    const m = /^\/api\/placement\/(0x[0-9a-fA-F]+|\d+)$/.exec(pathname);
    if (m) {
      const offset = Number(m[1]);
      const placement = findPlacement(s, offset);
      if (!placement) return json(res, 404, { error: 'NO_SUCH_PLACEMENT', reason: `no placement at 0x${offset.toString(16)} in this level` });
      return json(res, 200, {
        placement,
        script: scriptDiagnostics(s, placement),
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
      if (pathname === '/api/edit') return json(res, 200, state(applyEdit(s, body)));
      if (pathname === '/api/undo') { const r = undo(s); return r ? json(res, 200, state(r)) : json(res, 409, { error: 'NOTHING_TO_UNDO', reason: 'no edit left to undo' }); }
      if (pathname === '/api/redo') { const r = redo(s); return r ? json(res, 200, state(r)) : json(res, 409, { error: 'NOTHING_TO_REDO', reason: 'nothing was undone' }); }
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
