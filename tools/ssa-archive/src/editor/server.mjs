// node:http server for the editor (feature 003 T009, T014, T016).
//
// Two static roots and nothing else: the view directory and the vendored copy of three. A local server that will
// read any path the browser asks for is a file browser for the whole machine, so every request is resolved and
// then checked to still be inside one of those two directories; percent-encoded traversal decodes before the
// check, not after.
//
// The API is the contract in specs/003-placement-editor-3d/contracts/editor-api.md. It returns resolved records,
// never bytes, and it is the only way the view can reach the session. GET routes read; POST routes change the
// session only, and `/api/save` is the single place a file is produced. A refusal answers 409 with the rule or
// reason that caused it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sessionSummary,
  findPlacement,
  applyEdit,
  undo,
  redo,
  resetScene,
  planReplace,
  interchangeable,
} from './session.mjs';
import { meshesPayload } from './meshes.mjs';
import { catalog, prepareDrop, commitDrop } from './catalog.mjs';
import { classifyAddition, familyKey } from './addition-compatibility.mjs';
import { runAdditionProbe, readFamilyReport, reportsDir } from './addition-probe.mjs';
import { renderAdditionReport } from './addition-report-page.mjs';
import { assessPlacement } from './safety.mjs';
import { scriptDiagnostics } from './script-diagnostics.mjs';
import { directEntryConfirmed, TUTORIAL } from './level-entry.mjs';
import { buildSavePlan, save, patch, launch, observe, launchState, stopLaunch } from './save.mjs';
import { capabilitiesOf, levelKey, transformStatusFor } from './level-catalog.mjs';
import { isTutorial } from './levels.mjs';
import { captureSceneSnapshot, saveSnapshot, latestSnapshot, snapshotSummary } from './scene-snapshot.mjs';
import { buildCatalogue, libraryFor, readCatalogue, catalogueFile } from './game-catalogue.mjs';
import { readNativeBytes } from './native-run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEW_DIR = path.resolve(here, '../view');
const THREE_DIR = path.resolve(here, '../../node_modules/three');
const EVIDENCE_DIR = path.resolve(reportsDir, '../dolphin-evidence');

const DEFAULT_PORT = 7378;
const VALIDATION_REPEATS = 2; // a capability needs two identical boots
const MAX_VALIDATION_SOURCES = 2;

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

const notFound = (res, what) => json(res, 404, { error: 'NOT_FOUND', reason: `${what} is not served by this editor` });

// Resolve `rel` under `root` and refuse anything that escapes it or is not a readable file.
function safeFile(root, rel) {
  if (!rel || rel.endsWith('/')) return null;
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

function sendFile(res, abs) {
  const body = fs.readFileSync(abs);
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

// A family report names the batch whose record holds the runs. The batch name becomes a path segment, so it is
// checked against its exact shape before it is used as one.
function loadFamilyReport(key) {
  const report = readFamilyReport(key);
  if (!report || !/^batch-[0-9]+-[a-f0-9]{8}$/.test(report.batch)) return null;
  const record = JSON.parse(fs.readFileSync(path.join(reportsDir, report.batch, 'result.json'), 'utf8'));
  return { report, record };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('the request body is not JSON'), { error: 'BAD_BODY' });
  }
}

