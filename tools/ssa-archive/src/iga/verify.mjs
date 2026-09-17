// Structural validation (FR-005, FR-006). Every failure carries offset, field, actual, expected, reason.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArchive } from './reader.mjs';
import { readManifest, validateManifest } from '../workspace/manifest.mjs';

const UNSUPPORTED = new Set(['UNSUPPORTED_VERSION', 'UNSUPPORTED_MODE']);

function reportFrom(failures) {
  let status = 'VALID';
  if (failures.length) status = failures.every(f => UNSUPPORTED.has(f.reason)) ? 'UNSUPPORTED' : 'INVALID';
  if (
    failures.some(f => UNSUPPORTED.has(f.reason)) &&
    status === 'INVALID' &&
    failures.every(f => UNSUPPORTED.has(f.reason) || f.reason === 'BAD_MAGIC')
  )
    status = 'UNSUPPORTED';
  return { status, failures };
}

export function verifyBuffer(buf) {
  const parsed = parseArchive(buf);
  return { ...reportFrom(parsed.issues), parsed };
}

function verifyFile(file) {
  const buf = fs.readFileSync(file);
  const r = verifyBuffer(buf);
  return { file: path.resolve(file), size: buf.length, ...r };
}

// Workspace verification: manifest schema, then every non-replaced entry file must still hash to
// data_sha256 (data-model ExtractedWorkspace rule).
export function verifyWorkspace(dir) {
  const failures = [];
  let manifest;
  try {
    manifest = readManifest(dir);
  } catch (e) {
    return {
      dir,
      ...reportFrom([
        {
          offset: 0,
          field: 'manifest.json',
          actual: e.message,
          expected: 'readable JSON manifest',
          reason: 'WORKSPACE_ENTRY_HASH_MISMATCH',
        },
      ]),
    };
  }
  const schema = validateManifest(manifest);
  if (!schema.valid)
    failures.push(
      ...schema.errors.map(err => ({
        offset: 0,
        field: 'manifest' + err.instancePath,
        actual: JSON.stringify(err.params),
        expected: err.message,
        reason: 'WORKSPACE_ENTRY_HASH_MISMATCH',
      })),
    );
  for (const e of manifest.entries ?? []) {
    const file = path.join(dir, e.file);
    if (!fs.existsSync(file)) {
      failures.push({
        offset: e.start,
        field: `entries[${e.index}].file`,
        actual: 'missing',
        expected: e.file,
        reason: 'WORKSPACE_ENTRY_HASH_MISMATCH',
      });
      continue;
    }
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!e.replaced && actual !== e.data_sha256)
      failures.push({
        offset: e.start,
        field: `entries[${e.index}].data_sha256`,
        actual,
        expected: e.data_sha256,
        reason: 'WORKSPACE_ENTRY_HASH_MISMATCH',
      });
  }
  return { dir: path.resolve(dir), ...reportFrom(failures) };
}

export function verifyPath(target) {
  const p = path.resolve(target);
  if (fs.statSync(p).isDirectory()) return verifyWorkspace(p);
  return verifyFile(p);
}
