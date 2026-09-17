// `igz` subcommands that plan or support a modification: clone, clone-entity, pick-overwrite-target,
// relocation-probe and fixups.
//
// A plan is always written next to the modified file and carries its own validation. Only a same-size
// replacement (`clone-entity --replace-record`, `--replace-node`) is confirmed to load in game; the inserting
// modes are kept because the negative results they produced are part of the record (docs/m3-status.json).
import fs from 'node:fs';
import path from 'node:path';
import { EXIT, need } from '../errors.mjs';
import { writePlanFiles } from '../../igz/plan-common.mjs';
import { firstFixup, parseHexList, parseSetEdits, readJsonFile } from '../args.mjs';

const hex = value => '0x' + value.toString(16);
const DEFAULT_LINK_FIELD = 0x64; // PlacementReference "next" pointer
const planExit = plan => (plan.validation.status === 'VALID' ? EXIT.OK : EXIT.FAILED);
const failureLines = plan => plan.validation.failures.map(f => `  ${f.stage}: ${f.reason}`).join('\n');
const outputTargets = o => ({
  outFile: path.resolve(need(o.out, 'out')),
  planFile: o.plan ? path.resolve(o.plan) : null,
});
const writtenLines = written => (written.planFile ? '\nplan ' + written.planFile : '') + '\nfile ' + written.outFile;
const sourceLabel = plan => `${plan.source.type_name}@${hex(plan.source.object_offset)}`;

export async function clone({ buf, pos, o }) {
  const C = await import('../../igz/clone.mjs');
  const r = C.planClone(buf, {
    objectOffset: Number(need(pos[2], 'object offset')),
    findingId: need(o.finding, 'finding'),
    edits: parseSetEdits(o.set),
    appendToList: !!o['append-to-list'],
  });
  const written = writePlanFiles(r, outputTargets(o));
  const p = r.plan;
  return {
    result: { ...p, ...written, graph_after: r.graph_after },
    exitCode: planExit(p),
    text:
      `plan ${p.validation.status}: clone of ${sourceLabel(p)} at ${hex(p.insert_at)} (+${p.inserted_bytes} B, id ${hex(p.new_id)}), ${p.changes.length} edit(s), ${p.updates.length} table update(s)` +
      (p.validation.failures.length ? '\n' + failureLines(p) : '') +
      `\n-> ${written.outFile}${written.planFile ? ' ; plan ' + written.planFile : ''}`,
  };
}

