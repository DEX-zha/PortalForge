// Commands added by the user-story phases (rebuild, diff, patch, scan, bindiff, experiment,
// findings, gates). Kept separate so cli.mjs stays a thin dispatcher.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rebuildFromWorkspace } from './iga/writer.mjs';
import { diffArchives } from './iga/diff.mjs';
import { verifyBuffer } from './iga/verify.mjs';
import { readManifest } from './workspace/manifest.mjs';
import { buildPatchWorkspace } from './patch/riivolution.mjs';

class CliError extends Error { constructor(message, exitCode = 3) { super(message); this.exitCode = exitCode; } }
const need = (v, name) => { if (v === undefined || v === null || v === '') throw new CliError(`Missing --${name}`, 3); return v; };
const sha256 = b => createHash('sha256').update(b).digest('hex');
const parseReplace = (list, keyName) => Object.fromEntries((list ?? []).map(s => { const i = s.indexOf('='); if (i < 1) throw new CliError(`--replace expects <${keyName}>=<file>: ${s}`); return [s.slice(0, i), s.slice(i + 1)]; }));

export const commands = {
  async rebuild(pos, o) {
    const dir = path.resolve(need(pos[0], 'workspace dir'));
    const out = path.resolve(need(o.out, 'out'));
    const replacements = parseReplace(o.replace, 'index');
    for (const k of Object.keys(replacements)) if (!/^\d+$/.test(k)) throw new CliError(`--replace index must be numeric: ${k}`);
    let reencode = null, transformAll = null;
    if (Object.keys(replacements).length || o['reencode-all']) {
      const dec = await import('./iga/decode.mjs');
      reencode = dec.reencodeEntry; if (o['reencode-all']) transformAll = dec.reencodeStoredEntry;
    }
    const r = rebuildFromWorkspace(dir, { replacements: Object.fromEntries(Object.entries(replacements).map(([k, v]) => [Number(k), v])), reencode, transformAll,
      layout: o.layout ?? 'preserve', padUnits: o.pad ? Number(o.pad) : 0 });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.buffer);
    const manifest = readManifest(dir);
    const { parsed, ...validation } = verifyBuffer(r.buffer);
    let diff = null;
    if (fs.existsSync(manifest.source.file)) diff = diffArchives(fs.readFileSync(manifest.source.file), r.buffer);
    const result = { path: out, sha256: sha256(r.buffer), size: r.buffer.length, strategy: r.strategy, relayout: r.relayout, replaced_entries: r.replaced_entries, validation, diff: diff ? { ...diff, regions: diff.regions.slice(0, 200) } : { note: 'source archive not found; diff skipped', source: manifest.source.file } };
    const bad = validation.status !== 'VALID' || (diff && diff.unclassified_bytes > 0);
    return { result, exitCode: bad ? 1 : 0, text: `${out}: ${r.strategy}${r.relayout ? ' (relayout)' : ''}, ${validation.status}` + (diff ? `, diff regions=${diff.regions.length} size_delta=${diff.size_delta} unclassified=${diff.unclassified_bytes} ${JSON.stringify(diff.summary)}` : '') };
  },
  async diff(pos) {
    const a = path.resolve(need(pos[0], 'original')), b = path.resolve(need(pos[1], 'rebuilt'));
    const d = diffArchives(fs.readFileSync(a), fs.readFileSync(b));
    return { result: d, exitCode: d.unclassified_bytes > 0 ? 1 : 0, text: d.regions.length ? d.regions.slice(0, 50).map(r => `${r.class.padEnd(8)} @${r.offset} len=${r.length} ${r.label ?? ''}\n  old ${r.old_hex}${r.truncated ? '…' : ''}\n  new ${r.new_hex}${r.truncated ? '…' : ''}`).join('\n') + `\nsize_delta=${d.size_delta} unclassified=${d.unclassified_bytes} ${JSON.stringify(d.summary)}` : `identical (${d.size_delta} size delta)` };
  },
  async patch(pos, o) {
    const id = need(o.experiment, 'experiment');
    const game = need(o.game, 'game');
    const repl = parseReplace(o.replace, 'disc path');
    if (!Object.keys(repl).length) throw new CliError('At least one --replace <disc path>=<file> is required');
    // An original copy under .local/samples, when present, lets identical files be skipped (FR-009).
    const samples = path.resolve(process.cwd(), '../../.local/samples/DATA/files');
    const replacements = Object.entries(repl).map(([disc_path, file]) => { const original = path.join(samples, ...disc_path.split('/')); return { disc_path, file: path.resolve(file), original: fs.existsSync(original) ? original : undefined }; });
    const ws = buildPatchWorkspace({ experimentId: id, game, replacements, outDir: need(o.out, 'out'), force: !!o.force });
    return { result: ws, text: `${ws.dir}: ${ws.replacements.length} replacement(s), xml ${ws.xml}, descriptor ${ws.descriptor}` };
  },
  async experiment(pos, o) {
    const kind = need(pos[0], 'experiment kind (m1|m2|explore)');
    if (kind === 'explore') {
      const { explore } = await import('./experiments/explore-entry.mjs');
      const r = await explore({ script: o.script, figure: o.figure, label: o.label ?? 'explore', target: o.game });
      return { result: r, exitCode: r.status === 'DONE' ? 0 : 1, text: `${r.status} ${r.output} shots=${r.shots.length}${r.error ? ' error=' + r.error : ''}` };
    }
    if (kind === 'm1') {
      const { runM1 } = await import('./experiments/m1-roundtrip.mjs');
      const r = await runM1({ archive: need(o.archive, 'archive'), variant: o.variant ?? null, figure: o.figure ?? null, script: o.script, skipControl: !!o['skip-control'] });
      return { result: r, exitCode: r.exitCode ?? (r.status === 'PASS' ? 0 : 1), text: `${r.status} (${r.failing_stage ?? 'ok'}): ${r.notes ?? ''}\n${r.output}` };
    }
    if (kind === 'm2') {
      const { runM2 } = await import('./experiments/m2-mutation.mjs');
      const watch = (o.watch ?? []).map(w => Number(w));
      const r = await runM2({ archive: need(o.archive, 'archive'), entry: Number(need(o.entry, 'entry')), offset: Number(need(o.offset, 'offset')), type: need(o.type, 'type'), value: Number(need(o.value, 'value')),
        predict: need(o.predict, 'predict'), findingId: o.finding ?? null, repeat: o.repeat ? Number(o.repeat) : 2, figure: o.figure ?? null, script: o.script, watch, skipControl: !!o['skip-control'] });
      return { result: r, exitCode: r.exitCode ?? (r.status === 'PASS' ? 0 : 1), text: `${r.status} (${r.failing_stage ?? 'ok'}): ${r.notes ?? ''}\n${r.output}` };
    }
    if (kind === 'live-probe') {
      const { liveProbe } = await import('./experiments/live-probe.mjs');
      const pokes = (o.poke ?? []).map(s => { const [address, value, wait] = s.split('='); return { address: /^match:/.test(address) ? address : Number(address), value: Number(value), wait: wait ? Number(wait) : undefined }; });
      const r = await liveProbe({ script: o.script, figure: o.figure ?? null, label: o.label ?? 'live-probe', patterns: o.pattern ?? [], pokes, saveSlot: o['save-slot'] ? Number(o['save-slot']) : null });
      return { result: r, exitCode: r.status === 'DONE' ? 0 : 1, text: `${r.status} ${r.output}\n` + (r.scan ?? []).map(s => `${s.pattern.slice(0, 32)}…: ${s.matches.length} match(es) ${s.matches.slice(0, 5).join(' ')}`).join('\n') + (r.error ? '\nerror: ' + r.error : '') };
    }
    if (kind === 'ptr-scan') {
      const { ptrScan } = await import('./experiments/live-probe.mjs');
      const { buildGraph } = await import('./igz/graph.mjs');
      const fileBuf = o.file ? fs.readFileSync(path.resolve(o.file)) : null;
      const graph = fileBuf ? buildGraph(fileBuf, { fields: false }) : null;
      const targets = (o.address ?? '').split(',').filter(Boolean).map(Number);
      if (!targets.length) throw new CliError('Missing --address <file offset|0x8... address>[,...]', 3);
      const r = await ptrScan({ label: o.label ?? 'ptr-scan', stateSlot: o['save-slot'] ? Number(o['save-slot']) : 6, figure: o.figure ?? null, base: o.base ? Number(o.base) : undefined, targets, patterns: o.pattern ?? [], fileBuf, graph, mem2: !o['no-dimensions'], dumpSection: !!o.dimensions });
      const lines = [`${r.status} ${r.output}`];
      for (const t of r.targets) {
        lines.push(`target ${t.target} ${t.object ? t.object.type_name + '@0x' + t.object.offset.toString(16) : ''} -> ${t.address}: ${t.referrers.length} referrer(s); resident words changed: ${t.resident_diff?.changed_words ?? '?'}`);
        for (const w of t.resident_diff?.words ?? []) lines.push(`    ${w.field} file=${w.file} live=${w.live}${w.live_minus_base ? ' (=base+' + w.live_minus_base + ')' : ''}`);
        for (const ref of t.referrers.slice(0, 40)) lines.push(`    ref @${ref.at}${ref.aligned ? '' : ' (unaligned)'} ${ref.in_section ? `in section: ${ref.object ? ref.object.type_name + '@0x' + ref.object.offset.toString(16) + '+0x' + ref.field.toString(16) : 'file 0x' + ref.file_offset.toString(16)}` : `heap, context@${ref.context_at}: ${ref.context}`}`);
      }
      for (const p of r.patterns) { lines.push(`pattern ${p.pattern.slice(0, 24)}…: ${p.hits.length} hit(s)`); for (const h of p.hits.slice(0, 20)) lines.push(`    @${h.at} ${h.in_section ? `in section ${h.object ? h.object.type_name + '@0x' + h.object.offset.toString(16) + '+0x' + h.field.toString(16) : ''}` : 'heap ' + (h.context ?? '')}`); }
      if (r.error) lines.push('error: ' + r.error);
      return { result: r, exitCode: r.status === 'DONE' ? 0 : 1, text: lines.join('\n') };
    }
    if (kind === 'ram-diff') {
      const { ramDiff } = await import('./experiments/live-probe.mjs');
      const r = await ramDiff({ label: o.label ?? 'ram-diff', stateSlot: o['save-slot'] ? Number(o['save-slot']) : 6, figure: o.figure ?? null });
      return { result: r, exitCode: r.status === 'DONE' ? 0 : 1, text: `${r.status} ${r.output}\ncandidates=${r.candidates?.length ?? 0}\n` + (r.candidates ?? []).slice(0, 15).map(c => `${c.address} before=${JSON.stringify(c.before)} right=${JSON.stringify(c.delta_right)} back=${JSON.stringify(c.delta_back)}`).join('\n') + (r.error ? '\nerror: ' + r.error : '') };
    }
    if (kind === 'm3') {
      const { runM3 } = await import('./experiments/m3-duplicate.mjs');
      const probes = (o.probe ?? []).map(s => { const m = /^([0-9a-f]+)(?::(\d+))?(?::(.+))?$/i.exec(s); if (!m) throw new CliError(`--probe expects <hex pattern>[:<header delta>[:<label>]]: ${s}`); return { pattern: m[1].toLowerCase(), header_delta: Number(m[2] ?? 0), label: m[3] ?? `probe${m[1].slice(0, 8)}` }; });
      const r = await runM3({ archive: need(o.archive, 'archive'), entry: Number(need(o.entry, 'entry')), planFile: path.resolve(need(o.plan, 'plan')), clonedFile: o.file ? path.resolve(o.file) : null, predict: need(o.predict, 'predict'), repeat: o.repeat ? Number(o.repeat) : 2, figure: o.figure ?? null, script: o.script, skipControl: !!o['skip-control'], probes, dumpSection: !!o['dump-section'], dumpAnchor: o['dump-anchor'] !== undefined ? Number(o['dump-anchor']) : null, reads: (o.read ?? []).map(sp => { const m = /^([^=]+)=(0x[0-9a-f]+|\d+)(:deref)?$/i.exec(sp); if (!m) throw new CliError(`--read expects <label>=<file offset>[:deref]: ${sp}`); return { label: m[1], file_offset: Number(m[2]), deref: !!m[3] }; }) });
      return { result: r, exitCode: r.exitCode ?? (r.status === 'PASS' ? 0 : 1), text: `${r.status} (${r.failing_stage ?? 'ok'}): ${r.notes ?? ''}\n${r.output}` };
    }
    if (kind === 'm2-judge') {
      const { judge } = await import('./experiments/m2-mutation.mjs');
      const r = judge({ id: need(o.id, 'id'), run: Number(need(o.run, 'run')), observed: need(o.observed, 'observed'), match: String(o.match ?? '').toLowerCase() === 'yes', replicates: o.replicates ?? [] });
      return { result: r, exitCode: r.status === 'FAIL' ? 1 : 0, text: `${r.status}: ${r.notes}` };
    }
    throw new CliError(`Unknown experiment kind ${kind}`, 3);
  },
  async scan(pos, o) {
    const S = await import('./research/scan.mjs');
    const kind = need(pos[0], 'scan kind (floats|strings|identifiers)');
    const file = path.resolve(need(pos[1], 'file'));
    const buf = fs.readFileSync(file);
    const limit = o.limit ? Number(o.limit) : undefined;
    if (kind === 'floats') {
      // --range "min,max" or --range="-50000 50000" (a leading dash needs the = form)
      const [min, max] = String(o.range ?? '').split(/[\s,;]+/).filter(Boolean).map(Number);
      const r = S.scanFloats(buf, { min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined, vector: o.vector ? Number(o.vector) : 1, endian: o.endian ?? 'both', limit });
      return { result: { file, ...r }, text: `${r.total} candidate(s), showing ${r.rows.length}\n` + r.rows.map(x => `0x${x.offset.toString(16).padStart(8, '0')} ${x.endian} score=${x.score} [${x.values.join(', ')}]`).join('\n') };
    }
    if (kind === 'strings') {
      const r = S.scanStrings(buf, { min: o.min ? Number(o.min) : 6, limit, pattern: o.filter ?? null });
      return { result: { file, ...r }, text: r.rows.map(x => `0x${x.offset.toString(16).padStart(8, '0')} ${x.text}`).join('\n') };
    }
    if (kind === 'identifiers') {
      const rows = S.identifierHistogram(buf, { min: o.min ? Number(o.min) : 4 }).slice(0, limit ?? 200);
      return { result: { file, rows }, text: rows.map(x => `${String(x.count).padStart(6)} ${x.token}`).join('\n') };
    }
    throw new CliError(`Unknown scan kind ${kind}`, 3);
  },
  async bindiff(pos, o) {
    const { bindiff } = await import('./research/bindiff.mjs');
    const a = fs.readFileSync(path.resolve(need(pos[0], 'a'))), b = fs.readFileSync(path.resolve(need(pos[1], 'b')));
    const d = bindiff(a, b, { context: o.context ? Number(o.context) : 16, limit: o.limit ? Number(o.limit) : 1000 });
    return { result: d, text: `${d.runs} run(s), ${d.differing_bytes} differing byte(s), size_delta=${d.size_delta}\n` + d.rows.slice(0, 200).map(r => `0x${r.offset.toString(16).padStart(8, '0')} len=${r.length} old=${r.old_hex} new=${r.new_hex}${r.old_f32be !== undefined ? ` f32be ${r.old_f32be} -> ${r.new_f32be}` : ''}`).join('\n') };
  },
  async igz(pos, o) {
    const G = await import('./igz/graph.mjs');
    const sub = need(pos[0], 'igz subcommand (sections|types|objects|show)');
    const file = path.resolve(need(pos[1], 'decoded IGZ file'));
    const buf = fs.readFileSync(file);
    const g = G.buildGraph(buf, { file, fields: sub === 'show' || sub === 'objects' && !!o.json, fieldLimit: o.limit ? Number(o.limit) : 64 });
    if (sub === 'sections') return { result: { header: g.header, second_header: g.second_header, sections: g.sections, issues: g.issues }, text: g.sections.map(s => `#${s.index} @0x${s.offset.toString(16)} size=0x${s.size.toString(16)} align=${s.align} tag=${s.tag}`).join('\n') + `\nsecond header words: ${g.second_header?.words.map(w => '0x' + w.toString(16)).join(' ')}` + (g.issues.length ? `\nissues: ${JSON.stringify(g.issues)}` : '') };
    if (sub === 'types') { const hist = new Map(G.histogram(g).map(h => [h.type_name, h])); return { result: { types: g.types, table: g.type_table, histogram: G.histogram(g) }, text: g.types.map(t => `${String(t.index).padStart(3)} ${(t.name || '(empty)').padEnd(34)} size_hint=${t.size_hint ?? '-'} ${o.histogram ? 'objects=' + (hist.get(t.name || 'type#' + t.index)?.count ?? 0) + ' median=' + (hist.get(t.name || 'type#' + t.index)?.median_size ?? '-') : ''}`).join('\n') }; }
    if (sub === 'objects') {
      const rows = o.type ? g.objects.filter(x => x.type_name === o.type) : g.objects;
      if (o.out) fs.writeFileSync(path.resolve(o.out), JSON.stringify(g, null, 1));
      const a = g.accounting;
      return { result: { object_section: g.object_section, string_section: g.string_section, count: rows.length, accounting: a, unparsed: g.unparsed, histogram: G.histogram(g).slice(0, 40) },
        text: `objects=${a.objects} unparsed=${a.unparsed} padding=${a.padding} total=${a.total} (${a.objects + a.unparsed + a.padding === a.total ? 'accounted' : 'MISMATCH'}); ${g.objects.length} objects, ${g.unparsed.length} unparsed region(s)\n` + G.histogram(g).slice(0, 25).map(h => `${String(h.count).padStart(6)} ${h.type_name.padEnd(32)} median=0x${h.median_size.toString(16)}`).join('\n') + (o.out ? `\ngraph -> ${path.resolve(o.out)}` : '') };
    }
    if (sub === 'show') {
      const off = Number(need(pos[2], 'object offset'));
      const ob = g.objects.find(x => x.offset === off) ?? g.objects.filter(x => x.offset <= off).pop();
      if (!ob) throw new CliError('No object at or before that offset', 1);
      return { result: ob, text: `${ob.type_name || 'type#' + ob.type} @0x${ob.offset.toString(16)} size=0x${ob.size.toString(16)} id=0x${ob.id.toString(16)}\n` + ob.fields.filter(f => f.kind !== 'unknown').map(f => `  +0x${(f.offset - ob.offset).toString(16).padStart(3, '0')} ${f.kind.padEnd(11)} ${f.kind === 'string_ref' ? '"' + f.target + '"' : f.kind === 'object_ref' ? `-> ${f.target.type_name}@0x${f.target.offset.toString(16)}` : f.kind === 'flagged_ref' ? '0x' + f.value.toString(16) : f.value}`).join('\n') };
    }
    if (sub === 'near') {
      const E = await import('./igz/entities.mjs');
      const [x, y, z] = [pos[2], pos[3], pos[4]].map(Number);
      if (![x, y, z].every(Number.isFinite)) throw new CliError('igz near needs x y z', 3);
      const rows = E.near(buf, g, [x, y, z], { tol: o.tol ? Number(o.tol) : 3, includeDimensions: !o['no-dimensions'] && !!o.dimensions });
      return { result: { target: [x, y, z], rows: rows.slice(0, o.limit ? Number(o.limit) : 40) }, text: rows.slice(0, o.limit ? Number(o.limit) : 40).map(r => `d=${r.distance.toFixed(2).padStart(6)} 0x${r.offset.toString(16)} ${r.object.type_name || 'type#'}@0x${r.object.offset.toString(16)}+0x${r.field.toString(16)} [${r.values.join(', ')}] ${r.flags.join(',')}`).join('\n') || '(no triple within tolerance)' };
    }
    if (sub === 'match') {
      const M = await import('./igz/match.mjs');
      const base = o.base ? Number(o.base) : M.DEFAULT_SECTION_BASE;
      if (o.address) { const r = M.matchAddress(g, Number(o.address), { base }); return { result: r, text: r.object ? `${r.address} -> file 0x${r.file_offset.toString(16)} = ${r.object.type_name}@0x${r.object.offset.toString(16)}+0x${r.field.toString(16)}` : `${r.address} -> file 0x${r.file_offset.toString(16)}: no owning object` }; }
      if (o.pattern?.length) { const r = M.matchPattern(buf, g, o.pattern[0]); return { result: r, text: r.hits.map(h => `0x${h.file_offset.toString(16)} ${h.object ? h.object.type_name + '@0x' + h.object.offset.toString(16) + '+0x' + h.field.toString(16) : 'no object'}`).join('\n') || '(no hit)' }; }
      throw new CliError('igz match needs --address <ram address> or --pattern <hex>', 3);
    }
    if (sub === 'clone') {
      const C = await import('./igz/clone.mjs');
      const edits = (o.set ?? []).map(s => { const m = /^(?:\+?0x)?([0-9a-f]+)(?::(f32be|u32be|u16be|u8))?=(.+)$/i.exec(s); if (!m) throw new CliError(`--set expects <hex offset>[:type]=<value>: ${s}`); return { offset: parseInt(m[1], 16), type: m[2] ?? 'f32be', value: Number(m[3]) }; });
      const r = C.planClone(buf, { objectOffset: Number(need(pos[2], 'object offset')), findingId: need(o.finding, 'finding'), edits, appendToList: !!o['append-to-list'] });
      const written = C.writePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
      return { result: { ...r.plan, ...written, graph_after: r.graph_after }, exitCode: r.plan.validation.status === 'VALID' ? 0 : 1, text: `plan ${r.plan.validation.status}: clone of ${r.plan.source.type_name}@0x${r.plan.source.object_offset.toString(16)} at 0x${r.plan.insert_at.toString(16)} (+${r.plan.inserted_bytes} B, id 0x${r.plan.new_id.toString(16)}), ${r.plan.changes.length} edit(s), ${r.plan.updates.length} table update(s)` + (r.plan.validation.failures.length ? '\n' + r.plan.validation.failures.map(f => `  ${f.stage}: ${f.reason}`).join('\n') : '') + `\n-> ${written.outFile}${written.planFile ? ' ; plan ' + written.planFile : ''}` };
    }
    if (sub === 'placements') {
      const P = await import('./igz/placements.mjs');
      const fixups = JSON.parse(fs.readFileSync(path.resolve(need(o.fixups, 'fixups')), 'utf8'));
      const near = o.near ? o.near.split(',').map(Number) : null;
      if (near && near.length !== 3) throw new CliError('--near expects x,z,radius');
      const res = P.listPlacements(buf, g, fixups, { layer: o.layer ?? null, near, all: !!o.all });
      return { result: res, text: P.formatPlacements(res, { limit: o.limit ? Number(o.limit) : 60 }) };
    }
    if (sub === 'script' || sub === 'scripts') {
      const S = await import('./igz/script.mjs');
      const fixups = o.fixups ? JSON.parse(fs.readFileSync(path.resolve(o.fixups), 'utf8')) : null;
      if (sub === 'scripts') {
        const a = S.auditScripts(buf, g, fixups);
        const bad = a.rows.filter(r => r.error || r.issues || !r.headers || r.uncovered);
        return { result: a, text: `type-92 scripts: ${a.scripts}; model OK (count==capacity, size word, array at +0x34, every pointer lands on a record header, blob fully tiled): ${a.model_ok}\n` + (bad.length ? 'deviations:\n' + bad.slice(0, 15).map(r => `  0x${r.record.toString(16)} ${r.name ?? ''} ${r.error ?? `issues ${r.issues} headers ${r.headers} uncovered ${r.uncovered}`}`).join('\n') : 'no deviations') + '\n' + a.rows.filter(r => !r.error).slice(0, 12).map(r => `  0x${r.record.toString(16)} ${String(r.count).padStart(4)} instr  ${r.name}`).join('\n') };
      }
      const d = S.decodeScript(buf, g, fixups, Number(need(pos[2], 'script record offset')));
      const lines = [`script 0x${d.record.toString(16)} "${d.name}" blob 0x${d.blob_bytes.toString(16)} owner 0x${(d.owner_size ?? 0).toString(16)} instructions ${d.count}; issues: ${d.issues.join('; ') || 'none'}; coverage ${d.coverage.covered_bytes}/${d.blob_bytes} bytes in ${d.coverage.records_in_blob} records`];
      for (const e of d.instructions) {
        if (o.limit && e.index >= Number(o.limit)) { lines.push(`  … ${d.count - e.index} more`); break; }
        if (!e.header) { lines.push(`  [${String(e.index).padStart(3)}] 0x${e.target.toString(16)} (no record header)${e.in_blob ? '' : ' OUTSIDE BLOB'}`); continue; }
        const a = e.args; const parts = [];
        if (a.strings.length) parts.push(a.strings.map(s => `"${s.text}"`).join(' '));
        if (a.triples.length) parts.push(a.triples.map(tr => `(${tr.xyz.join(', ')})@+0x${tr.at.toString(16)}`).join(' '));
        else if (a.floats.length) parts.push(a.floats.slice(0, 4).map(f => f.value).join(' '));
        if (a.refs.length) parts.push(a.refs.map(r => `->${r.kind === 'instruction' ? '#' : ''}${r.opcode ? '"' + r.opcode + '"' : '0x' + r.target.toString(16)}`).slice(0, 4).join(' '));
        lines.push(`  [${String(e.index).padStart(3)}] 0x${e.target.toString(16)} ${String(e.type).padStart(3)} ${(e.opcode ?? '?').padEnd(42)} ${parts.join(' | ')}${e.in_blob ? '' : '  OUTSIDE BLOB'}`);
      }
      return { result: d, text: lines.join('\n') };
    }
    if (sub === 'clone-entity') {
      const R = await import('./igz/relocate.mjs');
      const edits = (o.set ?? []).map(s => { const m = /^(?:\+?0x)?([0-9a-f]+)(?::(f32be|u32be|u16be|u8))?=(.+)$/i.exec(s); if (!m) throw new CliError(`--set expects <hex offset>[:type]=<value>: ${s}`); return { offset: parseInt(m[1], 16), type: m[2] ?? 'f32be', value: Number(m[3]) }; });
      const fixups = R.loadFixups(path.resolve(need(o.fixups, 'fixups')));
      const common = { start: Number(need(pos[2], 'owner offset')), end: Number(need(o.end, 'end')), findingId: need(o.finding, 'finding'), edits, bumpRefcounts: !o['no-refcounts'], extraFindings: o['also-finding'] ?? [] };
      let r, p;
      if (o['replace-record'] !== undefined) {
        const keep = (o.keep ?? '').split(',').filter(Boolean).map(x => parseInt(x, 16));
        r = R.planReplaceRecord(buf, fixups, { source: Number(pos[2]), victim: Number(o['replace-record']), keep, findingId: common.findingId, edits, extraFindings: common.extraFindings });
        p = r.plan;
        const written = R.writeReachablePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
        return { result: { ...p, ...written, graph_after: r.graph_after }, exitCode: p.validation.status === 'VALID' ? 0 : 1, text: p.validation.status + ' [replace-record]: ' + p.source.type_name + '@0x' + p.source.object_offset.toString(16) + ' copied over ' + p.victim_type_name + '@0x' + p.victim.toString(16) + '; kept ' + p.kept_fields.join(',') + '; pointers internal ' + p.pointers.internal + ' external ' + p.pointers.external + '; edits ' + p.changes.length + '; file length unchanged\n' + p.validation.failures.map(f => '  ' + f.stage + ': ' + f.reason).join('\n') + (written.planFile ? '\nplan ' + written.planFile : '') + '\nfile ' + written.outFile };
      }
      if (o['replace-node'] !== undefined) {
        r = R.planReplaceNode(buf, fixups, { source: Number(pos[2]), victim: o['replace-node'] === 'next' ? null : Number(o['replace-node']), linkField: o['link-field'] !== undefined ? Number(o['link-field']) : 0x64, findingId: common.findingId, edits, extraFindings: common.extraFindings });
        p = r.plan;
        const written = R.writeReachablePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
        return { result: { ...p, ...written, graph_after: r.graph_after }, exitCode: p.validation.status === 'VALID' ? 0 : 1, text: p.validation.status + ' [replace-node]: ' + p.source.type_name + '@0x' + p.source.object_offset.toString(16) + ' copied over ' + p.victim_type_name + '@0x' + p.victim.toString(16) + '; copy.next -> 0x' + p.victim_old_next.toString(16) + '; file length unchanged, nothing moved\n' + p.validation.failures.map(f => '  ' + f.stage + ': ' + f.reason).join('\n') + (written.planFile ? '\nplan ' + written.planFile : '') + '\nfile ' + written.outFile };
      }
      if (o['link-after'] !== undefined) {
        r = R.planLinkClone(buf, fixups, { source: Number(o['link-after']), linkField: o['link-field'] !== undefined ? Number(o['link-field']) : 0x64, findingId: common.findingId, insertBefore: o['insert-before'] !== undefined ? Number(o['insert-before']) : null, edits, extraFindings: common.extraFindings });
        p = r.plan;
        const written = R.writeReachablePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
        return { result: { ...p, ...written, graph_after: r.graph_after }, exitCode: p.validation.status === 'VALID' ? 0 : 1, text: p.validation.status + ' [link-after]: ' + p.source.type_name + '@0x' + p.source.object_offset.toString(16) + ' (' + p.source.block_bytes + ' B) -> clone @0x' + p.insert_at.toString(16) + '; link +0x' + p.link_field.toString(16) + ': source -> clone, clone -> 0x' + p.old_next.toString(16) + '; moved records ' + p.moved_records + '; +' + p.inserted_bytes + ' B; no table change\n' + p.validation.failures.map(f => '  ' + f.stage + ': ' + f.reason).join('\n') + (written.planFile ? '\nplan ' + written.planFile : '') + '\nfile ' + written.outFile };
      }
      if (o.overwrite !== undefined) {
        r = R.planOverwriteClone(buf, fixups, { ...common, target: Number(o.overwrite) });
        p = r.plan;
        const written = R.writeReachablePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
        return { result: { ...p, ...written, graph_after: r.graph_after }, exitCode: p.validation.status === 'VALID' ? 0 : 1, text: `${p.validation.status} [in-place overwrite]: ${p.source.type_name}@0x${p.source.object_offset.toString(16)} block ${p.source.block_bytes} B -> onto ${p.target.type_name}@0x${p.target.offset.toString(16)} (blob 0x${p.target.blob_bytes.toString(16)}, zeroed 0x${p.target.leftover_zeroed.toString(16)}); file length unchanged, no table growth; pointers internal ${p.pointers.internal} external ${p.pointers.external}, refcounts ${p.refcounts.length}, edits ${p.changes.length}\n${p.validation.failures.map(f => `  ${f.stage}: ${f.reason}`).join('\n')}${written.planFile ? '\nplan ' + written.planFile : ''}\nfile ${written.outFile}` };
      }
      r = R.planReachableClone(buf, fixups, { ...common, register: !o['no-register'], replaceEntry: o['replace-entry'] !== undefined ? Number(o['replace-entry']) : null, insertBefore: o['insert-before'] !== undefined ? Number(o['insert-before']) : null, freshIds: !!o['fresh-ids'] });
      const written = R.writeReachablePlan(r, { outFile: path.resolve(need(o.out, 'out')), planFile: o.plan ? path.resolve(o.plan) : null });
      p = r.plan;
      return { result: { ...p, ...written, graph_after: r.graph_after }, exitCode: p.validation.status === 'VALID' ? 0 : 1, text: `${p.validation.status}: ${p.source.type_name}@0x${p.source.object_offset.toString(16)} block ${p.source.block_bytes} B -> clone @0x${p.insert_at.toString(16)} (+${p.inserted_bytes} B${p.insert_before !== null ? `, inserted before 0x${p.insert_before.toString(16)}, end pad ${p.end_pad}` : ''}), refcounts bumped ${p.refcounts.length}, table entry ${p.table_entry ? `#${p.table_entry.index}` : 'none'}, pointers internal ${p.pointers.internal} external ${p.pointers.external}, rebased after shift ${p.pointers.rebased_after_shift}, new ids ${p.new_ids.length}, edits ${p.changes.length}\n${p.validation.failures.map(f => `  ${f.stage}: ${f.reason}`).join('\n')}${written.planFile ? '\nplan ' + written.planFile : ''}\nfile ${written.outFile}` };
    }
    if (sub === 'pick-overwrite-target') {
      const { buildGraph } = await import('./igz/graph.mjs');
      const fixups = JSON.parse(fs.readFileSync(path.resolve(need(o.fixups, 'fixups')), 'utf8'));
      const gg = buildGraph(buf, { fields: false }); const s1 = gg.sections[gg.object_section];
      const type = Number(need(o.type, 'type')); const block = Number(need(o.end, 'end')) - Number(need(pos[2], 'owner offset'));
      const tableEnd = s1.offset + (buf.readUInt32BE(s1.offset + 0x14) & 0x7fffffff);
      const entries = new Set(); for (let q = s1.offset + 0x20; q < tableEnd; q += 4) entries.add(s1.offset + buf.readUInt32BE(q));
      const sorted = [...entries].sort((a, b) => a - b);
      const words = fixups.pointer_words.concat(fixups.head_pointer_words ?? [], fixups.cross_pointer_words ?? []);
      const cands = [];
      for (const T of sorted) { const ob = gg.objects.find(x => x.offset === T); if (!ob || ob.type !== type) continue; let be = s1.offset + s1.size; for (const e of entries) if (e > T && e < be) be = e; if (be - T < block) continue; let ext = 0; for (const w of words) { if (w >= T && w < be) continue; const t = s1.offset + (buf.readUInt32BE(w) & 0xffffff); if (t > T && t < be) ext++; } cands.push({ offset: T, blob: be - T, leftover: be - T - block, ext }); }
      cands.sort((a, b) => a.ext - b.ext || a.leftover - b.leftover);
      return { result: cands.slice(0, 20), text: `${cands.length} type-${type} table entries with blob >= 0x${block.toString(16)}:\n` + cands.slice(0, 12).map(c => `  0x${c.offset.toString(16)} blob 0x${c.blob.toString(16)} leftover 0x${c.leftover.toString(16)} externalRefsIntoBlob ${c.ext}`).join('\n') };
    }
    if (sub === 'relocation-probe') {
      const R = await import('./igz/relocation.mjs');
      const fixups = JSON.parse(fs.readFileSync(path.resolve(need(o.fixups, 'fixups')), 'utf8'));
      const truth = R.relocationTruth(buf, fixups);
      const results = [];
      const onlyTemplate = o.probe && o.probe.includes('template');
      if (!onlyTemplate) for (const s of g.sections) {
        if (o.section !== undefined && s.index !== Number(o.section)) continue;
        if (s.index === g.object_section) continue;
        const sb = buf.subarray(s.offset, s.offset + s.size);
        results.push(...R.probeFlat(truth, `sec${s.index}`, sb));
        results.push(...R.probeBitmap(truth, `sec${s.index}`, sb));
      }
      results.sort((a, b) => (b.recall + b.precision) - (a.recall + a.precision));
      const tt = R.typeTemplates(buf, fixups);
      const lines = [`ground truth: ${truth.wordIdx.length} relocated words over ${truth.nWords} section-1 words`];
      lines.push('top flat/bitmap decoders (by recall+precision):');
      for (const r of results.slice(0, 14)) lines.push(`  ${r.section.padEnd(6)} ${r.decoder.padEnd(22)} produced ${String(r.produced).padStart(8)}  precision ${(100 * r.precision).toFixed(1)}%  recall ${(100 * r.recall).toFixed(1)}%`);
      lines.push(`per-type templates explain ${(100 * tt.explained_pct).toFixed(1)}% of pointer fields (${tt.explained}/${tt.total}); ${tt.templates.filter(t => t.template.length).length} types have a non-empty pointer template`);
      const sm = R.structuralModel(buf, fixups);
      lines.push(`structural model: fixed-field ${(100 * sm.fixed / sm.total).toFixed(1)}% + array-run ${(100 * sm.array / sm.total).toFixed(1)}% = ${(100 * sm.explained_pct).toFixed(1)}% explained; ${sm.unexplained} unexplained`);
      if (sm.unexplained_samples.length) lines.push('  unexplained e.g. ' + sm.unexplained_samples.slice(0, 6).map(u => `${u.type}${u.field}`).join(' '));
      if (o.out) fs.writeFileSync(path.resolve(o.out), JSON.stringify({ truth_words: truth.wordIdx.length, section_words: truth.nWords, results, templates: tt.templates, explained_pct: tt.explained_pct }, null, 2));
      return { result: { results: results.slice(0, 30), templates_explained_pct: tt.explained_pct }, text: lines.join('\n') };
    }
    if (sub === 'fixups') {
      const { fixupMap, crossSectionPointers } = await import('./igz/fixups.mjs');
      const live = fs.readFileSync(path.resolve(need(pos[2], 'resident section dump')));
      const m = fixupMap(buf, live, g, { base: o.base ? Number(o.base) : undefined });
      // --regions <mem1.bin>,<mem2.bin>: raw dumps of MEM1 (0x80000000) and MEM2 (0x90000000) from
      // `experiment ptr-scan --dimensions`, used to find pointers into the object section from other sections.
      let cross = null;
      if (o.regions) {
        const files = o.regions.split(',').map(f => path.resolve(f.trim()));
        const regions = files.map(f => ({ start: /90000000/.test(path.basename(f)) ? 0x90000000 : 0x80000000, buf: fs.readFileSync(f) }));
        const overrides = Object.fromEntries((o['section-address'] ?? []).map(s => { const [i, a] = s.split('='); return [Number(i), Number(a)]; }));
        cross = crossSectionPointers(buf, g, regions, { overrides });
        m.cross_pointer_words = cross.cross_pointer_words; m.cross_sections = cross.sections; m.cross_per_section = cross.per_section;
      }
      const { pointer_words, id_words, head_pointer_words, cross_pointer_words = [], objects, ...summary } = m;
      if (o.out) fs.writeFileSync(path.resolve(o.out), JSON.stringify({ ...summary, head_pointer_words, pointer_words, id_words, cross_pointer_words }));
      const crossText = cross ? `\nsections located: ${cross.sections.map(s => `#${s.index}@${s.live === null ? '?' : '0x' + s.live.toString(16)}`).join(' ')}\ncross-section words: ${cross.per_section.map(p => p.error ? `#${p.section} ${p.error}` : `#${p.section}: ${p.changed} changed, by target ${JSON.stringify(p.by_target)}, into object section ${p.into_object_section}, unclassified ${p.unclassified}`).join('\n  ')}` : '';
      return { result: summary, text: crossText + `\nvisited ${m.visited}/${m.total} objects; id shift 0x${(m.id_shift ?? 0).toString(16)}; words: ${JSON.stringify(m.kinds)}\nheader area: ${m.head_changes} changed words, ${m.head_pointers} rebased pointers\nclasses seen: ${m.classes.length}; pointer words: ${pointer_words.length} (${m.adjusted_pointer_words} with a runtime-adjusted value)${m.unvisited_range ? `\nunvisited range 0x${m.unvisited_range.min.toString(16)}..0x${m.unvisited_range.max.toString(16)}, visited objects inside that range: ${m.unvisited_range.visited_objects_inside}` : ''}\nunvisited by type: ${m.unvisited_by_type.slice(0, 20).map(u => `${u.count} ${u.key}`).join(', ') || '(none)'}\nunvisited (first 20): ${m.unvisited.slice(0, 20).map(u => `${u.type_name || 'type' + u.type}@0x${u.offset.toString(16)}`).join(' ')}` };
    }
    if (sub === 'refs') {
      const { reverseReferences } = await import('./igz/refs.mjs');
      const { ownerChain } = await import('./igz/containers.mjs');
      const off = Number(need(pos[2], 'object offset'));
      const hits = reverseReferences(buf, g, off);
      const chain = o.depth ? ownerChain(buf, g, off, { depth: Number(o.depth) }) : null;
      return { result: { target: off, hits, chain }, text: `${hits.length} reference(s) to 0x${off.toString(16)}\n` + hits.slice(0, 60).map(h => `  0x${h.file_offset.toString(16)} sec#${h.section} ${h.convention.padEnd(9)} value=0x${h.value.toString(16)}${h.referrer ? ` in ${h.referrer.type_name || 'type#'}@0x${h.referrer.offset.toString(16)}+0x${h.referrer.field.toString(16)}` : ''}`).join('\n') + (chain ? '\n' + chain.map((lvl, i) => `level ${i + 1}: ${[...new Set(lvl.filter(h => h.referrer).map(h => `${h.referrer.type_name}@0x${h.referrer.offset.toString(16)}`))].join(', ') || '(none)'}`).join('\n') : '') };
    }
    if (sub === 'containers' || sub === 'members') {
      const { decodeContainers, containersOf } = await import('./igz/containers.mjs');
      if (sub === 'members') { const off = Number(need(pos[2], 'object offset')); const cs = containersOf(buf, g, off); return { result: cs, text: cs.length ? cs.map(c => `${c.kind} ${c.container.type_name}@0x${c.container.offset.toString(16)} count=${c.count}${c.capacity ? '/' + c.capacity : ''} members[${c.members.indexOf(off)}]`).join('\n') : '(no container lists this object)' }; }
      const cs = decodeContainers(buf, g).filter(c => !o.type || c.container.type_name === o.type);
      const byType = new Map(); for (const c of cs) { const k = `${c.container.type_name || 'type#'} ${c.kind}`; const e = byType.get(k) ?? { count: 0, members: 0 }; e.count++; e.members += c.count; byType.set(k, e); }
      return { result: { containers: cs.length, by_type: [...byType.entries()].map(([k, v]) => ({ key: k, ...v })), sample: cs.slice(0, o.limit ? Number(o.limit) : 20) }, text: [...byType.entries()].sort((a, b) => b[1].count - a[1].count).map(([k, v]) => `${String(v.count).padStart(6)} ${k.padEnd(40)} members=${v.members}`).join('\n') };
    }
    if (sub === 'fields') {
      const E = await import('./igz/entities.mjs');
      const rows = E.fieldStatistics(buf, g).slice(0, o.limit ? Number(o.limit) : 40);
      return { result: rows, text: rows.map(r => `${String(r.count).padStart(6)} ${(r.type_name || 'type#').padEnd(30)} +0x${r.field.toString(16)} boxes=${r.boxes}`).join('\n') };
    }
    throw new CliError(`Unknown igz subcommand ${sub}`, 3);
  },
  async findings(pos, o) {
    const F = await import('./research/findings.mjs');
    const sub = pos[0] ?? 'list';
    if (sub === 'list') {
      const rows = F.list().filter(r => !o.category || r.category === o.category);
      return { result: rows.map(r => ({ id: r.id, category: r.category, confidence: r.confidence, editable: r.editable === true && r.confidence === 'CONFIRMED', structure: r.structure, updated: r.updated })),
        text: rows.map(r => `${r.confidence.padEnd(9)} ${(r.editable && r.confidence === 'CONFIRMED') ? 'editable ' : '         '} ${r.id}  ${r.structure}`).join('\n') || '(no findings)' };
    }
    if (sub === 'show') { const r = F.load(need(pos[1], 'id')); r.editable = r.editable === true && r.confidence === 'CONFIRMED'; return { result: r, text: JSON.stringify(r, null, 2) }; }
    if (sub === 'validate') { const rows = F.validateAll(); const bad = rows.filter(r => !r.valid); return { result: rows, exitCode: bad.length ? 1 : 0, text: bad.length ? bad.map(b => `${b.id}: ${b.errors.join('; ')}`).join('\n') : `${rows.length} finding(s) valid` }; }
    if (sub === 'render') { const files = F.render(); return { result: { files }, text: files.join('\n') }; }
    if (sub === 'promote') {
      const r = F.promote(need(pos[1], 'id'), { to: need(o.to, 'to'), evidence: { experiment_id: o.experiment, probe: o.probe, summary: need(o.summary, 'summary') } });
      return { result: r, text: `${r.id} -> ${r.confidence}` };
    }
    if (sub === 'editable') { const rows = F.editableFindings(); return { result: rows, text: rows.map(r => r.id).join('\n') || '(no editable finding: nothing is CONFIRMED yet)' }; }
    throw new CliError(`Unknown findings subcommand ${sub} (list|show|validate|render|promote|editable)`, 3);
  },
  async gates() {
    const docs = path.resolve(process.cwd(), '../../docs');
    const gates = ['M0', 'M1', 'M2', 'M3', 'M4A', 'M4B', 'M5'].map(name => {
      const f = path.join(docs, `${name.toLowerCase()}-status.json`);
      if (!fs.existsSync(f)) return { name, status: 'UNKNOWN', evidence: [], validated_on: null };
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); return { name, status: j.status ?? 'UNKNOWN', evidence: j.evidence ?? [], validated_on: j.validated_on ?? null, details: j.details ?? null };
    });
    return { result: gates, text: gates.map(g => `${g.name.padEnd(4)} ${g.status.padEnd(8)} ${g.validated_on ?? ''} ${g.evidence.length ? g.evidence.join(', ') : ''}`).join('\n') };
  },
};
