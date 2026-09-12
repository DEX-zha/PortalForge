// Relocation and reachable duplication (spec 002 T034/T036, after the ptr-scan runs of 2026-09-13).
//
// What the runtime showed (docs/findings: igz.loader.pointer-traversal, igz.loader.fixup-map): the loader
// does not walk section 1 sequentially. Starting from the section-1 header roots (word +0x1C -> first
// object, the u32 table of section-relative offsets, the block after it) it follows pointer fields, and
// for every object it reaches it rewrites the type word into a class pointer, shifts the id, rebases
// every section-relative offset to a pointer and runs the class constructor. Objects nobody points at
// stay untouched, which is why the first M3 clone was inert.
//
// Consequently a clone becomes alive only when a visited structure points at it. The one structure that
// references the spawn owner is the header table, so registering a clone means inserting a table entry,
// which shifts every later byte of section 1: all pointer words known from the fixup map are rebased.
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, validateGraph } from './graph.mjs';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';
import * as Findings from '../research/findings.mjs';

export function loadFixups(file) {
  const fx = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['pointer_words', 'head_pointer_words', 'id_words', 'section_offset']) if (fx[k] === undefined) throw new Error(`fixup map lacks ${k}`);
  return fx;
}

const HEAD_COUNT_A = 0x0c, HEAD_COUNT_B = 0x10, HEAD_TABLE_END = 0x14, HEAD_BLOCK_END = 0x1c;

// Insert `bytes` at file offset `at` (inside the object section). `pointerWords` are file offsets of
// u32 words holding section-relative offsets (object bodies and header area alike); words whose target
// lies at or after `at` are increased by the inserted length, and every word located after `at` moves.
// Returns { buffer, pointerWords, idWords, updates } with the word lists remapped to the new layout.
export function insertBytes(buf, graph, { pointerWords, idWords = [] }, at, bytes) {
  const sec = graph.sections[graph.object_section];
  const len = bytes.length;
  if (at < sec.offset + 0x20 || at > sec.offset + sec.size) throw new Error(`insert point 0x${at.toString(16)} outside the object section`);
  const out = Buffer.concat([buf.subarray(0, at), bytes, buf.subarray(at)]);
  const updates = [];
  const move = w => (w >= at ? w + len : w);
  const relAt = at - sec.offset;
  const done = new Set();                                                   // a word is rebased once
  const rebase = (wordOffset, field) => {
    if (done.has(wordOffset)) return; done.add(wordOffset);
    const w = move(wordOffset);
    const v = out.readUInt32BE(w);
    const flag = v & 0x80000000, rel = v & 0x7fffffff;
    if (rel >= relAt) { out.writeUInt32BE(((flag | (rel + len)) >>> 0), w); updates.push({ location: w, field, old: v, new: (flag | (rel + len)) >>> 0 }); }
  };
  for (const w of pointerWords) rebase(w, 'pointer');
  // Header words: counts when the insertion grows the table, table end, block end.
  const tableEnd = sec.offset + (buf.readUInt32BE(sec.offset + HEAD_TABLE_END) & 0x7fffffff);
  const blockEnd = sec.offset + buf.readUInt32BE(sec.offset + HEAD_BLOCK_END);
  if (at <= tableEnd) {
    for (const h of [HEAD_COUNT_A, HEAD_COUNT_B]) { const v = out.readUInt32BE(sec.offset + h); out.writeUInt32BE(v + len / 4, sec.offset + h); updates.push({ location: sec.offset + h, field: `head+0x${h.toString(16)} count`, old: v, new: v + len / 4 }); }
    rebase(sec.offset + HEAD_TABLE_END, 'head table end');
  }
  if (at <= blockEnd) rebase(sec.offset + HEAD_BLOCK_END, 'head block end');
  // Section table: grow this section, shift the later ones.
  for (const s of graph.sections) {
    const row = 0x10 + 16 * s.index;
    if (s.index === sec.index) { out.writeUInt32BE(s.size + len, row + 4); updates.push({ location: row + 4, field: `sections[${s.index}].size`, old: s.size, new: s.size + len }); }
    else if (s.offset >= at) { out.writeUInt32BE(s.offset + len, row); updates.push({ location: row, field: `sections[${s.index}].offset`, old: s.offset, new: s.offset + len }); }
  }
  return { buffer: out, pointerWords: pointerWords.map(move), idWords: idWords.map(move), updates, inserted: len };
}

