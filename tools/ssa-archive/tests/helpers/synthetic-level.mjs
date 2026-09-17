// A synthetic level for the editor tests (feature 003): four placements of an arbitrary class index, so the
// structural detector is exercised rather than a hardcoded type; three resolve a shared model, one is a marker;
// a named list claims three of them so layers exist and one placement stays unlayered.
//
// `syntheticFixups` builds the runtime map the duplication path needs: the editor refuses to duplicate on a level
// with no pointer evidence, so a test that exercises a replacement must supply one.
import { buildIgz } from './synthetic-igz.mjs';

const P = 0x120;
const MODEL_FIELD = 0xdc;

export function syntheticLevel({ placementType = 77, modelType = 12 } = {}) {
  const strings = ['Crate_01', 'C:/tfb/Content/Models/Objects/crate.mdl', 'Barrel_01', 'CS_Camera01', 'Props'];
  const at = [];
  let acc = 0;
  for (const s of strings) {
    at.push(acc);
    acc += s.length + 1;
  }
  const str = i => (0x01000000 | at[i]) >>> 0;
  return buildIgz({
    types: Array.from({ length: 120 }, (_, i) => 't' + i),
    strings,
    objects: [
      {
        type: placementType,
        size: P,
        fields: [
          { at: 0x08, u32: str(0) },
          { at: 0x24, f32: 10 },
          { at: 0x28, f32: 2 },
          { at: 0x2c, f32: -3 },
          { at: 0x34, f32: 90 },
          { at: 0xb8, f32: 100 },
          { at: MODEL_FIELD, obj: 4 },
        ],
      },
      {
        type: placementType,
        size: P,
        fields: [
          { at: 0x08, u32: str(2) },
          { at: 0x24, f32: 20 },
          { at: 0x28, f32: 2 },
          { at: 0x2c, f32: 5 },
          { at: 0x34, f32: 0 },
          { at: 0xb8, f32: 100 },
          { at: MODEL_FIELD, obj: 4 },
        ],
      },
      {
        type: placementType,
        size: P,
        fields: [
          { at: 0x08, u32: str(3) },
          { at: 0x24, f32: 1 },
          { at: 0x28, f32: 1 },
          { at: 0x2c, f32: 1 },
          { at: 0x34, f32: 0 },
          { at: 0xb8, f32: 100 },
        ],
      },
      {
        type: placementType,
        size: P,
        fields: [
          { at: 0x08, u32: str(0) },
          { at: 0x24, f32: 30 },
          { at: 0x28, f32: 2 },
          { at: 0x2c, f32: 7 },
          { at: 0x34, f32: 0 },
          { at: 0xb8, f32: 100 },
          { at: MODEL_FIELD, obj: 4 },
        ],
      },
      { type: modelType, size: 0x20, fields: [{ at: 0x08, u32: str(1) }] },
      {
        type: 40,
        size: 0x40,
        fields: [
          { at: 0x08, u32: str(4) },
          { at: 0x20, obj: 0 },
          { at: 0x24, obj: 1 },
          { at: 0x28, obj: 3 },
        ],
      },
    ],
    headTable: [0, 1, 2, 3, 4, 5],
  });
}

// The words the game would rewrite at load: each placement's model pointer and the list's three members.
export function syntheticFixups(built) {
  const [p0, p1, , p3, , list] = built.objectOffsets;
  return {
    section_offset: built.sections.s1,
    pointer_words: [p0 + MODEL_FIELD, p1 + MODEL_FIELD, p3 + MODEL_FIELD, list + 0x20, list + 0x24, list + 0x28],
    head_pointer_words: built.headPointerWords ?? [],
    id_words: [],
    cross_pointer_words: [],
  };
}
