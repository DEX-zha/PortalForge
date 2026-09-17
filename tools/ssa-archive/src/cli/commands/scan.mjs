// `scan <kind>` and `bindiff`: format-agnostic searches over a raw file, used to find candidate values
// before anything is known about the structure that holds them.
import fs from 'node:fs';
import path from 'node:path';
import { need } from '../errors.mjs';
import { pickSubcommand } from '../dispatch.mjs';

const hexOffset = offset => `0x${offset.toString(16).padStart(8, '0')}`;

function scanFloats({ S, buf, file, limit }, o) {
  // --range "min,max" or --range="-50000 50000" (a leading dash needs the = form)
  const [min, max] = String(o.range ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  const r = S.scanFloats(buf, {
    min: Number.isFinite(min) ? min : undefined,
    max: Number.isFinite(max) ? max : undefined,
    vector: o.vector ? Number(o.vector) : 1,
    endian: o.endian ?? 'both',
    limit,
  });
  return {
    result: { file, ...r },
    text:
      `${r.total} candidate(s), showing ${r.rows.length}\n` +
      r.rows.map(x => `${hexOffset(x.offset)} ${x.endian} score=${x.score} [${x.values.join(', ')}]`).join('\n'),
  };
}

function scanStrings({ S, buf, file, limit }, o) {
  const r = S.scanStrings(buf, { min: o.min ? Number(o.min) : 6, limit, pattern: o.filter ?? null });
  return { result: { file, ...r }, text: r.rows.map(x => `${hexOffset(x.offset)} ${x.text}`).join('\n') };
}

function scanIdentifiers({ S, buf, file, limit }, o) {
  const rows = S.identifierHistogram(buf, { min: o.min ? Number(o.min) : 4 }).slice(0, limit ?? 200);
  return { result: { file, rows }, text: rows.map(x => `${String(x.count).padStart(6)} ${x.token}`).join('\n') };
}

const SCAN_KINDS = { floats: scanFloats, strings: scanStrings, identifiers: scanIdentifiers };

export async function scan(pos, o) {
  const S = await import('../../research/scan.mjs');
  const kind = need(pos[0], 'scan kind (floats|strings|identifiers)');
  const file = path.resolve(need(pos[1], 'file'));
  const buf = fs.readFileSync(file);
  const limit = o.limit ? Number(o.limit) : undefined;
  return pickSubcommand(SCAN_KINDS, kind, name => `Unknown scan kind ${name}`)({ S, buf, file, limit }, o);
}

export async function bindiff(pos, o) {
  const { bindiff: run } = await import('../../research/bindiff.mjs');
  const a = fs.readFileSync(path.resolve(need(pos[0], 'a')));
  const b = fs.readFileSync(path.resolve(need(pos[1], 'b')));
  const d = run(a, b, { context: o.context ? Number(o.context) : 16, limit: o.limit ? Number(o.limit) : 1000 });
  const row = r =>
    `${hexOffset(r.offset)} len=${r.length} old=${r.old_hex} new=${r.new_hex}${r.old_f32be !== undefined ? ` f32be ${r.old_f32be} -> ${r.new_f32be}` : ''}`;
  return {
    result: d,
    text:
      `${d.runs} run(s), ${d.differing_bytes} differing byte(s), size_delta=${d.size_delta}\n` +
      d.rows.slice(0, 200).map(row).join('\n'),
  };
}