// The five ways `clone-entity` can place a copy. Each returns the planner result and the summary line that
// describes what the plan does; writing the files and reporting failures is common to all of them.
const CLONE_MODES = [
  {
    // Same-size replacement of a table record: the confirmed recipe for a visible duplicate.
    when: o => o['replace-record'] !== undefined,
    plan: (R, buf, fixups, common, pos, o) =>
      R.planReplaceRecord(buf, fixups, {
        source: Number(pos[2]),
        victim: Number(o['replace-record']),
        keep: parseHexList(o.keep),
        findingId: common.findingId,
        edits: common.edits,
        extraFindings: common.extraFindings,
      }),
    summary: p =>
      `${p.validation.status} [replace-record]: ${sourceLabel(p)} copied over ${p.victim_type_name}@${hex(p.victim)}; kept ${p.kept_fields.join(',')}; pointers internal ${p.pointers.internal} external ${p.pointers.external}; edits ${p.changes.length}; file length unchanged`,
  },
  {
    // Same-size replacement of a linked-chain node: nothing moves, the copy inherits the victim's successor.
    when: o => o['replace-node'] !== undefined,
    plan: (R, buf, fixups, common, pos, o) =>
      R.planReplaceNode(buf, fixups, {
        source: Number(pos[2]),
        victim: o['replace-node'] === 'next' ? null : Number(o['replace-node']),
        linkField: o['link-field'] !== undefined ? Number(o['link-field']) : DEFAULT_LINK_FIELD,
        findingId: common.findingId,
        edits: common.edits,
        extraFindings: common.extraFindings,
      }),
    summary: p =>
      `${p.validation.status} [replace-node]: ${sourceLabel(p)} copied over ${p.victim_type_name}@${hex(p.victim)}; copy.next -> ${hex(p.victim_old_next)}; file length unchanged, nothing moved`,
  },
  {
    when: o => o['link-after'] !== undefined,
    plan: (R, buf, fixups, common, pos, o) =>
      R.planLinkClone(buf, fixups, {
        source: Number(o['link-after']),
        linkField: o['link-field'] !== undefined ? Number(o['link-field']) : DEFAULT_LINK_FIELD,
        findingId: common.findingId,
        insertBefore: o['insert-before'] !== undefined ? Number(o['insert-before']) : null,
        edits: common.edits,
        extraFindings: common.extraFindings,
      }),
    summary: p =>
      `${p.validation.status} [link-after]: ${sourceLabel(p)} (${p.source.block_bytes} B) -> clone @${hex(p.insert_at)}; link +${hex(p.link_field)}: source -> clone, clone -> ${hex(p.old_next)}; moved records ${p.moved_records}; +${p.inserted_bytes} B; no table change`,
  },
  {
    when: o => o.overwrite !== undefined,
    plan: (R, buf, fixups, common, pos, o) =>
      R.planOverwriteClone(buf, fixups, { ...common, target: Number(o.overwrite) }),
    summary: p =>
      `${p.validation.status} [in-place overwrite]: ${sourceLabel(p)} block ${p.source.block_bytes} B -> onto ${p.target.type_name}@${hex(p.target.offset)} (blob ${hex(p.target.blob_bytes)}, zeroed ${hex(p.target.leftover_zeroed)}); file length unchanged, no table growth; pointers internal ${p.pointers.internal} external ${p.pointers.external}, refcounts ${p.refcounts.length}, edits ${p.changes.length}`,
  },
  {
    // Default: insert a reachable clone, which shifts every later record.
    when: () => true,
    plan: (R, buf, fixups, common, pos, o) =>
      R.planReachableClone(buf, fixups, {
        ...common,
        register: !o['no-register'],
        replaceEntry: o['replace-entry'] !== undefined ? Number(o['replace-entry']) : null,
        insertBefore: o['insert-before'] !== undefined ? Number(o['insert-before']) : null,
        freshIds: !!o['fresh-ids'],
      }),
    summary: p =>
      `${p.validation.status}: ${sourceLabel(p)} block ${p.source.block_bytes} B -> clone @${hex(p.insert_at)} (+${p.inserted_bytes} B${p.insert_before !== null ? `, inserted before ${hex(p.insert_before)}, end pad ${p.end_pad}` : ''}), refcounts bumped ${p.refcounts.length}, table entry ${p.table_entry ? `#${p.table_entry.index}` : 'none'}, pointers internal ${p.pointers.internal} external ${p.pointers.external}, rebased after shift ${p.pointers.rebased_after_shift}, new ids ${p.new_ids.length}, edits ${p.changes.length}`,
  },
];

export async function cloneEntity({ buf, pos, o }) {
  const R = await import('../../igz/relocate.mjs');
  const edits = parseSetEdits(o.set);
  const fixups = R.loadFixups(path.resolve(need(firstFixup(o.fixups), 'fixups')));
  const common = {
    start: Number(need(pos[2], 'owner offset')),
    end: Number(need(o.end, 'end')),
    findingId: need(o.finding, 'finding'),
    edits,
    bumpRefcounts: !o['no-refcounts'],
    extraFindings: o['also-finding'] ?? [],
  };
  const mode = CLONE_MODES.find(m => m.when(o));
  const r = mode.plan(R, buf, fixups, common, pos, o);
  const written = writePlanFiles(r, outputTargets(o));
  const p = r.plan;
  return {
    result: { ...p, ...written, graph_after: r.graph_after },
    exitCode: planExit(p),
    text: mode.summary(p) + '\n' + failureLines(p) + writtenLines(written),
  };
}

