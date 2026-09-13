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
// replaceEntry: instead of growing the table (which shifts the object area), overwrite one existing
// table entry with the clone's offset. The object that entry used to register becomes unreachable, so
// this is a diagnostic: it tests "a table entry makes the clone alive" without any relocation.
export function planReachableClone(buf, fixups, { start, end, findingId, edits = [], register = true, registerShift = null, replaceEntry = null, insertBefore = null, bumpRefcounts = true, freshIds = false, findingsOpts = {}, extraFindings = [] }) {
  if (replaceEntry !== null) register = false;
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
  const secEnd = sec.offset + sec.size;
  // Where the copy goes. Appending after the last object is outside the range the loader enumerates
  // (run m3-…-1789256664691: an appended clone stays raw while the level is alive), so the default is
  // to insert it before a given object (`insertBefore`, e.g. the first of the six tail objects); the
  // objects after that point move by the block length and every pointer to them is rebased.
  const insertAt = insertBefore ?? secEnd;
  if (insertAt !== secEnd && !graph.objects.some(o => o.offset === insertAt)) throw new Error(`insertBefore 0x${insertAt.toString(16)} is not an object header`);
  const inside = insertAt !== secEnd;
  // Appending: the copy keeps the source's alignment class modulo the section alignment (pre-pad) and is
  // padded to the alignment. Inserting inside the walked range: no padding may separate objects, so the
  // block is inserted as is and the alignment padding goes to the end of the section.
  const prePad = inside ? 0 : (((start - sec.offset) - sec.size) % align + align) % align;
  const pad = (align - ((prePad + blockLen + entryBytes) % align)) % align;
  const cloneStart = insertAt + prePad;
  const delta = cloneStart - start;                                         // file delta of the copy
  const copy = Buffer.alloc(prePad + blockLen + (inside ? 0 : pad)); buf.copy(copy, prePad, start, end);
  const endPad = inside ? pad : 0;
  const failures = [], changes = [];
  // Pointers inside the block that point inside the block follow the copy; others keep pointing at
  // the shared originals (rebased when those move). Pointers into the block from outside are left
  // alone (the original keeps them).
  const inBlock = w => w >= start && w < end;
  const blockPointerWords = fixups.pointer_words.filter(inBlock);
  let internal = 0, external = 0;
  const at = w => w - start + prePad;                                       // block offset -> copy buffer offset
  const externalTargets = new Map();                                        // original file offset -> count
  for (const w of blockPointerWords) {
    const v = copy.readUInt32BE(at(w));
    const rel = v & 0x7fffffff, target = sec.offset + rel;
    if (target >= start && target < end) { copy.writeUInt32BE(((v & 0x80000000) | (rel + delta)) >>> 0, at(w)); internal++; }
    else { external++; externalTargets.set(target, (externalTargets.get(target) ?? 0) + 1); if (target >= insertAt) copy.writeUInt32BE(((v & 0x80000000) | (rel + copy.length)) >>> 0, at(w)); }
  }
  const work = buf;
  const refcountUpdates = [];
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
  let step = insertBytes(work, graph, words, insertAt, copy);
  let updates = [...step.updates];
  const copyPointerWords = blockPointerWords.map(w => w - start + cloneStart);
  let pointerWordsNow = step.pointerWords.concat(copyPointerWords);
  let out = step.buffer, tableEntry = null, cloneOffset = cloneStart;
  if (endPad) {
    const g1 = buildGraph(out, { fields: false }); const s1 = g1.sections[g1.object_section];
    step = insertBytes(out, g1, { pointerWords: pointerWordsNow, idWords: step.idWords }, s1.offset + s1.size, Buffer.alloc(endPad));
    out = step.buffer; updates = updates.concat(step.updates); pointerWordsNow = step.pointerWords;
    updates.push({ location: s1.offset + s1.size, field: 'alignment padding at the section end', old: null, new: endPad });
  }
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
  if (replaceEntry !== null) {
    const loc = sec.offset + 4 * replaceEntry;
    const tableEnd = sec.offset + (buf.readUInt32BE(sec.offset + HEAD_TABLE_END) & 0x7fffffff);
    if (loc < sec.offset + 0x20 || loc >= tableEnd) throw new Error(`table index ${replaceEntry} outside the header table`);
    const old = out.readUInt32BE(loc);
    out.writeUInt32BE(cloneOffset - sec.offset, loc);
    tableEntry = { location: loc, value: cloneOffset - sec.offset, index: replaceEntry, replaced: old, replaced_object: sec.offset + old };
    updates.push({ location: loc, field: `head table entry #${replaceEntry} (replaced)`, old, new: cloneOffset - sec.offset });
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
    const moved = o => o.offset + shift + (o.offset >= insertAt ? copy.length : 0);
    let mismatched = 0; for (const o of graph.objects) { const m = byOff.get(moved(o)); if (!m || m.type !== o.type) mismatched++; }
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
  // Reference counts (finding igz.object.refcount): each shared target gains one owning reference per
  // pointer word of the copy. Applied after validation because the graph detector only recognises
  // headers whose refcount is 1; locations are mapped from original to final coordinates.
  if (bumpRefcounts) {
    const finalOf = L => L + (L >= insertAt ? copy.length : 0) + shift;
    for (const [t, n] of externalTargets) {
      const loc = finalOf(t) + 4;
      const rc = out.readUInt32BE(loc);
      if (rc >= 1 && rc <= 100000) { out.writeUInt32BE(rc + n, loc); refcountUpdates.push({ location: loc, field: 'refcount', old: rc, new: rc + n }); }
      else failures.push({ stage: 'reference', reason: `shared target 0x${t.toString(16)} has no plausible refcount (${rc})`, offset: t });
    }
    updates = refcountUpdates.concat(updates);
  }
  const plan = {
    source: { object_offset: start, type_name: source.type_name, finding_id: findingId, block_end: end, block_bytes: blockLen },
    changes, insert_at: cloneOffset, updates: updates.slice(0, 200), updates_total: updates.length, new_id: freshIds ? maxId + 1 : source.id, new_ids: newIds, fresh_ids: freshIds,
    validation: { status: failures.length ? 'INVALID' : 'VALID', failures },
    inserted_bytes: copy.length + endPad + entryBytes, register, register_shift: shift, replace_entry: replaceEntry, insert_before: inside ? insertAt : null, pre_pad: prePad, end_pad: endPad, refcounts: refcountUpdates, table_entry: tableEntry, pointers: { internal, external, cross_section_words: crossWords.length, rebased_after_shift: updates.filter(u => u.field === 'pointer').length },
    findings: [findingId, ...extraFindings], method: 'reachable-clone (fixup-map relocation, header table registration)',
  };
  const v = schemaValidator('duplication-plan.schema.json', contracts002);
  const { source: { block_end, block_bytes, ...src }, updates_total, new_ids, inserted_bytes, register: _r, register_shift, replace_entry, insert_before, pre_pad, end_pad, refcounts, fresh_ids, table_entry, pointers, findings, method, ...rest } = plan;
  const strict = { ...rest, source: src };
  plan.schema_valid = v(strict); plan.schema_errors = v.errors ?? null;
  return { plan, buffer: out, graph_after: after ? { objects: after.objects.length, accounting: after.accounting } : null };
}

function ownerOf(objects, fileOffset) {
  let lo = 0, hi = objects.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (objects[m].offset <= fileOffset) { best = m; lo = m + 1; } else hi = m - 1; }
  if (best < 0) return null; const o = objects[best]; return fileOffset < o.offset + o.size ? o : null;
}

