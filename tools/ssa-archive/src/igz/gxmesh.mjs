// GX mesh geometry of a Wii IGZ level (feature 004): section-5 draw descriptors, section-6 vertex blocks and
// display lists, decoded to vertices and triangles, and tied to the models that placements reference.
//
// Established on the tutorial (2264 of 2264 draw units walked in sequence, 209 of 209 placed models' meshes inside
// their declared bounds) and read off byte boundaries, not inferred from names -- type names in these files are
// unreliable. The findings are documented in docs/format/igz-mesh-geometry.md.
//
// SECTION 5 -- one descriptor per draw unit, in file order, each starting {0xf, 1}:
//   +0x08  vertex count            +0x34  vertex stride (sum of the per-array record sizes)
//   +0x44  back-pointer: object-section offset of the node record this unit belongs to (relocated by the game)
//   +0x6c.. attribute list: triplets {tag<<24 | sub<<16, format, offset<<16}, ended by 0x2c000000;
//           tags seen: 0x32 normal (s8 x3), 0x33 colour (2 bytes), 0x1d texcoord (s16 x2), 0x06 (4 bytes).
//           The position is implicit and always first.
//   after the LAST 0x2c000000: the record sizes of the separate arrays, e.g. {10, 4, 4} (position+normal, uv, uv).
//           A descriptor may also carry an inner {0x10, 1, ...} block: a second material pass, no block of its own.
//
// SECTION 6 -- one block per descriptor, in the same order, every piece 32-aligned RELATIVE TO THE SECTION START:
//   interleaved kind (world chunks):  00 9F count(u16)  then count * stride bytes, position s16 x3 at +0.
//   separate kind (placed models):    array 0 = position s16 x3 [+ normal s8 x3 + pad] (sizes[0] bytes each),
//                                     then one array per remaining size, each 32-aligned, no prefix.
//   then a 32-byte header of GX vertex-attribute fraction bits, position first (6 for world chunks, 7..10 for
//   props; normals 6, texcoords 14), followed by a 0x00 NOP and the display list:
//   {opcode 0x98|vat, count(u16), count * attrs * idxSize} triangle strips, NOP-separated, zero padded.
//   idxSize is 1 or 2 bytes and is NOT a function of the vertex count (234 vertices were seen with 16-bit
//   indices): both widths are tried and the one whose list ends exactly where the next block starts is kept.
//   Every index of a strip addresses one vertex of the block's own arrays; all attributes share that index.
//
// Position = s16 * 2^-frac, in the model's local space for placed models and in world space for world chunks.

const OPS = new Set([0x80, 0x90, 0x98, 0xa0, 0xa8, 0xb0, 0xb8]);

// A record header: {type < typeCount, 1 <= refcount < 4096, name word in section 1}. The enumerator's own test
// demands refcount 1 and so hides every shared record; node records are frequently shared.
const recordHeaderTest = (buf, typeCount) => p =>
  p + 12 <= buf.length &&
  buf.readUInt32BE(p) < typeCount &&
  buf.readUInt32BE(p + 4) >= 1 &&
  buf.readUInt32BE(p + 4) < 4096 &&
  buf[p + 8] === 1;

// The two geometry sections carry stable tags in the section table (44: descriptors, 51: vertex blocks) on every
// level seen; the index is the fallback.
export const descriptorSection = graph => graph.sections.find(s => s.tag === 44) ?? graph.sections[5];
export const geometrySection = graph => graph.sections.find(s => s.tag === 51) ?? graph.sections[6];

