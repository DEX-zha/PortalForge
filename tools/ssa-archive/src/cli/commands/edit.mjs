// `edit <subcommand> ...`: the placement editor.
//   levels            list the levels of the disc as the editor can open them
//   open <level>      open a level by name or disc path, extracting and decoding it when needed, and serve it
//   serve, preview    open an editor session on a decoded file; the runtime fixup map is optional
//   list, show        read placements; the fixup map is required
//   set, replace      write a modified copy of the file, together with its plan
import fs from 'node:fs';
import path from 'node:path';
import { buildEditorPatch } from '../../editor/patch-build.mjs';
import { runEditorGame } from '../../editor/dolphin-run.mjs';
import { CliError, EXIT, need } from '../errors.mjs';
import { firstFixup, parseHexList, parseNumberList, readFixups } from '../args.mjs';
import { pickSubcommand } from '../dispatch.mjs';
import { localDir, sampleOf } from '../paths.mjs';
import { setting } from '../../../../dolphin-mcp/config.mjs';

const DEFAULT_PORT = 7378;
const hex = value => '0x' + value.toString(16);
const planExit = plan => (plan.validation.status === 'VALID' ? EXIT.OK : EXIT.FAILED);

// What the editor server needs from the outside world: a patch builder, a game runner, the level catalogue and
// a way to open another level. They are the same ones the command line uses, so an editor run leaves the same
// evidence trail as a command-line one. Nothing here is bound to one session: the server may switch levels.
export function editorDeps(o = {}) {
  return {
    build: ({ experimentId, replacements, session }) => {
      const game = o.game ?? setting('game');
      if (!game) {
        throw Object.assign(new Error('no game image configured: set .local/dolphin-config.json or pass --game'), {
          error: 'NO_GAME',
        });
      }
      const outDir = o['patch-out'] ?? path.join(localDir, 'patches', experimentId);
      const original = sampleOf(session.archive);
      if (!fs.existsSync(original)) throw new Error('Original archive sample is missing: ' + original);
      return buildEditorPatch({ experimentId, game, replacements, outDir, original, session });
    },
    run: args => runEditorGame({ ...args, archive: args.session.archive, figure: args.figure ?? o.figure ?? null }),
    levels: () => levelCatalogModule().then(m => m.levelCatalog()),
    open: (query, options = {}) =>
      import('../../editor/level-open.mjs').then(m => m.openLevel(query, { game: o.game ?? undefined, ...options })),
  };
}

const levelCatalogModule = () => import('../../editor/level-catalog.mjs');

async function openEditorSession(file, o) {
  const { openSession } = await import('../../editor/session.mjs');
  return openSession(file, {
    archive: need(o.archive, 'archive'),
    entry: Number(need(o.entry, 'entry')),
    fixups: readFixups(o.fixups),
  });
}

function openInBrowser(url) {
  return import('node:child_process').then(({ spawn }) => {
    const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['open', [url]];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  });
}

// Starts the editor server on a session and returns; the process stays alive for as long as the server listens.
async function serveSession(session, o) {
  const { startServer } = await import('../../editor/server.mjs');
  const served = await startServer({
    session,
    port: o.port ? Number(o.port) : DEFAULT_PORT,
    deps: editorDeps(o),
  });
  if (o.open) await openInBrowser(served.url);
  const runtimeMap = session.has_runtime_map
    ? '; runtime fixup map loaded'
    : '; no runtime map, every pointer-derived value is structural';
  const capabilities = session.level?.capabilities;
  const withheld = capabilities
    ? Object.entries(capabilities)
        .filter(([, c]) => !c.available)
        .map(([k, c]) => `  ${k}: ${c.why}`)
    : [];
  return {
    result: {
      session: session.id,
      url: served.url,
      placements: session.placements.length,
      level: session.level ?? null,
    },
    text: [
      `session ${session.id}  ${session.file}`,
      `level ${session.archive}${session.level ? ` (${session.level.family})` : ''}`,
      `placements ${session.placements.length} in ${session.layers.length} layer(s); class type ${session.detection.placement_type}; models ${session.counts.direct} direct, ${session.counts.absent} absent${runtimeMap}`,
      ...(withheld.length ? ['not available on this level:', ...withheld] : []),
      `view ${served.url}`,
      'the editor writes nothing until you save; press Ctrl+C to stop',
    ].join('\n'),
  };
}

