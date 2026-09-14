// Read-only audit: decoded draw units are not the same denominator as placed models.
// Run from any directory: node probe-mesh-coverage.mjs <decoded-level> [<decoded-level> ...]
// Optional --fixups <json> applies to ONE input only. Prints metadata, never game vertices.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildGraph } from '../src/igz/graph.mjs';
import { resolveAll, stringAt } from '../src/igz/model-resolve.mjs';
import { decodeGeometry, assignUnits, referenceIndex, boundsIn } from '../src/igz/gxmesh.mjs';
import { modelMeshes, meshesPayload } from '../src/editor/meshes.mjs';

const args = process.argv.slice(2), inputs = [];
let fixups = null, fixupFile = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fixups') {
    fixupFile = args[++i];
    fixups = JSON.parse(fs.readFileSync(fixupFile, 'utf8'));
  } else inputs.push(args[i]);
}
assert.ok(inputs.length, 'Supply at least one decoded level file');
assert.ok(!fixups || inputs.length === 1, 'A runtime fixup map must only be used with its matching level');

function tally(units) {
  const kinds = {}, fractions = {};
  let vertices = 0, triangles = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const u of units) {
    vertices += u.count; triangles += u.triangles.length / 3;
    kinds[u.kind] = (kinds[u.kind] ?? 0) + 1;
    fractions[u.frac] = (fractions[u.frac] ?? 0) + 1;
    for (let i = 0; i < u.vertices.length; i++) {
      const a = i % 3, x = u.vertices[i];
      min[a] = Math.min(min[a], x); max[a] = Math.max(max[a], x);
    }
  }
  return { units: units.length, vertices, triangles, kinds, fractions, bounds: units.length ? { min, max } : null };
}

for (const input of inputs) {
  const buffer = fs.readFileSync(input), sha256 = createHash('sha256').update(buffer).digest('hex');
  const graph = buildGraph(buffer), resolved = resolveAll(buffer, graph, fixups);
  const session = { buffer, graph, placements: resolved.rows, fixups };
  const geo = decodeGeometry(buffer, graph);
  const models = [...new Set(resolved.rows.filter(p => p.model?.offset != null).map(p => p.model.offset))];
  const assignment = assignUnits(buffer, graph, geo.units, models, fixups);
  const assigned = new Set([...assignment.byModel.values()].flat());
  const unassigned = geo.units.filter((u, i) => !assigned.has(i));
  const served = modelMeshes(session), payload = meshesPayload(session);
  const sceneryIds = new Set((payload.scenery?.chunks ?? []).flatMap(c => c.descriptors));
  const omitted = unassigned.filter(u => !sceneryIds.has(u.descriptor));
  assert.equal(assigned.size + unassigned.length, geo.units.length);
  assert.equal(assignment.world, unassigned.length);
  assert.equal(assigned.size + sceneryIds.size + omitted.length, geo.units.length);
  assert.equal(payload.models.length, served.models.size);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), sha256, 'audit changed source bytes');
  const index = referenceIndex(buffer, graph, fixups);
  const ctx = { buf: buffer, s2: graph.sections[2] };
  const examples = omitted.filter(u => u.kind !== 'interleaved');
  for (const u of omitted.slice(0, 3)) if (!examples.includes(u)) examples.push(u);
  const report = {
    file: path.resolve(input), sha256, fixups: fixupFile,
    placements: resolved.rows.length, models: models.length, models_with_mesh: served.models.size,
    decode: { descriptors: geo.descriptors.length, stop: geo.stop, consumed: geo.consumed, size: geo.size },
    decoded: tally(geo.units), assigned_unique: tally(geo.units.filter((u, i) => assigned.has(i))),
    unassigned: tally(unassigned), scenery: tally(unassigned.filter(u => sceneryIds.has(u.descriptor))),
    omitted: tally(omitted), omitted_interleaved: tally(omitted.filter(u => u.kind === 'interleaved')),
    model_unit_associations: served.stats.owned, shared_units: assignment.shared,
    payload_keys: Object.keys(payload), payload_stats: payload.stats,
    // Header ownership and bounds remain heuristics; this is evidence for investigation, not editability.
    omitted_examples: examples.slice(0, 12).map(u => {
      const owner = index.ownerOf(u.owner);
      return { descriptor: u.descriptor, owner: '0x' + owner.toString(16),
        owner_name: owner < 0 ? null : stringAt(ctx, buffer.readUInt32BE(owner + 8)),
        owner_bounds_heuristic: owner < 0 ? null : boundsIn(buffer, graph, owner), ...tally([u]) };
    }),
  };
  process.stdout.write(JSON.stringify(report) + '\n');
}