export function parseDescriptors(buf, graph) {
  const sec = descriptorSection(graph);
  if (!sec) return [];
  const S5 = sec.offset,
    L5 = sec.size,
    OS = graph.sections[graph.object_section].offset;
  // The descriptor's type index is per file (0xf on the tutorial, another number elsewhere): read it off the
  // first entry, which always sits at +0x04 with refcount 1 and the constant 0x80000004 at its +0x0c.
  if (L5 < 0x14 || buf.readUInt32BE(S5 + 8) !== 1 || buf.readUInt32BE(S5 + 0x10) !== 0x80000004) return [];
  const T = buf.readUInt32BE(S5 + 4);
  const starts = [];
  for (let p = S5; p + 16 <= S5 + L5; p += 4)
    if (buf.readUInt32BE(p) === T && buf.readUInt32BE(p + 4) === 1 && buf.readUInt32BE(p + 12) === 0x80000004)
      starts.push(p);
  return starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : S5 + L5;
    const attrs = [],
      sizes = [];
    for (let p = s + 0x6c; p + 12 <= end; p += 4) {
      const w = buf.readUInt32BE(p);
      if (w === 0x2c000000) break;
      if ((w & 0xffff) === 0 && w >>> 24 !== 0 && w !== 0x2e000000) {
        const fmt = buf.readUInt32BE(p + 4),
          o = buf.readUInt32BE(p + 8);
        if ((o & 0xffff) === 0 && o >>> 16 < 64) {
          attrs.push({ tag: w >>> 24, sub: (w >>> 16) & 0xff, format: fmt, offset: o >>> 16 });
          p += 8;
        }
      }
    }
    let lastMarker = -1,
      passes = 1;
    for (let q = s + 0x6c; q + 8 <= end; q += 4) {
      const w = buf.readUInt32BE(q);
      if (w === 0x2c000000) lastMarker = q;
      if (w === T + 1 && buf.readUInt32BE(q + 4) === 1) passes++;
    }
    if (lastMarker >= 0) {
      let q = lastMarker + 4;
      while (q + 4 <= end && buf.readUInt32BE(q) === 0) q += 4;
      for (; q + 4 <= end; q += 4) {
        const v = buf.readUInt32BE(q);
        if (v === 0 || v > 64) break;
        sizes.push(v);
      }
    }
    return {
      index: i,
      at: s,
      count: buf.readUInt32BE(s + 8),
      stride: buf.readUInt32BE(s + 0x34),
      owner: OS + buf.readUInt32BE(s + 0x44),
      attrs,
      sizes,
      passes,
    };
  });
}

// Walk section 6 block by block. Returns the blocks decoded in sequence and, if the walk broke, where and why.
export function walkBlocks(buf, graph, descriptors) {
  const sec = geometrySection(graph);
  if (!sec) return { blocks: [], stop: { why: 'no geometry section' }, consumed: 0, size: 0 };
  const S6 = sec.offset,
    L6 = sec.size,
    END = S6 + L6;
  const align = x => S6 + Math.ceil((x - S6) / 32) * 32;
  const vatAt = q => {
    if (q + 0x22 > END) return null;
    const w = [0, 1, 2, 3, 4, 5, 6, 7].map(k => buf.readUInt32BE(q + 4 * k));
    if (!(w[0] > 0 && w[0] < 32 && w.every(x => x < 32))) return null;
    if (buf[q + 0x20] !== 0 || !OPS.has(buf[q + 0x21] & 0xf8)) return null;
    return w;
  };
  const layoutAt = (d, at) => {
    if (at + 4 <= END && buf.readUInt16BE(at) === 0x009f && buf.readUInt16BE(at + 2) === d.count)
      return { kind: 'interleaved', pos: at + 4, posSize: d.stride, end: at + 4 + d.count * d.stride };
    const sizes = d.sizes.length ? d.sizes : [d.stride];
    if (sizes.reduce((a, b) => a + b, 0) !== d.stride) return null;
    let p = at,
      last = at;
    for (const sz of sizes) {
      last = p;
      p = align(p + d.count * sz);
    }
    return { kind: 'separate', pos: at, posSize: sizes[0], end: last + d.count * sizes[sizes.length - 1] };
  };
  const fitsNext = (next, q) => {
    if (!next) return q >= END - 64;
    const l = layoutAt(next, q);
    return !!(l && vatAt(align(l.end)));
  };
  function parseList(p, attrCount, count, idx, next) {
    const k = attrCount * idx,
      strips = [];
    let last = p;
    for (;;) {
      while (p < END && buf[p] === 0) p++;
      if (p >= END || !OPS.has(buf[p] & 0xf8)) break;
      // The next block can pass for one more strip: an interleaved one opens with {00 9F count}, and the raw vertex
      // data of a separate-array one can begin with a byte in the opcode range (0xB2 was seen). Both start at a
      // 32-boundary after a zero byte, and from there the next descriptor's arrays end exactly on a VAT header;
      // nothing inside a display list satisfies that.
      if (strips.length && next && buf[p - 1] === 0 && (p - 1 - S6) % 32 === 0 && fitsNext(next, p - 1)) break;
      const cnt = buf.readUInt16BE(p + 1);
      if (!cnt || cnt > 8192) break;
      const q = p + 3 + cnt * k;
      if (q > END) break;
      const ix = new Array(cnt);
      let bad = false;
      for (let v = 0; v < cnt; v++) {
        const a = p + 3 + v * k;
        const id = idx === 1 ? buf[a] : buf.readUInt16BE(a);
        if (id >= count) {
          bad = true;
          break;
        }
        ix[v] = id;
      }
      if (bad) break;
      strips.push({ op: buf[p] & 0xf8, indices: ix });
      p = q;
      last = q;
    }
    return { end: last, strips };
  }
  const blocks = [];
  let cursor = S6 + 0x20,
    stop = null;
  for (const d of descriptors) {
    const lay = layoutAt(d, cursor);
    const vat = lay && vatAt(align(lay.end));
    if (!lay || !vat) {
      stop = { descriptor: d.index, at: cursor - S6, why: !lay ? 'no array layout' : 'no VAT header after the arrays' };
      break;
    }
    const next = descriptors[d.index + 1],
      attrCount = 1 + d.attrs.length,
      dl = align(lay.end) + 0x20;
    let list = null;
    for (const idx of d.count > 255 ? [2, 1] : [1, 2]) {
      const t = parseList(dl, attrCount, d.count, idx, next);
      if (t.strips.length && fitsNext(next, align(t.end))) {
        list = { ...t, idx };
        break;
      }
    }
    if (!list) {
      stop = { descriptor: d.index, at: cursor - S6, why: 'display list does not end where the next block starts' };
      break;
    }
    blocks.push({
      descriptor: d,
      kind: lay.kind,
      pos: lay.pos,
      posSize: lay.posSize,
      vat,
      dl,
      strips: list.strips,
      indexBytes: list.idx,
    });
    cursor = align(list.end);
  }
  return { blocks, stop, consumed: cursor - S6, size: L6 };
}

