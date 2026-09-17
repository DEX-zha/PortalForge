// Relocation-table probe (spec 002, static reverse-engineering of the pointer-fixup structure).
//
// Ground truth: the set of section-1 word offsets the game rebases into pointers, obtained by diffing a
// decoded level.bld against its resident image (experiment ptr-scan --dimensions + igz fixups). The
// engine turns a valid IGZ object into a live one by rebasing these words; a cloned record is not in the
// structure, so its fields stay raw offsets and the load hangs (finding igz.loader.relocation-table).
//
// This module tries to reproduce that set from the file's own bytes, testing encoding hypotheses on each
// candidate section and on per-type field templates. Success = a decoder whose output equals the whole
// relocated-word set across every object, not just one.
import { buildGraph } from './graph.mjs';

// --- ground truth ------------------------------------------------------------
export function relocationTruth(buf, fixups) {
  const g = buildGraph(buf, { fields: false });
  const sec = g.sections[g.object_section];
  const all = new Set([...fixups.pointer_words, ...(fixups.head_pointer_words ?? [])]);
  const words = [...all]
    .map(w => w - sec.offset)
    .filter(b => b >= 0 && b < sec.size)
    .map(b => b / 4)
    .sort((a, b) => a - b);
  return { graph: g, sec, wordIdx: words, wordSet: new Set(words), nWords: sec.size / 4 };
}

// score a candidate list of section-1 word indices against the truth
function score(truth, produced) {
  let inSet = 0;
  const seen = new Set();
  for (const v of produced) {
    if (truth.wordSet.has(v)) inSet++;
    seen.add(v);
  }
  let covered = 0;
  for (const v of truth.wordIdx) if (seen.has(v)) covered++;
  return {
    produced: produced.length,
    precision: produced.length ? inSet / produced.length : 0,
    recall: truth.wordIdx.length ? covered / truth.wordIdx.length : 0,
  };
}

// --- flat encodings on a byte buffer -----------------------------------------
function* u32be(buf) {
  for (let p = 0; p + 4 <= buf.length; p += 4) yield buf.readUInt32BE(p);
}
function* u16be(buf) {
  for (let p = 0; p + 2 <= buf.length; p += 2) yield buf.readUInt16BE(p);
}

export function probeFlat(truth, name, buf) {
  const results = [];
  const add = (how, arr) => results.push({ section: name, decoder: how, ...score(truth, arr) });
  // raw u32 as byte offset (/4) and as word index
  const u = [...u32be(buf)];
  add(
    'u32 byteoff/4',
    u.filter(v => v % 4 === 0 && v / 4 < truth.nWords).map(v => v / 4),
  );
  add(
    'u32 wordidx',
    u.filter(v => v < truth.nWords),
  );
  // cumulative sums (delta lists)
  let a = 0;
  add(
    'u32 cumsum/4',
    u
      .map(v => (a += v))
      .filter(v => v % 4 === 0 && v / 4 < truth.nWords)
      .map(v => v / 4),
  );
  a = 0;
  add(
    'u32 cumsum wordidx',
    u.map(v => (a += v)).filter(v => v < truth.nWords),
  );
  const u16 = [...u16be(buf)];
  a = 0;
  add(
    'u16 cumsum wordidx',
    u16.map(v => (a += v)).filter(v => v < truth.nWords),
  );
  a = 0;
  add(
    'u16 cumsum/2',
    u16
      .map(v => (a += v))
      .filter(v => v % 2 === 0)
      .map(v => v / 2)
      .filter(v => v < truth.nWords),
  );
  // byte varint (LEB128) delta stream, cumulative in words
  {
    const arr = [];
    let acc = 0,
      cur = 0,
      sh = 0;
    for (const b of buf) {
      cur |= (b & 0x7f) << sh;
      if (b & 0x80) {
        sh += 7;
      } else {
        acc += cur;
        if (acc < truth.nWords) arr.push(acc);
        cur = 0;
        sh = 0;
      }
    }
    add('leb128 delta words', arr);
  }
  // byte delta stream (each byte = word gap; 0 = escape not handled, treated as gap 0)
  {
    const arr = [];
    let acc = 0;
    for (const b of buf) {
      acc += b;
      if (b !== 0 && acc < truth.nWords) arr.push(acc);
    }
    add('byte delta words', arr);
  }
  return results;
}

// bitmap: 1 bit per section-1 word, tried MSB/LSB first, sliding the start over the buffer
export function probeBitmap(truth, name, buf) {
  const need = Math.ceil(truth.nWords / 8);
  const results = [];
  if (buf.length < need) return results;
  const starts = [0];
  for (let s = 1; s <= 64; s++) starts.push(s);
  starts.push(need, 2 * need);
  for (const msb of [true, false])
    for (const start of starts) {
      if (start + need > buf.length) continue;
      const arr = [];
      for (let i = 0; i < truth.nWords; i++) {
        const byte = buf[start + (i >> 3)];
        const bit = msb ? (byte >> (7 - (i & 7))) & 1 : (byte >> (i & 7)) & 1;
        if (bit) arr.push(i);
      }
      const s = score(truth, arr);
      if (s.recall > 0.5 || (s.precision > 0.8 && s.produced > 1000))
        results.push({ section: name, decoder: `bitmap ${msb ? 'MSB' : 'LSB'} @+0x${start.toString(16)}`, ...s });
    }
  return results;
}

