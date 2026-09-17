// Install a reviewed recipe only for a cold, editor-owned research session.
import fs from 'node:fs';
import path from 'node:path';
import { profile, portOccupied, bridgeCall } from '../../../dolphin-mcp/runtime.mjs';
import {
  compileNativePatch,
  nativeOptions,
  FACTORY_HASH,
  ACTIVATION_HASH,
  NATIVE_MAGIC,
  NATIVE_HEADER_MAGIC,
  NATIVE_STRIDE,
  TABLE,
  TABLE_STRIDE,
} from './native-patch.mjs';
import { sha256 as hash } from '../util/hash.mjs';
import {
  ATTEMPT_CREATED,
  GECKO_AREA,
  HEAP,
  INSTANCE,
  INSTANCE_BYTES,
  PLACEMENT_CLASS,
  SLOT,
  STATE_ACTIVE,
  readVector,
} from './native-layout.mjs';
export const readNativeBytes = async (address, length) =>
  Buffer.from(await bridgeCall('memory.read_bytes', [address, length]), 'hex');

export async function installNativePatch(
  native,
  { directory = profile, occupied = portOccupied, compiler = compileNativePatch } = {},
) {
  // The patch names the options it was compiled with (another level's base and anchor, the layout); a patch
  // without them is a tutorial patch from before they existed.
  const recipe = compiler(native.additions, native.options ?? {});
  if (
    hash(recipe.ini) !== native.sha256 ||
    !fs.existsSync(native.file) ||
    hash(fs.readFileSync(native.file)) !== native.sha256
  )
    throw Error(
      'Native addition patch does not match its reviewed recipe. Rebuild the patch with this editor version.',
    );
  if (await occupied()) throw Error('Close the previous research Dolphin before installing this native patch.');
  fs.mkdirSync(directory, { recursive: true });
  const lease = path.join(directory, 'portalforge-native.lock');
  let fd;
  try {
    fd = fs.openSync(lease, 'wx');
  } catch {
    throw Error('A native patch session already owns this research profile.');
  }
  const files = [path.join(directory, 'Config/Dolphin.ini'), path.join(directory, 'GameSettings/SSPP52.ini')];
  const previous = files.map(f => (fs.existsSync(f) ? fs.readFileSync(f) : null));
  const restore = () => {
    for (let i = 0; i < files.length; i++) {
      if (previous[i] === null) {
        if (fs.existsSync(files[i])) fs.unlinkSync(files[i]);
      } else fs.writeFileSync(files[i], previous[i]);
    }
    fs.closeSync(fd);
    fs.unlinkSync(lease);
  };
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, previous: previous.map(b => b?.toString('base64') ?? null) }),
    );
    const game = previous[1]?.toString('utf8') ?? '';
    if (/^\s*\[Gecko/m.test(game))
      throw Error(
        'The research profile already contains Gecko codes; keep them in a separate profile before using native additions.',
      );
    const config = previous[0]?.toString('utf8') ?? '';
    const lines = config.split(/\r?\n/);
    let start = lines.findIndex(l => l.trim() === '[Core]');
    if (start < 0) {
      lines.push('[Core]');
      start = lines.length - 1;
    }
    let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
    if (end < 0) end = lines.length;
    const key = lines.findIndex((l, i) => i > start && i < end && /^\s*EnableCheats\s*=/.test(l));
    if (key >= 0) lines[key] = 'EnableCheats = True';
    else lines.splice(end, 0, 'EnableCheats = True');
    files.forEach(f => fs.mkdirSync(path.dirname(f), { recursive: true }));
    fs.writeFileSync(files[0], lines.join('\n'));
    fs.writeFileSync(files[1], game + '\n' + recipe.ini);
    return restore;
  } catch (e) {
    restore();
    throw e;
  }
}

export async function verifyNativeFactory(read = readNativeBytes) {
  if (hash(await read(0x80041984, 0x1f0)) !== FACTORY_HASH)
    throw Error('Native factory fingerprint differs: this game revision is not supported.');
  if (hash(await read(0x80062860, 0x328)) !== ACTIVATION_HASH)
    throw Error('Native activation manager fingerprint differs: this game revision is not supported.');
}

// Where each addition's bookkeeping sits in a dump of the Gecko area: the words the compiled code writes as it
// runs. One list of matches per addition, in the order given; a consumed patch has exactly one match each.
export function locateAdditionRows(memory, additions, options = {}) {
  const { base, layout } = nativeOptions(options);
  const found = [];
  if (layout === 'table') {
    for (let off = 0; off + 0x10 + NATIVE_STRIDE <= memory.length; off += 4) {
      if (memory.readUInt32BE(off) !== NATIVE_HEADER_MAGIC || memory.readUInt32BE(off + 12) !== TABLE_STRIDE) continue;
      const count = memory.readUInt32BE(off + 8),
        first = off + 0x10 + NATIVE_STRIDE;
      if (!count || first + count * TABLE_STRIDE > memory.length) continue;
      for (let at = first; at < first + count * TABLE_STRIDE; at += TABLE_STRIDE)
        found.push({
          at,
          id: memory.readInt32BE(at + TABLE.id),
          source: memory.readUInt32BE(at + TABLE.source),
          attempt: memory.readUInt32BE(at + TABLE.attempt),
          pointer: memory.readUInt32BE(at + TABLE.pointer),
        });
    }
  } else {
    for (let at = 0; at + NATIVE_STRIDE <= memory.length; at += 4) {
      if (memory.readUInt32BE(at) !== NATIVE_MAGIC) continue;
      found.push({
        at,
        id: memory.readInt32BE(at + SLOT.id),
        source: memory.readUInt32BE(at + SLOT.source),
        attempt: memory.readUInt32BE(at + SLOT.attempt),
        pointer: memory.readUInt32BE(at + SLOT.pointer),
      });
    }
  }
  return additions.map(a => found.filter(row => row.id === a.id && row.source === base + a.source));
}

