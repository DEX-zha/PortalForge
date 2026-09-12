// Field decoding and reference resolution (research.md R3, R4).
//   string_ref : u32 v != 0 such that stringSection.offset + v starts a printable NUL-terminated string
//   object_ref : u32 v such that objectSection.offset + v is an object header
//   flagged_ref: u32 with bit 31 set (meaning UNKNOWN, low 24 bits kept)
//   f32        : finite big-endian float with a sane magnitude
export function makeResolver(buf, header, objectSection, objects) {
  const strSec = header.sections.find(s => s.align === 2) ?? header.sections[2] ?? null;
  const strStart = strSec ? strSec.offset : -1, strEnd = strSec ? strSec.offset + strSec.size : -1;
  const objByOffset = new Map(objects.map(o => [o.offset, o]));
  const isStringStart = p => p > strStart && p < strEnd && buf[p - 1] === 0 && buf[p] >= 0x21 && buf[p] <= 0x7e;
  const readString = p => { const e = buf.indexOf(0, p); return buf.toString('latin1', p, e < 0 ? Math.min(p + 200, strEnd) : Math.min(e, p + 200)); };
  return {
    string_section: strSec,
    decodeField(p) {
      const v = buf.readUInt32BE(p);
      if (v !== 0 && strSec && isStringStart(strStart + v)) return { offset: p, kind: 'string_ref', value: v, target: readString(strStart + v) };
      if (v & 0x80000000) return { offset: p, kind: 'flagged_ref', value: v, target: { low24: v & 0xffffff } };
      const o = objectSection ? objByOffset.get(objectSection.offset + v) : null;
      if (v !== 0 && o) return { offset: p, kind: 'object_ref', value: v, target: { offset: o.offset, type_name: o.type_name } };
      const f = buf.readFloatBE(p);
      if (Number.isFinite(f) && f !== 0 && Math.abs(f) >= 1e-4 && Math.abs(f) <= 1e6 && (v >>> 24) >= 0x30 && (v >>> 24) <= 0xcf) return { offset: p, kind: 'f32', value: Math.round(f * 10000) / 10000 };
      return { offset: p, kind: v === 0 ? 'unknown' : 'u32', value: v };
    },
    decodeObject(o, { limit = 256 } = {}) {
      const fields = [];
      for (let q = 12; q < o.size && fields.length < limit; q += 4) fields.push(this.decodeField(o.offset + q));
      return fields;
    },
  };
}
