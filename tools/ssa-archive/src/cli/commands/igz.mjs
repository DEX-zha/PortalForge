// `igz <subcommand> <decoded IGZ file> [...]`: inspect a decoded level entry, or plan a modification of it.
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../../igz/graph.mjs';
import { need } from '../errors.mjs';
import { pickSubcommand } from '../dispatch.mjs';
import * as inspect from './igz-inspect.mjs';
import * as modify from './igz-clone.mjs';

const IGZ_SUBCOMMANDS = {
  sections: inspect.sections,
  types: inspect.types,
  objects: inspect.objects,
  show: inspect.show,
  near: inspect.near,
  match: inspect.match,
  models: inspect.models,
  placements: inspect.placements,
  script: inspect.script,
  scripts: inspect.scripts,
  refs: inspect.refs,
  containers: inspect.containers,
  members: inspect.members,
  fields: inspect.fields,
  clone: modify.clone,
  'clone-entity': modify.cloneEntity,
  'pick-overwrite-target': modify.pickOverwriteTarget,
  'relocation-probe': modify.relocationProbe,
  fixups: modify.fixups,
};

// Field decoding is the expensive part of building the graph, so it only happens for the subcommands that
// print fields.
const needsFields = (sub, o) => sub === 'show' || (sub === 'objects' && !!o.json);

export async function igz(pos, o) {
  const sub = need(pos[0], 'igz subcommand (sections|types|objects|show)');
  const file = path.resolve(need(pos[1], 'decoded IGZ file'));
  const handler = pickSubcommand(IGZ_SUBCOMMANDS, sub, name => `Unknown igz subcommand ${name}`);
  const buf = fs.readFileSync(file);
  const graph = buildGraph(buf, { file, fields: needsFields(sub, o), fieldLimit: o.limit ? Number(o.limit) : 64 });
  return handler({ file, buf, graph, pos, o });
}
