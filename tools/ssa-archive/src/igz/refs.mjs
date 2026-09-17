// Reverse references (spec 002 T031): every word in every section whose value resolves to the target
// object under one of the pointer conventions seen in these files:
//   objrel  : value == target - objectSection.offset        (plain section-relative offset)
//   abs     : value == target                                (absolute file offset)
//   flagged : value & 0x80000000 and (value & 0x7fffffff) == target - objectSection.offset
//   low24   : (value & 0xffffff) == (target - objectSection.offset) and value >>> 24 != 0
//   secrel:N: value == target - sections[N].offset for another section N
export function reverseReferences(
  buf,
  graph,
  targetOffset,
  { conventions = ['objrel', 'abs', 'flagged', 'low24', 'secrel'] } = {},
) {
  const objSec = graph.sections[graph.object_section];
  const rel = targetOffset - objSec.offset;
  const owners = new Map(graph.objects.map(o => [o.offset, o]));
  const sortedOffsets = graph.objects.map(o => o.offset);
  const ownerOf = p => {
    let lo = 0,
      hi = sortedOffsets.length - 1,
      best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedOffsets[mid] <= p) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (best < 0) return null;
    const o = owners.get(sortedOffsets[best]);
    return p < o.offset + o.size ? o : null;
  };
  const hits = [];
  for (const s of graph.sections) {
    const end = s.offset + s.size;
    for (let p = s.offset; p + 4 <= end; p += 4) {
      const v = buf.readUInt32BE(p);
      let conv = null;
      if (conventions.includes('objrel') && v === rel && rel !== 0) conv = 'objrel';
      else if (conventions.includes('abs') && v === targetOffset) conv = 'abs';
      else if (conventions.includes('flagged') && v & 0x80000000 && (v & 0x7fffffff) === rel) conv = 'flagged';
      else if (
        conventions.includes('low24') &&
        v >>> 24 !== 0 &&
        (v & 0xffffff) === (rel & 0xffffff) &&
        rel < 0x1000000
      )
        conv = 'low24';
      else if (conventions.includes('secrel') && s.index !== graph.object_section && v === targetOffset - s.offset)
        conv = `secrel:${s.index}`;
      if (!conv) continue;
      const o = s.index === graph.object_section ? ownerOf(p) : null;
      hits.push({
        file_offset: p,
        section: s.index,
        convention: conv,
        value: v,
        referrer: o ? { offset: o.offset, type_name: o.type_name, id: o.id, field: p - o.offset } : null,
      });
    }
  }
  return hits;
}

// Field decoding and reference resolution (research.md R3, R4).
//   string_ref : u32 v != 0 such that stringSection.offset + v starts a printable NUL-terminated string
//   object_ref : u32 v such that objectSection.offset + v is an object header
//   flagged_ref: u32 with bit 31 set (meaning UNKNOWN, low 24 bits kept)
//   f32        : finite big-endian float with a sane magnitude
export function makeResolver(buf, header, objectSection, objects) {
  const strSec = header.sections.find(s => s.align === 2) ?? header.sections[2] ?? null;
  const strStart = strSec ? strSec.offset : -1,
    strEnd = strSec ? strSec.offset + strSec.size : -1;
  const objByOffset = new Map(objects.map(o => [o.offset, o]));
  const isStringStart = p => p > strStart && p < strEnd && buf[p - 1] === 0 && buf[p] >= 0x21 && buf[p] <= 0x7e;
  const readString = p => {
    const e = buf.indexOf(0, p);
    return buf.toString('latin1', p, e < 0 ? Math.min(p + 200, strEnd) : Math.min(e, p + 200));
  };
  return {
    string_section: strSec,
    decodeField(p) {
      const v = buf.readUInt32BE(p);
      if (v !== 0 && strSec && isStringStart(strStart + v))
        return { offset: p, kind: 'string_ref', value: v, target: readString(strStart + v) };
      if (v & 0x80000000) return { offset: p, kind: 'flagged_ref', value: v, target: { low24: v & 0xffffff } };
      const o = objectSection ? objByOffset.get(objectSection.offset + v) : null;
      if (v !== 0 && o)
        return { offset: p, kind: 'object_ref', value: v, target: { offset: o.offset, type_name: o.type_name } };
      const f = buf.readFloatBE(p);
      if (
        Number.isFinite(f) &&
        f !== 0 &&
        Math.abs(f) >= 1e-4 &&
        Math.abs(f) <= 1e6 &&
        v >>> 24 >= 0x30 &&
        v >>> 24 <= 0xcf
      )
        return { offset: p, kind: 'f32', value: Math.round(f * 10000) / 10000 };
      return { offset: p, kind: v === 0 ? 'unknown' : 'u32', value: v };
    },
    decodeObject(o, { limit = 256 } = {}) {
      const fields = [];
      for (let q = 12; q < o.size && fields.length < limit; q += 4) fields.push(this.decodeField(o.offset + q));
      return fields;
    },
  };
}
