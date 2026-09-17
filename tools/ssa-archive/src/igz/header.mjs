// IGZ v5 file header and section table (big-endian). Findings: docs/findings/igz-objects.md.
//   0x00 magic 49 47 5A 01, 0x04 version 5, 0x08/0x0C zero, then from 0x10 descriptors
//   {u32 offset, u32 size, u32 align, u32 tag} until offset == 0; the last section ends at EOF.
export const IGZ_MAGIC = 0x49475a01;
export const IGZ_VERSION = 5;
export const failure = (offset, field, actual, expected, reason) => ({ offset, field, actual, expected, reason });

export function parseIgzHeader(buf) {
  const issues = [];
  if (buf.length < 0x20) {
    issues.push(failure(0, 'file', buf.length, '>= 32 bytes', 'BAD_IGZ_MAGIC'));
    return { issues };
  }
  const magic = buf.readUInt32BE(0),
    version = buf.readUInt32BE(4);
  if (magic !== IGZ_MAGIC)
    issues.push(failure(0, 'magic', '0x' + magic.toString(16), '0x' + IGZ_MAGIC.toString(16), 'BAD_IGZ_MAGIC'));
  if (version !== IGZ_VERSION) issues.push(failure(4, 'version', version, IGZ_VERSION, 'UNSUPPORTED_IGZ_VERSION'));
  const words = [0, 4, 8, 12].map(o => buf.readUInt32BE(o));
  const sections = [];
  for (let o = 0x10; o + 16 <= Math.min(buf.length, 0x800); o += 16) {
    const offset = buf.readUInt32BE(o);
    if (offset === 0) break;
    sections.push({
      index: sections.length,
      offset,
      size: buf.readUInt32BE(o + 4),
      align: buf.readUInt32BE(o + 8),
      tag: buf.readUInt32BE(o + 12),
      table_offset: o,
    });
  }
  const sorted = [...sections].sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].offset + sorted[i - 1].size > sorted[i].offset)
      issues.push(
        failure(
          sorted[i].table_offset,
          `sections[${sorted[i].index}]`,
          sorted[i].offset,
          `>= ${sorted[i - 1].offset + sorted[i - 1].size}`,
          'SECTION_OVERLAP',
        ),
      );
  }
  if (sorted.length) {
    const last = sorted[sorted.length - 1];
    if (last.offset + last.size !== buf.length)
      issues.push(
        failure(
          last.table_offset,
          `sections[${last.index}].end`,
          last.offset + last.size,
          buf.length,
          'SECTION_END_MISMATCH',
        ),
      );
  } else issues.push(failure(0x10, 'sections', 0, '>= 1', 'SECTION_END_MISMATCH'));
  // Section 0 carries a second IGZ header (13 words) before the type-name table.
  let second = null;
  if (sections[0] && sections[0].offset + 0x34 <= buf.length) {
    second = {
      offset: sections[0].offset,
      words: Array.from({ length: 13 }, (_, i) => buf.readUInt32BE(sections[0].offset + 4 * i)),
    };
    if (second.words[0] !== IGZ_MAGIC)
      issues.push(
        failure(
          sections[0].offset,
          'section0.magic',
          '0x' + second.words[0].toString(16),
          '0x' + IGZ_MAGIC.toString(16),
          'BAD_IGZ_MAGIC',
        ),
      );
  }
  return { magic, version, words, sections, second_header: second, issues };
}

export function sectionOf(sections, offset) {
  return sections.find(s => offset >= s.offset && offset < s.offset + s.size) ?? null;
}
