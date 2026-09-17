// Smoke test of the MCP server without a game: handshake, tool list, status, and the refusal of a write
// outside guest memory. With --live it also pings a running bridge. Usage: node smoke.mjs [--live]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { here } from './runtime.mjs';
import path from 'node:path';
const client = new Client({ name: 'portalforge-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, 'server.mjs')],
  stderr: 'inherit',
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(JSON.stringify({ handshake: 'PASS', tools: tools.map(t => t.name) }, null, 2));
  const status = await client.callTool({ name: 'dolphin_status', arguments: {} });
  console.log(JSON.stringify(status, null, 2));
  const bad = await client.callTool({ name: 'dolphin_write32', arguments: { address: 0, value: 1 } });
  if (!bad.isError) throw new Error('Invalid memory write was not rejected');
  console.log('INVALID_WRITE_REJECTION=PASS');
  if (process.argv.includes('--live')) {
    const ping = await client.callTool({ name: 'dolphin_ping', arguments: {} });
    if (ping.isError) throw new Error(JSON.stringify(ping));
    console.log(JSON.stringify(ping));
  }
} finally {
  await client.close();
}
