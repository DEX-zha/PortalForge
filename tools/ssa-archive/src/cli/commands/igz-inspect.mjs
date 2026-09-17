// Read-only `igz` subcommands: what is in a decoded level, and how its records relate to one another.
//
// Every handler receives the same context, built once by the `igz` command:
//   { file, buf, graph, pos, o }  with pos[2..] holding the subcommand's own positional arguments.
import fs from 'node:fs';
import path from 'node:path';
import * as G from '../../igz/graph.mjs';
import { CliError, EXIT, need } from '../errors.mjs';
import { firstFixup, readFixups, readJsonFile } from '../args.mjs';

const hex = value => '0x' + value.toString(16);
const limitOr = (o, fallback) => (o.limit ? Number(o.limit) : fallback);
const typeLabel = object => object.type_name || 'type#' + object.type;
const at = (object, field) => `${object.type_name}@${hex(object.offset)}+${hex(field)}`;

export function sections({ graph }) {
  const rows = graph.sections
    .map(s => `#${s.index} @${hex(s.offset)} size=${hex(s.size)} align=${s.align} tag=${s.tag}`)
    .join('\n');
  return {
    result: {
      header: graph.header,
      second_header: graph.second_header,
      sections: graph.sections,
      issues: graph.issues,
    },
    text:
      rows +
      `\nsecond header words: ${graph.second_header?.words.map(hex).join(' ')}` +
      (graph.issues.length ? `\nissues: ${JSON.stringify(graph.issues)}` : ''),
  };
}

export function types({ graph, o }) {
  const histogram = G.histogram(graph);
  const byName = new Map(histogram.map(h => [h.type_name, h]));
  const usage = t => {
    const h = byName.get(t.name || 'type#' + t.index);
    return `objects=${h?.count ?? 0} median=${h?.median_size ?? '-'}`;
  };
  return {
    result: { types: graph.types, table: graph.type_table, histogram },
    text: graph.types
      .map(
        t =>
          `${String(t.index).padStart(3)} ${(t.name || '(empty)').padEnd(34)} size_hint=${t.size_hint ?? '-'} ${o.histogram ? usage(t) : ''}`,
      )
      .join('\n'),
  };
}

export function objects({ graph, o }) {
  const rows = o.type ? graph.objects.filter(x => x.type_name === o.type) : graph.objects;
  if (o.out) fs.writeFileSync(path.resolve(o.out), JSON.stringify(graph, null, 1));
  const a = graph.accounting;
  const histogram = G.histogram(graph);
  const accounted = a.objects + a.unparsed + a.padding === a.total;
  return {
    result: {
      object_section: graph.object_section,
      string_section: graph.string_section,
      count: rows.length,
      accounting: a,
      unparsed: graph.unparsed,
      histogram: histogram.slice(0, 40),
    },
    text:
      `objects=${a.objects} unparsed=${a.unparsed} padding=${a.padding} total=${a.total} (${accounted ? 'accounted' : 'MISMATCH'}); ${graph.objects.length} objects, ${graph.unparsed.length} unparsed region(s)\n` +
      histogram
        .slice(0, 25)
        .map(h => `${String(h.count).padStart(6)} ${h.type_name.padEnd(32)} median=${hex(h.median_size)}`)
        .join('\n') +
      (o.out ? `\ngraph -> ${path.resolve(o.out)}` : ''),
  };
}

function fieldValue(field) {
  if (field.kind === 'string_ref') return '"' + field.target + '"';
  if (field.kind === 'object_ref') return `-> ${field.target.type_name}@${hex(field.target.offset)}`;
  if (field.kind === 'flagged_ref') return hex(field.value);
  return field.value;
}

