import { openSession, interchangeable } from '../src/editor/session.mjs';
const W = '../../.local/workspaces/';
for (const [name, dir, map] of [['Mining', 'mining-bld', null], ['Tutorial', 'tutorial-bld', '../../.local/dolphin-evidence/ptr-scan3-fixups.json']]) {
  const fs = await import('node:fs');
  const fixups = map ? JSON.parse(fs.readFileSync(map, 'utf8')) : null;
  const s = openSession(W + dir + '/entries/3-level.bld.decoded', { archive: 'x', entry: 3, fixups });
  const groups = new Map();
  for (const p of s.placements) {
    const c = s.copy.get(p.offset);
    const key = (c.wrapped ? 'wrapped:' : 'plain:') + c.size;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const pairs = [...groups.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
  const wrapped = s.placements.filter(p => s.copy.get(p.offset).wrapped).length;
  console.log(`${name}: ${s.placements.length} placements | wrapped ${wrapped} | interchangeable groups ${pairs.length} | largest ${pairs.slice(0, 4).map(([k, v]) => k + ' x' + v.length).join(' ')}`);
  const usable = pairs.reduce((n, [, v]) => n + v.length, 0);
  console.log(`   placements with at least one stand-in: ${usable} of ${s.placements.length}`);
}
