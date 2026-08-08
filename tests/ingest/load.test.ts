import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('re-ingest updates mutable fields and variants without duplicating the work row', async () => {
    const skeleton = loadSkeleton('skeleton/works.yaml');
    const deps = { db: client as unknown as pg.Pool, embedder: fakeEmbedder, skeleton };

    // Ingest the pristine record first so this test is order-independent.
    const first = await loadRecord('records/film/ref_valter_vazduh_trepti.yaml', deps);

    const original = readFileSync('records/film/ref_valter_vazduh_trepti.yaml', 'utf-8');
    const modified = original
      .replace(
        /meaning: >\n(  .*\n)+/,
        'meaning: "REVISED MEANING for the re-ingest test."\n'
      )
      .replace('  - "Vazduh treperi kao da nebo gori"', '  - "Vazduh treperi ko da nebo gori"');
    expect(modified).toContain('REVISED MEANING');
    expect(modified).toContain('Vazduh treperi ko da nebo gori');

    const dir = mkdtempSync(join(tmpdir(), 'exyu-reingest-'));
    const modifiedPath = join(dir, 'ref_valter_vazduh_trepti.yaml');
    writeFileSync(modifiedPath, modified);

    const second = await loadRecord(modifiedPath, deps);
    expect(second.refId).toBe(first.refId);

    // (a) the updated field is reflected in the DB
    const ref = await client.query('SELECT enrichment, work_id FROM refs WHERE id = $1', [second.refId]);
    expect(ref.rows[0].enrichment.meaning).toBe('REVISED MEANING for the re-ingest test.');

    const variants = await client.query(
      'SELECT variant_text FROM variants WHERE ref_id = $1 ORDER BY variant_text',
      [second.refId]
    );
    const variantTexts = variants.rows.map((r) => r.variant_text);
    expect(variantTexts).toContain('Vazduh treperi ko da nebo gori');
    expect(variantTexts).not.toContain('Vazduh treperi kao da nebo gori');

    // (b) exactly one works row for that title/year
    const works = await client.query('SELECT id FROM works WHERE title = $1 AND year = $2', [
      'Valter brani Sarajevo',
      1972
    ]);
    expect(works.rows).toHaveLength(1);

    // (c) the ref's work_id still points at that one row
    expect(ref.rows[0].work_id).toBe(works.rows[0].id);
  });

  it('writes related[] graph edges into refs_edges, resolving known targets', async () => {
    const skeleton = loadSkeleton('skeleton/works.yaml');
    const deps = { db: client as unknown as pg.Pool, embedder: fakeEmbedder, skeleton };

    // The film record must exist first so the meme's DERIVED_FROM edge resolves.
    const { refId: filmRefId } = await loadRecord('records/film/ref_valter_vazduh_trepti.yaml', deps);
    const { refId: memeRefId } = await loadRecord('records/meme/ref_stub_meme.yaml', deps);

    const edges = await client.query('SELECT * FROM refs_edges WHERE ref_id = $1', [memeRefId]);
    expect(edges.rows).toHaveLength(1);
    expect(edges.rows[0].rel_type).toBe('DERIVED_FROM');
    expect(edges.rows[0].related_ref_id).toBe(filmRefId);

    // The film record's own edge has a note but no `ref` target — stored unresolved.
    const filmEdges = await client.query('SELECT * FROM refs_edges WHERE ref_id = $1', [filmRefId]);
    expect(filmEdges.rows).toHaveLength(1);
    expect(filmEdges.rows[0].rel_type).toBe('SAME_THEME');
    expect(filmEdges.rows[0].related_ref_id).toBeNull();
    expect(filmEdges.rows[0].note).toBe('partizan recognition codes');

    // Re-ingesting must not accumulate duplicate outgoing edges.
    await loadRecord('records/meme/ref_stub_meme.yaml', deps);
    const again = await client.query('SELECT * FROM refs_edges WHERE ref_id = $1', [memeRefId]);
    expect(again.rows).toHaveLength(1);
  });

  it('throws a clear dimension-mismatch error instead of a cryptic Postgres error', async () => {
    const skeleton = loadSkeleton('skeleton/works.yaml');
    const wrongSizeEmbedder: EmbeddingProvider = {
      embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.01))
    };

    await expect(
      loadRecord('records/film/ref_valter_vazduh_trepti.yaml', {
        db: client as unknown as pg.Pool,
        embedder: wrongSizeEmbedder,
        skeleton
      })
    ).rejects.toThrow(
      /Embedding dimension mismatch: got 1024, expected 1536 .*EMBEDDING_PROVIDER/s
    );
  });
});
