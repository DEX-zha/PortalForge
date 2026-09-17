// Load-time fixup map (spec 002 T033 follow-up): diff the decoded file's object section against its
// resident copy (dumped by `experiment ptr-scan --dimensions`) and classify every rewritten word.
//   ptr       live == base + fileValue                      section-relative offset rebased to a pointer
//   class     word at an object header (+0) or at a nested header, live in the code/static range
//   id        live - fileValue == the constant id shift seen on every header (+8)
//   string    file value is a string-section offset and live is a pointer outside the section
//   code      live in 0x8000xxxx..0x8010xxxx (function pointer written by the constructor)
//   zeroed    live == 0, file != 0
//   filled    file == 0, live != 0 (runtime state)
//   other
// Pointer encoding (finding igz.pointer.section-indexed): high byte = target section index among
// sections 1..8, low 24 bits = offset. `crossSectionPointers` locates every section in raw MEM1/MEM2
// dumps and lists the words of sections 2..8 that point INTO section 1 (they must move with it).
// The per-object verdict "visited" = header word +0 rewritten. Objects never rewritten were not seen by
// the loader: that is the structural fact behind the M3 failure.
export function crossSectionPointers(fileBuf, graph, regions, { overrides = {} } = {}) {
  const S = graph.sections;
  // A section is found by a window of its file bytes that survives loading unchanged: sections whose
  // objects are rewritten in place (5, 7) only keep short runs, so shorter windows are tried, and a
  // window is accepted only when it occurs exactly once in the dumps and the candidate address is
  // consistent for two different windows.
  const locate = s => {
    for (const win of [48, 32, 16]) {
      const found = new Map();
      const step = Math.max(16, Math.floor(s.size / 120 / 16) * 16); // at most ~120 probes per window size
      for (let off = 0; off + win <= s.size; off += step) {
        const sig = fileBuf.subarray(s.offset + off, s.offset + off + win);
        let nz = 0;
        for (const x of sig) if (x) nz++;
        if (nz < win / 2) continue;
        const hits = [];
        for (const r of regions) {
          let p = r.buf.indexOf(sig);
          while (p !== -1 && hits.length < 3) {
            hits.push(r.start + p - off);
            p = r.buf.indexOf(sig, p + 1);
          }
        }
        if (hits.length === 1 && hits[0] % 4 === 0) {
          found.set(hits[0], (found.get(hits[0]) ?? 0) + 1);
          if (found.get(hits[0]) >= 2) return { address: hits[0], ambiguous: null, window: win };
        }
      }
    }
    return null;
  };
  // overrides: {sectionIndex: address} for sections the signature search cannot place (section 5 of the
  // tutorial is rewritten too densely; its address follows section 4 in the MEM2 allocation order).
  const loc = S.map(s => ({
    ...s,
    live:
      overrides[s.index] !== undefined
        ? { address: Number(overrides[s.index]), ambiguous: null, window: 'override' }
        : locate(s),
  }));
  const readLive = (addr, n) => {
    for (const r of regions)
      if (addr >= r.start && addr + n <= r.start + r.buf.length)
        return r.buf.subarray(addr - r.start, addr - r.start + n);
    return null;
  };
  const baseOf = k => loc[k + 1]?.live?.address ?? null;
  const out = {
    sections: loc.map(s => ({
      index: s.index,
      live: s.live ? s.live.address : null,
      ambiguous: s.live?.ambiguous ?? null,
      window: s.live?.window ?? null,
    })),
    per_section: [],
    cross_pointer_words: [],
  };
  for (const s of loc) {
    if (!s.live || s.index === 0 || s.index === graph.object_section) continue;
    const live = readLive(s.live.address, s.size);
    if (!live) {
      out.per_section.push({ section: s.index, error: 'dump does not cover the section' });
      continue;
    }
    const st = { section: s.index, changed: 0, by_target: {}, into_object_section: 0, unclassified: 0 };
    for (let q = 0; q + 4 <= s.size; q += 4) {
      const f = fileBuf.readUInt32BE(s.offset + q),
        l = live.readUInt32BE(q);
      if (f === l) continue;
      st.changed++;
      const idx = f >>> 24,
        low = f & 0xffffff;
      const b = idx <= 7 ? baseOf(idx) : null;
      if (
        b !== null &&
        loc[idx + 1] &&
        low < loc[idx + 1].size &&
        (l === (b + low) >>> 0 || l === (((b + low) >>> 0) & 0x7fffffff))
      ) {
        st.by_target[idx + 1] = (st.by_target[idx + 1] ?? 0) + 1;
        if (idx + 1 === graph.object_section) {
          st.into_object_section++;
          out.cross_pointer_words.push(s.offset + q);
        }
      } else st.unclassified++;
    }
    out.per_section.push(st);
  }
  return out;
}