// Structural model: is every relocated word explained by (a) a type-consistent fixed field offset, or
// (b) membership in a contiguous run of relocated words (a pointer array whose length varies per
// instance)? If so, the relocation is computed from type field descriptors + array counts, not stored
// as a flat table — so cloning an existing type needs no new relocation data, only correct processing.
export function structuralModel(buf, fixups) {
  const { graph: g } = relocationTruth(buf, fixups);
  const offs = g.objects.map(o => o.offset);
  const ownerIdx = p => {
    let lo = 0,
      hi = offs.length - 1,
      b = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (offs[m] <= p) {
        b = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return b;
  };
  const perObj = new Map(g.objects.map(o => [o.offset, []]));
  for (const w of fixups.pointer_words) {
    const i = ownerIdx(w);
    if (i < 0) continue;
    const o = g.objects[i];
    if (w < o.offset + o.size) perObj.get(o.offset).push((w - o.offset) / 4);
  }
  // per-type: fixed offsets that are pointers in a strong majority of instances (>= 95%)
  const byType = new Map();
  for (const o of g.objects) {
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type).push(o);
  }
  const tmplByType = new Map();
  for (const [t, insts] of byType) {
    const counts = new Map();
    for (const o of insts) for (const wq of perObj.get(o.offset)) counts.set(wq, (counts.get(wq) ?? 0) + 1);
    const tmpl = new Set([...counts.entries()].filter(([, c]) => c >= insts.length * 0.95).map(([q]) => q));
    tmplByType.set(t, tmpl);
  }
  let fixedHit = 0,
    arrayHit = 0,
    unexplained = 0,
    total = 0;
  const unex = [];
  for (const o of g.objects) {
    const set = new Set(perObj.get(o.offset));
    const tmpl = tmplByType.get(o.type);
    for (const wq of perObj.get(o.offset)) {
      total++;
      if (tmpl.has(wq)) fixedHit++;
      else if (set.has(wq - 1) || set.has(wq + 1))
        arrayHit++; // adjacent to another pointer -> array run
      else {
        unexplained++;
        if (unex.length < 20)
          unex.push({
            obj: '0x' + o.offset.toString(16),
            type: o.type_name || o.type,
            field: '0x' + (wq * 4).toString(16),
          });
      }
    }
  }
  return {
    total,
    fixed: fixedHit,
    array: arrayHit,
    unexplained,
    explained_pct: (fixedHit + arrayHit) / total,
    unexplained_samples: unex,
  };
}

// --- per-type field template -------------------------------------------------
// For each type, the set of pointer field-offsets in its fixed prefix (min instance size). If the engine
// rebases by type, this template + array counts reproduce the truth. Reports the per-type consistency and
// how much of the truth the templates alone explain.
export function typeTemplates(buf, fixups) {
  const { graph: g } = relocationTruth(buf, fixups);
  const offs = g.objects.map(o => o.offset);
  const ownerIdx = p => {
    let lo = 0,
      hi = offs.length - 1,
      b = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (offs[m] <= p) {
        b = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    return b;
  };
  const perObj = new Map(g.objects.map(o => [o.offset, []]));
  for (const w of fixups.pointer_words) {
    const i = ownerIdx(w);
    if (i < 0) continue;
    const o = g.objects[i];
    if (w < o.offset + o.size) perObj.get(o.offset).push((w - o.offset) / 4);
  }
  const byType = new Map();
  for (const o of g.objects) {
    if (!byType.has(o.type)) byType.set(o.type, { name: o.type_name, insts: [] });
    byType.get(o.type).insts.push(o);
  }
  const templates = new Map();
  let explained = 0,
    total = 0;
  for (const [t, { name, insts }] of byType) {
    const minWords = Math.min(...insts.map(o => o.size)) / 4;
    // template = offsets < minWords that are pointers in EVERY instance
    const counts = new Map();
    for (const o of insts)
      for (const wq of perObj.get(o.offset)) if (wq < minWords) counts.set(wq, (counts.get(wq) ?? 0) + 1);
    const tmpl = [...counts.entries()]
      .filter(([, c]) => c === insts.length)
      .map(([q]) => q)
      .sort((a, b) => a - b);
    templates.set(t, { name, count: insts.length, min_words: minWords, template: tmpl });
    // explanation: pointers each instance has that lie inside the template
    for (const o of insts) {
      for (const wq of perObj.get(o.offset)) {
        total++;
        if (wq < minWords && tmpl.includes(wq)) explained++;
      }
    }
  }
  return {
    templates: [...templates.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count),
    explained,
    total,
    explained_pct: total ? explained / total : 0,
  };
}
