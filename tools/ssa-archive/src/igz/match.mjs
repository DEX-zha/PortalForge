// Live RAM address or byte pattern -> owning object and field (spec 002 FR-004).
// Section 1 of the tutorial level.bld is resident in MEM1 at file_offset + 0x80DBC020
// (finding level.bld.resident-in-mem1, LIKELY); the base is configurable per level/session.
export const DEFAULT_SECTION_BASE = 0x80dbc020;

export function owner(graph, fileOffset) {
  let prev = null;
  for (const o of graph.objects) {
    if (o.offset <= fileOffset) prev = o;
    else break;
  }
  if (!prev || fileOffset >= prev.offset + prev.size) return null;
  return {
    object: { offset: prev.offset, type_name: prev.type_name, id: prev.id, size: prev.size },
    field: fileOffset - prev.offset,
  };
}

export function matchAddress(graph, address, { base = DEFAULT_SECTION_BASE } = {}) {
  const fileOffset = address - base;
  return {
    address: '0x' + address.toString(16),
    base: '0x' + base.toString(16),
    file_offset: fileOffset,
    ...(owner(graph, fileOffset) ?? { object: null, field: null }),
  };
}

export function matchPattern(buf, graph, hex) {
  const needle = Buffer.from(hex, 'hex');
  const hits = [];
  let o = buf.indexOf(needle);
  while (o !== -1 && hits.length < 50) {
    hits.push({ file_offset: o, ...(owner(graph, o) ?? { object: null, field: null }) });
    o = buf.indexOf(needle, o + 1);
  }
  return { pattern: hex, hits };
}