// Header-table records of one type whose blob is large enough to hold a block of `blockBytes`, ranked by how
// few outside pointers land inside the blob: those are the records an in-place overwrite would disturb least.
function overwriteCandidates(buf, graph, fixups, type, blockBytes) {
  const s1 = graph.sections[graph.object_section];
  const tableEnd = s1.offset + (buf.readUInt32BE(s1.offset + 0x14) & 0x7fffffff);
  const entries = new Set();
  for (let q = s1.offset + 0x20; q < tableEnd; q += 4) entries.add(s1.offset + buf.readUInt32BE(q));
  const pointerWords = fixups.pointer_words.concat(fixups.head_pointer_words ?? [], fixups.cross_pointer_words ?? []);

  const candidates = [];
  for (const record of [...entries].sort((a, b) => a - b)) {
    const object = graph.objects.find(x => x.offset === record);
    if (!object || object.type !== type) continue;
    // The blob runs to the next table record, or to the end of the section.
    let blobEnd = s1.offset + s1.size;
    for (const e of entries) if (e > record && e < blobEnd) blobEnd = e;
    if (blobEnd - record < blockBytes) continue;
    let externalRefs = 0;
    for (const word of pointerWords) {
      if (word >= record && word < blobEnd) continue;
      const target = s1.offset + (buf.readUInt32BE(word) & 0xffffff);
      if (target > record && target < blobEnd) externalRefs++;
    }
    candidates.push({
      offset: record,
      blob: blobEnd - record,
      leftover: blobEnd - record - blockBytes,
      ext: externalRefs,
    });
  }
  return candidates.sort((a, b) => a.ext - b.ext || a.leftover - b.leftover);
}

export async function pickOverwriteTarget({ buf, pos, o }) {
  const { buildGraph } = await import('../../igz/graph.mjs');
  const fixups = readJsonFile(need(firstFixup(o.fixups), 'fixups'));
  const type = Number(need(o.type, 'type'));
  const blockBytes = Number(need(o.end, 'end')) - Number(need(pos[2], 'owner offset'));
  const candidates = overwriteCandidates(buf, buildGraph(buf, { fields: false }), fixups, type, blockBytes);
  return {
    result: candidates.slice(0, 20),
    text:
      `${candidates.length} type-${type} table entries with blob >= ${hex(blockBytes)}:\n` +
      candidates
        .slice(0, 12)
        .map(c => `  ${hex(c.offset)} blob ${hex(c.blob)} leftover ${hex(c.leftover)} externalRefsIntoBlob ${c.ext}`)
        .join('\n'),
  };
}

// Tests whether any section holds the relocation table in a flat or bitmap encoding, and how much of the
// runtime truth per-type templates explain. It documents why relocation is treated as reflection-driven.
export async function relocationProbe({ buf, graph, o }) {
  const R = await import('../../igz/relocation.mjs');
  const fixups = readJsonFile(need(firstFixup(o.fixups), 'fixups'));
  const truth = R.relocationTruth(buf, fixups);

  const results = [];
  const templatesOnly = o.probe && o.probe.includes('template');
  if (!templatesOnly) {
    for (const s of graph.sections) {
      if (o.section !== undefined && s.index !== Number(o.section)) continue;
      if (s.index === graph.object_section) continue;
      const bytes = buf.subarray(s.offset, s.offset + s.size);
      results.push(...R.probeFlat(truth, `sec${s.index}`, bytes));
      results.push(...R.probeBitmap(truth, `sec${s.index}`, bytes));
    }
  }
  results.sort((a, b) => b.recall + b.precision - (a.recall + a.precision));

  const templates = R.typeTemplates(buf, fixups);
  const structural = R.structuralModel(buf, fixups);
  const percent = ratio => (100 * ratio).toFixed(1);
  const lines = [
    `ground truth: ${truth.wordIdx.length} relocated words over ${truth.nWords} section-1 words`,
    'top flat/bitmap decoders (by recall+precision):',
    ...results
      .slice(0, 14)
      .map(
        r =>
          `  ${r.section.padEnd(6)} ${r.decoder.padEnd(22)} produced ${String(r.produced).padStart(8)}  precision ${percent(r.precision)}%  recall ${percent(r.recall)}%`,
      ),
    `per-type templates explain ${percent(templates.explained_pct)}% of pointer fields (${templates.explained}/${templates.total}); ${templates.templates.filter(t => t.template.length).length} types have a non-empty pointer template`,
    `structural model: fixed-field ${percent(structural.fixed / structural.total)}% + array-run ${percent(structural.array / structural.total)}% = ${percent(structural.explained_pct)}% explained; ${structural.unexplained} unexplained`,
  ];
  if (structural.unexplained_samples.length) {
    lines.push(
      '  unexplained e.g. ' +
        structural.unexplained_samples
          .slice(0, 6)
          .map(u => `${u.type}${u.field}`)
          .join(' '),
    );
  }

  if (o.out) {
    const report = {
      truth_words: truth.wordIdx.length,
      section_words: truth.nWords,
      results,
      templates: templates.templates,
      explained_pct: templates.explained_pct,
    };
    fs.writeFileSync(path.resolve(o.out), JSON.stringify(report, null, 2));
  }
  return {
    result: { results: results.slice(0, 30), templates_explained_pct: templates.explained_pct },
    text: lines.join('\n'),
  };
}

