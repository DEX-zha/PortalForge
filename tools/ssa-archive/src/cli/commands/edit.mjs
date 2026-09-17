// `edit <subcommand> <level.bld.decoded>`: the placement editor.
//   serve, preview    open an editor session; the runtime fixup map is optional
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

const DEFAULT_PORT = 7378;
const hex = value => '0x' + value.toString(16);
const planExit = plan => (plan.validation.status === 'VALID' ? EXIT.OK : EXIT.FAILED);

function gameFromConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(localDir, 'dolphin-config.json'), 'utf8')).game;
  } catch {
    return null; // no configuration yet: the caller reports it with the way to fix it
  }
}

// What the editor server needs from the outside world: a patch builder and a game runner. They are the same
// ones the command line uses, so an editor run leaves the same evidence trail as a command-line one.
export function editorDeps(session, o) {
  return {
    build: ({ experimentId, replacements }) => {
      const game = o.game ?? gameFromConfig();
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
    run: args => runEditorGame({ ...args, archive: session.archive, figure: args.figure ?? o.figure ?? null }),
  };
}

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

// Starts the editor server and returns; the process stays alive for as long as the server listens.
async function serve({ file, o }) {
  const { startServer } = await import('../../editor/server.mjs');
  const session = await openEditorSession(file, o);
  const served = await startServer({
    session,
    port: o.port ? Number(o.port) : DEFAULT_PORT,
    deps: editorDeps(session, o),
  });
  if (o.open) await openInBrowser(served.url);
  const runtimeMap = session.has_runtime_map
    ? '; runtime fixup map loaded'
    : '; no runtime map, every pointer-derived value is structural';
  return {
    result: { session: session.id, url: served.url, placements: session.placements.length },
    text: [
      `session ${session.id}  ${session.file}`,
      `placements ${session.placements.length} in ${session.layers.length} layer(s); class type ${session.detection.placement_type}; models ${session.counts.direct} direct, ${session.counts.absent} absent${runtimeMap}`,
      `view ${served.url}`,
      'the editor writes nothing until you save; press Ctrl+C to stop',
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

// serve and preview open their own session; the others work on a level opened with its fixup map.
const SESSION_SUBCOMMANDS = { serve, preview };
const LEVEL_SUBCOMMANDS = { list, show, set, replace };

export async function edit(pos, o) {
  const sub = pos[0];
  const file = path.resolve(need(pos[1], 'level.bld.decoded file'));
  if (Object.hasOwn(SESSION_SUBCOMMANDS, sub)) return SESSION_SUBCOMMANDS[sub]({ file, pos, o });

  const E = await import('../../editor/placements.mjs');
  const level = E.openLevel(file, path.resolve(need(firstFixup(o.fixups), 'fixups')));
  const handler = pickSubcommand(
    LEVEL_SUBCOMMANDS,
    sub,
    name => `Unknown edit subcommand ${name} (list|show|set|replace)`,
  );
  return handler({ E, level, pos, o });
}