const serve = async ({ file, o }) => serveSession(await openEditorSession(file, o), o);

// `edit open <level>`: the level is located, extracted and decoded as needed, then served like `serve`.
async function open({ query, o }) {
  const { openLevel } = await import('../../editor/level-open.mjs');
  const session = await openLevel(query, {
    fixups: o.fixups ? readFixups(o.fixups) : 'auto',
    game: o.game ?? undefined,
    log: line => process.stderr.write(line + '\n'),
  });
  return serveSession(session, o);
}

// `edit levels`: one line per level, with what the machine holds for it.
async function levels() {
  const { levelCatalog } = await levelCatalogModule();
  const catalog = levelCatalog();
  const state = l =>
    l.ready
      ? 'decoded'
      : l.workspace.present
        ? 'extracted, not decoded'
        : l.original.present
          ? 'extracted'
          : 'on disc only';
  const line = l =>
    [
      l.name.padEnd(36),
      l.family.padEnd(9),
      String(l.placements ?? '?').padStart(5),
      state(l).padEnd(23),
      l.runtime_map ? `runtime map (${l.runtime_map.source})` : '',
      l.direct_entry === 'CONFIRMED' ? 'direct entry' : '',
    ]
      .join(' ')
      .trimEnd();
  const ready = catalog.levels.filter(l => l.ready).length;
  return {
    result: catalog,
    text: [
      ...catalog.levels.map(line),
      `${catalog.levels.length} level(s), ${ready} decoded; originals under ${catalog.samples}, workspaces under ${catalog.workspaces}`,
    ].join('\n'),
  };
}

// Renders the 3D view headlessly: the only way to check what the viewport shows without a browser.
async function preview({ file, o }) {
  const { renderPreview, formatPreview, LEGIBLE_PX } = await import('../../editor/preview.mjs');
  const session = await openEditorSession(file, o);
  const r = renderPreview(session, {
    out: o.out ? path.resolve(o.out) : null,
    width: o.width ? Number(o.width) : 1100,
    height: o.height ? Number(o.height) : 780,
    layer: o.layer ?? null,
    meshes: !!o.meshes,
    eye: o.eye ? parseNumberList(o.eye) : null,
    target: o.target ? parseNumberList(o.target) : null,
  });
  // A proxy view whose markers are too small to read is a failed preview, not a successful empty one.
  const illegible = !o.meshes && r.proxy_px_median < LEGIBLE_PX;
  return { result: r, exitCode: illegible ? EXIT.FAILED : EXIT.OK, text: formatPreview(r) };
}

function list({ E, level, o }) {
  const near = o.near ? parseNumberList(o.near) : null;
  if (near && near.length !== 3) throw new CliError('--near expects x,z,radius');
  const listed = E.listByLayer(level, { layer: o.layer ?? null, near, all: !!o.all });
  return { result: listed, text: E.formatLayers(listed, { limit: o.limit ? Number(o.limit) : 40 }) };
}

function show({ E, level, pos }) {
  const r = E.getPlacement(level, Number(need(pos[2], 'placement offset')));
  const model = r.model ? `${r.model.path} (type ${r.model.type} @${hex(r.model.offset)})` : '-';
  const behaviour = r.script ? `${r.script.path} (@${hex(r.script.offset)})` : '- (none: static)';
  const wrapper = r.wrapper
    ? `type-111 @${hex(r.wrapper.offset)} size ${hex(r.wrapper.size)} (wrapper-proven duplication recipe available)`
    : 'none (t104-generic recipe only, not yet boot-confirmed)';
  return {
    result: r,
    text: [
      E.formatRow(r),
      `  layers: ${r.layers.join(' | ') || '(none)'}  span ${hex(r.span)}  refcount ${r.refcount}  inbound pointers ${r.inbound_words}`,
      `  model: ${model}`,
      `  behaviour: ${behaviour}`,
      `  wrapper: ${wrapper}`,
      `  safety: ${r.safety.safety}${r.safety.reasons.length ? ' — ' + r.safety.reasons.join('; ') : ''}`,
    ].join('\n'),
  };
}

