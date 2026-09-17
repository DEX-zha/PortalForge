// Install a reviewed recipe only for a cold, editor-owned research session.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { profile, portOccupied, bridgeCall } from '../../../dolphin-mcp/runtime.mjs';
import {
  compileNativePatch,
  FACTORY_HASH,
  ACTIVATION_HASH,
  NATIVE_MAGIC,
  NATIVE_STRIDE,
  NATIVE_BASE,
} from './native-patch.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
export const readNativeBytes = async (address, length) =>
  Buffer.from(await bridgeCall('memory.read_bytes', [address, length]), 'hex');

export async function installNativePatch(
  native,
  { directory = profile, occupied = portOccupied, compiler = compileNativePatch } = {},
) {
  const recipe = compiler(native.additions);
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

// A consumed code is not enough: demand distinct live placements and their actors.
// Render visibility is still judged from screenshots, never inferred here.
export async function verifyNativeInstances(additions, read = readNativeBytes) {
  const memory = await read(0x80001800, 0x1800),
    rows = [];
  const valid = p => p % 4 === 0 && p >= 0x80003000 && p + 0xf8 <= 0x81800000;
  for (const a of additions) {
    const matches = [];
    for (let off = 0; off + NATIVE_STRIDE <= memory.length; off += 4) {
      if (
        memory.readUInt32BE(off) === NATIVE_MAGIC &&
        memory.readInt32BE(off + 0x1c) === a.id &&
        memory.readUInt32BE(off + 0x2c) === NATIVE_BASE + a.source
      )
        matches.push(off);
    }
    if (matches.length !== 1) throw Error(`Added object ${a.id}: native recipe was not uniquely consumed.`);
    const at = matches[0],
      pointer = memory.readUInt32BE(at + 8);
    if (memory.readUInt32BE(at + 4) !== 2 || !valid(pointer) || pointer === NATIVE_BASE + a.source)
      throw Error(`Added object ${a.id}: native creation did not complete.`);
    const b = await read(pointer, 0xf8),
      source = await read(NATIVE_BASE + a.source, 0xf8);
    // Native metadata identifies +24 as the initial transform, +3c as current.
    // AI movement and coin animation may change the latter after creation.
    const position = [0, 4, 8].map(n => b.readFloatBE(0x24 + n)),
      heading = b.readFloatBE(0x34);
    const current_position = [0, 4, 8].map(n => b.readFloatBE(0x3c + n)),
      current_heading = b.readFloatBE(0x4c);
    if (b.readUInt32BE(0xa8) !== (a.script == null ? 0 : NATIVE_BASE + a.script))
      throw Error(`Added object ${a.id}: source script was not retained.`);
    const sourceValid =
      a.script == null
        ? valid(source.readUInt32BE(0xf4))
        : source.readUInt32BE(0) === 0x80481674 && source.readUInt32BE(0xa8) === NATIVE_BASE + a.script;
    if (
      b.readUInt32BE(0) !== 0x80481674 ||
      b.readUInt32BE(0x54) !== 1 ||
      b.readUInt32BE(0x5c) !== NATIVE_BASE + a.source ||
      b.readUInt32BE(0xdc) !== NATIVE_BASE + a.model ||
      !valid(b.readUInt32BE(0xf4)) ||
      !sourceValid ||
      b.readUInt32BE(0xf4) === source.readUInt32BE(0xf4) ||
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
export async function verifyNativeLifecycle(additions, observations, verify = verifyNativeInstances) {
  try {
    return { ...(await verify(additions)), lifecycle: 'present_at_end' };
  } catch (error) {
    const earlier = observations.find(o => o.verified && additions.every(a => o.objects.some(p => p.id === a.id)));
    if (!additions.some(a => a.script != null) || !earlier) throw error;
    const statics = additions.filter(a => a.script == null);
    if (statics.length) await verify(statics);
    return { ...earlier, lifecycle: 'changed_after_creation', final_verified: false, final_error: error.message };
  }
}
