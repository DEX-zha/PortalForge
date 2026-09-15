// Read-only catalogue of script clone resources. This does not evaluate the script VM:
// a referenced template's stored transform is not the spawned actor's world transform.
import { decodeScript } from '../igz/script.mjs';
import { driftingPath } from './trajectory.mjs';
import { sceneRoles } from './scene-roles.mjs';
import { startupParts, STARTUP_TEMPLATES } from './scripted-startup.mjs';

// A deliberately small read-only expression recogniser: clone ... at [me]. It
// does not execute branches or infer where an arbitrary reference will point.
export function cloneAtOwner(session, instruction) {
  const b = session.buffer, sec = session.graph.sections[session.graph.object_section];
  const valid = (p, bytes) => Number.isInteger(p) && p >= sec.offset
    && p + bytes <= Math.min(b.length, sec.offset + sec.size);
  const ref = at => valid(at, 4) ? sec.offset + (b.readUInt32BE(at) & 0x7fffffff) : -1;
  if (!valid(instruction, 0x2c)) return false;
  const list = ref(instruction + 0x28);
  if (!valid(list, 24) || b.readUInt32BE(list) !== 114) return false;
  if (b.readUInt32BE(list + 8) !== 1 || b.readUInt32BE(list + 12) !== 1
      || b.readUInt32BE(list + 16) !== 0x80000004) return false;
  const array = ref(list + 20);
  return valid(array, 4) && b.readUInt32BE(array) === 0x8000005b;
}

function movementDiagnostics(session, placement, sceneRole, trajectory, templateFor) {
  const inactive = new Set(sceneRoles(session).map(r => r.offset));
  const targets = new Map();
  const add = (p, relation, conditional = false) => {
    if (!p || p.offset === placement.offset || inactive.has(p.offset) || targets.has(p.offset)) return;
    targets.set(p.offset, { offset: p.offset, name: p.name, position: p.position, relation, conditional });
  };
  for (const c of sceneRole?.counterparts ?? []) add(session.placements.find(p => p.offset === c.offset), 'counterpart');
  for (const script of templateFor.filter(s => s.at_owner)) {
    for (const p of session.placements.filter(p => p.behavior?.offset === script.offset)) {
      const parts = STARTUP_TEMPLATES.has(placement.name) ? startupParts(session, p) : null;
      if (parts && !parts.some(part => part.name === placement.name)) continue;
      add(p, 'creator', true);
    }
  }
  return {
    kind: sceneRole || templateFor.length ? 'resource' : trajectory
      ? trajectory.supported ? 'trajectory' : 'unsupported_trajectory' : 'initial_position',
    targets: [...targets.values()],
    scripted: placement.behavior?.offset != null,
    model_shared: !!placement.shared_state?.shared,
    confidence: 'LIKELY', editable: false,
  };
}

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
          if (!p) continue;
          const atOwner = cloneAtOwner(session, op.target);
          const existing = clones.find(c => c.offset === p.offset);
          if (existing) { existing.at_owner ||= atOwner; continue; }
          clones.push({ offset: p.offset, name: p.name, model: p.model.path, instruction: op.target, at_owner: atOwner });
          if (!templates.has(p.offset)) templates.set(p.offset, []);
          templates.get(p.offset).push({ offset, path: owner.behavior.path, resource: clones.at(-1) });
        }
      }
      scripts.set(offset, { clones, animated: decoded.instructions.some(i => /^(slide value|displace\|)/.test(i.opcode ?? '')) });
    }
    session._scriptDiagnostics = { scripts, templates };
  }
  const { scripts, templates } = session._scriptDiagnostics;
  const sceneRole = sceneRoles(session).find(r => r.offset === placement.offset) ?? null;
  const trajectory = driftingPath(session, placement);
  const templateFor = (templates.get(placement.offset) ?? []).map(({ resource, ...s }) => ({ ...s, at_owner: resource.at_owner }));
  return { ...(scripts.get(placement.behavior?.offset) ?? { clones: [], animated: false }),
    scene_role: sceneRole, trajectory, template_for: templateFor,
    movement: movementDiagnostics(session, placement, sceneRole, trajectory, templateFor),
    confidence: 'LIKELY', editable: false };
}
