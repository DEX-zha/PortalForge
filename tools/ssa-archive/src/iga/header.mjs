// IGA version 4 fixed header (0x30 bytes, little-endian) and hash table.
// Layout and confidence labels: specs/001-ssa-level-research/research.md, section R2.
export const MAGIC = 0x1a414749; // "IGA\x1A" read as little-endian u32
export const VERSION = 4;
export const HEADER_SIZE = 0x30;
const HASH_SIZE = 4;
export const ENTRY_SIZE = 12; // u32 start, u32 size, u32 mode
export const ALIGN = 0x800;
export const CHUNK_SIZE = 0x8000;
const MODE_NONE = 0xff; // high byte of mode
const MODE_LZMA = 0x10; // high byte of mode on v4 (community reader remaps to LZMA)

// Words 0x10, 0x14, 0x20, 0x24, 0x28, 0x2C have UNKNOWN semantics and are preserved verbatim.
const WORD_NAMES = [
  'magic',
  'version',
  'table_size',
  'count',
  'flags_packed',
  'word_14',
  'name_table_offset',
  'name_table_size',
  'word_20',
  'word_24',
  'word_28',
  'word_2c',
];

export const alignUp = (n, a = ALIGN) => Math.ceil(n / a) * a;
export const hex = n => '0x' + (n >>> 0).toString(16);
export const failure = (offset, field, actual, expected, reason) => ({ offset, field, actual, expected, reason });

export function decodeHeader(buf, issues = []) {
  if (buf.length < HEADER_SIZE) {
    issues.push(failure(0, 'header', buf.length, `at least ${HEADER_SIZE} bytes`, 'BAD_MAGIC'));
    return null;
  }
  const words = [];
  for (let i = 0; i < WORD_NAMES.length; i++) words.push(buf.readUInt32LE(4 * i));
  const h = Object.fromEntries(WORD_NAMES.map((n, i) => [n, words[i]]));
  h.header_words = words;
  if (h.magic !== MAGIC) issues.push(failure(0x00, 'magic', hex(h.magic), hex(MAGIC), 'BAD_MAGIC'));
  if (h.version !== VERSION) issues.push(failure(0x04, 'version', h.version, VERSION, 'UNSUPPORTED_VERSION'));
  return h;
}

export function encodeHeader(h) {
  const words = h.header_words ?? WORD_NAMES.map(n => h[n]);
  if (words.length !== WORD_NAMES.length) throw new Error('header needs exactly 12 words');
  const b = Buffer.alloc(HEADER_SIZE);
  words.forEach((w, i) => b.writeUInt32LE(w >>> 0, 4 * i));
  return b;
}

// Hash table: u32[count] at 0x30, strictly ascending.
export function decodeHashes(buf, count, issues = []) {
  const end = HEADER_SIZE + HASH_SIZE * count;
  if (end > buf.length) {
    issues.push(failure(0x0c, 'count', count, `hash table must end before ${buf.length}`, 'COUNT_MISMATCH'));
    return [];
  }
  const hashes = [];
  for (let i = 0; i < count; i++) {
    const v = buf.readUInt32LE(HEADER_SIZE + HASH_SIZE * i);
    if (i > 0 && !(hashes[i - 1] < v)) {
      issues.push(
        failure(
          HEADER_SIZE + HASH_SIZE * i,
          `hashes[${i}]`,
          hex(v),
          `greater than ${hex(hashes[i - 1])}`,
          'HASHES_NOT_SORTED',
        ),
      );
    }
    hashes.push(v);
  }
  return hashes;
}

export function encodeHashes(hashes) {
  const b = Buffer.alloc(HASH_SIZE * hashes.length);
  hashes.forEach((h, i) => b.writeUInt32LE(h >>> 0, HASH_SIZE * i));
  return b;
}

export const entryTableOffset = count => HEADER_SIZE + HASH_SIZE * count;
export const entryTableEnd = count => entryTableOffset(count) + ENTRY_SIZE * count;

// Interpolation lookup words (CONFIRMED on 152 level archives + 7 samples, see docs/format/iga-v4.md):
//   word 0x10 = floor(0xFFFFFFFF / count)                      -> estimated index = hash / word
//   word 0x14 = max |i - min(count-1, floor(hash_i / word0x10))| -> maximum probe distance
export const lookupScale = count => Math.floor(0xffffffff / count);
export function maxProbeDistance(hashes, scale = lookupScale(hashes.length)) {
  let max = 0;
  hashes.forEach((h, i) => {
    const est = Math.min(hashes.length - 1, Math.floor((h >>> 0) / scale));
    max = Math.max(max, Math.abs(i - est));
  });
  return max;
}

export function compressionOf(mode) {
  const high = mode >>> 24;
  if (high === MODE_NONE) return 'NONE';
  if (high === MODE_LZMA) return 'LZMA_CHUNKED';
  return null;
}
