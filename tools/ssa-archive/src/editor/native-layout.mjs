// Memory layout the native-addition recipe relies on, for SSPP52 Rev 1; see feature 005 research.md.
// Factory and activation fingerprints guard the known executable paths before a run. They do not
// independently validate every layout constant or establish compatibility with another revision.

// The range the Gecko code handler reserves for codes; the recipe keeps its per-addition slots there.
export const GECKO_AREA = { start: 0x80001800, size: 0x1800 };

// Where a created instance may legitimately live: above the code handler, inside MEM1.
export const HEAP = { start: 0x80003000, end: 0x81800000 };

// One slot per addition, written by the compiled code as it runs.
export const SLOT = {
  magic: 0x00,
  attempt: 0x04, // 0 = guards not passed yet, 2 = the factory returned
  pointer: 0x08, // the instance the factory returned
  id: 0x1c,
  source: 0x2c,
};
export const ATTEMPT_CREATED = 2;

// A placement instance in RAM. `position` and `heading` are the initial transform the patch asked for; the
// `current_*` pair is what AI movement and animation change afterwards.
export const INSTANCE = {
  class: 0x00,
  position: 0x24,
  heading: 0x34,
  current_position: 0x3c,
  current_heading: 0x4c,
  state: 0x54,
  parent: 0x5c,
  script: 0xa8,
  model: 0xdc,
  actor: 0xf4,
};
export const INSTANCE_BYTES = 0xf8;
export const PLACEMENT_CLASS = 0x80481674; // class pointer of a constructed placement
export const STATE_ACTIVE = 1;

export const readVector = (bytes, offset) => [0, 4, 8].map(n => bytes.readFloatBE(offset + n));
