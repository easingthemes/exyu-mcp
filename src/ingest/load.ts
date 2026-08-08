import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import pg from 'pg';
import { validateRecord } from './validate.js';
import { resolveWork, loadSkeleton, type WorkSkeletonEntry } from './resolveWork.js';
import { assertEmbeddingDimension, type EmbeddingProvider } from '../providers/embedding.js';

export interface LoadDeps {
  db: pg.Pool | pg.Client;
  embedder: EmbeddingProvider;
  skeleton: WorkSkeletonEntry[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export async function loadRecord(filePath: string, deps: LoadDeps): Promise<{ refId: string }> {
  const raw = parse(readFileSync(filePath, 'utf-8'));
  const record = validateRecord(raw);

  // Embed before opening the transaction: it is a network call to an external
  // provider and there is no reason to hold a DB connection open across it.
  const embedding = await deps.embedder.embed(record.canonical_text);
  assertEmbeddingDimension(embedding);
  const vectorLiteral = `[${embedding.join(',')}]`;

  // A transaction has to run on a single connection. When handed a Pool we check out
  // one client and release it in the finally; when handed a Client we use it directly.
  const pool = deps.db instanceof pg.Pool ? deps.db : null;
  const client: pg.PoolClient | pg.Client = pool ? await pool.connect() : (deps.db as pg.Client);

  try {
    await client.query('BEGIN');

    let workId: string | null = null;
    if (record.work) {
      const match = resolveWork({ title: record.work.title, year: record.work.year }, deps.skeleton);
      // Upsert on the (title, year) natural key so re-ingesting a record reuses the
      // existing work row instead of orphaning a fresh one every time.
      const upserted = await client.query(
        `INSERT INTO works (title, year, wikidata_qid, musicbrainz_mbid)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (title, year) DO UPDATE SET
           wikidata_qid = EXCLUDED.wikidata_qid,
           musicbrainz_mbid = EXCLUDED.musicbrainz_mbid
         RETURNING id`,
        [record.work.title, record.work.year ?? null, match?.wikidata_qid ?? null, record.work.musicbrainz_mbid ?? null]
      );
      workId = upserted.rows[0].id;
    }

    // Every mutable column is refreshed on conflict — a partial update would silently
    // strand the previous values of fields the YAML has since changed.
    const refResult = await client.query(
      `INSERT INTO refs (external_id, source_type, canonical_text, normalized_text, function, work_id, extension, speaker, timestamp_start, timestamp_end, enrichment, signals, gap, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (external_id) DO UPDATE SET
         source_type = EXCLUDED.source_type,
         canonical_text = EXCLUDED.canonical_text,
         normalized_text = EXCLUDED.normalized_text,
         function = EXCLUDED.function,
         work_id = EXCLUDED.work_id,
         extension = EXCLUDED.extension,
         speaker = EXCLUDED.speaker,
         timestamp_start = EXCLUDED.timestamp_start,
         timestamp_end = EXCLUDED.timestamp_end,
         enrichment = EXCLUDED.enrichment,
         signals = EXCLUDED.signals,
         gap = EXCLUDED.gap,
         embedding = EXCLUDED.embedding
       RETURNING id`,
      [
        record.id,
        record.source_type,
        record.canonical_text,
        record.normalized_text,
        record.function,
        workId,
        record.extension ?? null,
        record.speaker ?? null,
        record.timestamp_start ?? null,
        record.timestamp_end ?? null,
        { meaning: record.meaning, emotional_tone: record.emotional_tone, modern_usage: record.modern_usage },
        record.signals ?? {},
        { gap_score: record.gap_score, gap_notes: record.gap_notes },
        vectorLiteral
      ]
    );
    const refId: string = refResult.rows[0].id;

    await client.query('DELETE FROM variants WHERE ref_id = $1', [refId]);
    for (const variant of record.variants) {
      await client.query(
        'INSERT INTO variants (ref_id, variant_text, normalized_variant) VALUES ($1, $2, $3)',
        [refId, variant, normalize(variant)]
      );
    }

    await client.query('DELETE FROM sources WHERE ref_id = $1', [refId]);
    for (const source of record.sources) {
      await client.query(
        `INSERT INTO sources (ref_id, field, source_id, source_type, url, license, retrieved_at, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          refId,
          Array.isArray(source.field) ? source.field.join(',') : source.field,
          source.source_id,
          source.source_type,
          source.url ?? null,
          source.license,
          source.retrieved_at,
          source.confidence
        ]
      );
    }

    // Graph edges. `rel.ref` is an external_id that may point at a record ingested
    // later, so resolution is best-effort: an unresolved edge is stored with a NULL
    // related_ref_id rather than dropped, and picks nothing up retroactively (a
    // re-ingest of this record after the target lands will resolve it).
    await client.query('DELETE FROM refs_edges WHERE ref_id = $1', [refId]);
    for (const rel of record.related ?? []) {
      let relatedRefId: string | null = null;
      if (rel.ref) {
        const target = await client.query('SELECT id FROM refs WHERE external_id = $1', [rel.ref]);
        relatedRefId = target.rows[0]?.id ?? null;
      }
      await client.query(
        'INSERT INTO refs_edges (ref_id, related_ref_id, rel_type, note) VALUES ($1, $2, $3, $4)',
        [refId, relatedRefId, rel.rel_type, rel.note ?? null]
      );
    }

    await client.query('COMMIT');
    return { refId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* the original error is what matters; a failed rollback must not mask it */
    });
    throw err;
  } finally {
    if (pool) (client as pg.PoolClient).release();
  }
}

// CLI: `npm run ingest -- <file.yaml> [<file.yaml> ...]`
// Requires DATABASE_URL and working credentials for the configured EMBEDDING_PROVIDER.
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: npm run ingest -- <record.yaml> [<record.yaml> ...]');
    process.exit(1);
  }

  const { getPool } = await import('../db/pool.js');
  const { createEmbeddingProvider } = await import('../providers/embedding.js');

  const pool = getPool();
  const deps: LoadDeps = {
    db: pool,
    embedder: createEmbeddingProvider(),
    skeleton: loadSkeleton('skeleton/works.yaml')
  };

  let failures = 0;
  try {
    for (const file of files) {
      try {
        const { refId } = await loadRecord(file, deps);
        console.log(`ok    ${file} -> refs.id=${refId}`);
      } catch (err) {
        failures++;
        console.error(`FAIL  ${file}`);
        console.error(`      ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`\n${files.length - failures}/${files.length} record(s) ingested.`);
  if (failures > 0) process.exit(1);
}
