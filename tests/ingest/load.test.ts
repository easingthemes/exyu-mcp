import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { loadRecord } from '../../src/ingest/load.js';
import { loadSkeleton } from '../../src/ingest/resolveWork.js';
import type { EmbeddingProvider } from '../../src/providers/embedding.js';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

const fakeEmbedder: EmbeddingProvider = {
  embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.01))
};

beforeAll(async () => {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('exyu')
    .withUsername('exyu')
    .withPassword('exyu')
    .start();
  client = new pg.Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  await runMigrations(client as unknown as pg.Pool);
}, 60_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe('loadRecord', () => {
  it('ingests a valid YAML record into refs/works/variants/sources', async () => {
    const skeleton = loadSkeleton('skeleton/works.yaml');
    const { refId } = await loadRecord('records/film/ref_valter_vazduh_trepti.yaml', {
      db: client as unknown as pg.Pool,
      embedder: fakeEmbedder,
      skeleton
    });

    expect(refId).toBeTruthy();

    const ref = await client.query('SELECT * FROM refs WHERE id = $1', [refId]);
    expect(ref.rows[0].external_id).toBe('ref_valter_vazduh_trepti');
    expect(ref.rows[0].embedding).not.toBeNull();

    const variants = await client.query('SELECT * FROM variants WHERE ref_id = $1', [refId]);
    expect(variants.rows.length).toBeGreaterThan(0);

    const sources = await client.query('SELECT * FROM sources WHERE ref_id = $1', [refId]);
    expect(sources.rows.length).toBeGreaterThan(0);
  });

  it('rejects an invalid record with a clear error', async () => {
    const skeleton = loadSkeleton('skeleton/works.yaml');
    await expect(
      loadRecord('tests/fixtures/invalid-record.yaml', {
        db: client as unknown as pg.Pool,
        embedder: fakeEmbedder,
        skeleton
      })
    ).rejects.toThrow(/schema validation failed/i);
  });
});
