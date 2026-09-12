// Extracted workspace: entries/<index>-<basename> files plus manifest.json validated against the
// contract schema (specs/001-ssa-level-research/contracts/workspace-manifest.schema.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';   // contracts use JSON Schema draft 2020-12
import addFormats from 'ajv-formats';
import { parseArchive, entryStoredBytes } from '../iga/reader.mjs';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../../../..');
export const contracts = path.join(root, 'specs/001-ssa-level-research/contracts');
export const TOOL_VERSION = 'portalforge-ssa-archive/0.1.0';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map();
export const contracts002 = path.join(root, 'specs/002-igz-entity-model/contracts');
export function schemaValidator(name, dir = contracts) {
  const key = path.join(dir, name);
  if (!validators.has(key)) validators.set(key, ajv.compile(JSON.parse(fs.readFileSync(key, 'utf8'))));
  return validators.get(key);
}
export function validateManifest(manifest) {
  const v = schemaValidator('workspace-manifest.schema.json');
  return { valid: v(manifest), errors: v.errors ?? [] };
}

const sha256 = b => createHash('sha256').update(b).digest('hex');
const safeName = name => path.basename(name.replace(/\\/g, '/')).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'entry';

// Non-zero bytes outside every known region are captured so a rebuild can reproduce them.
function rawGaps(buf, regions) {
  const gaps = [];
  for (const r of regions) {
    if (r.class !== 'PADDING') continue;
    const slice = buf.subarray(r.offset, r.offset + r.length);
    if (slice.some(b => b !== 0)) gaps.push({ offset: r.offset, hex: slice.toString('hex') });
  }
  return gaps;
}

export function extractToWorkspace(buf, { discPath, sourceFile, outDir }) {
  const parsed = parseArchive(buf);
  if (parsed.issues.length) {
    const err = new Error('Archive is not VALID; run verify first');
    err.failures = parsed.issues; throw err;
  }
  fs.mkdirSync(path.join(outDir, 'entries'), { recursive: true });
  const entries = parsed.entries.map(e => {
    const file = path.posix.join('entries', `${e.index}-${safeName(e.name)}`);
    fs.writeFileSync(path.join(outDir, file), entryStoredBytes(buf, e));
    return { index: e.index, name: e.name, name_offset: e.name_offset, hash: e.hash, start: e.start, size: e.size, stored_size: e.stored_size,
      mode: e.mode, compression: e.compression, chunk_table_index: e.chunk_table_index, file, decoded_file: null, data_sha256: e.data_sha256, replaced: false };
  });
  const manifest = {
    tool_version: TOOL_VERSION, created_at: new Date().toISOString(),
    source: { disc_path: discPath, file: path.resolve(sourceFile), size: buf.length, sha256: sha256(buf) },
    header_words: parsed.header.header_words, hashes: parsed.hashes, entries,
    chunk_tables: parsed.chunk_area ? [{ offset: parsed.chunk_area.offset, values: parsed.chunk_area.values, confidence: 'UNKNOWN', decoded: null }] : [],
    name_table: { offset: parsed.name_table.offset, size: parsed.name_table.size, tail_hex: nameTableTail(buf, parsed) },
    raw_gaps: rawGaps(buf, parsed.regions),
  };
  const check = validateManifest(manifest);
  if (!check.valid) throw new Error('Manifest does not satisfy the contract schema: ' + ajv.errorsText(check.errors));
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

// Bytes of the name table not covered by the offsets array or the strings (usually zero fill).
function nameTableTail(buf, parsed) {
  const nt = parsed.name_table, count = parsed.header.count;
  const covered = Buffer.alloc(nt.size);
  covered.fill(1, 0, 4 * count);
  for (const e of parsed.entries) covered.fill(1, e.name_offset, e.name_offset + Buffer.byteLength(e.name, 'latin1') + 1);
  let tail = '';
  for (let i = 0; i < nt.size; i++) if (!covered[i] && buf[nt.offset + i] !== 0) tail += i.toString(16) + ':' + buf[nt.offset + i].toString(16) + ';';
  return tail;
}

export function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
}
export function writeManifest(dir, manifest) {
  const check = validateManifest(manifest);
  if (!check.valid) throw new Error('Manifest does not satisfy the contract schema: ' + ajv.errorsText(check.errors));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
