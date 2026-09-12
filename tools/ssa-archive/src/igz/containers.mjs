// Container decoding (spec 002 T032): list-like objects hold {count, capacity, element pointer} and an
// element array of object-section-relative offsets. Detection is data-driven, not name-driven: inside an
// object, a pair of u32 with count <= capacity <= 200000 followed within 4 words by a pointer (plain or
// flagged section-relative) to an array whose first `count` words mostly resolve to object headers.
// Arrays of object offsets embedded directly in an object body are reported as inline lists.
import { reverseReferences } from './refs.mjs';

export function decodeContainers(buf, graph, { minMembers = 1, minResolved = 0.5 } = {}) {
  const objSec = graph.sections[graph.object_section];
  const secEnd = objSec.offset + objSec.size;
  const headers = new Set(graph.objects.map(o => o.offset));
  const isMemberWord = v => v !== 0 && v < objSec.size && headers.has(objSec.offset + v);
  const containers = [];
  for (const o of graph.objects) {
    // (a) count/capacity/pointer triples
    for (let q = 12; q + 12 <= o.size; q += 4) {
      const count = buf.readUInt32BE(o.offset + q), cap = buf.readUInt32BE(o.offset + q + 4);
      if (count < minMembers || cap < count || cap > 200000) continue;
      for (let k = 8; k <= 16 && q + k + 4 <= o.size; k += 4) {
        const ptr = buf.readUInt32BE(o.offset + q + k);
        const relPtr = ptr & 0x7fffffff;
        const arr = objSec.offset + relPtr;
        if (relPtr === 0 || arr + 4 * count > secEnd) continue;
        let resolved = 0; const members = [];
        for (let i = 0; i < count; i++) { const v = buf.readUInt32BE(arr + 4 * i); if (isMemberWord(v)) { resolved++; members.push(objSec.offset + v); } else if (v === 0xffffffff) members.push(null); else members.push(undefined); }
        if (resolved / count >= minResolved) { containers.push({ container: { offset: o.offset, type_name: o.type_name, id: o.id }, kind: 'pointer_list', count_field: q, count, capacity: cap, pointer_field: q + k, pointer: ptr, array_offset: arr, resolved, members }); break; }
      }
    }
    // (b) inline arrays of >= 3 consecutive member offsets
    let run = [], runStart = 0;
    for (let q = 12; q + 4 <= o.size; q += 4) {
      const v = buf.readUInt32BE(o.offset + q);
      if (isMemberWord(v)) { if (!run.length) runStart = q; run.push(objSec.offset + v); }
      else { if (run.length >= 3) containers.push({ container: { offset: o.offset, type_name: o.type_name, id: o.id }, kind: 'inline_array', array_field: runStart, count: run.length, members: run }); run = []; }
    }
    if (run.length >= 3) containers.push({ container: { offset: o.offset, type_name: o.type_name, id: o.id }, kind: 'inline_array', array_field: runStart, count: run.length, members: run });
  }
  return containers;
}

export function containersOf(buf, graph, targetOffset, opts = {}) {
  return decodeContainers(buf, graph, opts).filter(c => c.members.includes(targetOffset));
}

// Owner chain: referrers of the target, then referrers of those, up to `depth` levels.
export function ownerChain(buf, graph, targetOffset, { depth = 3 } = {}) {
  const levels = []; let frontier = [targetOffset]; const seen = new Set([targetOffset]);
  for (let d = 0; d < depth && frontier.length; d++) {
    const level = [];
    for (const t of frontier) {
      for (const h of reverseReferences(buf, graph, t)) { level.push({ target: t, ...h }); if (h.referrer && !seen.has(h.referrer.offset)) { seen.add(h.referrer.offset); } }
    }
    levels.push(level);
    frontier = [...new Set(level.filter(h => h.referrer).map(h => h.referrer.offset))].slice(0, 20);
  }
  return levels;
}
