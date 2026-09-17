import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryRange, bridgeCall, portOccupied, buildDescriptor, here } from '../runtime.mjs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
test('game-mod descriptor paths use forward slashes so Dolphin resolves external files', () => {
  // Dolphin's SplitPath only splits on '/' (and ':' on Windows); a backslash XML path makes the
  // patch root "C:" and every relative external file silently missing.
  const d = buildDescriptor(path.join(here, 'package.json'), path.join(here, 'server.mjs'), here, [
    { 'option-id': 'x', choice: 1 },
  ]);
  const patch = d.riivolution.patches[0];
  for (const p of [d['base-file'], patch.xml, patch.root]) {
    assert.ok(!p.includes('\\'), 'backslash in ' + p);
    assert.ok(path.isAbsolute(p), 'absolute path required: ' + p);
  }
  assert.ok(patch.xml.endsWith('/server.mjs'));
  assert.equal(patch.root, here.replace(/\\/g, '/'));
});
test('RAM boundaries reject overflow, MMIO and invalid sizes', () => {
  memoryRange(0x817ffffc, 4);
  memoryRange(0x93fffffc, 4);
  for (const [a, n] of [
    [0x817ffffd, 4],
    [0x93fffffd, 4],
    [0xcc000000, 4],
    [0x80000000, 0],
    [0x80000000, 65537],
    [0x80000000, 1.5],
  ])
    assert.throws(() => memoryRange(a, n));
});
test('valid unaligned reads remain exact byte ranges', () => {
  memoryRange(0x80000001, 8);
});
test('bridge reconstructs fragmented responses and preserves 64-bit strings', async () => {
  const s = createServer(socket =>
    socket.once('data', data => {
      assert.equal(JSON.parse(data).params[1], '18446744073709551615');
      socket.write('{"id":1,"result":"1844674407');
      setTimeout(() => socket.end('3709551615"}\n'), 10);
    }),
  );
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  try {
    assert.equal(
      await bridgeCall('memory.write_u64', [0x80004000, '18446744073709551615'], 1000, s.address().port),
      '18446744073709551615',
    );
  } finally {
    s.close();
  }
});
test('silent bridge times out instead of hanging indefinitely', async () => {
  const sockets = [];
  const s = createServer(socket => {
    sockets.push(socket);
    socket.on('data', () => {});
  });
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  try {
    await assert.rejects(bridgeCall('bridge.ping', [], 50, s.address().port), /timeout/);
  } finally {
    sockets.forEach(x => x.destroy());
    s.close();
  }
});
test('occupied bridge port is detected before spawning a conflicting emulator', async () => {
  const s = createServer(socket => socket.destroy());
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = s.address().port;
  assert.equal(await portOccupied(port), true);
  await new Promise(r => s.close(r));
  assert.equal(await portOccupied(port), false);
});
