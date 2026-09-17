// The level every confirmed editing recipe was proven on. A recipe that reads "tutorial only" checks this one
// constant, so widening support to another level is a deliberate change in one place.
export const TUTORIAL_ARCHIVE = 'level/level_027_tutorial.bld';

// Disc paths are compared case-insensitively: the game's own file table is not consistent about case.
export const isTutorial = archive => archive?.toLowerCase() === TUTORIAL_ARCHIVE;
