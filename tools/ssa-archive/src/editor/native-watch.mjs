// What a run does about the additions it carries (feature 007). The launcher calls it at three moments and knows
// nothing else about additions:
//
//   atCapture(file)  at every capture of the level: measure the level first when the patch is live, then read
//                    every addition back, row by row, and keep the strict whole-batch check as a timeline;
//   whilePlaying()   now and then while the player plays, until each addition has been seen alive (in classic
//                    play the level is reached by hand, and a pickup may be collected long before the game closes);
//   atEnd()          the last reading and the verdict of the run.
//
// Everything it learns goes into the run's record: `native_arrival` (the measure of a live patch),
// `native_samples` (one row per addition per reading), `native_observations` and `native_additions` (the strict
// check). A run whose additions are all confirmed recipes fails when one is missing, as it always did; a run with
// experimental additions, the compact table or the live routine records the failure and goes on, because the
// player came to play and a source that failed is a result to show.
import { inspectAdditions, verifyNativeInstances, verifyNativeLifecycle } from './native-run.mjs';

// A live patch tries to measure the level this many times before giving up: the level may still be loading.
const ARRIVAL_ATTEMPTS = 6;
// In play, at most this many readings: enough for a level reached by hand, without growing the record for hours.
const PLAY_READINGS = 40;

const LEVEL_CAPTURE = /tutorial|arrived/;

export function watchAdditions({ native, record, run, inspect = null, arrival = null, services = {} }) {
  if (!native) return { atCapture: async () => {}, whilePlaying: async () => {}, atEnd: async () => {} };
  const read = { inspect: inspectAdditions, verify: verifyNativeInstances, ...services };
  const inspectRows = inspect ?? ((rows, options) => read.inspect(rows, undefined, options));
  // What the additions are read back with. A live patch learns it at arrival: the level's base and anchor, and,
  // for a campaign, the batch it chose there.
  const carried = { additions: native.additions ?? [], options: native.options ?? {} };
  const tolerant =
    !!inspect || !!native.live || carried.additions.some(a => a.experimental) || carried.options.layout === 'table';
  let measure = native.live ? (arrival ? 'pending' : 'missing') : 'none';
  let attempts = 0;
  let readings = 0;

  const arrive = async () => {
    if (measure !== 'pending') return;
    attempts++;
    try {
      const { additions, options, ...facts } = await arrival({ run });
      carried.additions = additions ?? carried.additions;
      carried.options = options;
      record.native_arrival = { ...facts, additions: carried.additions.length, attempts };
      measure = 'done';
    } catch (e) {
      record.native_arrival = { error: e.message, attempts };
      if (e.retryable === false || attempts >= ARRIVAL_ATTEMPTS) measure = 'failed';
    }
  };

  const ready = () => measure === 'none' || measure === 'done';

  const sample = async capture => {
    if (!ready()) return null;
    record.native_samples ??= [];
    try {
      const rows = await inspectRows(carried.additions, carried.options);
      record.native_samples.push({ capture, rows });
      return rows;
    } catch (e) {
      record.native_samples.push({ capture, rows: [], error: e.message });
      return null;
    }
  };

  // Scripted additions may transform or destroy themselves, and additions created from the activation manager
  // are judged at every capture: both keep the strict check as a timeline, not only as a final state.
  const observe = async capture => {
    const timeline = carried.additions.some(a => a.script != null) || carried.options.context === 'activation';
    if (!ready() || !timeline) return;
    record.native_observations ??= [];
    try {
      const verified = await read.verify(carried.additions, undefined, carried.options);
      record.native_observations.push({ capture, ...verified });
    } catch (e) {
      record.native_observations.push({ capture, verified: false, reason: e.message });
    }
  };

  const seenAlive = id =>
    (record.native_samples ?? []).some(s => s.rows.some(row => row.id === id && row.runtime === 'passed'));

  return {
    async atCapture(file) {
      if (!LEVEL_CAPTURE.test(file)) return;
      await arrive();
      await sample(file);
      await observe(file);
    },

    // `levelRead` says the level's archive has been read from the disc: before that there is nothing to measure.
    async whilePlaying({ levelRead }) {
      if (measure === 'pending' && levelRead) await arrive();
      if (!ready() || readings >= PLAY_READINGS || carried.additions.every(a => seenAlive(a.id))) return;
      readings++;
      await sample('playing');
    },

    async atEnd() {
      if (measure === 'missing' || measure === 'failed' || measure === 'pending') {
        const reason =
          measure === 'missing'
            ? 'This patch carries the live routine, but the launch was given no way to measure the level.'
            : `The level could not be measured: ${record.native_arrival?.error ?? 'it was never reached'}.`;
        record.native_additions = { verified: false, reason };
        return;
      }
      await sample(null);
      const strict = () =>
        verifyNativeLifecycle(carried.additions, record.native_observations ?? [], read.verify, carried.options);
      if (!tolerant) {
        record.native_additions = await strict();
        return;
      }
      try {
        record.native_additions = await strict();
      } catch (e) {
        record.native_additions = { verified: false, reason: e.message };
      }
    },
  };
}
