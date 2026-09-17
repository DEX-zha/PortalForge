// Type-92 script records (spec 002, visible-duplication chantier). Model verified on the tutorial:
//   owner header (type 92)          +0x24 count, +0x28 capacity (== count), +0x2C 0x80000000 | count*4,
//                                   +0x30 -> own +0x34, then `count` section-1 pointers = the instruction list
//   instruction records             follow the owner contiguously and tile the blob [entry, next entry);
//                                   word +0 = opcode class (type index), word +8 = opcode text (section-2
//                                   string), remaining words = arguments (strings, floats, pointers to
//                                   variables/other instructions).
// The section-0 type names are class names of the script VM, not the meaning of the record (a "tfbSpriteInfo"
// here is a "set value" instruction), so listings show the opcode text, never the type name alone.
import { buildGraph } from './graph.mjs';

export function scriptTable(buf, graph) {
  const sec = graph.sections[graph.object_section];
  const tableEnd = sec.offset + (buf.readUInt32BE(sec.offset + 0x14) & 0x7fffffff);
  // A table word carries the same flagged high bit as any other section-1 pointer, and some levels use it:
  // Level_009_Minefield holds 0x80051E0C here. Adding it unmasked walks past the end of the file, which is how
  // this surfaced when the corpus widened from four levels to all 76 on the disc. Entries that still land
  // outside the object section after masking are dropped rather than trusted.
  const entries = [];
  for (let p = sec.offset + 0x20; p < tableEnd; p += 4) {
    const off = buf.readUInt32BE(p) & 0x7fffffff;
    if (off === 0 || off >= sec.size) continue;
    entries.push(sec.offset + off);
  }
  return [...new Set(entries)].sort((a, b) => a - b);
}

function stringAt(buf, graph, v) {
  const s2 = graph.sections[2];
  const off = v & 0xffffff;
  if (v >>> 24 !== 1 || off >= s2.size) return null;
  const p = s2.offset + off;
  const e = buf.indexOf(0, p);
  return buf.toString('latin1', p, e < 0 ? p + 80 : Math.min(e, p + 200));
}

// refcount-N records (shared variables/attributes) are missed by the graph`s refcount==1 detector: accept any
// plausible header {type<224, 1<=refcount<=64, word2 high byte 1} as a record.
const looseHeader = (buf, p) =>
  p + 12 <= buf.length &&
  buf.readUInt32BE(p) < 224 &&
  buf.readUInt32BE(p + 4) >= 1 &&
  buf.readUInt32BE(p + 4) <= 64 &&
  buf.readUInt32BE(p + 8) >>> 24 === 1;

