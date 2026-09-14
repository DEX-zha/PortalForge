# IGZ level geometry: from a placement to its mesh

How a Wii level of Skylanders: Spyro's Adventure stores the meshes it draws, and how PortalForge reads them.
Everything below was read off byte boundaries of the tutorial level and then counted on every level of the disc.
Type names were never used: they are per file and unreliable (finding `igz.types.per-file-indices`). The
decoder is `tools/ssa-archive/src/igz/gxmesh.mjs`; the finding records are `igz.sections.roles`,
`igz.geometry.descriptor-table`, `igz.geometry.block-layout`, `igz.geometry.position-quantisation` and
`igz.geometry.model-ownership`.

## The chain

```
placement (type-104 record)           +0xDC -> model record (type-64, named by the .mdl path)
model record                          +0x14 -> node list (type-65)
node list                             +0x20 -> node (type-3 group, or type-8 directly)
type-3 group                          +0x74, +0x78, +0x7c, +0x80, +0x8c ... -> type-8 nodes, one per draw unit
type-8 node                           +0x10c / +0x11c -> type-12 child nodes -> +0x74 -> more children
section-5 descriptor                  +0x44 -> back into a type-8 / type-12 node (that is the only link from a
                                               mesh to its owner, and it points the other way)
section-6 block                       found by walking the section in descriptor order
```

The type indices above (3, 8, 12, 64, 65, 104) are the tutorial's. They differ per file; the decoder never
tests them. The pointers a model record holds at +0x18 and +0x20, and a node's +0x84..+0x90 and +0xd8, lead
into other objects (materials, render states, shared records) and must not be followed for ownership.

## What each section is

| index | tag | content | evidence |
|---|---|---|---|
| 0 | 0 | header, section table, type table | |
| 1 | 8 | object records (placements, models, nodes, layers, scripts) | |
| 2 | 15 | string data | |
| 3 | 25 | Havok 7.1 physics: collision (`hkpPhysicsData`) | class names at its head |
| 4 | 31 | CMPR (DXT1) textures, 32-aligned | `5bc45b83 aaaaaaaa` blocks at its head, a green block under the weed's texture reference |
| 5 | 44 | draw-unit descriptors | this document |
| 6 | 51 | vertex blocks and GX display lists | this document |
| 7 | 65 | Havok animation (`hkaSplineCompressedAnimation`) | class names at its head |
| 8 | 0 | FMOD FSB4 sound banks, to the last byte | 214 banks covering 3 092 064 of 3 092 080 bytes on the tutorial |

A render node's reference into section 8 is a sound. Its references into section 4 are textures. Neither is
geometry, and neither is edited.

## Section 5: one descriptor per draw unit

Each entry opens `{T, 1, count, 0x80000004, ...}` where `T` is the descriptor's per-file type index (0xf on the
tutorial); the decoder reads `T` off the first entry, which always sits at +0x04.

| field | meaning |
|---|---|
| +0x08 | vertex count |
| +0x34 | vertex stride, the sum of the per-array record sizes |
| +0x44 | back-pointer: object-section offset inside the owning node record (relocated by the game at load) |
| +0x6c.. | attribute list: triplets `{tag<<24 \| sub<<16, format, offset<<16}` until `0x2c000000` |
| after the last `0x2c000000` | the record sizes of the separate arrays, e.g. `{10, 4, 4}` |

