// Parsers for option values that several commands share. Each one fails with a usage error that shows the
// expected shape, because a malformed value is the most common way these commands are misused.
import fs from 'node:fs';
import path from 'node:path';
import { CliError } from './errors.mjs';

// `--replace <key>=<file>`, repeatable. Returns { key: file }.
export function parseReplace(list, keyName) {
  return Object.fromEntries(
    (list ?? []).map(spec => {
      const at = spec.indexOf('=');
      if (at < 1) throw new CliError(`--replace expects <${keyName}>=<file>: ${spec}`);
      return [spec.slice(0, at), spec.slice(at + 1)];
    }),
  );
}

// `--set <hex offset>[:type]=<value>`, repeatable. The type defaults to a big-endian float, the common case
// for transforms.
export function parseSetEdits(list) {
  return (list ?? []).map(spec => {
    const m = /^(?:\+?0x)?([0-9a-f]+)(?::(f32be|u32be|u16be|u8))?=(.+)$/i.exec(spec);
    if (!m) throw new CliError(`--set expects <hex offset>[:type]=<value>: ${spec}`);
    return { offset: parseInt(m[1], 16), type: m[2] ?? 'f32be', value: Number(m[3]) };
  });
}

// `--keep 50,128,1ac`: a comma-separated list of hexadecimal field offsets.
export const parseHexList = value =>
  String(value ?? '')
    .split(',')
    .filter(Boolean)
    .map(x => parseInt(x, 16));

// `--near x,z,radius` and friends: a comma-separated list of numbers.
export const parseNumberList = value => String(value).split(',').map(Number);

// `--fixups` is declared repeatable for `corpus`; every other command takes the first one.
export const firstFixup = value => (Array.isArray(value) ? value[0] : value);

export const readJsonFile = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

// The runtime fixup map, when one was given.
export const readFixups = value => (value ? readJsonFile(firstFixup(value)) : null);
