// Generic binary diff for comparative analysis (source description section 25, research.md R11):
// contiguous differing runs with old/new bytes and surrounding context; no format assumptions.
export function bindiff(a, b, { context = 16, limit = 1000, hexLimit = 64 } = {}) {
  const min = Math.min(a.length, b.length);
  const runs = [];
  let i = 0;
  while (i < min) {
    if (a[i] === b[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < min && a[j] !== b[j]) j++;
    runs.push({ offset: i, length: j - i });
    i = j;
  }
  if (a.length !== b.length) runs.push({ offset: min, length: Math.max(a.length, b.length) - min, size_change: true });
  const rows = runs.slice(0, limit).map(r => {
    const s = Math.max(0, r.offset - context),
      e = Math.min(Math.max(a.length, b.length), r.offset + r.length + context);
    return {
      ...r,
      old_hex: a.subarray(r.offset, Math.min(r.offset + r.length, r.offset + hexLimit, a.length)).toString('hex'),
      new_hex: b.subarray(r.offset, Math.min(r.offset + r.length, r.offset + hexLimit, b.length)).toString('hex'),
      context_before: a.subarray(s, r.offset).toString('hex'),
      context_after: a.subarray(r.offset + r.length, e).toString('hex'),
      old_f32be: r.length === 4 && r.offset + 4 <= a.length ? a.readFloatBE(r.offset) : undefined,
      new_f32be: r.length === 4 && r.offset + 4 <= b.length ? b.readFloatBE(r.offset) : undefined,
    };
  });
  return {
    runs: runs.length,
    differing_bytes: runs.reduce((n, r) => n + r.length, 0),
    size_delta: b.length - a.length,
    rows,
  };
}
