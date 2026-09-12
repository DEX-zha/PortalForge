// Object enumeration by header pattern (research.md R1): {u32 type < typeCount, u32 1, u32 0x01xxxxxx}
// at 4-byte alignment inside the object section. Each object is bounded by the next header or the
// section end; bytes before the first header and any known trailing data are reported as unparsed.
export function findObjectSection(buf, header, typeCount) {
  let best = null;
  for (const s of header.sections) {
    let hits = 0;
    const end = s.offset + s.size;
    for (let p = s.offset; p + 12 <= end; p += 4) if (isHeader(buf, p, typeCount)) hits++;
    if (!best || hits > best.hits) best = { section: s, hits };
  }
  return best;
}

export function isHeader(buf, p, typeCount) {
  return buf.readUInt32BE(p) < typeCount && buf.readUInt32BE(p + 4) === 1 && (buf[p + 8] === 1);
}

export function enumerateObjects(buf, header, types) {
  const typeCount = types.names.length;
  const pick = findObjectSection(buf, header, typeCount);
  if (!pick) return { section: null, objects: [], unparsed: [] };
  const s = pick.section, end = s.offset + s.size;
  const heads = [];
  for (let p = s.offset; p + 12 <= end; p += 4) if (isHeader(buf, p, typeCount)) heads.push(p);
  const objects = heads.map((p, i) => ({ offset: p, size: (i + 1 < heads.length ? heads[i + 1] : end) - p, type: buf.readUInt32BE(p), type_name: types.names[buf.readUInt32BE(p)] ?? '', id: buf.readUInt32BE(p + 8) }));
  const unparsed = [];
  if (heads.length && heads[0] > s.offset) unparsed.push({ offset: s.offset, size: heads[0] - s.offset, note: 'section header and lists before the first object' });
  if (!heads.length) unparsed.push({ offset: s.offset, size: s.size, note: 'no object header found' });
  return { section: s, objects, unparsed };
}
