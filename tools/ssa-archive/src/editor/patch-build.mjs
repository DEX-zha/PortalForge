// The saved IGZ is one entry of the disc archive, never a replacement for the archive itself.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractToWorkspace } from '../workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../iga/writer.mjs';
import { reencodeEntry, decodeStoredEntry } from '../iga/decode.mjs';
import { verifyBuffer } from '../iga/verify.mjs';
import { buildPatchWorkspace, monitorSize } from '../patch/riivolution.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');

export function buildEditorPatch({ experimentId, session, replacements, original, game, outDir }) {
  const source = fs.readFileSync(original),
    edited = fs.readFileSync(replacements[0].file);
  const workspace = path.join(outDir, 'archive-workspace');
  extractToWorkspace(source, { discPath: session.archive, sourceFile: original, outDir: workspace });
  let built = rebuildFromWorkspace(workspace, {
    replacements: { [session.entry]: replacements[0].file },
    reencode: reencodeEntry,
    padUnits: 1,
  });
  if (monitorSize(built.buffer.length) === monitorSize(source.length)) {
    built = rebuildFromWorkspace(workspace, {
      replacements: { [session.entry]: replacements[0].file },
      reencode: reencodeEntry,
      padUnits: 2,
    });
  }
  const validation = verifyBuffer(built.buffer);
  if (validation.status !== 'VALID')
    throw new Error('rebuilt archive failed verification: ' + JSON.stringify(validation.failures));
  const e = validation.parsed.entries[session.entry];
  const decoded =
    e.compression === 'NONE'
      ? built.buffer.subarray(e.start, e.start + e.size)
      : decodeStoredEntry(built.buffer.subarray(e.start, e.start + e.stored_size), e, {
          values: validation.parsed.chunk_area?.values ?? [],
          word_24: built.buffer.readUInt32LE(0x24),
          word_28: built.buffer.readUInt32LE(0x28),
        });
  if (!decoded.equals(edited)) throw new Error('rebuilt archive does not contain the saved editor bytes');
  const rebuilt = path.join(workspace, 'rebuilt.bld');
  fs.writeFileSync(rebuilt, built.buffer);
  const ws = buildPatchWorkspace({
    experimentId,
    game,
    outDir,
    force: true,
    replacements: [{ disc_path: session.archive, file: rebuilt, original }],
  });
  return {
    ...ws,
    rebuilt_sha256: hash(built.buffer),
    decoded_sha256: hash(edited),
    entry_verified: true,
    original_monitor_size: monitorSize(source.length),
    entry: session.entry,
    saved_file: replacements[0].file,
  };
}