// Strip / fan / list / quad primitives to triangle indices.
export function triangulate(strips) {
  const tri = [];
  for (const s of strips) {
    const ix = s.indices;
    if (s.op === 0x98) {
      for (let i = 2; i < ix.length; i++) {
        if (i % 2 === 0) tri.push(ix[i - 2], ix[i - 1], ix[i]);
        else tri.push(ix[i - 1], ix[i - 2], ix[i]);
      }
    } else if (s.op === 0x90) {
      for (let i = 0; i + 2 < ix.length; i += 3) tri.push(ix[i], ix[i + 1], ix[i + 2]);
    } else if (s.op === 0xa0) {
      for (let i = 2; i < ix.length; i++) tri.push(ix[0], ix[i - 1], ix[i]);
    } else if (s.op === 0x80) {
      for (let i = 0; i + 3 < ix.length; i += 4) tri.push(ix[i], ix[i + 1], ix[i + 2], ix[i], ix[i + 2], ix[i + 3]);
    }
  }
  return Uint32Array.from(tri);
}

function blockGeometry(buf, block) {
  const d = block.descriptor,
    sc = Math.pow(2, -block.vat[0]);
  const vertices = new Float32Array(d.count * 3);
  for (let i = 0; i < d.count; i++) {
    const p = block.pos + i * block.posSize;
    vertices[3 * i] = buf.readInt16BE(p) * sc;
    vertices[3 * i + 1] = buf.readInt16BE(p + 2) * sc;
    vertices[3 * i + 2] = buf.readInt16BE(p + 4) * sc;
  }
  return {
    descriptor: d.index,
    owner: d.owner,
    kind: block.kind,
    count: d.count,
    frac: block.vat[0],
    vertices,
    triangles: triangulate(block.strips),
    strips: block.strips.length,
  };
}

