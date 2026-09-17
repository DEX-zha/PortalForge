// ObjectGraph assembly with 100 % area accounting (spec 002 FR-002, SC-001), validated against
// specs/002-igz-entity-model/contracts/object-graph.schema.json.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseIgzHeader } from './header.mjs';
import { parseTypes, typeRows } from './types.mjs';
import { enumerateObjects } from './objects.mjs';
import { makeResolver } from './refs.mjs';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';

export function buildGraph(buf, { file = null, fields = false, fieldLimit = 64 } = {}) {
  const header = parseIgzHeader(buf);
  if (header.issues.some(i => i.reason === 'BAD_IGZ_MAGIC' || i.reason === 'UNSUPPORTED_IGZ_VERSION')) {
    const e = new Error('Not an IGZ v5 file: ' + header.issues.map(i => i.reason).join(', '));
    e.exitCode = 2;
    e.issues = header.issues;
    throw e;
  }
  const types = parseTypes(buf, header);
  const { section, objects, unparsed } = enumerateObjects(buf, header, types);
  const resolver = makeResolver(buf, header, section, objects);
  if (fields) for (const o of objects) o.fields = resolver.decodeObject(o, { limit: fieldLimit });
  const total = section ? section.size : 0;
  const objectBytes = objects.reduce((n, o) => n + o.size, 0),
    unparsedBytes = unparsed.reduce((n, u) => n + u.size, 0);
  const graph = {
    file: file ? path.resolve(file) : 'buffer',
    sha256: createHash('sha256').update(buf).digest('hex'),
    size: buf.length,
    header: { magic: header.magic, version: header.version, words: header.words },
    sections: header.sections.map(({ index, offset, size, align, tag }) => ({ index, offset, size, align, tag })),
    second_header: header.second_header,
    types: typeRows(types),
    type_table: { names_offset: types.names_offset, sizes_offset: types.sizes_offset },
    object_section: section ? section.index : null,
    string_section: resolver.string_section ? resolver.string_section.index : null,
    objects,
    unparsed,
    accounting: {
      objects: objectBytes,
      unparsed: unparsedBytes,
      padding: Math.max(0, total - objectBytes - unparsedBytes),
      total,
    },
    issues: [...header.issues, ...types.issues],
  };
  return graph;
}

export function validateGraph(graph) {
  const v = schemaValidator('object-graph.schema.json', contracts002);
  return { valid: v(graph), errors: v.errors ?? [] };
}

export function histogram(graph) {
  const h = new Map();
  for (const o of graph.objects) {
    const k = o.type_name || `type#${o.type}`;
    const e = h.get(k) ?? { count: 0, bytes: 0, sizes: [] };
    e.count++;
    e.bytes += o.size;
    e.sizes.push(o.size);
    h.set(k, e);
  }
  return [...h.entries()]
    .map(([type_name, e]) => {
      const s = [...e.sizes].sort((a, b) => a - b);
      return { type_name, count: e.count, bytes: e.bytes, median_size: s[Math.floor(s.length / 2)], min_size: s[0] };
    })
    .sort((a, b) => b.count - a.count);
}
