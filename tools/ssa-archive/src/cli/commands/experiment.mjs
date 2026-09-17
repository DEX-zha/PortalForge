// `experiment <kind>`: runs driven through the Dolphin MCP. Every kind boots the dedicated research Dolphin,
// never the user's own installation, and writes its record under .local/dolphin-evidence/.
//
// The experiment modules are imported on demand: they pull in the MCP client, which the read-only commands
// have no reason to load.
import fs from 'node:fs';
import path from 'node:path';
import { CliError, EXIT, need } from '../errors.mjs';
import { pickSubcommand } from '../dispatch.mjs';

const DEFAULT_STATE_SLOT = 6; // the tutorial-start save state of the research profile

// Gate experiments share one outcome shape: PASS/FAIL plus the stage that failed and where the record went.
const gateOutcome = r => ({
  result: r,
  exitCode: r.exitCode ?? (r.status === 'PASS' ? EXIT.OK : EXIT.FAILED),
  text: `${r.status} (${r.failing_stage ?? 'ok'}): ${r.notes ?? ''}\n${r.output}`,
});

const doneOrFailed = status => (status === 'DONE' ? EXIT.OK : EXIT.FAILED);
const stateSlot = o => (o['save-slot'] ? Number(o['save-slot']) : DEFAULT_STATE_SLOT);
const objectLabel = (object, field) => `${object.type_name}@0x${object.offset.toString(16)}+0x${field.toString(16)}`;

async function explore(pos, o) {
  const { explore: run } = await import('../../experiments/explore-entry.mjs');
  const r = await run({ script: o.script, figure: o.figure, label: o.label ?? 'explore', target: o.game });
  return {
    result: r,
    exitCode: doneOrFailed(r.status),
    text: `${r.status} ${r.output} shots=${r.shots.length}${r.error ? ' error=' + r.error : ''}`,
  };
}

async function m1(pos, o) {
  const { runM1 } = await import('../../experiments/m1-roundtrip.mjs');
  return gateOutcome(
    await runM1({
      archive: need(o.archive, 'archive'),
      variant: o.variant ?? null,
      figure: o.figure ?? null,
      script: o.script,
      skipControl: !!o['skip-control'],
    }),
  );
}

// Launches the game in the project profile and hands it to the researcher. It scripts nothing and judges
// nothing: it exists so a save state can be made where the runner will look for it, which is
// .local/dolphin-user/StateSaves, not the user's own Dolphin installation.
async function play(pos, o) {
  const { GameSession, gameFromConfig } = await import('../../experiments/run-game.mjs');
  const target = o.game ?? gameFromConfig();
  const session = await new GameSession(console.log).connect();
  await session.launch(target, 'play');
  return {
    result: { launched: target },
    text: [
      'the game is running in the project profile; this command does not touch your own Dolphin',
      'play to where you want the state, then save it with Dolphin: Shift+F1 to Shift+F8 for slots 1 to 8',
      'states are written to .local/dolphin-user/StateSaves, which is where the experiment runner looks',
      'close Dolphin when you are done; nothing here is recorded as an experiment',
    ].join('\n'),
  };
}

async function m2(pos, o) {
  const { runM2 } = await import('../../experiments/m2-mutation.mjs');
  return gateOutcome(
    await runM2({
      archive: need(o.archive, 'archive'),
      entry: Number(need(o.entry, 'entry')),
      offset: Number(need(o.offset, 'offset')),
      type: need(o.type, 'type'),
      value: Number(need(o.value, 'value')),
      predict: need(o.predict, 'predict'),
      findingId: o.finding ?? null,
      repeat: o.repeat ? Number(o.repeat) : 2,
      figure: o.figure ?? null,
      script: o.script,
      watch: (o.watch ?? []).map(Number),
      skipControl: !!o['skip-control'],
    }),
  );
}

// `--poke <address|match:pattern>=<value>[=<wait frames>]`
function parsePoke(spec) {
  const [address, value, wait] = spec.split('=');
  return {
    address: /^match:/.test(address) ? address : Number(address),
    value: Number(value),
    wait: wait ? Number(wait) : undefined,
  };
}

async function liveProbe(pos, o) {
  const { liveProbe: run } = await import('../../experiments/live-probe.mjs');
  const r = await run({
    script: o.script,
    figure: o.figure ?? null,
    label: o.label ?? 'live-probe',
    patterns: o.pattern ?? [],
    pokes: (o.poke ?? []).map(parsePoke),
    saveSlot: o['save-slot'] ? Number(o['save-slot']) : null,
  });
  const scans = (r.scan ?? [])
    .map(s => `${s.pattern.slice(0, 32)}…: ${s.matches.length} match(es) ${s.matches.slice(0, 5).join(' ')}`)
    .join('\n');
  return {
    result: r,
    exitCode: doneOrFailed(r.status),
    text: `${r.status} ${r.output}\n` + scans + (r.error ? '\nerror: ' + r.error : ''),
  };
}

