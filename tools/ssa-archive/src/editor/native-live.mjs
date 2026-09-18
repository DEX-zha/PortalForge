// Additions written into the running game (feature 007, `layout: 'live'` of native-patch.mjs).
//
// A level that was never measured has no base and no anchor to compile a table with. Its patch carries the live
// routine instead: the same bytes for every level, with an empty table. Once the run has reached the level, the
// launcher measures it (the scene snapshot's own method: where the resident section sits, which placements are
// active with an actor), keeps that snapshot, and writes the table into the game: the rows, then the anchor, then
// the count. The routine does nothing while the count is zero, so it never sees half a table; it creates every
// row on the next frame the activation manager runs.
//
// The snapshot this leaves behind is the level's measure from then on: the next patch of that level compiles its
// table in (native-params.mjs), which also works when the game is played without the editor attached.
//
// The table is also how a scene holds more additions than the Gecko area has rows for. Once the routine has
// attempted every row, the launcher reads what it wrote (the attempt word and the instance the factory returned),
// keeps it, and writes the next rows over them. The Gecko budget bounds a batch, not a scene; what bounds a scene
// is the game itself, and the readings say so row by row.
import { setTimeout as sleep } from 'node:timers/promises';
import { bridgeCall } from '../../../dolphin-mcp/runtime.mjs';
import { GECKO_AREA } from './native-layout.mjs';
import {
  LIVE_HEADER,
  LIVE_HEADER_BYTES,
  LIVE_HEADER_MAGIC,
  NATIVE_STRIDE,
  TABLE,
  TABLE_STRIDE,
  assertAdditions,
  tableRowWords,
} from './native-patch.mjs';
import { readNativeBytes } from './native-run.mjs';
import { nativeParamsFor } from './native-params.mjs';
import { captureSceneSnapshot, saveSnapshot } from './scene-snapshot.mjs';

// The bridge writes a block byte by byte inside one call, and a 32-bit word the same way: a count below 256 only
// ever changes its last byte, which is what makes writing it last an atomic switch.
export const bridgeWriter = {
  bytes: (address, buffer) => bridgeCall('memory.write_bytes', [address, buffer.toString('hex')]),
  u32: (address, value) => bridgeCall('memory.write_u32', [address, value >>> 0]),
};

// The live routine's header in a dump of the Gecko area, or null when the game does not carry it.
export function locateLiveTable(memory) {
  for (let at = 0; at + LIVE_HEADER_BYTES <= memory.length; at += 4) {
    if (memory.readUInt32BE(at + LIVE_HEADER.magic) !== LIVE_HEADER_MAGIC) continue;
    if (memory.readUInt32BE(at + LIVE_HEADER.stride) !== TABLE_STRIDE) continue;
    const capacity = memory.readUInt32BE(at + LIVE_HEADER.capacity);
    const rows = at + LIVE_HEADER_BYTES + NATIVE_STRIDE;
    if (!capacity || rows + capacity * TABLE_STRIDE > memory.length) continue;
    return {
      at,
      rows,
      capacity,
      count: memory.readUInt32BE(at + LIVE_HEADER.count),
      anchor: memory.readUInt32BE(at + LIVE_HEADER.anchor),
    };
  }
  return null;
}

export function liveRows(additions, base) {
  const rows = Buffer.alloc(additions.length * TABLE_STRIDE);
  additions.forEach((addition, i) =>
    tableRowWords(addition, base).forEach((word, w) => rows.writeUInt32BE(word, i * TABLE_STRIDE + w * 4)),
  );
  return rows;
}

// Writes the table. The order is the protocol: count to zero, rows, anchor, count.
export async function writeLiveTable({ additions, base, anchor, read = readNativeBytes, write = bridgeWriter }) {
  assertAdditions(additions, { base });
  const table = locateLiveTable(await read(GECKO_AREA.start, GECKO_AREA.size));
  if (!table) throw Error('The live addition routine is not installed in this game.');
  if (additions.length > table.capacity)
    throw Error(`The live table holds ${table.capacity} additions; ${additions.length} were asked for.`);
  const header = GECKO_AREA.start + table.at;
  await write.u32(header + LIVE_HEADER.count, 0);
  await write.bytes(GECKO_AREA.start + table.rows, liveRows(additions, base));
  await write.u32(header + LIVE_HEADER.anchor, anchor);
  await write.u32(header + LIVE_HEADER.count, additions.length);
  return { header, capacity: table.capacity, written: additions.length };
}