export function show({ graph, pos }) {
  const offset = Number(need(pos[2], 'object offset'));
  // An offset inside a record selects the record that contains it.
  const object = graph.objects.find(x => x.offset === offset) ?? graph.objects.filter(x => x.offset <= offset).pop();
  if (!object) throw new CliError('No object at or before that offset', EXIT.FAILED);
  const fields = object.fields
    .filter(f => f.kind !== 'unknown')
    .map(f => `  +0x${(f.offset - object.offset).toString(16).padStart(3, '0')} ${f.kind.padEnd(11)} ${fieldValue(f)}`)
    .join('\n');
  return {
    result: object,
    text: `${typeLabel(object)} @${hex(object.offset)} size=${hex(object.size)} id=${hex(object.id)}\n` + fields,
  };
}

export async function near({ buf, graph, pos, o }) {
  const E = await import('../../igz/entities.mjs');
  const target = [pos[2], pos[3], pos[4]].map(Number);
  if (!target.every(Number.isFinite)) throw new CliError('igz near needs x y z', EXIT.USAGE);
  const rows = E.near(buf, graph, target, {
    tol: o.tol ? Number(o.tol) : 3,
    includeDimensions: !o['no-dimensions'] && !!o.dimensions,
  }).slice(0, limitOr(o, 40));
  return {
    result: { target, rows },
    text:
      rows
        .map(
          r =>
            `d=${r.distance.toFixed(2).padStart(6)} ${hex(r.offset)} ${r.object.type_name || 'type#'}@${hex(r.object.offset)}+${hex(r.field)} [${r.values.join(', ')}] ${r.flags.join(',')}`,
        )
        .join('\n') || '(no triple within tolerance)',
  };
}

// Maps a live RAM address, or a byte pattern, back to the record that owns it in the file.
export async function match({ buf, graph, o }) {
  const M = await import('../../igz/match.mjs');
  if (o.address) {
    const base = o.base ? Number(o.base) : M.DEFAULT_SECTION_BASE;
    const r = M.matchAddress(graph, Number(o.address), { base });
    return {
      result: r,
      text: r.object
        ? `${r.address} -> file ${hex(r.file_offset)} = ${at(r.object, r.field)}`
        : `${r.address} -> file ${hex(r.file_offset)}: no owning object`,
    };
  }
  if (o.pattern?.length) {
    const r = M.matchPattern(buf, graph, o.pattern[0]);
    return {
      result: r,
      text:
        r.hits.map(h => `${hex(h.file_offset)} ${h.object ? at(h.object, h.field) : 'no object'}`).join('\n') ||
        '(no hit)',
    };
  }
  throw new CliError('igz match needs --address <ram address> or --pattern <hex>', EXIT.USAGE);
}

function groundTruthLines(v) {
  const lines = [
    '',
    `ground truth (runtime fixup map): agreement ${(v.agreement * 100).toFixed(1)}% (${v.agreed}/${v.total}), structural-only ${v.false_positives.length}, missed ${v.missed.length}`,
  ];
  for (const r of v.false_positives.slice(0, 5)) lines.push(`  structural-only ${hex(r.offset)} ${r.name}`);
  for (const r of v.missed.slice(0, 5)) lines.push(`  missed ${hex(r.offset)} ${r.name}`);
  return lines;
}

function safetyLines(S, resolved, hasRuntimeMap, limit) {
  const graded = resolved.rows.map(p => ({ p, rules: S.assessPlacement(p, { hasRuntimeMap }) }));
  const tally = {};
  for (const entry of graded) {
    const worst = S.worst(entry.rules);
    tally[worst] = (tally[worst] ?? 0) + 1;
  }
  const risky = graded.filter(x => x.rules.some(r => r.severity === 'critical' || r.severity === 'high'));
  const lines = [
    '',
    `safety over ${resolved.placements} placements: ${S.SEVERITY.map(level => `${level} ${tally[level] ?? 0}`).join(', ')}`,
  ];
  for (const x of risky.slice(0, limit)) {
    lines.push(
      `  ${hex(x.p.offset)} ${String(x.p.name).padEnd(28)}${x.rules.map(r => `${r.severity}/${r.id}`).join(' ')}`,
    );
  }
  return lines;
}