function formatPtrScan(r) {
  const lines = [`${r.status} ${r.output}`];
  for (const t of r.targets) {
    const owner = t.object ? t.object.type_name + '@0x' + t.object.offset.toString(16) : '';
    lines.push(
      `target ${t.target} ${owner} -> ${t.address}: ${t.referrers.length} referrer(s); resident words changed: ${t.resident_diff?.changed_words ?? '?'}`,
    );
    for (const w of t.resident_diff?.words ?? []) {
      lines.push(
        `    ${w.field} file=${w.file} live=${w.live}${w.live_minus_base ? ' (=base+' + w.live_minus_base + ')' : ''}`,
      );
    }
    for (const ref of t.referrers.slice(0, 40)) {
      const where = ref.in_section
        ? `in section: ${ref.object ? objectLabel(ref.object, ref.field) : 'file 0x' + ref.file_offset.toString(16)}`
        : `heap, context@${ref.context_at}: ${ref.context}`;
      lines.push(`    ref @${ref.at}${ref.aligned ? '' : ' (unaligned)'} ${where}`);
    }
  }
  for (const p of r.patterns) {
    lines.push(`pattern ${p.pattern.slice(0, 24)}…: ${p.hits.length} hit(s)`);
    for (const h of p.hits.slice(0, 20)) {
      const where = h.in_section
        ? `in section ${h.object ? objectLabel(h.object, h.field) : ''}`
        : 'heap ' + (h.context ?? '');
      lines.push(`    @${h.at} ${where}`);
    }
  }
  if (r.error) lines.push('error: ' + r.error);
  return lines.join('\n');
}

async function ptrScan(pos, o) {
  const { ptrScan: run } = await import('../../experiments/live-probe.mjs');
  const { buildGraph } = await import('../../igz/graph.mjs');
  const fileBuf = o.file ? fs.readFileSync(path.resolve(o.file)) : null;
  const targets = (o.address ?? '').split(',').filter(Boolean).map(Number);
  if (!targets.length) throw new CliError('Missing --address <file offset|0x8... address>[,...]', EXIT.USAGE);
  const r = await run({
    label: o.label ?? 'ptr-scan',
    stateSlot: stateSlot(o),
    figure: o.figure ?? null,
    base: o.base ? Number(o.base) : undefined,
    targets,
    patterns: o.pattern ?? [],
    fileBuf,
    graph: fileBuf ? buildGraph(fileBuf, { fields: false }) : null,
    mem2: !o['no-dimensions'],
    dumpSection: !!o.dimensions,
  });
  return { result: r, exitCode: doneOrFailed(r.status), text: formatPtrScan(r) };
}

async function ramDiff(pos, o) {
  const { ramDiff: run } = await import('../../experiments/live-probe.mjs');
  const r = await run({ label: o.label ?? 'ram-diff', stateSlot: stateSlot(o), figure: o.figure ?? null });
  const candidates = (r.candidates ?? [])
    .slice(0, 15)
    .map(
      c =>
        `${c.address} before=${JSON.stringify(c.before)} right=${JSON.stringify(c.delta_right)} back=${JSON.stringify(c.delta_back)}`,
    )
    .join('\n');
  return {
    result: r,
    exitCode: doneOrFailed(r.status),
    text:
      `${r.status} ${r.output}\ncandidates=${r.candidates?.length ?? 0}\n` +
      candidates +
      (r.error ? '\nerror: ' + r.error : ''),
  };
}

// `--probe <hex pattern>[:<header delta>[:<label>]]`
function parseProbe(spec) {
  const m = /^([0-9a-f]+)(?::(\d+))?(?::(.+))?$/i.exec(spec);
  if (!m) throw new CliError(`--probe expects <hex pattern>[:<header delta>[:<label>]]: ${spec}`);
  return { pattern: m[1].toLowerCase(), header_delta: Number(m[2] ?? 0), label: m[3] ?? `probe${m[1].slice(0, 8)}` };
}

// `--read <label>=<file offset>[:deref]`
function parseRead(spec) {
  const m = /^([^=]+)=(0x[0-9a-f]+|\d+)(:deref)?$/i.exec(spec);
  if (!m) throw new CliError(`--read expects <label>=<file offset>[:deref]: ${spec}`);
  return { label: m[1], file_offset: Number(m[2]), deref: !!m[3] };
}

async function m3(pos, o) {
  const { runM3 } = await import('../../experiments/m3-duplicate.mjs');
  return gateOutcome(
    await runM3({
      archive: need(o.archive, 'archive'),
      entry: Number(need(o.entry, 'entry')),
      planFile: path.resolve(need(o.plan, 'plan')),
      clonedFile: o.file ? path.resolve(o.file) : null,
      predict: need(o.predict, 'predict'),
      repeat: o.repeat ? Number(o.repeat) : 2,
      figure: o.figure ?? null,
      script: o.script,
      skipControl: !!o['skip-control'],
      probes: (o.probe ?? []).map(parseProbe),
      dumpSection: !!o['dump-section'],
      dumpAnchor: o['dump-anchor'] !== undefined ? Number(o['dump-anchor']) : null,
      reads: (o.read ?? []).map(parseRead),
    }),
  );
}

// Records the human judgement of one run; a gate only passes once every run has been judged.
async function m2Judge(pos, o) {
  const { judge } = await import('../../experiments/m2-mutation.mjs');
  const r = judge({
    id: need(o.id, 'id'),
    run: Number(need(o.run, 'run')),
    observed: need(o.observed, 'observed'),
    match: String(o.match ?? '').toLowerCase() === 'yes',
    replicates: o.replicates ?? [],
  });
  return { result: r, exitCode: r.status === 'FAIL' ? EXIT.FAILED : EXIT.OK, text: `${r.status}: ${r.notes}` };
}

const EXPERIMENT_KINDS = {
  explore,
  play,
  m1,
  m2,
  m3,
  'm2-judge': m2Judge,
  'live-probe': liveProbe,
  'ptr-scan': ptrScan,
  'ram-diff': ramDiff,
};

export async function experiment(pos, o) {
  const kind = need(pos[0], 'experiment kind (m1|m2|explore)');
  return pickSubcommand(EXPERIMENT_KINDS, kind, name => `Unknown experiment kind ${name}`)(pos, o);
}
