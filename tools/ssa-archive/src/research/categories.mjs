// Evidence categories kept separate per FR-014, plus the container itself.
export const CATEGORIES = Object.freeze({
  container: 'IGA v4 container fields and chunk encoding',
  'igz-objects': 'IGZ object types and file structure',
  'world-entities': 'World entities: identity, position, rotation, properties',
  'visible-geometry': 'Visible geometry: meshes, vertices, materials, textures',
  collisions: 'Collision data, distinct from visible geometry',
  'gameplay-logic': 'Spawns, triggers, doors, checkpoints, level exit',
  references: 'Inter-resource references, fixups, tables and counts',
});
export const CONFIDENCE = Object.freeze(['CONFIRMED', 'LIKELY', 'UNKNOWN']);
export function assertCategory(c) {
  if (!Object.hasOwn(CATEGORIES, c)) throw new Error(`Unknown finding category "${c}"; expected one of ${Object.keys(CATEGORIES).join(', ')}`);
  return c;
}