export async function models({ buf, graph, o }) {
  const M = await import('../../igz/model-resolve.mjs');
  const S = await import('../../editor/safety.mjs');
  const fixups = readFixups(o.fixups);
  const resolved = M.resolveAll(buf, graph, fixups);
  const lines = [M.formatResolve(resolved, { limit: limitOr(o, 20) })];
  if (fixups && o.validate) lines.push(...groundTruthLines(M.validateAgainstFixups(buf, graph, fixups)));
  if (resolved.file_has_placements) lines.push(...safetyLines(S, resolved, !!fixups, limitOr(o, 8)));
  return { result: { ...resolved, rows: o.json ? resolved.rows : undefined }, text: lines.join('\n') };
}

export async function placements({ buf, graph, o }) {
  const P = await import('../../igz/placements.mjs');
  const fixups = readJsonFile(need(firstFixup(o.fixups), 'fixups'));
  const nearArg = o.near ? o.near.split(',').map(Number) : null;
  if (nearArg && nearArg.length !== 3) throw new CliError('--near expects x,z,radius');
  const listed = P.listPlacements(buf, graph, fixups, { layer: o.layer ?? null, near: nearArg, all: !!o.all });
  return { result: listed, text: P.formatPlacements(listed, { limit: limitOr(o, 60) }) };
}

// Audits every compiled script (type-92 record) against the model: count == capacity, a size word, the array
// at +0x34, every pointer landing on a record header, and the blob fully tiled.
export async function scripts({ buf, graph, o }) {
  const S = await import('../../igz/script.mjs');
  const audit = S.auditScripts(buf, graph, readFixups(o.fixups));
  const deviating = audit.rows.filter(r => r.error || r.issues || !r.headers || r.uncovered);
  const deviations = deviating.length
    ? 'deviations:\n' +
      deviating
        .slice(0, 15)
        .map(
          r =>
            `  ${hex(r.record)} ${r.name ?? ''} ${r.error ?? `issues ${r.issues} headers ${r.headers} uncovered ${r.uncovered}`}`,
        )
        .join('\n')
    : 'no deviations';
  const sample = audit.rows
    .filter(r => !r.error)
    .slice(0, 12)
    .map(r => `  ${hex(r.record)} ${String(r.count).padStart(4)} instr  ${r.name}`)
    .join('\n');
  return {
    result: audit,
    text:
      `type-92 scripts: ${audit.scripts}; model OK (count==capacity, size word, array at +0x34, every pointer lands on a record header, blob fully tiled): ${audit.model_ok}\n` +
      deviations +
      '\n' +
      sample,
  };
}

function instructionArguments(args) {
  const parts = [];
  if (args.strings.length) parts.push(args.strings.map(s => `"${s.text}"`).join(' '));
  if (args.triples.length) parts.push(args.triples.map(t => `(${t.xyz.join(', ')})@+${hex(t.at)}`).join(' '));
  else if (args.floats.length) {
    parts.push(
      args.floats
        .slice(0, 4)
        .map(f => f.value)
        .join(' '),
    );
  }
  if (args.refs.length) {
    parts.push(
      args.refs
        .map(r => `->${r.kind === 'instruction' ? '#' : ''}${r.opcode ? '"' + r.opcode + '"' : hex(r.target)}`)
        .slice(0, 4)
        .join(' '),
    );
  }
  return parts.join(' | ');
}

