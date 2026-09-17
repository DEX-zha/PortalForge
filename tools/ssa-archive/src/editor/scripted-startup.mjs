// The small set of startup assemblies already compared with Dolphin. Shared by
// the preview and resource navigation so a dock cannot be offered as a bridge.
export const STARTUP_TEMPLATES = new Set([
  'Template_Bridge_whole',
  'Template_Dock_whole',
  'Push_Canon_Art_Top',
  'Push_Canon_Art_Bottom',
]);

export function startupParts(session, owner) {
  if (owner.native_addition) return null;
  const script = owner.behavior?.path ?? '';
  const bridge = /\/Level_027\/Scripts\/Bridge_Spawner\.ai$/i.test(script);
  const cannon =
    /\/Includes\/GameElement_PushBlock\/Scripts\/PushBlock_Template\.ai$/i.test(script) &&
    session.placements.some(p => /\/Level_027\/Scripts\/Bridge_Spawner\.ai$/i.test(p.behavior?.path ?? ''));
  if (!bridge && !cannon) return null; // No startup interpretation for this script.
  const b = session.buffer;
  if (b.readUInt32BE(owner.offset) !== 104 || b.readUInt32BE(owner.offset + 0x54) & 1) return [];
  const id = b.readUInt32BE(owner.offset + 0x20);
  if (bridge && id === 0) return [{ name: 'Template_Bridge_whole', heading_offset: -90 }];
  if (bridge && id === 1) return [{ name: 'Template_Dock_whole', heading_offset: -90 }];
  if (cannon && id === 10) return [{ name: 'Push_Canon_Art_Top' }, { name: 'Push_Canon_Art_Bottom', fixed_heading: 0 }];
  return [];
}
