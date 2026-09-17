// SSA SSPP52 Rev 1 native placement recipe. This compiler is not a capability
// decision: native-additions.mjs checks the finding and the source catalogue.
// Gecko owns the code region; no IGZ insertion or guessed code cave is used.
//
// What is level-specific is data, and the defaults are the tutorial's, so the boot-proven output does not
// change: `base` is where the level's resident section sits in MEM1 and `anchor` is a placement whose
// activation says the level is ready. Both come from a scene snapshot on the other levels (native-params.mjs).
//
// Two call contexts. `validated` is what the tutorial proved: script-less sources at the return of the game's
// own clone call, scripted ones in the activation manager. `activation` runs every addition in the activation
// manager behind the anchor, which does not depend on a script cloning something at level start.
//
// Two data layouts. `slot` is the proven one: 144 bytes per addition, the factory's argument block living in
// the slot. `table` keeps 40 bytes per addition and one shared argument block, rebuilt before every call.
export const NATIVE_BASE = 0x80dbc020;
export const TUTORIAL_ANCHOR = 0x81105604; // the sunflower source, active with an actor when the level is ready
// Mixed eight-copy proof: level.prop.native-addition-capacity. Keep the byte guard.
export const NATIVE_LIMIT = 8;
// What Dolphin's Gecko area leaves for codes once its code handler is installed.
export const GECKO_CODE_BUDGET = 3256;
export const NATIVE_MAGIC = 0x50464e41;
export const NATIVE_HEADER_MAGIC = 0x50464e48;
export const NATIVE_STRIDE = 0x90;
export const TABLE_STRIDE = 0x28;
// A row of the `table` layout. The first two words are written by the code as it runs.
export const TABLE = {
  attempt: 0x00,
  pointer: 0x04,
  id: 0x08,
  position: 0x0c,
  source: 0x18,
  heading: 0x1c,
  model: 0x20,
  script: 0x24,
};
const PLACEMENT_CLASS = 0x80481674;
const MEM1_END = 0x81800000;
const CONTEXTS = ['validated', 'activation'];
const LAYOUTS = ['slot', 'table'];
export const FACTORY_HASH = '8fcf8ff29324baff5246ef8dbf3dcab41c983941b8ac603b7554fff8bd2b42a3';
export const ACTIVATION_HASH = '77ce73ad478b451bf6bf01c67104fbc439e5dc5a09818351bcf36babc9cd0b18';
const hex = n => (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
const floatWord = n => {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, n);
  return b.getUint32(0);
};
class PPC {
  words = [];
  labels = new Map();
  fixups = [];
  emit(w) {
    this.words.push(w >>> 0);
  }
  label(s) {
    this.labels.set(s, this.words.length * 4);
  }
  d(op, t, a, value) {
    this.emit((op << 26) | (t << 21) | (a << 16) | (value & 65535));
  }
  lw(t, off, a) {
    this.d(32, t, a, off);
  }
  sw(t, off, a) {
    this.d(36, t, a, off);
  }
  li(t, v) {
    this.d(14, t, 0, v);
  }
  imm(t, v) {
    this.d(15, t, 0, v >>> 16);
    this.d(24, t, t, v & 65535);
  }
  spr(write, t, s) {
    this.emit((31 << 26) | (t << 21) | ((s & 31) << 16) | ((s & 992) << 6) | ((write ? 467 : 339) << 1));
  }
  cmpi(r, v) {
    this.d(11, 0, r, v);
  }
  cmp(a, b, unsigned = false) {
    this.emit((31 << 26) | (a << 16) | (b << 11) | (unsigned ? 64 : 0));
  }
  mr(t, s) {
    this.emit((31 << 26) | (s << 21) | (t << 16) | (s << 11) | (444 << 1));
  }
  branch(to, bo = null, bi = null) {
    this.fixups.push({ at: this.words.length, to, bo, bi });
    this.emit(0);
  }
  done() {
    for (const f of this.fixups) {
      if (!this.labels.has(f.to)) throw Error('Missing PPC label');
      const delta = this.labels.get(f.to) - f.at * 4;
      if (Math.abs(delta) > 32764) throw Error('PPC branch exceeds bounded payload');
      this.words[f.at] =
        f.bo === null
          ? (0x48000000 | (delta & 0x3fffffc)) >>> 0
          : ((16 << 26) | (f.bo << 21) | (f.bi << 16) | (delta & 65532)) >>> 0;
    }
    return this.words;
  }
  tail() {
    if (this.words.length % 2 === 0) this.emit(0x60000000);
    this.label('tail');
    this.emit(0);
  }
}