export function fixupMap(fileBuf, liveBuf, graph, { base = 0x80dbc020 } = {}) {
  const sec = graph.sections[graph.object_section];
  if (liveBuf.length < sec.size) throw new Error(`dump is ${liveBuf.length} bytes, section is ${sec.size}`);
  const strSec = graph.sections[2];
  const idShift = (() => {
    const c = new Map();
    for (const o of graph.objects.slice(0, 500)) {
      const f = fileBuf.readUInt32BE(o.offset + 8),
        l = liveBuf.readUInt32BE(o.offset - sec.offset + 8);
      if (f !== l) {
        const d = (l - f) >>> 0;
        c.set(d, (c.get(d) ?? 0) + 1);
      }
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  })();
  const classes = new Map();
  const kinds = { ptr: 0, class: 0, id: 0, string: 0, code: 0, zeroed: 0, filled: 0, other: 0, unchanged: 0 };
  const objects = [];
  const pointerWords = []; // file offsets of words that are section-relative pointers (for relocation)
  const idWords = []; // file offsets of 0x01xxxxxx ids (remapped by id_shift at load)
  let adjusted = 0; // pointer words whose live value is not the plain rebase (moved cursors, heap copies)
  let unvisited = [];
  for (const o of graph.objects) {
    const rel = o.offset - sec.offset;
    const f0 = fileBuf.readUInt32BE(o.offset),
      l0 = liveBuf.readUInt32BE(rel);
    const visited = f0 !== l0 && l0 >= 0x80000000;
    const entry = {
      offset: o.offset,
      type: o.type,
      type_name: o.type_name,
      visited,
      class_ptr: visited ? l0 : null,
      changed: 0,
    };
    if (visited) {
      const k = o.type;
      if (!classes.has(k))
        classes.set(k, { type: k, type_name: o.type_name, class_ptr: '0x' + l0.toString(16), objects: 0 });
      classes.get(k).objects++;
    } else unvisited.push(entry);
    for (let q = 0; q + 4 <= o.size; q += 4) {
      const f = fileBuf.readUInt32BE(o.offset + q),
        l = liveBuf.readUInt32BE(rel + q);
      if (f === l) {
        kinds.unchanged++;
        continue;
      }
      entry.changed++;
      let kind;
      const secLive = l >= base + sec.offset && l < base + sec.offset + sec.size;
      const isStringStart =
        strSec && f > 0 && f < strSec.size && fileBuf[strSec.offset + f - 1] === 0 && fileBuf[strSec.offset + f] > 0x20;
      if (l === (base + sec.offset + f) >>> 0 && f >= 0x20 && f < sec.size) {
        kind = 'ptr';
        pointerWords.push(o.offset + q);
      } else if (idShift !== null && (l - f) >>> 0 === idShift) {
        kind = 'id';
        idWords.push(o.offset + q);
      } else if (
        f < 0x100000 &&
        l >= 0x80400000 &&
        l < 0x80600000 &&
        (q === 0 || fileBuf.readUInt32BE(o.offset + q + 4) < 0x100)
      )
        kind = 'class';
      else if (l >= 0x80000000 && l < 0x80100000) kind = 'code';
      else if (l === 0) kind = 'zeroed';
      else if (f === 0) kind = 'filled';
      else if (isStringStart && l >= 0x80000000 && !secLive) kind = 'string';
      // A section offset the loader read as a pointer and then moved (list cursor advanced, data copied
      // to the heap): the file word still needs rebasing when the section is relocated.
      else if (
        f >= 0x20 &&
        f < sec.size &&
        !isStringStart &&
        (secLive || (l >= 0x80800000 && l < 0x81800000) || (l >= 0x90000000 && l < 0x94000000))
      ) {
        kind = 'ptr';
        pointerWords.push(o.offset + q);
        adjusted++;
      } else if (f < 0x100000 && l >= 0x80700000 && l < 0x80800000)
        kind = 'string'; // interned string pointer (mid-string offsets included)
      else kind = 'other';
      kinds[kind]++;
    }
    objects.push(entry);
  }
  // Words outside objects (section header/table area before the first object)
  const head = [];
  const first = graph.objects[0].offset;
  for (let p = sec.offset; p < first; p += 4) {
    const f = fileBuf.readUInt32BE(p),
      l = liveBuf.readUInt32BE(p - sec.offset);
    if (f !== l) head.push({ offset: p, file: f, live: l, ptr: l === (base + sec.offset + f) >>> 0 });
  }
  // Unvisited objects: contiguous region or scattered?
  const uOffs = unvisited.map(u => u.offset);
  const uMin = Math.min(...uOffs),
    uMax = Math.max(...uOffs);
  const visitedInside = objects.filter(o => o.visited && o.offset >= uMin && o.offset <= uMax).length;
  const unvisitedRange = unvisited.length ? { min: uMin, max: uMax, visited_objects_inside: visitedInside } : null;
  const byTypeUnvisited = new Map();
  for (const u of unvisited) {
    const k = `${u.type} ${u.type_name}`;
    byTypeUnvisited.set(k, (byTypeUnvisited.get(k) ?? 0) + 1);
  }
  return {
    base,
    id_shift: idShift,
    kinds,
    adjusted_pointer_words: adjusted,
    visited: objects.length - unvisited.length,
    total: objects.length,
    unvisited: unvisited.map(u => ({ offset: u.offset, type: u.type, type_name: u.type_name })),
    unvisited_by_type: [...byTypeUnvisited.entries()]
      .map(([k, n]) => ({ key: k, count: n }))
      .sort((a, b) => b.count - a.count),
    classes: [...classes.values()].sort((a, b) => a.type - b.type),
    head_changes: head.length,
    head_pointers: head.filter(h => h.ptr).length,
    unvisited_range: unvisitedRange,
    section_offset: sec.offset,
    first_object: first,
    head_pointer_words: head.filter(h => h.ptr).map(h => h.offset),
    pointer_words: pointerWords,
    id_words: idWords,
    objects,
  };
}