// Clone the byte range [start, end) of the object section (an owner object and the children stored
// right after it), append it to the section, give every id word in the copy a fresh id, rebase the
// pointers that stay inside the copy, apply size-preserving edits, then register the copy in the header
// table (one new entry, which shifts the whole object area by 4 bytes). Total growth is padded to the
// section alignment so the later sections keep their alignment.
const TYPES = { f32be: [4, (b, o, v) => b.writeFloatBE(v, o)], u32be: [4, (b, o, v) => b.writeUInt32BE(v >>> 0, o)], u16be: [2, (b, o, v) => b.writeUInt16BE(v, o)], u8: [1, (b, o, v) => b.writeUInt8(v, o)] };

// Registration inserts one table entry (4 bytes) and, right after the header block, enough zero padding
// for the whole object area to move by `registerShift` bytes (default: the section alignment, 32), so
// every object keeps its alignment modulo 32: inline geometry and texture data in section 1 are read
// by hardware that needs 32-byte alignment, and a 4-byte shift froze the level load (run
// m3-level_027_tutorial-e3-1789253576009).
export function planReachableClone(buf, fixups, { start, end, findingId, edits = [], register = true, registerShift = null, freshIds = false, findingsOpts = {}, extraFindings = [] }) {
  const finding = Findings.load(findingId, findingsOpts);
  if (finding.confidence !== 'CONFIRMED') { const e = new Error(`Finding ${findingId} is ${finding.confidence}; duplication needs CONFIRMED`); e.exitCode = 1; throw e; }
  const graph = buildGraph(buf, { fields: false });
  const sec = graph.sections[graph.object_section];
  if (fixups.section_offset !== sec.offset) throw new Error(`fixup map is for a file whose object section starts at 0x${fixups.section_offset.toString(16)}, this one starts at 0x${sec.offset.toString(16)}`);
  const source = graph.objects.find(o => o.offset === start);
  if (!source) { const e = new Error(`No object header at 0x${start.toString(16)}`); e.exitCode = 1; throw e; }
  const blockLen = end - start;
  if (blockLen <= 0 || end > sec.offset + sec.size) throw new Error('bad clone range');
  const align = Math.max(4, sec.align || 4);
  const shift = register ? (registerShift ?? Math.max(4, align)) : 0;    // total move of the object area
  if (shift % 4 || (register && shift < 4)) throw new Error('registerShift must be a positive multiple of 4');
  const entryBytes = shift;
  const insertAt = sec.offset + sec.size;                                   // end of the object section
  // The copy keeps the source's alignment class modulo the section alignment (inline data inside the
  // block may be read by hardware with alignment requirements), so it may start after a small pre-pad.
  const prePad = (((start - sec.offset) - sec.size) % align + align) % align;
  const pad = (align - ((prePad + blockLen + entryBytes) % align)) % align;
  const cloneStart = insertAt + prePad;
  const delta = cloneStart - start;                                         // file delta of the copy
  const copy = Buffer.alloc(prePad + blockLen + pad); buf.copy(copy, prePad, start, end);
  const failures = [], changes = [];
  // Pointers inside the block that point inside the block follow the copy; others keep pointing at
  // the shared originals. Pointers into the block from outside are left alone (the original keeps them).
  const inBlock = w => w >= start && w < end;
  const blockPointerWords = fixups.pointer_words.filter(inBlock);
  let internal = 0, external = 0;
  const at = w => w - start + prePad;                                       // block offset -> copy buffer offset
  for (const w of blockPointerWords) {
    const v = copy.readUInt32BE(at(w));
    const target = sec.offset + (v & 0x7fffffff);
    if (target >= start && target < end) { copy.writeUInt32BE(((v & 0x80000000) | ((v & 0x7fffffff) + delta)) >>> 0, at(w)); internal++; } else external++;
  }
  // Header word +8 ("id") is a section-indexed pointer (0x01 = section 2) to a string shared by many
  // objects (4 300 tfbSpriteInfo share one), not a unique id: the copy keeps every such word unchanged
  // (finding igz.pointer.section-indexed). `freshIds` remains available for experiments.
  const maxId = graph.objects.reduce((m, o) => Math.max(m, o.id), 0);
  const idWordsInBlock = fixups.id_words.filter(inBlock).sort((a, b) => a - b);
  let nextId = maxId + 1; const newIds = [];
  if (freshIds) for (const w of idWordsInBlock) { const old = copy.readUInt32BE(at(w)); copy.writeUInt32BE(nextId >>> 0, at(w)); newIds.push({ field: '+0x' + (w - start).toString(16), old: '0x' + old.toString(16), new: '0x' + nextId.toString(16) }); nextId++; }
  for (const ed of edits) {
    const [width, write] = TYPES[ed.type] ?? [];
    if (!write) throw new Error(`unsupported edit type ${ed.type}`);
    if (ed.offset + width > blockLen) throw new Error(`edit +0x${ed.offset.toString(16)} outside the cloned block`);
    const old_hex = copy.subarray(prePad + ed.offset, prePad + ed.offset + width).toString('hex');
    write(copy, prePad + ed.offset, ed.value);
    changes.push({ field: '+0x' + ed.offset.toString(16), type: ed.type, old_hex, new_hex: copy.subarray(prePad + ed.offset, prePad + ed.offset + width).toString('hex') });
  }
  // 1. append the copy
  // Every word that holds a section-1 offset: object fields, header table, and (when the map was built
  // with region dumps) the words of the other sections that point into section 1.
  const crossWords = fixups.cross_pointer_words ?? [];
  const words = { pointerWords: fixups.pointer_words.concat(fixups.head_pointer_words, crossWords), idWords: fixups.id_words };
  let step = insertBytes(buf, graph, words, insertAt, copy);
  let updates = [...step.updates];
  const copyPointerWords = blockPointerWords.map(w => w - start + cloneStart);
  let pointerWordsNow = step.pointerWords.concat(copyPointerWords);
  let out = step.buffer, tableEntry = null, cloneOffset = cloneStart;
  // 2. register: one more table entry at the end of the table, then zero padding after the header block
  //    so that the object area moves by `shift` bytes in total.
  if (register) {
    const graph1 = buildGraph(out, { fields: false });
    const sec1 = graph1.sections[graph1.object_section];
    const tableEnd = sec1.offset + (out.readUInt32BE(sec1.offset + HEAD_TABLE_END) & 0x7fffffff);
    const entry = Buffer.alloc(4); entry.writeUInt32BE(cloneOffset + shift - sec1.offset);   // the clone itself moves by `shift`
    step = insertBytes(out, graph1, { pointerWords: pointerWordsNow, idWords: step.idWords }, tableEnd, entry);
    out = step.buffer; updates = updates.concat(step.updates); pointerWordsNow = step.pointerWords; cloneOffset += 4;
    tableEntry = { location: tableEnd, value: cloneOffset + shift - 4 - sec1.offset, index: (tableEnd - sec1.offset) / 4 };
    updates.push({ location: tableEnd, field: 'head table entry (new)', old: null, new: tableEntry.value });
    if (shift > 4) {
      const graph2 = buildGraph(out, { fields: false });
      const sec2 = graph2.sections[graph2.object_section];
      const blockEnd = sec2.offset + out.readUInt32BE(sec2.offset + HEAD_BLOCK_END);          // == first object
      step = insertBytes(out, graph2, { pointerWords: pointerWordsNow, idWords: step.idWords }, blockEnd, Buffer.alloc(shift - 4));
      out = step.buffer; updates = updates.concat(step.updates); pointerWordsNow = step.pointerWords; cloneOffset += shift - 4;
      updates.push({ location: blockEnd, field: 'padding after the header block', old: null, new: shift - 4 });
    }
  }
  // Validation: re-parse and check the copy resolves like the original.
  let after = null;
  try {
    after = buildGraph(out, { fields: false });
    const expected = graph.objects.length + graph.objects.filter(o => o.offset >= start && o.offset < end).length;
    if (after.objects.length !== expected) failures.push({ stage: 'count', reason: `object count ${after.objects.length}, expected ${expected}` });
    if (!validateGraph(after).valid) failures.push({ stage: 'validation', reason: 'object graph schema failed' });
    if (after.issues.length) failures.push(...after.issues.map(i => ({ stage: 'validation', reason: i.reason, offset: i.offset })));
    const secA = after.sections[after.object_section];
    if (secA.offset + secA.size !== after.sections[after.sections.length - 1].offset - (after.sections[after.sections.length - 1].offset - (secA.offset + secA.size))) { /* sections are contiguous by construction */ }
    if (after.sections.at(-1).offset + after.sections.at(-1).size !== out.length) failures.push({ stage: 'validation', reason: 'sections do not end at EOF' });
    const clone = after.objects.find(o => o.offset === cloneOffset);
    if (!clone) failures.push({ stage: 'validation', reason: 'clone header not recognised', offset: cloneOffset });
    else if (clone.type !== source.type) failures.push({ stage: 'validation', reason: `clone type ${clone.type} != source ${source.type}` });
    // every original object keeps its type at its shifted position
    const byOff = new Map(after.objects.map(o => [o.offset, o]));
    let mismatched = 0; for (const o of graph.objects) { const m = byOff.get(o.offset + shift); if (!m || m.type !== o.type) mismatched++; }
    if (mismatched) failures.push({ stage: 'validation', reason: `${mismatched} original object(s) not found at their shifted offset` });
    // pointer words of the copy resolve to the same object types as in the source
    for (const w of blockPointerWords) {
      const vs = buf.readUInt32BE(w) & 0x7fffffff, vc = out.readUInt32BE(w - start + cloneOffset) & 0x7fffffff;
      const ts = sec.offset + vs, tc = after.sections[after.object_section].offset + vc;
      const srcObj = ownerOf(graph.objects, ts), cloneObj = ownerOf(after.objects, tc);
      if (!srcObj || !cloneObj || srcObj.type !== cloneObj.type || (ts - srcObj.offset) !== (tc - cloneObj.offset)) { failures.push({ stage: 'reference', reason: `copied pointer +0x${(w - start).toString(16)} does not resolve like the original`, offset: w - start + cloneOffset }); break; }
    }
    if (register) {
      const secA2 = after.sections[after.object_section];
      const cnt = out.readUInt32BE(secA2.offset + HEAD_COUNT_A), endRel = out.readUInt32BE(secA2.offset + HEAD_TABLE_END) & 0x7fffffff;
      if (cnt * 4 !== endRel) failures.push({ stage: 'validation', reason: `table count ${cnt} and end 0x${endRel.toString(16)} disagree` });
      if (secA2.offset + out.readUInt32BE(secA2.offset + HEAD_BLOCK_END) !== after.objects[0].offset) failures.push({ stage: 'validation', reason: 'block end no longer points at the first object' });
      if (out.readUInt32BE(tableEntry.location) !== cloneOffset - secA2.offset) failures.push({ stage: 'reference', reason: 'table entry does not point at the clone' });
    }
  } catch (e) { failures.push({ stage: 'validation', reason: e.message }); }
  const plan = {
    source: { object_offset: start, type_name: source.type_name, finding_id: findingId, block_end: end, block_bytes: blockLen },
    changes, insert_at: cloneOffset, updates: updates.slice(0, 200), updates_total: updates.length, new_id: freshIds ? maxId + 1 : source.id, new_ids: newIds, fresh_ids: freshIds,
    validation: { status: failures.length ? 'INVALID' : 'VALID', failures },
    inserted_bytes: copy.length + entryBytes, register, register_shift: shift, pre_pad: prePad, table_entry: tableEntry, pointers: { internal, external, cross_section_words: crossWords.length, rebased_after_shift: updates.filter(u => u.field === 'pointer').length },
    findings: [findingId, ...extraFindings], method: 'reachable-clone (fixup-map relocation, header table registration)',
  };
  const v = schemaValidator('duplication-plan.schema.json', contracts002);
  const { source: { block_end, block_bytes, ...src }, updates_total, new_ids, inserted_bytes, register: _r, register_shift, pre_pad, fresh_ids, table_entry, pointers, findings, method, ...rest } = plan;
  const strict = { ...rest, source: src };
  plan.schema_valid = v(strict); plan.schema_errors = v.errors ?? null;
  return { plan, buffer: out, graph_after: after ? { objects: after.objects.length, accounting: after.accounting } : null };
}

function ownerOf(objects, fileOffset) {
  let lo = 0, hi = objects.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (objects[m].offset <= fileOffset) { best = m; lo = m + 1; } else hi = m - 1; }
  if (best < 0) return null; const o = objects[best]; return fileOffset < o.offset + o.size ? o : null;
}

export function writeReachablePlan(result, { outFile, planFile }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result.buffer);
  if (planFile) fs.writeFileSync(planFile, JSON.stringify({ ...result.plan, output: path.resolve(outFile), graph_after: result.graph_after }, null, 2));
  return { outFile: path.resolve(outFile), planFile: planFile ? path.resolve(planFile) : null };
}
