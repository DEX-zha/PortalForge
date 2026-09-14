// Display-only interpretation, deliberately scoped to the audited tutorial layout.
// +0x54 bit 0 distinguishes stored templates/initially inactive objects from the
// active placements. It is NOT an editable visibility property or a script simulator.
export function sceneRoles(session) {
  if (session._sceneRoles) return session._sceneRoles;
  const tutorial = session.placements.some(p => /\/Level_027\/Scripts\/Bridge_Spawner\.ai$/i.test(p.behavior?.path ?? ''));
  if (!tutorial) return [];
  const inactive = p => session.buffer.readUInt32BE(p.offset) === 104
    && (session.buffer.readUInt32BE(p.offset + 0x54) & 1) !== 0;
  const roles = session.placements.filter(inactive).map(p => ({
    offset: p.offset, role: 'template_or_inactive', confidence: 'LIKELY', editable: false,
    counterparts: session.placements.filter(q => !inactive(q) && q.offset !== p.offset
      && q.name?.replace(/\(\d+\)$/, '') === p.name?.replace(/\(\d+\)$/, '')
      && q.model?.offset === p.model?.offset && q.behavior?.offset === p.behavior?.offset)
      .map(q => ({ offset: q.offset, name: q.name })),
  }));
  session._sceneRoles = roles;
  return roles;
}
