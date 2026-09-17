// Replacement-only Riivolution patch workspace (FR-009) and Dolphin game-mod descriptor.
// The descriptor is produced by the MCP's buildDescriptor so every path uses forward slashes:
// Dolphin splits the XML path on '/' only (docs/mcp/dolphin-mcp.md, research.md R9).
import fs from 'node:fs';
import path from 'node:path';
import { buildDescriptor } from '../../../dolphin-mcp/runtime.mjs';
import { sha256File } from '../util/hash.mjs';

const xmlAttr = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const monitorSize = bytes => `${Math.floor(bytes / 1000)} kB`;

// replacements: [{disc_path, file, original?}] ; identical files (same sha256 as original) are
// skipped unless force is set (an experiment may want Dolphin to serve an identical rebuild).
//
// memory: [{offset, value}] or [{offset, bytes}] ; Riivolution memory patches, which Dolphin applies once the
// executable is loaded and before the game's first instruction (Boot.cpp, ApplyGeneralMemoryPatches). `value` is a
// short hex string written inline; `bytes` is a Buffer written to a file of the workspace and named by
// `valuefile`. Research only (feature 007, S08): the editor never adds one by itself.
export function buildPatchWorkspace({
  experimentId,
  game,
  replacements,
  outDir,
  displayName = 'PortalForge experiment',
  force = false,
  memory = [],
}) {
  if (!/^[A-Za-z0-9._-]+$/.test(experimentId)) throw new Error('experimentId must match [A-Za-z0-9._-]+');
  const out = path.resolve(outDir);
  fs.mkdirSync(path.join(out, 'riivolution'), { recursive: true });
  const included = [],
    skipped = [];
  for (const r of replacements) {
    const disc = r.disc_path.replace(/^\/+/, '');
    const src = path.resolve(r.file);
    const sha = sha256File(src);
    if (!force && r.original && fs.existsSync(r.original) && sha256File(r.original) === sha) {
      skipped.push(disc);
      continue;
    }
    const rel = path.posix.join('files', disc);
    const dest = path.join(out, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    included.push({ disc_path: disc, file: rel, sha256: sha, size: fs.statSync(dest).size });
  }
  // A leading '/' makes Dolphin resolve the external path against the descriptor root; without it
  // the path is relative to the XML's own folder (riivolution/), which silently skips the patch.
  const files = included
    .map(
      r => `    <file disc="/${xmlAttr(r.disc_path)}" external="/${xmlAttr(r.file)}" resize="true" create="false" />`,
    )
    .join('\n');
  const address = n => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const memoryPatches = memory.map((patch, i) => {
    if (!Number.isInteger(patch.offset) || patch.offset < 0x80000000 || patch.offset >= 0x94000000)
      throw new Error('a memory patch needs an address in MEM1 or MEM2');
    if (patch.bytes) {
      const rel = path.posix.join('memory', `${address(patch.offset)}.bin`);
      const dest = path.join(out, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, patch.bytes);
      return { offset: patch.offset, file: rel, size: patch.bytes.length, sha256: sha256File(dest) };
    }
    if (!/^([0-9a-f]{2})+$/i.test(patch.value ?? '')) throw new Error(`memory patch ${i} needs hex bytes or a buffer`);
    return { offset: patch.offset, value: patch.value.toUpperCase() };
  });
  const memoryLines = memoryPatches
    .map(p =>
      p.file
        ? `    <memory offset="${address(p.offset)}" valuefile="/${xmlAttr(p.file)}" />`
        : `    <memory offset="${address(p.offset)}" value="${p.value}" />`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<wiidisc version="1">
  <id game="SSP" developer="52"><region type="P" /></id>
  <options>
    <section name="PortalForge">
      <option id="${xmlAttr(experimentId)}" name="${xmlAttr(displayName)}" default="1">
        <choice name="Enabled"><patch id="${xmlAttr(experimentId)}" /></choice>
      </option>
    </section>
  </options>
  <patch id="${xmlAttr(experimentId)}">
${[files, memoryLines].filter(Boolean).join('\n')}
  </patch>
</wiidisc>
`;
  const xmlPath = path.join(out, 'riivolution', `${experimentId}.xml`);
  fs.writeFileSync(xmlPath, xml);
  const descriptor = buildDescriptor(game, xmlPath, out, [{ 'option-id': experimentId, choice: 1 }]);
  descriptor['display-name'] = displayName;
  const descriptorPath = path.join(out, 'launch.json');
  fs.writeFileSync(descriptorPath, JSON.stringify(descriptor, null, 2));
  const expected_monitor_sizes = Object.fromEntries(included.map(r => [r.disc_path, monitorSize(r.size)]));
  const workspace = {
    experiment_id: experimentId,
    created_at: new Date().toISOString(),
    game: path.resolve(game),
    dir: out,
    replacements: included,
    ...(memoryPatches.length ? { memory: memoryPatches } : {}),
    skipped_identical: skipped,
    xml: xmlPath,
    descriptor: descriptorPath,
    expected_monitor_sizes,
  };
  fs.writeFileSync(path.join(out, 'patch.json'), JSON.stringify(workspace, null, 2));
  return workspace;
}
