// PortalForge Dolphin MCP server (stdio).
//
// It extends the upstream `mcp-dolphin` tool set with the tools in tool-definitions.mjs, validates every call
// against its schema, refuses memory access outside guest RAM, runs calls one at a time, and appends each one
// to .local/dolphin-evidence/calls.jsonl. That log is evidence: it is what an experiment record points at.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerTools } from './node_modules/mcp-dolphin/dist/tools.js';
import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeCall, evidence, initializeProfile, memoryRange } from './runtime.mjs';
import { EXTRA_TOOLS, correctUpstreamTools } from './tool-definitions.mjs';
import { HANDLERS } from './tool-handlers.mjs';

// The upstream package registers its handlers on a server object; capturing them lets this server list the
// upstream tools and delegate to them without running a second server.
const upstream = [];
registerTools({ setRequestHandler: (_schema, handler) => upstream.push(handler) }, { call: bridgeCall });
const [upstreamList, upstreamCall] = upstream;

const tools = [...correctUpstreamTools((await upstreamList()).tools), ...EXTRA_TOOLS];
const ajv = new Ajv({ strict: false });
const validators = new Map(tools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));

const asResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

// Bytes touched by a memory tool: an explicit length, the width in the tool name (read32), or the float size.
function accessLength(name, args) {
  if (args.length !== undefined) return args.length;
  const width = /\d+$/.exec(name)?.[0];
  return width ? Number(width) / 8 : (args.bits ?? 32) / 8;
}

function appendAudit(entry) {
  initializeProfile();
  fs.appendFileSync(
    path.join(evidence, 'calls.jsonl'),
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n',
  );
}

// A screenshot is also kept on disc, so an experiment can cite the file rather than an inline image.
function keepScreenshot(result) {
  const image = result.content.find(item => item.type === 'image');
  if (!image) return;
  const output = path.join(evidence, randomUUID() + '.png');
  fs.writeFileSync(output, Buffer.from(image.data, 'base64'));
  result.content.push({ type: 'text', text: output });
}

async function callTool(request) {
  const { name, arguments: args = {} } = request.params;
  try {
    const validate = validators.get(name);
    if (!validate) throw new Error('Unknown tool: ' + name);
    if (!validate(args)) throw new Error(ajv.errorsText(validate.errors));
    if (args.address !== undefined) memoryRange(args.address, accessLength(name, args));

    const handler = HANDLERS[name];
    const result = handler ? asResult(await handler(args)) : await upstreamCall(request);

    appendAudit({
      tool: name,
      args,
      result: result.content.filter(item => item.type === 'text'),
      isError: result.isError ?? false,
    });
    if (name === 'dolphin_screenshot') keepScreenshot(result);
    return result;
  } catch (e) {
    try {
      appendAudit({ tool: name, args, isError: true, error: e.message });
    } catch {
      // The call log is evidence, not control flow: a failed append must not hide the tool error itself.
    }
    return { isError: true, content: [{ type: 'text', text: e.message }] };
  }
}

const server = new Server({ name: 'portalforge-dolphin', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

// Calls run one at a time, so inputs, memory writes and launches never interleave.
let queue = Promise.resolve();
server.setRequestHandler(CallToolRequestSchema, request => {
  const task = queue.then(() => callTool(request));
  queue = task.catch(() => {});
  return task;
});

await server.connect(new StdioServerTransport());
