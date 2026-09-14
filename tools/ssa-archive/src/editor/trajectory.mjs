// Translation support is deliberately scoped to the tutorial Drifting_Piece path layout.
// No script opcodes, timing, collision or list sizes are changed.
export const TRAJECTORY_FINDING = 'level.drifting-piece.waypoint-translation';
export function driftingPath(session, placement) {
  if (!/\/Level_027\/Scripts\/Drifting_Piece\.ai$/i.test(placement.behavior?.path ?? '')) return null;
  const b = session.buffer, sec = session.graph.sections[session.graph.object_section];
  const refs = session.ptrSet ?? new Set(session.fixups?.pointer_words ?? []);
  const readRef = at => {
    if (at < sec.offset || at + 4 > sec.offset + sec.size || !refs.has(at)) return null;
    const p = sec.offset + (b.readUInt32BE(at) & 0x7fffffff);
    return p >= sec.offset && p + 4 <= sec.offset + sec.size ? p : null;
  };
  const invalid = reason => ({ supported: false, reason, points: [] });
  if (b.readUInt32BE(placement.offset) !== 104) return invalid('unconfirmed placement class');
  const list = readRef(placement.offset + 0xe4);
  if (list === null || list + 24 > sec.offset + sec.size || b.readUInt32BE(list) !== 147) return invalid('unconfirmed waypoint list');
  const count = b.readUInt32BE(list + 8), start = readRef(list + 20);
  if (!count || count > 1024 || b.readUInt32BE(list + 12) !== count || b.readUInt32BE(list + 16) !== ((0x80000000 | count * 4) >>> 0)
      || start === null || start + count * 4 > sec.offset + sec.size) return invalid('invalid waypoint array');
  const points = [];
  for (let i = 0; i < count; i++) {
    const p = readRef(start + i * 4);
    if (p === null || p + 56 > sec.offset + sec.size || b.readUInt32BE(p) !== 148) return invalid('unconfirmed waypoint record');
    const position = [0, 1, 2].map(a => b.readFloatBE(p + 0x20 + a * 4));
    if (!position.every(Number.isFinite) || points.some(v => v.offset === p)) return invalid('invalid waypoint positions');
    // Shared waypoint records must never move another actor silently.
    const incoming = [...refs].filter(at => at >= sec.offset && at + 4 <= sec.offset + sec.size && readRef(at) === p);
    if (incoming.length !== 1 || incoming[0] !== start + i * 4) return invalid('shared waypoint record');
    points.push({ offset: p, position });
  }
  const listUsers = session.placements.filter(p => readRef(p.offset + 0xe4) === list);
  if (listUsers.length !== 1) return invalid('shared waypoint list');
  return { supported: true, list, points, finding: TRAJECTORY_FINDING };
}

// Plan first, apply with the anchor only after every word is valid. Use float32 destinations
// so the path delta equals the displacement that will actually be stored in the placement.
export function translatedPathWords(session, placement, position) {
  const path = driftingPath(session, placement);
  if (!path) return [];
  if (!path.supported) throw Object.assign(new Error('The drifting path cannot be translated safely: ' + path.reason), { error: 'UNSUPPORTED_TRAJECTORY' });
  const b = session.buffer;
  const delta = position.map((v, a) => Math.fround(v) - b.readFloatBE(placement.offset + 0x24 + a * 4));
  return path.points.flatMap(p => p.position.map((old, a) => {
    const value = Math.fround(old + delta[a]);
    if (!Number.isFinite(value)) throw Object.assign(new Error('Trajectory translation exceeds float32 range'), { error: 'BAD_VALUE' });
    const raw = Buffer.alloc(4); raw.writeFloatBE(value);
    const offset = p.offset + 0x20 + a * 4;
    return { offset, before: b.readUInt32BE(offset), after: raw.readUInt32BE(0) };
  }));
}