// How long a batch is given to be attempted before the next one takes its place. The routine attempts every row
// in one pass of the activation manager, so this is a margin, not a wait; a row still untouched after it is one
// whose guards do not pass (a source that is not what the row says), and it is recorded as such.
const SETTLE = { everyMs: 250, timeoutMs: 5000 };

// What the routine wrote in the rows of the table: for each addition, its attempt word and its instance.
async function readBatch(batch, table, read) {
  const memory = await read(GECKO_AREA.start + table.rows, batch.length * TABLE_STRIDE);
  return batch.map((addition, i) => ({
    id: addition.id,
    attempt: memory.readUInt32BE(i * TABLE_STRIDE + TABLE.attempt),
    pointer: memory.readUInt32BE(i * TABLE_STRIDE + TABLE.pointer),
  }));
}

// Writes a scene of any size through the table, one batch of `capacity` rows at a time. Every batch but the last
// is waited for, read and kept in `rows` before it is overwritten; the last one stays in the table, where the
// readings find it like any other. Resolves to what the rest of the run needs to read every addition back.
export async function writeLiveBatches({
  additions,
  base,
  anchor,
  read = readNativeBytes,
  write = bridgeWriter,
  settle = SETTLE,
  wait = sleep,
}) {
  assertAdditions(additions, { base });
  const table = locateLiveTable(await read(GECKO_AREA.start, GECKO_AREA.size));
  if (!table) throw Error('The live addition routine is not installed in this game.');
  const batches = [];
  for (let i = 0; i < additions.length; i += table.capacity) batches.push(additions.slice(i, i + table.capacity));
  const rows = {};
  for (const [index, batch] of batches.entries()) {
    await writeLiveTable({ additions: batch, base, anchor, read, write });
    if (index === batches.length - 1) break;
    let seen = await readBatch(batch, table, read);
    for (let waited = 0; seen.some(row => !row.attempt) && waited < settle.timeoutMs; waited += settle.everyMs) {
      await wait(settle.everyMs);
      seen = await readBatch(batch, table, read);
    }
    for (const row of seen) rows[row.id] = { attempt: row.attempt, pointer: row.pointer };
  }
  return { capacity: table.capacity, batches: batches.length, written: additions.length, rows };
}

// What a launch does when it reaches a level whose patch carries the live routine: measure, keep the measure,
// write the table. `additions` may be a function of the measure, for a campaign that chooses its batch once it
// knows what is active around the player. Returns what the rest of the run needs to read the additions back.
export function liveArrival(session, additions, services = {}) {
  const {
    read = readNativeBytes,
    write = bridgeWriter,
    capture = captureSceneSnapshot,
    keep = saveSnapshot,
    snapshotDir = session.snapshots_dir,
  } = services;
  let completed = null,
    writeFailure = null;
  return async ({ run = null } = {}) => {
    if (completed) return completed;
    if (writeFailure) throw writeFailure;
    const snapshot = await capture(session, {
      readBytes: read,
      run,
      moment: 'arrival, before the additions were written',
      created: false,
    });
    const file = keep(snapshot, snapshotDir ? { dir: snapshotDir } : undefined);
    const params = nativeParamsFor(session, { snapshot });
    if (!params.available) throw Error(params.reason);
    const rows = typeof additions === 'function' ? await additions({ snapshot, params }) : additions;
    let written;
    try {
      written = await writeLiveBatches({
        additions: rows,
        base: params.base,
        anchor: params.anchor.address,
        read,
        write,
        ...(services.settle ? { settle: services.settle } : {}),
        ...(services.wait ? { wait: services.wait } : {}),
      });
    } catch (cause) {
      // A bridge error may arrive after the game has already consumed a batch. Replaying it could
      // create duplicate instances. Retry measurement only; an uncertain write needs a fresh run.
      writeFailure = Object.assign(
        new Error(`Live addition write did not complete; do not replay this batch in the same run: ${cause.message}`, {
          cause,
        }),
        { retryable: false },
      );
      throw writeFailure;
    }
    completed = {
      additions: rows,
      options: { ...params.options, layout: 'live', capacity: written.capacity, rows: written.rows },
      base: params.base,
      anchor: params.anchor,
      snapshot: file,
      written: written.written,
      batches: written.batches,
    };
    return completed;
  };
}
