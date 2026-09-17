// Research scanners (FR-010): plausible scalars and grouped numeric values in both byte orders,
// plus printable-string runs to locate object type names. Read-only; no format assumptions.

const readers = {
  f32le: (b, o) => b.readFloatLE(o),
  f32be: (b, o) => b.readFloatBE(o),
  f64le: (b, o) => b.readDoubleLE(o),
  f64be: (b, o) => b.readDoubleBE(o),
};

// Plausibility of one float: finite, not denormal, within [min,max] by magnitude when non-zero.
function plausible(v, min, max) {
  if (!Number.isFinite(v)) return 0;
  if (v === 0) return 0.5;
  const a = Math.abs(v);
  if (a < 1e-6 || a > 1e12) return 0;
  if (a < Math.abs(min) && min > 0) return 0.2;
  if (a > Math.abs(max)) return 0;
  // Values with few significant digits look authored (e.g. 100, 12.5); noisy mantissas score lower.
  const rounded = Math.round(v * 1000) / 1000;
  return Math.abs(rounded - v) < 1e-6 ? 1 : 0.7;
}

// options: {min, max, vector (1|2|3|4|16), endian ('le'|'be'|'both'), width (32|64), step, limit}
export function scanFloats(
  buf,
  { min = -100000, max = 100000, vector = 1, endian = 'both', width = 32, step = 4, limit = 500 } = {},
) {
  if (![1, 2, 3, 4, 16].includes(vector)) throw new Error('vector must be 1, 2, 3, 4 or 16');
  const size = width / 8;
  const endians = endian === 'both' ? ['le', 'be'] : [endian];
  const rows = [];
  for (const en of endians) {
    const read = readers[`f${width}${en}`];
    for (let o = 0; o + size * vector <= buf.length; o += step) {
      const values = [];
      let score = 0;
      let nonZero = 0;
      for (let i = 0; i < vector; i++) {
        const v = read(buf, o + i * size);
        values.push(v);
        const p = plausible(v, min, max);
        if (p === 0) {
          score = -1;
          break;
        }
        score += p;
        if (v !== 0) nonZero++;
      }
      if (score < 0 || nonZero === 0) continue;
      if (vector === 16) {
        // homogeneous matrix bonus: last column or last row close to (0,0,0,1)
        const col = [values[3], values[7], values[11], values[15]],
          row = values.slice(12);
        const near = arr =>
          Math.abs(arr[0]) < 1e-3 && Math.abs(arr[1]) < 1e-3 && Math.abs(arr[2]) < 1e-3 && Math.abs(arr[3] - 1) < 1e-3;
        if (near(col) || near(row)) score += 8;
        else continue;
      }
      if (vector >= 2 && values.every(v => v === values[0])) score *= 0.5;
      rows.push({
        offset: o,
        endian: en,
        values: values.map(v => Math.round(v * 10000) / 10000),
        score: Math.round((score / vector) * 100) / 100,
      });
    }
  }
  rows.sort((a, b) => b.score - a.score || a.offset - b.offset);
  return { total: rows.length, rows: rows.slice(0, limit) };
}

export function scanStrings(buf, { min = 6, limit = 2000, pattern = null } = {}) {
  const re = pattern ? new RegExp(pattern) : null;
  const rows = [];
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const c = i < buf.length ? buf[i] : 0;
    const printable = c >= 0x20 && c <= 0x7e;
    if (printable && start === -1) start = i;
    if (!printable && start !== -1) {
      if (i - start >= min) {
        const text = buf.toString('latin1', start, i);
        if (!re || re.test(text)) rows.push({ offset: start, length: i - start, text });
      }
      start = -1;
    }
  }
  return { total: rows.length, rows: rows.slice(0, limit) };
}

// Histogram of string runs that look like identifiers (igXxx, CamelCase), useful to catalogue IGZ object types.
export function identifierHistogram(buf, { min = 4 } = {}) {
  const counts = new Map();
  for (const r of scanStrings(buf, { min, limit: Infinity }).rows) {
    for (const tok of r.text.split(/[^A-Za-z0-9_]+/))
      if (/^[A-Za-z_][A-Za-z0-9_]{3,}$/.test(tok)) counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token, count]) => ({ token, count }));
}
