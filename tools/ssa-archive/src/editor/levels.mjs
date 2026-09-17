// The level every confirmed editing recipe was proven on. A recipe that reads "tutorial only" checks this one
// constant, so widening support to another level is a deliberate change in one place.
export const TUTORIAL_ARCHIVE = 'level/level_027_tutorial.bld';

// Disc paths are compared case-insensitively: the game's own file table is not consistent about case.
export const isTutorial = archive => archive?.toLowerCase() === TUTORIAL_ARCHIVE;

// The decoded, unmodified level entry of the tutorial (SSPP52 Rev 1). A family test must start from it: a
// result measured on an edited level would describe the edit as much as the object.
export const ORIGINAL_TUTORIAL_SHA256 = '2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f';
