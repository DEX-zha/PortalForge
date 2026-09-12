// Interactive diagnostic MCP client. One JSON {name,arguments} request per line.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createInterface} from 'node:readline';
import {here} from './runtime.mjs';
import path from 'node:path';
const client=new Client({name:'portalforge-validation',version:'0.1.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(here,'server.mjs')],stderr:'inherit'}));
console.log('MCP_SESSION_READY');
for await(const line of createInterface({input:process.stdin})) {
  try {
    if(line.trim()==='exit') break;
    const result=await client.callTool(JSON.parse(line));
    console.log(JSON.stringify({...result,content:result.content.filter(c=>c.type!=='image')}));
  } catch(e) {console.log(JSON.stringify({error:e.message}));}
}
await client.close();
