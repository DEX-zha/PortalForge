# Research: what limits additions, and what the data allows

## The native recipe, read again

`compileNativePatch` emits one PowerPC routine: save registers, wait for the payload header's flag, and in the
`probe` variant wait until the activation manager holds observers and until an anchor placement is active with an
actor; then loop over `additions.length` slots, and for each: check the source record's class (`0x80481674`),
script and parent, copy the request into the factory's arguments and call `0x80041984`; keep the returned
instance and its ids in the slot. Everything level-specific is data:

| Item | Value today | Per level it should be |
|---|---|---|
| resident section base | `NATIVE_BASE = 0x80DBC020` (tutorial) | the snapshot's `base` (Mining `0x80DC6F48`) |
| readiness anchor | `0x81105604`, a tutorial placement | any record active with an actor on the level's snapshots |
| call context | script-less sources at the return of a script's clone call (`0x800445C8`), scripted ones in the activation manager (`0x80062B88`) | the activation manager for every source: it does not wait for a script to clone something |
| slot | 144 bytes: the factory's argument block itself | a 40-byte row, and one shared argument block rebuilt before each call |
| capacity | 8 confirmed; 2 344 of 3 256 bytes used by a mixed batch | measured by compiling: 18 with the slot, 59 with the row |

Measured on 2026-09-17 with the implementation: one addition costs 712 bytes (script-less) or 768 (scripted) of
the 3 256 that the Gecko area leaves after Dolphin's code handler, 144 of which are the slot; the rest is the
routine and the line framing. Mining's parameters from its snapshot: base `0x80DC6F48` (the same on the two
runs that measured it), anchor `MineTrain`, a still script-less prop active with an actor at the first playable
frame. Mining has 153 testable families: 108 exist as stored templates only, 29 as dormant placements only, 16
have an active member; 111 carry a script.

The hooks, the factory and the class pointer are executable addresses, identical on every level of SSPP52 Rev1.

## Libraries across the disc

Every level archive compiles the libraries it uses (`*.lvl` layers) with their templates, models, textures,
scripts and sounds. Census over the 75 decoded levels (`scene-roles` for templates):

| Libraries by how many levels hold them | Count |
|---|---:|
| one level only | 374 |
| two to nine | 284 |
| ten to twenty-nine | 53 |
| thirty to fifty-nine | 13 |
| sixty or more | 12 |

736 libraries, 149 enemy libraries. Everywhere: `GameElement_Food` (74), `Indicator_AttackHere` (68),
`Enemy_Set-Ups` and the enemy macros (67). Chompies: `Enemy_Chompy_common` in 19 levels, `Enemy_Chompy` in 16.
Most enemy families: 3 to 13 levels. Bosses and one-offs: one level. Templates per level: median 269, from 11 to
554. Conclusion: same-level cloning covers a lot per level, and "any enemy anywhere" is an import problem for most
enemies.

## What the loader allows

- Records are constructed by the positional walk of each header-table record's blob; reflection rebases pointer
  fields and constructs nothing (`igz.loader.reflection-constructs-pointees`).
- Inserting inside a blob is stomped by that blob's constructor; inserting in the head span shifts the
  count-bounded walkers (`igz.loader.blob-walk-stomps-insertions`, `igz.loader.head-span-count-walk`).
- The header table is `{count, offsets…}` at the start of section 1 with no slack; growing it shifted every
  record by 32 bytes and the load froze at 1 036 of 21 680 records, with a pointer map that was not yet complete
  and without the section-5 words that later relocations learned to include.
- Same-size replacement of a record is CONFIRMED (M3). Appending outside every blob leaves the record raw and the
  level playable: a raw record is inert.

What was never tried: growing the table with a **complete** pointer map (every section-1 and section-5 pointer
word, header-table and block words) taken from a resident dump of that very level, and appending the new records
at the end of the section as table records so that they are walked and constructed. That is experiment C1.

## The activation flag

+0x54 is 4 or 5 on every record of every level measured (`igz.placement.inactive-flag`); in the running game a
4 reads 1 with an actor or 2 without, a 5 reads 5 without an actor. Whether the game reads the file bit at
construction and nothing else decides placement is the hypothesis of phase B; it is a one-word, same-size edit
that the save plan can authorise exactly.

## What a campaign needs that already exists

`addition-probe.mjs` boots a level twice for one or two sources and verifies instances in memory
(`verifyNativeInstances`: class, state, actor, initial transform against the request, current transform kept
apart) at captures; `verifyNativeLifecycle` distinguishes creation from survival. What is missing is batching
(one patch with many sources), the per-level parameters, and the family promotion rule.