Attribute tags seen: `0x32` normal (s8 x3), `0x33` colour (2 bytes), `0x1d` texture coordinates (s16 x2),
`0x06` (4 bytes). The position is implicit and always first. The attribute offsets are non-zero only for
interleaved vertices (world chunks). An entry may carry an inner `{T+1, 1, ...}` block: a second material pass,
which owns no block of its own (checked on #1590/#1591: what looked like a second block was the next
descriptor's).

## Section 6: one block per descriptor, in order

Every piece is 32-aligned relative to the section start; the section itself is not 32-aligned in the file.
After 32 zero bytes:

```
interleaved kind (world chunks)
    00 9F cc cc              a GX direct-primitive header: opcode 0x9F, u16 vertex count
    count * stride bytes     interleaved vertices, position s16 x3 at +0
separate kind (placed props)
    array 0                  position s16 x3, plus normal s8 x3 and a pad byte when sizes[0] is 10
    array 1..n               one array per remaining size (uv s16 x2, colour, ...), each 32-aligned, no prefix
then, in both kinds
    32 bytes                 GX fraction bits, one u32 per attribute, position first: {6,14,0,0}, {10,6,14,14},
                             {10,6,14,14,14,0,0,0} for a five-attribute mesh
    00                       NOP
    display list             triangle strips {0x98|vat, u16 n, n * attrs * idxSize}, NOP separated, zero padded
```

The index size is 1 or 2 bytes and is not a function of the vertex count (a 234-vertex mesh uses 16-bit
indices). Every attribute of a vertex uses the same index, into the block's own arrays.

The walk is self-checking. A display list is accepted only when every index addresses a vertex of its own block
and the list ends exactly where the next descriptor's block begins, meaning that descriptor's arrays laid from
there end on a fraction header. That is what settles the index width, and what keeps two impostors from passing
for one more strip: the next interleaved block's `00 9F count` header, and the raw first bytes of a separate-array
block, which can begin with an opcode-looking value (0xB2 was seen on a prop present in twelve levels).

## Positions

`position = s16 * 2^-frac`, with `frac` the first word of the fraction header. World chunks use 6, in world
space. Props use 7 to 10, in the model's local space: a 1-unit coin and a 6-unit sunflower both use 10. Normals
use 6 (64 = 1.0; unit length verified), texture coordinates 14 (16384 = 1.0).

Checked against the owner's declared bounds, the `{4, 1, min, max}` attribute of the node record: world chunk
#2 dequantises to x −220.17..−218.64 against a declared −220.17..−218.64. Per model, 209 of 209 tutorial models
and 131 of 131 Mining models with declared bounds have every vertex inside them at 5%.

## Ownership

From a unit's back-pointer, the owner record is the nearest record header before it. Its parents are the
records holding a runtime pointer to its header; only when there is none, the records holding a pointer into
its body (private children are often referenced only through a parent's attribute blocks). Climbing parents
reaches model records. A unit belongs to every model it reaches whose declared bounds contain its vertices.

That last test is what makes it work. The 326-vertex sunflower head is reached by two sunflower models and fits
both: it belongs to both. A world chunk hangs off a material record that nine props point at: it reaches all
nine and fits none. Top-down walks from the model leak through +0x18/+0x20 and through a node's +0x84..+0x90.

The reference index uses the runtime fixup map when the level has one and structural header-landing pointers
otherwise. On the tutorial the two give the same assignment for all 210 models, so no level needs a boot to get
its meshes.

## Numbers

| | tutorial | Mining | disc (112 levels) |
|---|---|---|---|
| descriptors / blocks walked | 2264 / 2264 | 925 / 925 | 204 821 / 204 821 |
| vertices | 416 025 | 315 057 | 37 904 199 |
| triangles | 526 834 | 277 903 | |
| placed models with a mesh | 210 / 210 | 134 / 134 | 18 473 / 18 554 |
| models inside their declared bounds | 209 / 209 | 131 / 131 | |
| decode time | 108 ms | | |

The 81 models without a mesh on the disc are the credits and gryphon levels, which hold no geometry of this
kind, and one invisible marker model per level.

## What it looks like

`ssa-archive edit preview <level> --archive .. --entry 3 --meshes --eye 96,18,20 --target 86,13,46 --out x.png`
renders the decoded meshes as wireframes at their placements from a point near the tutorial spawn. The blades
sit above the windmill, the two sunflowers to its right, the floating island beyond: the arrangement of the
Dolphin control screenshot `m1-level_027_tutorial-reencode-1789234236226-control-46-tutorial-skylander.png`.
The editor draws the same meshes grey through `GET /api/meshes`, and keeps a cube proxy for any model the
decoder does not reach.

## What is not here

Textures and materials (section 4 and the material records), skeletons and skinning (the Havok animation of
section 7 and the bone records), collision (section 3). Nothing writes to sections 5 or 6; the decoder is
read-only by design. What keeps the geometry findings at LIKELY rather than CONFIRMED is the project's own
rule: a mesh-derived prediction has not yet been judged in the running game twice.