const geckoIni = lines =>
  `[Gecko]\n$PortalForge native additions v1\n${lines.join('\n')}\n[Gecko_Enabled]\n$PortalForge native additions v1\n`;
// The options a compiled patch was built with, defaults filled in. They travel with the patch so that the
// installer recompiles exactly the same bytes.
export function nativeOptions(options = {}) {
  const base = options.base ?? NATIVE_BASE;
  const resolved = {
    base,
    anchor: options.anchor ?? (base === NATIVE_BASE ? TUTORIAL_ANCHOR : null),
    context: options.context ?? 'validated',
    layout: options.layout ?? 'slot',
    limit: options.limit ?? NATIVE_LIMIT,
  };
  const address = n => Number.isInteger(n) && n % 4 === 0 && n >= 0x80003000 && n + 0xf8 < MEM1_END;
  if (!address(resolved.base)) throw Error('Native base must be a word-aligned MEM1 address');
  if (resolved.anchor !== null && !address(resolved.anchor))
    throw Error('Native anchor must be a word-aligned MEM1 address');
  if (!CONTEXTS.includes(resolved.context)) throw Error(`Native context must be one of ${CONTEXTS.join(', ')}`);
  if (!LAYOUTS.includes(resolved.layout)) throw Error(`Native layout must be one of ${LAYOUTS.join(', ')}`);
  if (!Number.isInteger(resolved.limit) || resolved.limit < 1) throw Error('Native limit must be a positive integer');
  return resolved;
}

export function compileNativePatch(additions, options = {}) {
  const settings = nativeOptions(options);
  const everything = settings.context === 'activation';
  // Scripted sources and experimental ones (any source without its own confirmed recipe, a stored template for
  // one) are created from the activation manager; a confirmed script-less source keeps its validated hook.
  const viaActivation = a => a?.script != null || a?.experimental === true;
  const scripted = Array.isArray(additions) && additions.some(viaActivation);
  // Validate the whole request before partitioning: IDs and capacity are global.
  const result = compile(additions, { ...options, ...settings, probe: everything || scripted });
  if (everything || !scripted || additions.every(viaActivation)) return { ...result, options: settings };
  // Keep each recipe's independently validated call context in mixed batches.
  const parts = [false, true].map(probe =>
    compile(
      additions.filter(a => viaActivation(a) === probe),
      { ...options, ...settings, probe },
    ),
  );
  const lines = parts.flatMap(p => p.lines),
    bytes = lines.length * 8;
  if (bytes > GECKO_CODE_BUDGET) throw Error('Native additions exceed the reserved Gecko code capacity');
  return {
    ...result,
    bytes,
    records_offset: null,
    hooks: parts.flatMap(p => p.hooks),
    lines,
    ini: geckoIni(lines),
    options: settings,
  };
}
// Experimental factory invocation. This does not grant an editable capability.
export const compileNativeProbe = (additions, options = {}) => compileNativePatch(additions, options);

// How many additions of one kind the Gecko budget holds with these options: measured by compiling, because the
// code, the padding and the line framing all count. A mixed batch in the `validated` context carries the code
// twice and holds fewer; its real size is checked when it is compiled.
export function nativeCapacity(options = {}, { scripted = false } = {}) {
  const settings = nativeOptions(options);
  const sample = i => ({
    id: -i - 1,
    source: 0,
    model: 0,
    position: [0, 0, 0],
    heading: 0,
    scale: 100,
    ...(scripted ? { script: 0 } : {}),
  });
  let count = 0;
  for (let n = 1; n <= 512; n++) {
    try {
      compile(
        Array.from({ length: n }, (_, i) => sample(i)),
        { ...settings, limit: n, probe: settings.context === 'activation' || scripted },
      );
      count = n;
    } catch {
      break;
    }
  }
  return count;
}