export function decodeGeometry(buf, graph) {
  if (!descriptorSection(graph) || !geometrySection(graph))
    return { descriptors: [], units: [], stop: { why: 'no geometry sections' }, consumed: 0, size: 0 };
  const descriptors = parseDescriptors(buf, graph);
  const walk = walkBlocks(buf, graph, descriptors);
  return {
    descriptors,
    units: walk.blocks.map(b => blockGeometry(buf, b)),
    stop: walk.stop,
    consumed: walk.consumed,
    size: walk.size,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Ownership: which placed model does a draw unit belong to.

// Reverse references between records of the object section. With a runtime fixup map, the pointer words are
// the loader's; without one, every word that lands on a record header within the section counts (structural).
export function referenceIndex(buf, graph, fixups = null) {
  const OS = graph.sections[graph.object_section],
    isH = recordHeaderTest(buf, graph.types.length);
  const heads = [];
  for (let p = OS.offset; p + 12 <= OS.offset + OS.size; p += 4) if (isH(p)) heads.push(p);
  const ownerOf = a => {
    let lo = 0,
      hi = heads.length - 1,
      b = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (heads[m] <= a) {
        b = heads[m];
        lo = m + 1;
      } else hi = m - 1;
    }
    return b;
  };
  const refs = new Map();
  const add = (w, t) => {
    const src = ownerOf(w),
      dst = ownerOf(t);
    if (src < 0 || dst < 0 || src === dst) return;
    if (!refs.has(dst)) refs.set(dst, []);
    refs.get(dst).push({ src, header: t === dst, field: w - src });
  };
  if (fixups?.pointer_words) {
    for (const w of fixups.pointer_words) {
      const t = OS.offset + (buf.readUInt32BE(w) & 0x7fffffff);
      if (t >= OS.offset && t < OS.offset + OS.size) add(w, t);
    }
  } else {
    for (let w = OS.offset; w + 4 <= OS.offset + OS.size; w += 4) {
      const v = buf.readUInt32BE(w);
      const t = OS.offset + (v & 0x7fffffff);
      if (v && t > OS.offset && t < OS.offset + OS.size && isH(t)) add(w, t);
    }
  }
  return { refs, ownerOf, isH, heads, structural: !fixups?.pointer_words };
}

// The {4, 1, min xyz, max xyz} bounds attribute inside a record.
export function boundsIn(buf, graph, rec) {
  const OS = graph.sections[graph.object_section];
  for (let p = rec + 12; p < rec + 0x400 && p + 32 <= OS.offset + OS.size; p += 4) {
    if (buf.readUInt32BE(p) === 4 && buf.readUInt32BE(p + 4) === 1) {
      const f = [0, 1, 2, 3, 4, 5].map(k => buf.readFloatBE(p + 8 + 4 * k));
      if (f.every(Number.isFinite) && f[3] > f[0] && f[4] > f[1] && f[5] > f[2] && Math.abs(f[3]) < 1e4)
        return { min: f.slice(0, 3), max: f.slice(3) };
    }
  }
  return null;
}

// A model's declared bounds: the first bounds attribute found from the model record down its node chain.
function modelBounds(buf, graph, index, model) {
  const OS = graph.sections[graph.object_section],
    isH = index.isH;
  const seen = new Set();
  let frontier = [model];
  for (let d = 0; d < 4 && frontier.length; d++) {
    const next = [];
    for (const r of frontier) {
      if (seen.has(r)) continue;
      seen.add(r);
      const bb = boundsIn(buf, graph, r);
      if (bb) return bb;
      for (let p = r + 12; p < r + 0x200 && p + 4 <= OS.offset + OS.size && !isH(p); p += 4) {
        const t = OS.offset + (buf.readUInt32BE(p) & 0x7fffffff);
        if (t > OS.offset && t < OS.offset + OS.size && isH(t)) next.push(t);
      }
    }
    frontier = next;
  }
  return null;
}

// Assign draw units to placed models. From a unit's owner record, climb the reverse references -- header
// references first, body references only when there is none -- until model records are reached. A unit belongs
// to every model it reaches whose declared bounds contain it: the sunflower head is shared by two sunflower
// models and fits both; a world chunk hangs off a material record nine props point at and fits none of them.
export function assignUnits(buf, graph, units, models, fixups = null, { tolerance = 0.05 } = {}) {
  const index = referenceIndex(buf, graph, fixups);
  const modelSet = new Set(models);
  const bounds = new Map(models.map(m => [m, modelBounds(buf, graph, index, m)]));
  const fits = (u, bb) => {
    if (!bb) return true;
    const ext = Math.max(...[0, 1, 2].map(a => bb.max[a] - bb.min[a])),
      tol = tolerance * ext + 0.05;
    for (let i = 0; i < u.count; i++)
      for (let a = 0; a < 3; a++) {
        const x = u.vertices[3 * i + a];
        if (x < bb.min[a] - tol || x > bb.max[a] + tol) return false;
      }
    return true;
  };
  const climb = rec => {
    const found = new Set(),
      seen = new Set();
    let frontier = [rec];
    for (let step = 0; step < 10 && frontier.length; step++) {
      const next = [];
      for (const r of frontier) {
        if (seen.has(r)) continue;
        seen.add(r);
        if (modelSet.has(r)) {
          found.add(r);
          continue;
        }
        const rs = index.refs.get(r) ?? [];
        const hdr = rs.filter(x => x.header);
        for (const x of hdr.length ? hdr : rs) next.push(x.src);
      }
      frontier = next;
    }
    return found;
  };
  const byModel = new Map(models.map(m => [m, []]));
  let shared = 0,
    world = 0;
  units.forEach((u, i) => {
    const owner = index.ownerOf(u.owner);
    const reached = owner < 0 ? [] : [...climb(owner)].filter(m => fits(u, bounds.get(m)));
    if (!reached.length) {
      world++;
      return;
    }
    if (reached.length > 1) shared++;
    for (const m of reached) byModel.get(m).push(i);
  });
  return { byModel, bounds, shared, world, structural: index.structural };
}
