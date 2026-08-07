// tests/tools/resolveReference.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { loadRecord } from '../../src/ingest/load.js';
import { loadSkeleton } from '../../src/ingest/resolveWork.js';
import { resolveReference } from '../../src/tools/resolveReference.js';
import type { EmbeddingProvider } from '../../src/providers/embedding.js';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

// Deterministic per-text fake embedding: same text -> same vector, different
// text -> a (near-orthogonal) different vector. A constant embedding for every
// input would make the vector leg's cosine similarity always 1.0, producing a
// false-positive match on unrelated queries and defeating the point of the
// cascade fallback test below.
function fakeEmbed(text: string): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  }
  const vector = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    vector[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return vector;
}

const fakeEmbedder: EmbeddingProvider = {
  embed: vi.fn().mockImplementation((text: string) => Promise.resolve(fakeEmbed(text)))
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
  const skeleton = loadSkeleton('skeleton/works.yaml');
  await loadRecord('records/film/ref_valter_vazduh_trepti.yaml', {
    db: client as unknown as pg.Pool,
    embedder: fakeEmbedder,
    skeleton
  });
}, 60_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe('resolveReference', () => {
  it('resolves the worn colloquial variant via the trigram leg', async () => {
    const result = await resolveReference('Vazduh gori ko da...', {
      db: client as unknown as pg.Pool,
      embedder: fakeEmbedder
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(result.matches[0].leg).toBe('trigram');
  });

  it('returns no matches for a completely unrelated query', async () => {
    const result = await resolveReference('completely unrelated query text xyz', {
      db: client as unknown as pg.Pool,
      embedder: fakeEmbedder
    });

    expect(result.matches).toEqual([]);
  });
});