const transformFrom = o => ({
  position: o.pos ? parseNumberList(o.pos) : null,
  heading: o.heading !== undefined ? Number(o.heading) : null,
  scale: o.scale !== undefined ? Number(o.scale) : null,
  allowScripted: !!o['allow-scripted'],
});

function writeResult(o, buffer, plan) {
  const outFile = path.resolve(need(o.out, 'out'));
  fs.writeFileSync(outFile, buffer);
  let planFile = null;
  if (o.plan) {
    planFile = path.resolve(o.plan);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
  }
  return { outFile, planFile };
}

const writtenLines = w => `\nfile ${w.outFile}${w.planFile ? '\nplan ' + w.planFile : ''}`;

function set({ E, level, pos, o }) {
  const r = E.setTransform(level, Number(need(pos[2], 'placement offset')), transformFrom(o));
  const written = writeResult(o, r.buffer, r.plan);
  const p = r.plan;
  const changes = p.changes.map(c => `${c.label} ${c.old} -> ${c.new}`).join(', ');
  return {
    result: { ...p, ...written },
    exitCode: planExit(p),
    text:
      `${p.validation.status} [set-transform]: ${p.placement.name} (${p.placement.safety.safety}) ${changes}; file length unchanged` +
      writtenLines(written),
  };
}

async function replace({ E, level, pos, o }) {
  const keep = o.keep && o.keep !== 'auto' ? parseHexList(o.keep) : 'auto';
  const r = E.replacePlacement(level, Number(need(pos[2], 'source placement offset')), Number(need(o.over, 'over')), {
    ...transformFrom(o),
    keep,
  });
  const written = writeResult(o, r.buffer, r.plan);
  const p = r.plan;
  const { formatRules } = await import('../../editor/safety.mjs');
  const safety = p.safety?.length ? `\nsafety (worst: ${p.safety_worst}):\n${formatRules(p.safety)}` : '';
  const failures = p.validation.failures.map(f => `  ${f.stage}: ${f.reason}`).join('\n');
  const warnings = (p.validation.warnings ?? []).map(w => '  WARNING: ' + w).join('\n');
  return {
    result: { ...p, ...written },
    exitCode: planExit(p),
    text:
      `${p.validation.status} [replace, recipe ${p.recipe}]: ${p.placement_source.name} copied over ${p.placement_victim.name} (${p.placement_victim.layers.join(' | ')}); kept ${p.kept_fields.join(',')}; pointers internal ${p.pointers.internal} external ${p.pointers.external}; edits ${p.changes.length}; file length unchanged${safety}` +
      `\n${failures}${warnings}` +
      writtenLines(written),
  };
}

// levels and open work from the catalogue; serve and preview open their own session on a file; the others work
// on a level opened with its fixup map.
const CATALOG_SUBCOMMANDS = { levels, open };
const SESSION_SUBCOMMANDS = { serve, preview };
const LEVEL_SUBCOMMANDS = { list, show, set, replace };

export async function edit(pos, o) {
  const sub = pos[0];
  if (Object.hasOwn(CATALOG_SUBCOMMANDS, sub)) {
    return CATALOG_SUBCOMMANDS[sub]({ query: sub === 'open' ? need(pos[1], 'level name or disc path') : null, o });
  }
  const file = path.resolve(need(pos[1], 'level.bld.decoded file'));
  if (Object.hasOwn(SESSION_SUBCOMMANDS, sub)) return SESSION_SUBCOMMANDS[sub]({ file, pos, o });

  const E = await import('../../editor/placements.mjs');
  const level = E.openLevel(file, path.resolve(need(firstFixup(o.fixups), 'fixups')));
  const handler = pickSubcommand(
    LEVEL_SUBCOMMANDS,
    sub,
    name => `Unknown edit subcommand ${name} (levels|open|serve|preview|list|show|set|replace)`,
  );
  return handler({ E, level, pos, o });
}