function compile(
  additions,
  {
    scaleHook = false,
    probe = false,
    base = NATIVE_BASE,
    anchor = TUTORIAL_ANCHOR,
    layout = 'slot',
    limit = NATIVE_LIMIT,
  } = {},
) {
  const table = layout === 'table';
  if (!Array.isArray(additions) || !additions.length || additions.length > limit)
    throw Error(`Native patch requires 1..${limit} additions`);
  if (probe && anchor === null) throw Error('This level has no readiness anchor: take a scene snapshot first');
  const ids = new Set();
  for (const a of additions) {
    if (!a || !Number.isInteger(a.id) || a.id < -2147483648 || a.id >= 0 || ids.has(a.id))
      throw Error('Addition identities must be distinct negative int32 integers');
    ids.add(a.id);
    // A source with nothing to draw (a trigger, a spawner) has no model record: its model word is zero.
    for (const k of a.model == null ? ['source'] : ['source', 'model'])
      if (!Number.isInteger(a[k]) || a[k] < 0 || base + a[k] + 0xf8 >= MEM1_END || a[k] % 4)
        throw Error('Invalid resident source/model offset');
    if (
      !Array.isArray(a.position) ||
      a.position.length !== 3 ||
      [...a.position, a.heading, a.scale].some(n => !Number.isFinite(n) || !Number.isFinite(Math.fround(n)))
    )
      throw Error('Native transform must be finite float32');
    if (a.scale <= 0 || a.scale > 1000) throw Error('Native scale must be in (0,1000]');
    if (a.scale !== 100) throw Error('Native additions currently require the source scale of 100%');
    if (
      probe &&
      a.script != null &&
      (!Number.isInteger(a.script) || a.script < 0 || a.script % 4 || base + a.script >= MEM1_END)
    )
      throw Error('Invalid script offset');
  }
  const p = new PPC(),
    guardZero = (r, yes = false) => {
      p.cmpi(r, 0);
      p.branch('next', yes ? 12 : 4, 2);
    };
  p.d(37, 1, 1, -0x200);
  p.sw(0, 8, 1);
  p.d(47, 2, 1, 0x10);
  for (const [s, o] of [
    [8, 0x90],
    [9, 0x98],
    [1, 0x9c],
  ]) {
    p.spr(false, 0, s);
    p.sw(0, o, 1);
  }
  p.emit(0x7c000026);
  p.sw(0, 0x94, 1);
  for (let i = 0; i < 14; i++) p.d(54, i, 1, 0xa0 + i * 8);
  p.emit(0xfc00048e);
  p.d(54, 0, 1, 0x110);
  p.emit(0x48000005);
  p.label('pc');
  p.spr(false, 30, 8);
  const dataFix = p.words.length;
  p.emit(0); // r30 = payload header, resolved below
  p.lw(0, 4, 30);
  p.cmpi(0, 0);
  p.branch('restore', 4, 2);
  if (probe) {
    // The activation manager's r30 is its native observer list. Clones with a
    // nonzero activation range were disposed of after early creation. The
    // validated recipe waits for observers at this boundary; retain the range,
    // ID, parameters and script, and let native activation keep controlling it.
    p.lw(3, 0x80, 1);
    p.cmpi(3, 0);
    p.branch('restore', 12, 2);
    p.lw(0, 8, 3);
    p.cmpi(0, 0);
    p.branch('restore', 12, 2);
    // A placement known to be active with an actor once the level is ready. On the tutorial it is the
    // independently validated sunflower source; elsewhere it comes from the level's scene snapshot.
    p.imm(3, anchor);
    p.lw(0, 0, 3);
    p.imm(4, PLACEMENT_CLASS);
    p.cmp(0, 4);
    p.branch('restore', 4, 2);
    p.lw(0, 0x54, 3);
    p.cmpi(0, 1);
    p.branch('restore', 4, 2);
    p.lw(0, 0xf4, 3);
    p.cmpi(0, 0);
    p.branch('restore', 12, 2);
  }
  p.li(0, 1);
  p.sw(0, 4, 30);
  p.li(29, additions.length);
  // r31 walks the additions. In the table layout r28 is the one argument block every call shares, laid out
  // like a slot so that the factory sees exactly what the proven layout showed it.
  if (table) p.d(14, 28, 30, 0x10);
  p.d(14, 31, 30, table ? 0x10 + NATIVE_STRIDE : 0x10);
  const row = table ? TABLE : { attempt: 0x04, pointer: 0x08, source: 0x2c, model: 0x84, script: 0x88 };
  const block = table ? 28 : 31;
  p.label('loop');
  p.lw(0, row.attempt, 31);
  guardZero(0);
  p.lw(3, row.source, 31);
  p.lw(4, 0, 3);
  p.imm(0, PLACEMENT_CLASS);
  p.cmp(4, 0);
  p.branch('next', 4, 2);
  if (probe) {
    p.lw(0, 0xa8, 3);
    p.lw(4, row.script, 31);
    p.cmp(0, 4);
    p.branch('next', 4, 2);
  } else {
    p.lw(0, 0xa8, 3);
    guardZero(0);
  }
  p.lw(0, 0x5c, 3);
  guardZero(0);
  p.lw(4, 0xdc, 3);
  p.lw(0, row.model, 31);
  p.cmp(4, 0);
  p.branch('next', 4, 2);
  if (!probe) {
    p.lw(0, 0x54, 3);
    p.cmpi(0, 1);
    p.branch('next', 4, 2);
    p.lw(0, 0xf4, 3);
    guardZero(0, true);
  }
  p.li(0, 1);
  p.sw(0, row.attempt, 31);
  if (table) {
    // Rebuild the shared block from nothing, so that no call sees what the previous one left in it.
    p.mr(4, 28);
    p.li(0, 0);
    p.li(5, NATIVE_STRIDE / 4);
    p.label('zero');
    p.sw(0, 0, 4);
    p.d(14, 4, 4, 4);
    p.d(14, 5, 5, -1);
    p.cmpi(5, 0);
    p.branch('zero', 4, 2);
    for (const [from, to] of [
      [TABLE.id, 0x1c],
      [TABLE.position, 0x20],
      [TABLE.position + 4, 0x24],
      [TABLE.position + 8, 0x28],
      [TABLE.source, 0x2c],
      [TABLE.heading, 0x70],
      [TABLE.model, 0x84],
      [TABLE.script, 0x88],
    ]) {
      p.lw(0, from, 31);
      p.sw(0, to, 28);
    }
    p.imm(0, floatWord(100)); // the only scale the recipe is proven at
    for (const o of [0x78, 0x7c, 0x80]) p.sw(0, o, 28);
  } else {
    p.lw(0, 0x14, 1);
    p.sw(0, 0xc, 31);
    p.lw(0, -19944, 13);
    p.sw(0, 0x10, 31);
  }
  p.lw(0, 0xf4, 3);
  p.sw(0, 0x18, block);
  p.d(14, 0, block, 0x50);
  p.sw(0, 0x38, block);
  p.imm(0, 0x8005c4d0);
  p.sw(0, 0x44, block);
  p.lw(0, -19764, 13);
  p.sw(0, 0x6c, block);
  p.d(14, 4, block, 0x20);
  p.d(14, 5, block, 0x30);
  p.imm(12, 0x80041984);
  p.spr(true, 12, 9);
  p.emit(0x4e800421);
  p.label('factory_return');
  p.sw(3, row.pointer, 31);
  if (!table) {
    p.lw(0, -19944, 13);
    p.sw(0, 0x14, 31);
  }
  p.li(0, 2);
  p.sw(0, row.attempt, 31);
  p.label('next');
  p.d(14, 31, 31, table ? TABLE_STRIDE : NATIVE_STRIDE);
  p.d(14, 29, 29, -1);
  p.cmpi(29, 0);
  p.branch('loop', 4, 2);
  p.li(0, 0);
  p.sw(0, 4, 30);
  p.label('restore');
  p.d(50, 0, 1, 0x110);
  p.emit(0xfdfe058e);
  for (let i = 0; i < 14; i++) p.d(50, i, 1, 0xa0 + i * 8);
  for (const [s, o] of [
    [8, 0x90],
    [9, 0x98],
    [1, 0x9c],
  ]) {
    p.lw(0, o, 1);
    p.spr(true, 0, s);
  }
  p.lw(0, 0x94, 1);
  p.emit(0x7c0ff120);
  p.d(46, 2, 1, 0x10);
  p.lw(0, 8, 1);
  p.d(14, 1, 1, 0x200);
  p.emit(probe ? 0x7f03c378 : 0x7c7d1b78);
  p.branch('tail');
  p.label('data');
  p.emit(NATIVE_HEADER_MAGIC);
  p.emit(0);
  p.emit(additions.length);
  p.emit(table ? TABLE_STRIDE : NATIVE_STRIDE);
  if (table) for (let i = 0; i < NATIVE_STRIDE / 4; i++) p.emit(0); // the shared argument block
  p.label('records');
  for (const a of additions) {
    const words = Array((table ? TABLE_STRIDE : NATIVE_STRIDE) / 4).fill(0);
    const script = a.script == null ? 0 : base + a.script;
    if (table) {
      words[TABLE.id / 4] = a.id >>> 0;
      a.position.forEach((v, i) => (words[TABLE.position / 4 + i] = floatWord(v)));
      words[TABLE.source / 4] = base + a.source;
      words[TABLE.heading / 4] = floatWord(a.heading);
      words[TABLE.model / 4] = a.model == null ? 0 : base + a.model;
      words[TABLE.script / 4] = script;
    } else {
      words[0] = NATIVE_MAGIC;
      words[0x1c / 4] = a.id >>> 0;
      a.position.forEach((v, i) => (words[8 + i] = floatWord(v)));
      words[0x2c / 4] = base + a.source;
      words[0x70 / 4] = floatWord(a.heading);
      for (const o of [0x78, 0x7c, 0x80]) words[o / 4] = floatWord(a.scale);
      words[0x84 / 4] = a.model == null ? 0 : base + a.model;
      if (probe) words[0x88 / 4] = script;
    }
    words.forEach(w => p.emit(w));
  }
  p.words[dataFix] = ((14 << 26) | (30 << 21) | (30 << 16) | (p.labels.get('data') - p.labels.get('pc'))) >>> 0;
  p.tail();
  // A second, separately guarded hook can set scale before native activation.
  // It remains opt-in until the scale recipe has its own in-game evidence.
  const hooks = [
    { address: probe ? 0x80062b88 : 0x800445c8, original: probe ? 0x7f03c378 : 0x7c7d1b78, words: p.done() },
  ];
  if (scaleHook) throw Error('Individual native scale has not been validated');
  const lines = [];
  for (const h of hooks) {
    lines.push(
      '20000000 53535050',
      '20000004 35320001',
      '20041984 9421FFD0',
      '2005C4D0 80A30008',
      hex(0x20000000 | (h.address & 0x1ffffff)) + ' ' + hex(h.original),
    );
    lines.push(hex(0xc2000000 | (h.address & 0x1ffffff)) + ' ' + hex(h.words.length / 2));
    for (let i = 0; i < h.words.length; i += 2) lines.push(hex(h.words[i]) + ' ' + hex(h.words[i + 1]));
    lines.push('E0000000 80008000');
  }
  if (lines.length * 8 > GECKO_CODE_BUDGET) throw Error('Native additions exceed the reserved Gecko code capacity');
  return {
    version: 1,
    game: 'SSPP52',
    revision: 1,
    count: additions.length,
    bytes: lines.length * 8,
    records_offset: p.labels.get('records'),
    stride: table ? TABLE_STRIDE : NATIVE_STRIDE,
    hooks,
    lines,
    ini: geckoIni(lines),
  };
}
