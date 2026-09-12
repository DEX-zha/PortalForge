// Original versus rebuilt comparison (FR-007, SC-003). Every differing byte is attributed to a
// layout region of the archive it belongs to: METADATA, TABLE, CONTENT or PADDING.
import { parseArchive, classifyOffset } from './reader.mjs';

const slice = (buf, s, e, limit) => buf.subarray(s, Math.min(e, s + limit, buf.length)).toString('hex');

export function diffArchives(original, rebuilt, { hexLimit = 64 } = {}) {
  const regionsO = parseArchive(original).regions;
  const regionsR = parseArchive(rebuilt).regions;
  const min = Math.min(original.length, rebuilt.length);
  const runs = [];
  let i = 0;
  while (i < min) {
    if (original[i] === rebuilt[i]) { i++; continue; }
    let j = i; while (j < min && original[j] !== rebuilt[j]) j++;
    runs.push([i, j]); i = j;
  }
  if (original.length !== rebuilt.length) runs.push([min, Math.max(original.length, rebuilt.length)]);
  const regions = [];
  let unclassified = 0;
  for (const [s, e] of runs) {
    let o = s;
    while (o < e) {
      const regs = o < original.length ? regionsO : regionsR;
      const r = classifyOffset(regs, o);
      const end = r ? Math.min(e, r.offset + r.length) : e;
      if (!r) unclassified += end - o;
      regions.push({ offset: o, length: end - o, class: r ? r.class : 'UNCLASSIFIED', label: r?.label ?? null,
        old_hex: slice(original, o, end, hexLimit), new_hex: slice(rebuilt, o, end, hexLimit), truncated: end - o > hexLimit });
      o = end;
    }
  }
  return { regions, size_delta: rebuilt.length - original.length, unclassified_bytes: unclassified,
    summary: regions.reduce((acc, r) => { acc[r.class] = (acc[r.class] ?? 0) + r.length; return acc; }, {}) };
}
