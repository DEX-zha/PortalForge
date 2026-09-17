// Type-name table and per-type size hints of an IGZ v5 file (research.md R2).
// Names are NUL-terminated strings starting right after the 13-word second header of section 0.
// The table is stored in blocks: a block of names, then a 12-byte record {u32, u32 next_block_offset,
// u32} (the first block length 0x248 is also word 11 of the second header), then more names. Splitting
// the whole range on NUL therefore yields some empty or garbage entries; that numbering is kept because
// the object type indexes observed in the file (and the M2-confirmed tfbPhysicsModel record) follow it
// (LIKELY). The table ends at the first 4-aligned position whose next 64 bytes contain no letter but at
// least one non-zero byte: the u32 size table.
export function parseTypes(buf, header) {
  const s0 = header.sections?.[0];
  if (!s0 || !header.second_header)
    return {
      names: [],
      sizes: [],
      names_offset: null,
      sizes_offset: null,
      issues: [
        {
          offset: 0,
          field: 'types',
          actual: 'missing section 0',
          expected: 'section 0 with second header',
          reason: 'TYPE_TABLE_MISSING',
        },
      ],
    };
  const start = s0.offset + 0x34,
    limit = s0.offset + s0.size;
  const names = [];
  let p = start;
  const isLetter = c => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
  // The u32 table is recognised by a run of small words; a 12-byte block record is followed by
  // name bytes, which read as huge words.
  const sizesStart = q => {
    if (q % 4 !== 0 || q + 16 > limit) return false;
    const n = Math.min(8, Math.floor((limit - q) / 4));
    if (n < 4) return false;
    let nonZero = false;
    for (let i = 0; i < n; i++) {
      const w = buf.readUInt32BE(q + 4 * i);
      if (w >= 0x100000) return false;
      if (w) nonZero = true;
    }
    return nonZero;
  };
  void isLetter;
  while (p < limit) {
    if (sizesStart(p)) break;
    const e = buf.indexOf(0, p);
    if (e < 0 || e >= limit) break;
    names.push(buf.toString('latin1', p, e));
    p = e + 1;
  }
  // Trim trailing empty names created by alignment padding before the size table.
  const sizesOffset = Math.ceil(p / 4) * 4;
  while (names.length && names[names.length - 1] === '' && p > start && sizesOffset - p < 4) {
    break;
  }
  const sizes = [];
  for (let i = 0; i < names.length && sizesOffset + 4 * i + 4 <= limit; i++)
    sizes.push(buf.readUInt32BE(sizesOffset + 4 * i));
  return { names, sizes, names_offset: start, sizes_offset: sizesOffset, issues: [] };
}

export function typeRows(types) {
  const printable = /^[\x20-\x7e]*$/;
  return types.names.map((name, index) => ({
    index,
    name: printable.test(name) ? name : '',
    size_hint: types.sizes[index] ?? null,
    size_confidence: 'UNKNOWN',
    block_record: !printable.test(name) || name === '',
  }));
}
