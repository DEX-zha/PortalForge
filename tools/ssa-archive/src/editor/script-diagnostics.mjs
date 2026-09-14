// Read-only catalogue of script clone resources. This does not evaluate the script VM:
// a referenced template's stored transform is not the spawned actor's world transform.
import { decodeScript } from '../igz/script.mjs';
import { driftingPath } from './trajectory.mjs';
import { sceneRoles } from './scene-roles.mjs';

export function scriptDiagnostics(session, placement) {
  if (!session._scriptDiagnostics) {
    const scripts = new Map(), templates = new Map();
    const b = session.buffer, sec = session.graph.sections[session.graph.object_section];
    const valid = p => Number.isInteger(p) && p >= sec.offset && p + 28 <= sec.offset + sec.size;
    const ref = at => at >= 0 && at + 4 <= b.length ? sec.offset + (b.readUInt32BE(at) & 0xffffff) : -1;
    const placements = new Map(session.placements.map(p => [p.offset, p]));
    for (const owner of session.placements.filter(p => p.behavior?.offset != null)) {
      const offset = owner.behavior.offset;
      if (scripts.has(offset)) continue;
      let decoded;
      try { decoded = decodeScript(b, session.graph, session.fixups, offset); } catch { continue; }
      if (decoded.issues.length) continue;
      const clones = [];
      for (const op of decoded.instructions) {
        if (op.opcode !== 'clone||at|facing||cloned') continue;
        const list = ref(op.target + 0x20);
        if (!valid(list) || b.readUInt32BE(list) !== 124) continue;
        const count = b.readUInt32BE(list + 8), capacity = b.readUInt32BE(list + 12), start = ref(list + 20);
        if (count !== capacity || count > 1024 || !valid(start) || start + count * 4 > sec.offset + sec.size) continue;
        for (let i = 0; i < count; i++) {
          const p = placements.get(ref(start + i * 4));
          if (!p || clones.some(c => c.offset === p.offset)) continue;
          clones.push({ offset: p.offset, name: p.name, model: p.model.path, instruction: op.target });
          if (!templates.has(p.offset)) templates.set(p.offset, []);
          templates.get(p.offset).push({ offset, path: owner.behavior.path });
        }
      }
      scripts.set(offset, { clones, animated: decoded.instructions.some(i => /^(slide value|displace\|)/.test(i.opcode ?? '')) });
    }
    session._scriptDiagnostics = { scripts, templates };
  }
  const { scripts, templates } = session._scriptDiagnostics;
  return { ...(scripts.get(placement.behavior?.offset) ?? { clones: [], animated: false }),
    scene_role: sceneRoles(session).find(r => r.offset === placement.offset) ?? null,
    trajectory: driftingPath(session, placement),
    template_for: templates.get(placement.offset) ?? [], confidence: 'LIKELY', editable: false };
}
