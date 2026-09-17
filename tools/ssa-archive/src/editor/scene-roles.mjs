// Display-only interpretation: which placements are stored templates or initially inactive objects, so the view
// can keep them in a layer of their own instead of drawing them at their storage coordinates as if they were
// placed. Bit 0 of the word at +0x54 of the placement record carries it; on every level measured the word is
// exactly 4 (placed) or 5 (template or inactive): tutorial 377/296, Mining 381/236, with the objects a level
// clones by script (Mine_Train_Template, Switch_90_Art_Template, the breakable-rock halves) all at 5 and the
// placed ones (MineTrain, the lanterns, the mining walls) all at 4. The placement class is the one detected for
// the file, never a fixed index (igz.types.per-file-indices). It is NOT an editable visibility property and not
// a script simulator: where a script later creates or activates the object is not read here.
export function sceneRoles(session) {
  if (session._sceneRoles) return session._sceneRoles;
  // The detected class of the file; a bare session (tests, partial views) falls back to the class word of its
  // first stored placement, which is the same thing read the other way round.
  const first = session.placements?.find(p => !p.native_addition && p.offset >= 0);
  const cls = session.detection?.placement_type ?? (first ? session.buffer.readUInt32BE(first.offset) : null);
  if (!Number.isInteger(cls)) return [];
  const inactive = p =>
    !p.native_addition &&
    p.offset >= 0 &&
    session.buffer.readUInt32BE(p.offset) === cls &&
    (session.buffer.readUInt32BE(p.offset + 0x54) & 1) !== 0;
  const roles = session.placements.filter(inactive).map(p => ({
    offset: p.offset,
    role: 'template_or_inactive',
    confidence: 'LIKELY',
    editable: false,
    counterparts: session.placements
      .filter(
        q =>
          !inactive(q) &&
          q.offset !== p.offset &&
          q.name?.replace(/\(\d+\)$/, '') === p.name?.replace(/\(\d+\)$/, '') &&
          q.model?.offset === p.model?.offset &&
          q.behavior?.offset === p.behavior?.offset,
      )
      .map(q => ({ offset: q.offset, name: q.name })),
  }));
  session._sceneRoles = roles;
  return roles;
}
