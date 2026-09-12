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
    if (kind === 'ram-diff') {
      const { ramDiff } = await import('./experiments/live-probe.mjs');
      const r = await ramDiff({ label: o.label ?? 'ram-diff', stateSlot: o['save-slot'] ? Number(o['save-slot']) : 6, figure: o.figure ?? null });
      return { result: r, exitCode: r.status === 'DONE' ? 0 : 1, text: `${r.status} ${r.output}\ncandidates=${r.candidates?.length ?? 0}\n` + (r.candidates ?? []).slice(0, 15).map(c => `${c.address} before=${JSON.stringify(c.before)} right=${JSON.stringify(c.delta_right)} back=${JSON.stringify(c.delta_back)}`).join('\n') + (r.error ? '\nerror: ' + r.error : '') };
    }
    if (kind === 'm2-judge') {
      const { judge } = await import('./experiments/m2-mutation.mjs');
      const r = judge({ id: need(o.id, 'id'), run: Number(need(o.run, 'run')), observed: need(o.observed, 'observed'), match: String(o.match ?? '').toLowerCase() === 'yes' });
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
