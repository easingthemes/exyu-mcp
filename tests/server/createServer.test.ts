import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { runMigrations } from '../../src/db/migrate.js';
import { loadRecord } from '../../src/ingest/load.js';
import { loadSkeleton } from '../../src/ingest/resolveWork.js';
import { createExyuServer } from '../../src/server/createServer.js';
import type { EmbeddingProvider } from '../../src/providers/embedding.js';

let container: StartedPostgreSqlContainer;
let dbClient: pg.Client;

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
}, 60_000);

afterAll(async () => {
  await dbClient.end();
  await container.stop();
});

describe('exyu MCP server end-to-end', () => {
  it('resolves the acceptance-test query over an in-memory MCP transport', async () => {
    const server = createExyuServer({ db: dbClient as unknown as pg.Pool, embedder: fakeEmbedder });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.1' });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const result = await client.callTool({
      name: 'resolve_reference',
      arguments: { query: 'Vazduh gori ko da...' }
    });

    const text = (result.content as { type: 'text'; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
  });
});