// `--regions <mem1.bin>,<mem2.bin>`: raw dumps of MEM1 (0x80000000) and MEM2 (0x90000000) from
// `experiment ptr-scan --dimensions`, used to find pointers into the object section from other sections.
function readMemoryRegions(value) {
  return value.split(',').map(file => {
    const resolved = path.resolve(file.trim());
    return {
      start: /90000000/.test(path.basename(resolved)) ? 0x90000000 : 0x80000000,
      buf: fs.readFileSync(resolved),
    };
  });
}

// `--section-address <index>=<address>`, repeatable: where a section was found in RAM.
const parseSectionAddresses = list =>
  Object.fromEntries(
    (list ?? []).map(spec => {
      const [index, address] = spec.split('=');
      return [Number(index), Number(address)];
    }),
  );

function crossSectionText(cross) {
  if (!cross) return '';
  const located = cross.sections.map(s => `#${s.index}@${s.live === null ? '?' : hex(s.live)}`).join(' ');
  const perSection = cross.per_section
    .map(p =>
      p.error
        ? `#${p.section} ${p.error}`
        : `#${p.section}: ${p.changed} changed, by target ${JSON.stringify(p.by_target)}, into object section ${p.into_object_section}, unclassified ${p.unclassified}`,
    )
    .join('\n  ');
  return `\nsections located: ${located}\ncross-section words: ${perSection}`;
}

// Diffs the file against a resident dump of the object section: which words the loader rewrote, and how.
export async function fixups({ buf, graph, pos, o }) {
  const { fixupMap, crossSectionPointers } = await import('../../igz/fixups.mjs');
  const live = fs.readFileSync(path.resolve(need(pos[2], 'resident section dump')));
  const map = fixupMap(buf, live, graph, { base: o.base ? Number(o.base) : undefined });

  let cross = null;
  if (o.regions) {
    cross = crossSectionPointers(buf, graph, readMemoryRegions(o.regions), {
      overrides: parseSectionAddresses(o['section-address']),
    });
    map.cross_pointer_words = cross.cross_pointer_words;
    map.cross_sections = cross.sections;
    map.cross_per_section = cross.per_section;
  }

  const { pointer_words, id_words, head_pointer_words, cross_pointer_words = [], objects: _objects, ...summary } = map;
  if (o.out) {
    fs.writeFileSync(
      path.resolve(o.out),
      JSON.stringify({ ...summary, head_pointer_words, pointer_words, id_words, cross_pointer_words }),
    );
  }

  const unvisitedRange = map.unvisited_range
    ? `\nunvisited range ${hex(map.unvisited_range.min)}..${hex(map.unvisited_range.max)}, visited objects inside that range: ${map.unvisited_range.visited_objects_inside}`
    : '';
  const unvisitedByType =
    map.unvisited_by_type
      .slice(0, 20)
      .map(u => `${u.count} ${u.key}`)
      .join(', ') || '(none)';
  const unvisitedFirst = map.unvisited
    .slice(0, 20)
    .map(u => `${u.type_name || 'type' + u.type}@${hex(u.offset)}`)
    .join(' ');
  return {
    result: summary,
    text:
      crossSectionText(cross) +
      `\nvisited ${map.visited}/${map.total} objects; id shift ${hex(map.id_shift ?? 0)}; words: ${JSON.stringify(map.kinds)}` +
      `\nheader area: ${map.head_changes} changed words, ${map.head_pointers} rebased pointers` +
      `\nclasses seen: ${map.classes.length}; pointer words: ${pointer_words.length} (${map.adjusted_pointer_words} with a runtime-adjusted value)` +
      unvisitedRange +
      `\nunvisited by type: ${unvisitedByType}` +
      `\nunvisited (first 20): ${unvisitedFirst}`,
  };
}