export function startServer({ session: initial, port = DEFAULT_PORT, host = '127.0.0.1', deps = {} } = {}) {
  // The session every route acts on. `POST /api/open` replaces it (feature 006); nothing else reassigns it, and
  // no route keeps a reference across requests, so a switch is complete the moment it happens.
  let session = initial;
  // The addition-validation batch in progress, if any. At most one runs at a time, and it holds the session lock.
  let validation = null;

  // What every mutating route reports back, so the view can refresh its toolbar without a second request.
  const sessionState = extra => ({
    dirty: session.dirty,
    undo_depth: session.edits.length,
    redo_depth: session.undone.length,
    locked: session.locked,
    saved: session.lastSave ? { file: session.lastSave.file, sha256: session.lastSave.sha256 } : null,
    patched: session.lastPatch ?? null,
    ...extra,
  });

  function validationStatus() {
    if (!validation) return { running: false };
    const { running, progress, result, error } = validation;
    return { running, progress, result, error };
  }

  // Starts a batch and returns at once: two boots outlast every HTTP client's patience, so the view polls.
  function startValidation(res, body) {
    if (session.locked || session.lastLaunch?.running || validation?.running) {
      return json(res, 409, {
        error: 'SESSION_LOCKED',
        reason: 'Stop the current editor-owned run before starting a validation batch.',
      });
    }
    const sources = body.sources;
    const valid =
      Array.isArray(sources) &&
      sources.length >= 1 &&
      sources.length <= MAX_VALIDATION_SOURCES &&
      sources.every(Number.isInteger);
    if (!valid) return json(res, 409, { error: 'BAD_BATCH', reason: 'Choose one or two source objects.' });

    const controller = new AbortController();
    const batch = { controller, running: true, progress: null, result: null, error: null };
    validation = batch;
    session.locked = true;
    Promise.resolve()
      .then(() =>
        (deps.probe ?? runAdditionProbe)(session, sources, {
          repeat: VALIDATION_REPEATS,
          signal: controller.signal,
          onProgress: progress => (batch.progress = progress),
        }),
      )
      .then(r => (batch.result = { id: r.id, status: r.status, candidates: r.candidates, error: r.error ?? null }))
      .catch(e => (batch.error = e.message))
      .finally(() => {
        batch.running = false;
        session.locked = false;
      });
    return json(res, 200, { running: true });
  }

  function placementDetails(res, offset) {
    const placement = findPlacement(session, offset);
    if (!placement) {
      return json(res, 404, {
        error: 'NO_SUCH_PLACEMENT',
        reason: `no placement at 0x${offset.toString(16)} in this level`,
      });
    }
    return json(res, 200, {
      placement,
      addition: classifyAddition(session, placement, { report: readFamilyReport(familyKey(session, placement)) }),
      script: placement.native_addition ? null : scriptDiagnostics(session, placement),
      safety: assessPlacement(placement, { hasRuntimeMap: session.has_runtime_map }),
      replace_targets: replaceTargets(session, placement),
    });
  }

  // The technical report of a family, or one capture of one run. A capture is only served when the recorded
  // path resolves inside the evidence folder and is a PNG.
  function additionReport(res, key, runIndex, shotIndex) {
    const loaded = loadFamilyReport(key);
    if (!loaded) return notFound(res, 'that test report');
    const { report, record } = loaded;
    if (runIndex !== undefined) {
      const shot = record.runs[Number(runIndex)]?.screenshots?.[Number(shotIndex)];
      const servable = shot && path.resolve(shot).startsWith(EVIDENCE_DIR + path.sep) && path.extname(shot) === '.png';
      return servable ? sendFile(res, path.resolve(shot)) : notFound(res, 'that test screenshot');
    }
    const screenshots = record.runs.flatMap((run, i) =>
      (run.screenshots ?? []).map((_, j) => ({ run: i + 1, url: `/api/addition-report/${key}/shot/${i}/${j}` })),
    );
    return json(res, 200, { report, record, screenshots });
  }

  // What this level can do, from the catalogue when the session came from it, else derived from the session.
  function currentCapabilities(levels) {
    const key = levelKey(session.archive);
    const listed = levels.find(l => l.key === key);
    return (
      session.level?.capabilities ??
      listed?.capabilities ??
      capabilitiesOf({
        tutorial: isTutorial(session.archive),
        transformStatus: transformStatusFor(session.archive),
        runtimeMap: session.has_runtime_map ? { file: null, source: 'given' } : null,
        directEntry: directEntryConfirmed(),
      })
    );
  }

  // The levels of the disc and where this session stands among them. Switching is possible only when the server
  // was given a way to open a level by name; a server started on one file says so rather than pretending.
  async function levelList(res) {
    const catalog = deps.levels ? await deps.levels() : { levels: [] };
    const key = levelKey(session.archive);
    const levels = catalog.levels.map(l => ({ ...l, current: l.key === key }));
    return json(res, 200, {
      current: {
        archive: session.archive,
        key,
        name: session.level?.name ?? null,
        family: session.level?.family ?? null,
        capabilities: currentCapabilities(levels),
      },
      switching: !!deps.open,
      levels,
    });
  }

  // Opens another level in place of the current one. Refuses while a run or a batch holds the session, and
  // refuses to drop unsaved edits unless the caller says so explicitly: a switch is a reset nobody can undo.
  async function openLevel(res, body) {
    if (!deps.open)
      return json(res, 409, {
        error: 'OPEN_UNAVAILABLE',
        reason: 'this server was started on one file; start it with `edit open <level>` to switch levels',
      });
    if (session.locked || session.lastLaunch?.running || validation?.running)
      return json(res, 409, {
        error: 'SESSION_LOCKED',
        reason: 'stop the editor-owned Dolphin or the validation batch before opening another level',
      });
    if (typeof body.archive !== 'string' || !body.archive.trim())
      return json(res, 409, { error: 'BAD_VALUE', reason: 'name the level to open' });
    if (session.dirty && !body.discard)
      return json(res, 409, {
        error: 'UNSAVED_CHANGES',
        reason: `${session.edits.length} unsaved edit(s) would be lost: save first, or open again with discard`,
        undo_depth: session.edits.length,
      });
    const next = await deps.open(body.archive.trim());
    session = next;
    if (deps.snapshotDir) session.snapshots_dir = deps.snapshotDir;
    validation = null;
    return json(res, 200, { opened: sessionSummary(session) });
  }

  // The level as the running game holds it (feature 006): the newest snapshot read from Dolphin for this level,
  // and whether one can be taken now, which needs an editor-owned run that has reached play.
  const playing = () => !!session.lastLaunch?.running && session.lastLaunch?.progress?.phase === 'playing';
  const snapshotOptions = deps.snapshotDir ? { dir: deps.snapshotDir } : {};
  if (deps.snapshotDir) session.snapshots_dir = deps.snapshotDir; // native-params.mjs reads the same folder
  function snapshotState(res) {
    return json(res, 200, {
      snapshot: snapshotSummary(latestSnapshot(session.archive, snapshotOptions), session),
      capturable: playing(),
    });
  }
  async function captureSnapshot(res, body) {
    if (!playing())
      return json(res, 409, {
        error: 'NOT_PLAYING',
        reason: 'launch the level from this editor and wait until the game is playing before capturing its scene',
      });
    const snapshot = await (deps.capture ?? captureSceneSnapshot)(session, {
      readBytes: deps.readBytes ?? readNativeBytes,
      run: session.lastLaunch.experiment_id ?? session.lastPatch?.experiment_id ?? null,
      moment: typeof body.moment === 'string' && body.moment.trim() ? body.moment.trim() : 'during play',
    });
    const file = saveSnapshot(snapshot, snapshotOptions);
    return json(res, 200, { snapshot: snapshotSummary({ file, ...snapshot }, session), capturable: true });
  }

  // Every kind of object of the game, seen from the open level (feature 007, phase P). Building reads each
  // decoded level once, a few seconds in all; it never opens the game image and never switches the session.
  const libraryFile = deps.catalogueFile ?? catalogueFile;
  const library = res => json(res, 200, libraryFor(session.archive, readCatalogue(libraryFile)));
  async function buildLibrary(res) {
    if (!deps.levels || !deps.open)
      return json(res, 409, { error: 'LIBRARY_UNAVAILABLE', reason: 'start the editor with `edit open <level>`' });
    const { levels } = await deps.levels();
    const built = await buildCatalogue({
      levels: levels.filter(level => level.ready),
      open: level => deps.open(level.name, { game: null }),
      file: libraryFile,
    });
    return json(res, 200, libraryFor(session.archive, built));
  }

  const GET_ROUTES = {
    '/api/session': res => json(res, 200, sessionSummary(session)),
    '/api/library': library,
    '/api/levels': levelList,
    '/api/snapshot': snapshotState,
    '/api/catalog': res => json(res, 200, catalog(session)),
    '/api/level-entry': res => {
      const tutorial = session.archive?.toLowerCase() === TUTORIAL,
        confirmed = directEntryConfirmed(),
        companion = session.level?.companion ?? null;
      // Another level reaches direct entry through the archive redirect (feature 006): the same tutorial
      // checkpoint, with the level's files served under the tutorial's names. An experiment, and labelled so.
      const capability = session.level?.capabilities?.direct_entry ?? null;
      const redirect = tutorial
        ? null
        : {
            available: confirmed && !!companion?.present,
            confidence: capability?.confidence ?? 'UNKNOWN',
            experimental: !!capability?.experimental || !capability,
            finding: 'level.entry.archive-redirect',
            why: !confirmed
              ? 'the tutorial checkpoint is not confirmed on this machine'
              : !companion
                ? 'this session was opened on a file: open the level by name so its voice pack can be extracted'
                : !companion.present
                  ? `the voice pack ${companion.archive} is not extracted: open the level with the game image configured`
                  : (capability?.why ??
                    'this level is served under the tutorial file names so the confirmed tutorial checkpoint loads it'),
          };
      return json(res, 200, {
        supported: tutorial && confirmed,
        redirect,
        preparation:
          'A checkpoint is prepared once for each compatible disc layout. Changed level bytes are loaded after restoration.',
      });
    },
    '/api/addition-validation': res => json(res, 200, validationStatus()),
    '/api/placements': res => json(res, 200, { placements: session.placements, layers: session.layers }),
    // Real geometry, decoded once per session from the two geometry sections and cached (feature 004).
    '/api/meshes': res => json(res, 200, meshesPayload(session)),
    // A run is polled, never awaited over HTTP: two boots outlast every client's header timeout.
    '/api/launch': res => json(res, 200, launchState(session)),
  };

  function handleGet(res, pathname) {
    if (Object.hasOwn(GET_ROUTES, pathname)) return GET_ROUTES[pathname](res);
    const report = /^\/api\/addition-report\/([a-f0-9]{64})(?:\/shot\/(\d+)\/(\d+))?$/.exec(pathname);
    if (report) return additionReport(res, report[1], report[2], report[3]);
    const placement = /^\/api\/placement\/(0x[0-9a-fA-F]+|-?\d+)$/.exec(pathname);
    if (placement) return placementDetails(res, Number(placement[1]));
    return notFound(res, pathname);
  }

  const historyStep = (step, error, reason) => res => {
    const result = step(session);
    return result ? json(res, 200, sessionState(result)) : json(res, 409, { error, reason });
  };

  const POST_ROUTES = {
    '/api/open': openLevel,
    '/api/library': buildLibrary,
    '/api/snapshot': captureSnapshot,
    '/api/addition-validation': startValidation,
    '/api/addition-validation/stop': res => {
      validation?.controller.abort();
      return json(res, 200, { stopping: !!validation?.running });
    },
    '/api/edit': (res, body) => json(res, 200, sessionState(applyEdit(session, body))),
    '/api/catalog/prepare': (res, body) => json(res, 200, prepareDrop(session, body)),
    '/api/catalog/commit': (res, body) => json(res, 200, sessionState(commitDrop(session, body))),
    '/api/undo': historyStep(undo, 'NOTHING_TO_UNDO', 'no edit left to undo'),
    '/api/redo': historyStep(redo, 'NOTHING_TO_REDO', 'nothing was undone'),
    '/api/reset': res => json(res, 200, sessionState(resetScene(session))),
    '/api/plan': res => json(res, 200, { plan: buildSavePlan(session) }),
    // Prepare a duplication without applying it: the refusal IS the answer, because it carries the rules the
    // researcher has to read before anything can be confirmed.
    '/api/duplicate/plan': (res, body) => json(res, 200, planReplace(session, body)),
    '/api/save': (res, body) => {
      const r = save(session, { out: body.out ?? null });
      return json(res, r.written ? 200 : 409, sessionState({ plan: r.plan, written: r.written }));
    },
    '/api/patch': res => json(res, 200, sessionState(patch(session, { deps }))),
    '/api/launch': async (res, body) => json(res, 200, sessionState(await launch(session, { ...body, deps }))),
    '/api/launch/stop': res => json(res, 200, sessionState(stopLaunch(session))),
    '/api/observe': (res, body) => json(res, 200, sessionState(observe(session, { ...body, deps }))),
  };

  async function handlePost(req, res, pathname) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return json(res, 400, { error: e.error ?? 'BAD_BODY', reason: e.message });
    }
    if (!Object.hasOwn(POST_ROUTES, pathname)) return notFound(res, pathname);
    try {
      return await POST_ROUTES[pathname](res, body);
    } catch (e) {
      // A refusal carries an error code and answers 409; anything else is a defect and answers 500.
      return json(res, e.error ? 409 : 500, {
        error: e.error ?? 'INTERNAL',
        reason: e.message.replace(/^[A-Z_]+: /, ''),
        rules: e.rules ?? [],
      });
    }
  }

  function serveStatic(res, pathname) {
    if (pathname === '/' || pathname === '/index.html') {
      const file = safeFile(VIEW_DIR, 'index.html');
      return file ? sendFile(res, file) : notFound(res, 'the view');
    }
    for (const [prefix, root] of [
      ['/view/', VIEW_DIR],
      ['/vendor/three/', THREE_DIR],
    ]) {
      if (!pathname.startsWith(prefix)) continue;
      const file = safeFile(root, pathname.slice(prefix.length));
      return file ? sendFile(res, file) : notFound(res, pathname);
    }
    return notFound(res, pathname);
  }

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return notFound(res, 'that path');
    }

    try {
      const reportPage = /^\/addition-report\/([a-f0-9]{64})$/.exec(pathname);
      if (req.method === 'GET' && reportPage) {
        const loaded = loadFamilyReport(reportPage[1]);
        if (!loaded) return notFound(res, 'that test report');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(renderAdditionReport(loaded.report, loaded.record, reportPage[1]));
      }
      if (pathname.startsWith('/api/')) {
        return req.method === 'GET' ? handleGet(res, pathname) : handlePost(req, res, pathname);
      }
      return serveStatic(res, pathname);
    } catch (e) {
      return json(res, 500, { error: 'INTERNAL', reason: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        address,
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
    .map(p => ({
      offset: p.offset,
      name: p.name,
      span: p.span,
      copies: session.copy?.get(p.offset)?.size ?? p.span,
      layers: p.layers,
      model: p.model.path,
    }));
}