// A consumed code is not enough: demand distinct live placements and their actors.
// Render visibility is still judged from screenshots, never inferred here.
export async function verifyNativeInstances(additions, read = readNativeBytes, options = {}) {
  const { base, context } = nativeOptions(options);
  const memory = await read(GECKO_AREA.start, GECKO_AREA.size),
    located = locateAdditionRows(memory, additions, options),
    rows = [];
  const valid = p => p % 4 === 0 && p >= HEAP.start && p + INSTANCE_BYTES <= HEAP.end;
  for (const [index, a] of additions.entries()) {
    const matches = located[index];
    if (matches.length !== 1) throw Error(`Added object ${a.id}: native recipe was not uniquely consumed.`);
    const { attempt, pointer } = matches[0];
    if (attempt !== ATTEMPT_CREATED || !valid(pointer) || pointer === base + a.source)
      throw Error(`Added object ${a.id}: native creation did not complete.`);
    const b = await read(pointer, INSTANCE_BYTES),
      source = await read(base + a.source, INSTANCE_BYTES);
    // Native metadata identifies +24 as the initial transform, +3c as current.
    // AI movement and coin animation may change the latter after creation.
    const position = readVector(b, INSTANCE.position),
      heading = b.readFloatBE(INSTANCE.heading);
    const current_position = readVector(b, INSTANCE.current_position),
      current_heading = b.readFloatBE(INSTANCE.current_heading);
    const script = a.script == null ? 0 : base + a.script;
    if (b.readUInt32BE(INSTANCE.script) !== script)
      throw Error(`Added object ${a.id}: source script was not retained.`);
    // The validated context creates a script-less copy only from a source that is itself active. In the
    // activation context the source may be a stored template, which never has an actor: it is identified by
    // its class and its script instead.
    const sourceValid =
      a.script == null && context === 'validated'
        ? valid(source.readUInt32BE(INSTANCE.actor))
        : source.readUInt32BE(INSTANCE.class) === PLACEMENT_CLASS && source.readUInt32BE(INSTANCE.script) === script;
    if (
      b.readUInt32BE(INSTANCE.class) !== PLACEMENT_CLASS ||
      b.readUInt32BE(INSTANCE.state) !== STATE_ACTIVE ||
      b.readUInt32BE(INSTANCE.parent) !== base + a.source ||
      b.readUInt32BE(INSTANCE.model) !== base + a.model ||
      !valid(b.readUInt32BE(INSTANCE.actor)) ||
      !sourceValid ||
      b.readUInt32BE(INSTANCE.actor) === source.readUInt32BE(INSTANCE.actor) ||
      position.some((n, i) => !Number.isFinite(n) || Math.abs(n - a.position[i]) > 0.002) ||
      !Number.isFinite(heading) ||
      Math.abs(heading - a.heading) > 0.02
    )
      throw Error(`Added object ${a.id}: runtime placement does not match the patch.`);
    if (current_position.some(n => !Number.isFinite(n)) || !Number.isFinite(current_heading))
      throw Error(`Added object ${a.id}: current transform is not finite.`);
    const actor_parameters = b.readUInt32BE(0xe0),
      local_variables = b.readUInt32BE(0xb0);
    if (
      a.script != null &&
      source.readUInt32BE(0xe0) &&
      (!valid(actor_parameters) || actor_parameters === source.readUInt32BE(0xe0))
    )
      throw Error(`Added object ${a.id}: actor parameters are not independent.`);
    if (local_variables && local_variables === source.readUInt32BE(0xb0))
      throw Error(`Added object ${a.id}: local script variables are shared with the source.`);
    rows.push({
      id: a.id,
      pointer,
      actor: b.readUInt32BE(0xf4),
      source_actor: source.readUInt32BE(0xf4),
      position,
      heading,
      current_position,
      current_heading,
      actor_parameters,
      local_variables,
    });
  }
  if (new Set(rows.map(r => r.pointer)).size !== rows.length || new Set(rows.map(r => r.actor)).size !== rows.length)
    throw Error('Native additions reused an existing object.');
  for (const key of ['actor_parameters', 'local_variables']) {
    const values = rows.map(r => r[key]).filter(Boolean);
    if (new Set(values).size !== values.length) throw Error(`Native additions share ${key}.`);
  }
  return { verified: true, method: 'MEM1 native instances and actors', objects: rows };
}

// Scripts may destroy a successfully created actor during the macro. Preserve
// the earlier proof separately from final survival; never relax static checks.
export async function verifyNativeLifecycle(additions, observations, verify = verifyNativeInstances, options = {}) {
  try {
    return { ...(await verify(additions, undefined, options)), lifecycle: 'present_at_end' };
  } catch (error) {
    const earlier = observations.find(o => o.verified && additions.every(a => o.objects.some(p => p.id === a.id)));
    if (!additions.some(a => a.script != null) || !earlier) throw error;
    const statics = additions.filter(a => a.script == null);
    if (statics.length) await verify(statics, undefined, options);
    return { ...earlier, lifecycle: 'changed_after_creation', final_verified: false, final_error: error.message };
  }
}