// In-place registration (no table growth, no shift): overwrite an existing header-table record with the
// clone block. The target must be a table entry of the same type as the clone owner, with a blob (to the
// next table entry) at least as large as the block and, ideally, no external references into its interior
// (pick with the target ranker). The file length is unchanged and only bytes inside [target, blobEnd)
// plus a few refcount words elsewhere are touched, so the game's per-type relocation walk processes the
// clone exactly as it did the sacrificed record (finding igz.loader.relocation-table: relocation is
// reflection-driven, so a same-type record in a registered slot needs no new relocation data).
export function planOverwriteClone(buf, fixups, { start, end, target, findingId, edits = [], bumpRefcounts = true, findingsOpts = {}, extraFindings = [] }) {
  const finding = Findings.load(findingId, findingsOpts);
  if (finding.confidence !== 'CONFIRMED') { const e = new Error(`Finding ${findingId} is ${finding.confidence}; duplication needs CONFIRMED`); e.exitCode = 1; throw e; }
  const graph = buildGraph(buf, { fields: false });
  const sec = graph.sections[graph.object_section];
  if (fixups.section_offset !== sec.offset) throw new Error(`fixup map is for section start 0x${fixups.section_offset.toString(16)}, this file 0x${sec.offset.toString(16)}`);
  const source = graph.objects.find(o => o.offset === start);
  const tgtObj = graph.objects.find(o => o.offset === target);
  if (!source) throw Object.assign(new Error(`no object at 0x${start.toString(16)}`), { exitCode: 1 });
  if (!tgtObj) throw Object.assign(new Error(`no object at target 0x${target.toString(16)}`), { exitCode: 1 });
  const blockLen = end - start;
  const failures = [], changes = [];
  // header table entries (file offsets), and the target's blob boundary = next entry after it in file order
  const tableEnd = sec.offset + (buf.readUInt32BE(sec.offset + 0x14) & 0x7fffffff);
  const entries = new Set(); for (let p = sec.offset + 0x20; p < tableEnd; p += 4) entries.add(sec.offset + buf.readUInt32BE(p));
  if (!entries.has(target)) failures.push({ stage: 'validation', reason: 'target is not a header-table entry' });
  if (tgtObj.type !== source.type) failures.push({ stage: 'validation', reason: `target type ${tgtObj.type} != clone owner type ${source.type}` });
  let blobEnd = sec.offset + sec.size; for (const e of entries) if (e > target && e < blobEnd) blobEnd = e;
  if (blobEnd - target < blockLen) throw Object.assign(new Error(`target blob 0x${(blobEnd - target).toString(16)} < block 0x${blockLen.toString(16)}`), { exitCode: 1 });
  const out = Buffer.from(buf);
  // write the clone block over the target, rebasing block-internal pointers by delta = target - start
  const delta = target - start;
  buf.copy(out, target, start, end);
  const inBlock = w => w >= start && w < end;
  let internal = 0, external = 0; const cloneExternals = new Map();
  for (const w of fixups.pointer_words.filter(inBlock)) {
    const off = w - start + target, v = out.readUInt32BE(off), rel = v & 0x7fffffff, tgt = sec.offset + rel;
    if (tgt >= start && tgt < end) { out.writeUInt32BE(((v & 0x80000000) | (rel + delta)) >>> 0, off); internal++; }
    else { external++; cloneExternals.set(tgt, (cloneExternals.get(tgt) ?? 0) + 1); }
  }
  // zero the leftover of the target blob so no dangling sub-structure remains
  const leftover = blobEnd - (target + blockLen);
  out.fill(0, target + blockLen, blobEnd);
  // edits on the clone (offsets relative to the block start)
  for (const ed of edits) {
    const [width, write] = TYPES[ed.type] ?? [];
    if (!write) throw new Error(`unsupported edit type ${ed.type}`);
    if (ed.offset + width > blockLen) throw new Error(`edit +0x${ed.offset.toString(16)} outside the block`);
    const old_hex = out.subarray(target + ed.offset, target + ed.offset + width).toString('hex');
    write(out, target + ed.offset, ed.value);
    changes.push({ field: '+0x' + ed.offset.toString(16), type: ed.type, old_hex, new_hex: out.subarray(target + ed.offset, target + ed.offset + width).toString('hex') });
  }
  // refcounts: only INCREMENT the shared externals the clone points at (one owning reference added). The
  // sacrificed record's outgoing references are left counted: an over-count merely delays a free, whereas
  // decrementing risks dropping a still-live object to 0 (dangling). Targets inside the zeroed leftover
  // are skipped (they are being removed with the blob).
  const refcountUpdates = [];
  if (bumpRefcounts) for (const [t, n] of cloneExternals) {
    if (t >= target && t < blobEnd) continue;                              // inside the overwritten blob
    const rc = out.readUInt32BE(t + 4);
    if (rc >= 1 && rc <= 200000) { out.writeUInt32BE(rc + n, t + 4); refcountUpdates.push({ location: t + 4, field: 'refcount', old: rc, new: rc + n }); }
    else failures.push({ stage: 'reference', reason: `shared target 0x${t.toString(16)} refcount ${rc} implausible`, offset: t });
  }
  // validation: same length, only [target,blobEnd) and refcount words changed, clone owner recognised
  if (out.length !== buf.length) failures.push({ stage: 'validation', reason: 'file length changed' });
  const rcLocs = new Set(refcountUpdates.map(u => u.location));
  for (let p = 0; p + 4 <= buf.length; p += 4) { if (p >= target && p < blobEnd) continue; if (rcLocs.has(p)) continue; if (buf.readUInt32BE(p) !== out.readUInt32BE(p)) { failures.push({ stage: 'validation', reason: `byte change outside the target blob at 0x${p.toString(16)}` }); break; } }
  let after = null;
  try {
    after = buildGraph(out, { fields: false });
    const clone = after.objects.find(o => o.offset === target);
    if (!clone || clone.type !== source.type) failures.push({ stage: 'validation', reason: 'clone owner not recognised at the target', offset: target });
    // the block's embedded children (every original object after `source` within [start,end)) must
    // reappear at the same relative offsets inside the overwritten target
    const childRels = graph.objects.filter(o => o.offset > start && o.offset < end).map(o => o.offset - start);
    for (const rel of childRels) { const child = after.objects.find(o => o.offset === target + rel); if (!child) failures.push({ stage: 'validation', reason: `clone child at +0x${rel.toString(16)} not recognised`, offset: target + rel }); }
    if (after.issues.length) failures.push(...after.issues.map(i => ({ stage: 'validation', reason: i.reason, offset: i.offset })));
    if (after.sections.at(-1).offset + after.sections.at(-1).size !== out.length) failures.push({ stage: 'validation', reason: 'sections do not end at EOF' });
  } catch (e) { failures.push({ stage: 'validation', reason: e.message }); }
  const plan = {
    source: { object_offset: start, type_name: source.type_name, finding_id: findingId, block_end: end, block_bytes: blockLen },
    changes, insert_at: target, updates: refcountUpdates, new_id: source.id,
    validation: { status: failures.length ? 'INVALID' : 'VALID', failures },
    mode: 'overwrite', target: { offset: target, type_name: tgtObj.type_name, blob_bytes: blobEnd - target, leftover_zeroed: leftover },
    pointers: { internal, external }, refcounts: refcountUpdates, findings: [findingId, ...extraFindings],
    method: 'in-place registration (overwrite a same-type table record; no table growth, no shift, file length unchanged)',
  };
  const v = schemaValidator('duplication-plan.schema.json', contracts002);
  const { source: { block_end, block_bytes, ...src }, mode, target: _t, pointers, refcounts, findings, method, ...rest } = plan;
  plan.schema_valid = v({ ...rest, source: src }); plan.schema_errors = v.errors ?? null;
  return { plan, buffer: out, graph_after: after ? { objects: after.objects.length, accounting: after.accounting } : null };
}

export function writeReachablePlan(result, { outFile, planFile }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result.buffer);
  if (planFile) fs.writeFileSync(planFile, JSON.stringify({ ...result.plan, output: path.resolve(outFile), graph_after: result.graph_after }, null, 2));
  return { outFile: path.resolve(outFile), planFile: planFile ? path.resolve(planFile) : null };
}
