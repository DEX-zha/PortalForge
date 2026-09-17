// Read-only previews of objects a script assembles at start-up (bridges, cannons): where the parts stand when
// the level begins. They are LIKELY, never editable, and nothing here executes a script.
import { scriptDiagnostics } from './script-diagnostics.mjs';
import { startupParts } from './scripted-startup.mjs';

// Startup poses compared with the actors' template/creator pointers and model
// matrices in Dolphin (docs/editor/scene-poses.md). No general script execution.
export function scriptedPreviews(session) {
  const previews = [];
  const add = (owner, templateName, headingOffset = 0, fixedHeading = null) => {
    const resource = scriptDiagnostics(session, owner).clones.find(c => c.name === templateName);
    const template = session.placements.find(t => t.offset === resource?.offset);
    if (template?.model?.offset == null) return;
    previews.push({
      owner: owner.offset,
      name: owner.name,
      model: template.model.offset,
      template: template.offset,
      position: owner.position,
      heading: fixedHeading ?? owner.rotation.heading + headingOffset,
      heading_offset: headingOffset,
      fixed_heading: fixedHeading,
      scale: template.scale,
      scale_mode: 'template',
      confidence: 'LIKELY',
      editable: false,
    });
  };
  for (const p of session.placements) {
    for (const part of startupParts(session, p) ?? []) add(p, part.name, part.heading_offset, part.fixed_heading);
  }
  return previews;
}
