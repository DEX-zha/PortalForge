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
import { sessionSummary, findPlacement } from './session.mjs';
import { assessPlacement } from './safety.mjs';

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

export function startServer({ session, port = 7378, host = '127.0.0.1' } = {}) {
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return notFound(res, 'that path'); }

    try {
      if (pathname.startsWith('/api/')) return api(req, res, pathname, session);
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

  // The API of this phase is read-only; the editing routes arrive with User Story 2.
  function api(req, res, pathname, s) {
    if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED', reason: `${req.method} is not accepted on ${pathname}` });
    if (pathname === '/api/session') return json(res, 200, sessionSummary(s));
    if (pathname === '/api/placements') return json(res, 200, { placements: s.placements, layers: s.layers });
    const m = /^\/api\/placement\/(0x[0-9a-fA-F]+|\d+)$/.exec(pathname);
    if (m) {
      const offset = Number(m[1]);
      const placement = findPlacement(s, offset);
      if (!placement) return json(res, 404, { error: 'NO_SUCH_PLACEMENT', reason: `no placement at 0x${offset.toString(16)} in this level` });
      return json(res, 200, {
        placement,
        safety: assessPlacement(placement, { hasRuntimeMap: s.has_runtime_map }),
        replace_targets: replaceTargets(s, placement),
      });
    }
    return notFound(res, pathname);
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
    .filter(p => p.offset !== placement.offset && p.span === placement.span)
    .map(p => ({ offset: p.offset, name: p.name, span: p.span, layers: p.layers, model: p.model.path }));
}
