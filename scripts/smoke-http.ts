// scripts/smoke-http.ts
//
// Compose-level HTTP smoke test (see .github/workflows/ci.yml).
//
// Drives a real MCP client against a running container's /mcp endpoint:
// initialize -> tools/list -> tools/call. The `initialize` POST and the calls that
// follow it are separate HTTP requests, which is precisely the seam a
// stateful-but-sessionless transport breaks — a regression this script fails on.
//
// Usage: tsx scripts/smoke-http.ts [baseUrl]   (default http://localhost:8787)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const baseUrl = process.argv[2] ?? 'http://localhost:8787';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`smoke assertion failed: ${message}`);
}

// The SDK's CallToolResult is a union (content blocks | legacy toolResult), so the
// text-content shape is narrowed here rather than assumed at the call sites.
function toolText(result: unknown): any {
  const content = (result as { content?: { type: string; text: string }[] }).content;
  assert(content?.[0]?.type === 'text', 'tool result has no text content');
  return JSON.parse(content[0].text);
}

async function main(): Promise<void> {
  const health = await fetch(`${baseUrl}/health`);
  assert(health.status === 200, `/health returned ${health.status}`);
  console.log('ok  /health');

  const methodNotAllowed = await fetch(`${baseUrl}/mcp`, { method: 'GET' });
  assert(methodNotAllowed.status === 405, `GET /mcp returned ${methodNotAllowed.status}, expected 405`);
  assert((await methodNotAllowed.json()).jsonrpc === '2.0', 'GET /mcp 405 body is not JSON-RPC shaped');
  console.log('ok  GET /mcp -> JSON-RPC 405');

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client({ name: 'exyu-ci-smoke', version: '0.0.1' });
  await client.connect(transport); // initialize
  console.log('ok  initialize');

  const tools = await client.listTools();
  assert(
    tools.tools.some((t) => t.name === 'resolve_reference'),
    'resolve_reference not advertised by tools/list'
  );
  console.log('ok  tools/list');

  const hit = toolText(
    await client.callTool({ name: 'resolve_reference', arguments: { query: 'Vazduh gori ko da...' } })
  );
  assert(Array.isArray(hit.matches), 'tools/call response has no matches array');
  assert(hit.matches.length > 0, 'seeded record did not match the worn query');
  assert(
    hit.matches[0].ref.external_id === 'ref_valter_vazduh_trepti',
    `unexpected match: ${hit.matches[0].ref.external_id}`
  );
  assert(hit.matches[0].ref.work?.title === 'Valter brani Sarajevo', 'match is missing its work citation');
  assert(!!hit.matches[0].ref.meaning, 'match is missing its meaning');
  assert(hit.matches[0].ref.sources?.length > 0, 'match is missing its sources');
  console.log('ok  tools/call -> fully-cited match');

  // No trigram/FTS hit and no embedding credentials in CI: the cascade must degrade
  // rather than error, and say so distinctly from a genuine miss.
  const miss = toolText(
    await client.callTool({ name: 'resolve_reference', arguments: { query: 'zzz totally unrelated qqq' } })
  );
  assert(Array.isArray(miss.matches) && miss.matches.length === 0, 'unrelated query unexpectedly matched');
  assert(typeof miss.note === 'string', 'miss response has no note');
  console.log(`ok  tools/call -> graceful miss (degraded=${miss.degraded})`);

  await client.close();
  console.log('\nHTTP smoke test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
