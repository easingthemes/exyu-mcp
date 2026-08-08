// tests/server/http.test.ts
//
// Exercises the real Express app over a real TCP socket with a real MCP client.
// The in-memory transport test in createServer.test.ts cannot catch HTTP-transport
// regressions (e.g. a stateful transport with no session store, which breaks every
// request after `initialize`), so this test drives the full round-trip:
// initialize -> tools/list -> tools/call.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { runMigrations } from '../../src/db/migrate.js';
import { loadRecord } from '../../src/ingest/load.js';
import { loadSkeleton } from '../../src/ingest/resolveWork.js';
import { createApp } from '../../src/server/http.js';
import type { EmbeddingProvider } from '../../src/providers/embedding.js';

let container: StartedPostgreSqlContainer;
let dbClient: pg.Client;
let httpServer: Server;
let baseUrl: string;

const fakeEmbedder: EmbeddingProvider = {
  embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.01))
};

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('exyu')
    .withUsername('exyu')
    .withPassword('exyu')
    .start();
  dbClient = new pg.Client({ connectionString: container.getConnectionUri() });
  await dbClient.connect();
  await runMigrations(dbClient as unknown as pg.Pool);
  const skeleton = loadSkeleton('skeleton/works.yaml');
  await loadRecord('records/film/ref_valter_vazduh_trepti.yaml', {
    db: dbClient as unknown as pg.Pool,
    embedder: fakeEmbedder,
    skeleton
  });

  const app = createApp({ db: dbClient as unknown as pg.Pool, embedder: fakeEmbedder });
  httpServer = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await dbClient.end();
  await container.stop();
});

describe('MCP Streamable-HTTP endpoint', () => {
  it('serves /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('completes initialize + tools/list + tools/call over real HTTP', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const client = new Client({ name: 'http-test-client', version: '0.0.1' });

    // connect() performs the `initialize` POST. Every call after this is a *second*
    // POST — the exact request that a stateful-but-sessionless transport rejects.
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('resolve_reference');

    const result = await client.callTool({
      name: 'resolve_reference',
      arguments: { query: 'Vazduh gori ko da...' }
    });

    const text = (result.content as { type: 'text'; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(parsed.matches[0].ref.work.title).toBe('Valter brani Sarajevo');

    await client.close();
  });

  it('answers GET /mcp with a JSON-RPC-shaped 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null
    });
  });

  it('answers DELETE /mcp with a JSON-RPC-shaped 405', async () => {
    const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect((await res.json()).error.code).toBe(-32000);
  });
});
