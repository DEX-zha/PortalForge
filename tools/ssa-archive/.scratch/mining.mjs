import fs from 'node:fs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
const W = '../../.local/workspaces/';
const session = openSession(W + 'mining-bld/entries/3-level.bld.decoded', { archive: 'level/Level_000_Mining.bld', entry: 3 });
console.log('opened:', session.placements.length, 'placements |', session.layers.length, 'layers | class', session.detection.placement_type,
  '| runtime map', session.has_runtime_map, '| counts', JSON.stringify(session.counts));
const s = await startServer({ session, port: 0 });
const get = p => fetch(s.url + p).then(r => r.json());
const post = (p, b) => fetch(s.url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) }).then(async r => ({ status: r.status, body: await r.json() }));

const all = await get('/api/placements');
console.log('top layers:', all.layers.slice(0, 5).map(l => l.name + '(' + l.count + ')').join(' '));
const withModel = all.placements.filter(p => p.model.path);
const p = withModel.find(x => !x.behavior) ?? withModel[0];
console.log('\npicked:', p.name, p.position, '| model', p.model.path.replace(/^.*\//, ''), '| behaviour', p.behavior?.path?.replace(/^.*\//, '') ?? 'none');
const detail = await get('/api/placement/' + p.offset);
console.log('evidence:', JSON.stringify(detail.placement.evidence));
console.log('safety:', detail.safety.map(r => r.severity + '/' + r.id).join(' '));
console.log('duplication targets offered:', detail.replace_targets.length);

console.log('\n--- edit');
const e = await post('/api/edit', { kind: 'transform', target: p.offset, position: [p.position[0], p.position[1] + 8, p.position[2]] });
console.log('edit:', e.status, e.body.placement?.position ?? e.body.error, '| dirty', e.body.dirty);
const out = '../../.local/workspaces/mining-bld/mining-edit.decoded';
const sv = await post('/api/save', { out });
console.log('save:', sv.status, sv.body.plan?.status, '| changes', sv.body.plan?.changes?.length, '| outside', sv.body.plan?.bytes_changed_outside);
const a = fs.readFileSync(session.file), b = fs.readFileSync(out);
let d = 0; for (let q = 0; q + 4 <= a.length; q += 4) if (a.readUInt32BE(q) !== b.readUInt32BE(q)) d++;
console.log('byte check: same length', a.length === b.length, '| differing words', d);

console.log('\n--- duplication must be refused without a runtime map');
const dup = await post('/api/edit', { kind: 'replace', target: withModel[1].offset, source: p.offset });
console.log('duplicate:', dup.status, dup.body.error, '|', (dup.body.reason ?? '').slice(0, 110));
await s.close();
