import { scriptDiagnostics } from './script-diagnostics.mjs';

// Startup poses compared with the actors' template/creator pointers and model
// matrices in Dolphin (docs/editor-scene-poses.md). No general script execution.
export function scriptedPreviews(session) {
  const previews = [];
  const add = (owner, templateName, headingOffset = 0, fixedHeading = null) => {
    const resource = scriptDiagnostics(session, owner).clones.find(c => c.name === templateName);
    const template = session.placements.find(t => t.offset === resource?.offset);
    if (template?.model?.offset == null) return;
    previews.push({ owner: owner.offset, name: owner.name, model: template.model.offset, template: template.offset,
      position: owner.position, heading: fixedHeading ?? owner.rotation.heading + headingOffset,
      heading_offset: headingOffset, fixed_heading: fixedHeading,
      scale: template.scale, scale_mode: 'template', confidence: 'LIKELY', editable: false });
  };
  for (const p of session.placements) {
    if (session.buffer.readUInt32BE(p.offset) !== 104 || session.buffer.readUInt32BE(p.offset + 0x54) & 1) continue;
    const id = session.buffer.readUInt32BE(p.offset + 0x20);
    if (/\/Level_027\/Scripts\/Bridge_Spawner\.ai$/i.test(p.behavior?.path ?? '')) {
      // The model actor is 90 degrees clockwise from its creator, not at the
      // stored template transform and not at the creator's own heading.
      if (id === 0) add(p, 'Template_Bridge_whole', -90);
      if (id === 1) add(p, 'Template_Dock_whole', -90);
    }
    if (id === 10 && /\/Includes\/GameElement_PushBlock\/Scripts\/PushBlock_Template\.ai$/i.test(p.behavior?.path ?? '')
      && session.placements.some(q => /\/Level_027\/Scripts\/Bridge_Spawner\.ai$/i.test(q.behavior?.path ?? ''))) {
      add(p, 'Push_Canon_Art_Top');
      add(p, 'Push_Canon_Art_Bottom', 0, 0);
    }
  }
  return previews;
}