export async function script({ buf, graph, pos, o }) {
  const S = await import('../../igz/script.mjs');
  const d = S.decodeScript(buf, graph, readFixups(o.fixups), Number(need(pos[2], 'script record offset')));
  const lines = [
    `script ${hex(d.record)} "${d.name}" blob ${hex(d.blob_bytes)} owner ${hex(d.owner_size ?? 0)} instructions ${d.count}; issues: ${d.issues.join('; ') || 'none'}; coverage ${d.coverage.covered_bytes}/${d.blob_bytes} bytes in ${d.coverage.records_in_blob} records`,
  ];
  for (const e of d.instructions) {
    if (o.limit && e.index >= Number(o.limit)) {
      lines.push(`  … ${d.count - e.index} more`);
      break;
    }
    const index = `[${String(e.index).padStart(3)}]`;
    if (!e.header) {
      lines.push(`  ${index} ${hex(e.target)} (no record header)${e.in_blob ? '' : ' OUTSIDE BLOB'}`);
      continue;
    }
    lines.push(
      `  ${index} ${hex(e.target)} ${String(e.type).padStart(3)} ${(e.opcode ?? '?').padEnd(42)} ${instructionArguments(e.args)}${e.in_blob ? '' : '  OUTSIDE BLOB'}`,
    );
  }
  return { result: d, text: lines.join('\n') };
}

export async function refs({ buf, graph, pos, o }) {
  const { reverseReferences } = await import('../../igz/refs.mjs');
  const { ownerChain } = await import('../../igz/containers.mjs');
  const offset = Number(need(pos[2], 'object offset'));
  const hits = reverseReferences(buf, graph, offset);
  const chain = o.depth ? ownerChain(buf, graph, offset, { depth: Number(o.depth) }) : null;
  const hitLine = h =>
    `  ${hex(h.file_offset)} sec#${h.section} ${h.convention.padEnd(9)} value=${hex(h.value)}${h.referrer ? ` in ${h.referrer.type_name || 'type#'}@${hex(h.referrer.offset)}+${hex(h.referrer.field)}` : ''}`;
  const levelLine = (level, i) => {
    const owners = new Set(level.filter(h => h.referrer).map(h => `${h.referrer.type_name}@${hex(h.referrer.offset)}`));
    return `level ${i + 1}: ${[...owners].join(', ') || '(none)'}`;
  };
  return {
    result: { target: offset, hits, chain },
    text:
      `${hits.length} reference(s) to ${hex(offset)}\n` +
      hits.slice(0, 60).map(hitLine).join('\n') +
      (chain ? '\n' + chain.map(levelLine).join('\n') : ''),
  };
}

export async function members({ buf, graph, pos }) {
  const { containersOf } = await import('../../igz/containers.mjs');
  const offset = Number(need(pos[2], 'object offset'));
  const found = containersOf(buf, graph, offset);
  return {
    result: found,
    text: found.length
      ? found
          .map(
            c =>
              `${c.kind} ${c.container.type_name}@${hex(c.container.offset)} count=${c.count}${c.capacity ? '/' + c.capacity : ''} members[${c.members.indexOf(offset)}]`,
          )
          .join('\n')
      : '(no container lists this object)',
  };
}

export async function containers({ buf, graph, o }) {
  const { decodeContainers } = await import('../../igz/containers.mjs');
  const found = decodeContainers(buf, graph).filter(c => !o.type || c.container.type_name === o.type);
  const byType = new Map();
  for (const c of found) {
    const key = `${c.container.type_name || 'type#'} ${c.kind}`;
    const entry = byType.get(key) ?? { count: 0, members: 0 };
    entry.count++;
    entry.members += c.count;
    byType.set(key, entry);
  }
  return {
    result: {
      containers: found.length,
      by_type: [...byType.entries()].map(([key, v]) => ({ key, ...v })),
      sample: found.slice(0, limitOr(o, 20)),
    },
    text: [...byType.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, v]) => `${String(v.count).padStart(6)} ${key.padEnd(40)} members=${v.members}`)
      .join('\n'),
  };
}

export async function fields({ buf, graph, o }) {
  const E = await import('../../igz/entities.mjs');
  const rows = E.fieldStatistics(buf, graph).slice(0, limitOr(o, 40));
  return {
    result: rows,
    text: rows
      .map(
        r => `${String(r.count).padStart(6)} ${(r.type_name || 'type#').padEnd(30)} +${hex(r.field)} boxes=${r.boxes}`,
      )
      .join('\n'),
  };
}