export function decodeScript(buf, graph, fixups, recOffset) {
  const sec = graph.sections[graph.object_section];
  const sorted = scriptTable(buf, graph);
  if (!sorted.includes(recOffset))
    throw Object.assign(new Error(`0x${recOffset.toString(16)} is not a header-table record`), { exitCode: 1 });
  const end = sorted.find(e => e > recOffset) ?? sec.offset + sec.size;
  const owner = graph.objects.find(o => o.offset === recOffset);
  const type = buf.readUInt32BE(recOffset);
  const count = buf.readUInt32BE(recOffset + 0x24),
    cap = buf.readUInt32BE(recOffset + 0x28),
    sizeWord = buf.readUInt32BE(recOffset + 0x2c),
    arrPtr = buf.readUInt32BE(recOffset + 0x30);
  const arrayStart = sec.offset + (arrPtr & 0xffffff);
  const issues = [];
  if (type !== 92) issues.push(`type ${type} is not 92`);
  if (cap !== count) issues.push(`capacity ${cap} != count ${count}`);
  if (sizeWord !== (0x80000000 | (count * 4)) >>> 0)
    issues.push(`size word 0x${sizeWord.toString(16)} != 0x80000000|count*4`);
  if (arrayStart !== recOffset + 0x34) issues.push(`array pointer -> 0x${arrayStart.toString(16)}, expected own+0x34`);
  const ptrSet = new Set(fixups?.pointer_words ?? []);
  const byOff = new Map(graph.objects.map(o => [o.offset, o]));
  const instructions = [];
  for (let i = 0; i < count; i++) {
    const w = arrayStart + 4 * i;
    const v = buf.readUInt32BE(w);
    const target = sec.offset + (v & 0xffffff);
    let rec = byOff.get(target);
    const loose = !rec && looseHeader(buf, target);
    if (loose) {
      // size = distance to the next known record header (graph object or plausible header), bounded
      let nxt = target + 0x40;
      const after = graph.objects.find(o => o.offset > target);
      const bound = Math.min(after ? after.offset : sec.offset + sec.size, target + 0x2000);
      for (let p = target + 0x10; p < bound; p += 4)
        if (looseHeader(buf, p)) {
          nxt = p;
          break;
        }
      if (nxt === target + 0x40 && bound > nxt) nxt = bound;
      rec = {
        offset: target,
        type: buf.readUInt32BE(target),
        type_name: graph.types?.[buf.readUInt32BE(target)]?.name ?? null,
        size: nxt - target,
      };
    }
    const entry = {
      index: i,
      pointer_word: w,
      target,
      in_blob: target >= recOffset && target < end,
      confirmed_pointer: ptrSet.has(w),
      header: !!rec,
      shared: loose || (rec && !(target >= recOffset && target < end)),
    };
    if (rec) {
      entry.type = rec.type;
      entry.type_name = rec.type_name;
      entry.size = rec.size;
      entry.opcode = stringAt(buf, graph, buf.readUInt32BE(rec.offset + 8));
      const args = { strings: [], floats: [], triples: [], refs: [] };
      for (let q = 12; q + 4 <= rec.size; q += 4) {
        const a = buf.readUInt32BE(rec.offset + q);
        const s = stringAt(buf, graph, a);
        if (s !== null && /[A-Za-z0-9_]{2}/.test(s)) {
          args.strings.push({ at: q, text: s.slice(0, 60) });
          continue;
        }
        if (ptrSet.has(rec.offset + q)) {
          const t = sec.offset + (a & 0xffffff);
          const to = byOff.get(t);
          args.refs.push({
            at: q,
            target: t,
            kind: to ? (to.offset >= recOffset && to.offset < end ? 'instruction' : 'external') : 'inside',
            opcode: to ? stringAt(buf, graph, buf.readUInt32BE(to.offset + 8))?.slice(0, 30) : null,
          });
          continue;
        }
        const f = buf.readFloatBE(rec.offset + q);
        if (Number.isFinite(f) && Math.abs(f) > 1e-3 && Math.abs(f) < 1e5 && a >>> 24 >= 0x38 && a >>> 24 <= 0xc8)
          args.floats.push({ at: q, value: Math.round(f * 1000) / 1000 });
      }
      for (let k = 0; k + 2 < args.floats.length; k++)
        if (args.floats[k + 1].at === args.floats[k].at + 4 && args.floats[k + 2].at === args.floats[k].at + 8) {
          args.triples.push({
            at: args.floats[k].at,
            xyz: [args.floats[k].value, args.floats[k + 1].value, args.floats[k + 2].value],
          });
          k += 2;
        }
      entry.args = args;
    }
    instructions.push(entry);
  }
  // blob coverage by detected records (instructions tile the blob after the owner)
  const inside = graph.objects.filter(o => o.offset >= recOffset && o.offset < end);
  const covered = inside.reduce((n, o) => n + Math.min(o.size, end - o.offset), 0);
  return {
    record: recOffset,
    end,
    blob_bytes: end - recOffset,
    name: stringAt(buf, graph, buf.readUInt32BE(recOffset + 8)),
    owner_size: owner?.size ?? null,
    count,
    instructions,
    issues,
    coverage: { records_in_blob: inside.length, covered_bytes: covered, uncovered_bytes: end - recOffset - covered },
    all_targets_in_blob: instructions.every(e => e.in_blob),
    all_headers: instructions.every(e => e.header),
    local_headers: instructions.filter(e => e.in_blob).every(e => e.header),
    local_count: instructions.filter(e => e.in_blob).length,
    shared_count: instructions.filter(e => !e.in_blob).length,
  };
}

export function auditScripts(buf, graph, fixups) {
  const sorted = scriptTable(buf, graph);
  const scripts = sorted.filter(e => buf.readUInt32BE(e) === 92);
  const rows = scripts.map(e => {
    try {
      const d = decodeScript(buf, graph, fixups, e);
      return {
        record: e,
        name: d.name?.replace(/^.*\//, ''),
        count: d.count,
        issues: d.issues.length,
        targets_in_blob: d.all_targets_in_blob,
        headers: d.all_headers,
        uncovered: d.coverage.uncovered_bytes,
      };
    } catch (err) {
      return { record: e, error: err.message };
    }
  });
  const ok = rows.filter(r => !r.error && r.issues === 0 && r.uncovered === 0); // list entries may point at values (arguments by reference), so headers are not required
  return { scripts: scripts.length, model_ok: ok.length, rows };
}
