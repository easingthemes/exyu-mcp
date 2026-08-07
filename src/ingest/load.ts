import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import pg from 'pg';
import { validateRecord } from './validate.js';
import { resolveWork, type WorkSkeletonEntry } from './resolveWork.js';
import type { EmbeddingProvider } from '../providers/embedding.js';

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

  let workId: string | null = null;
  if (record.work) {
    const match = resolveWork({ title: record.work.title, year: record.work.year }, deps.skeleton);
    const upserted = await deps.db.query(
      `INSERT INTO works (title, year, wikidata_qid, musicbrainz_mbid)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [record.work.title, record.work.year ?? null, match?.wikidata_qid ?? null, record.work.musicbrainz_mbid ?? null]
    );
    workId = upserted.rows[0].id;
  }

  const embedding = await deps.embedder.embed(record.canonical_text);
  const vectorLiteral = `[${embedding.join(',')}]`;

  const refResult = await deps.db.query(
    `INSERT INTO refs (external_id, source_type, canonical_text, normalized_text, function, work_id, extension, speaker, timestamp_start, timestamp_end, enrichment, signals, gap, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (external_id) DO UPDATE SET
       canonical_text = EXCLUDED.canonical_text,
       normalized_text = EXCLUDED.normalized_text,
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

  await deps.db.query('DELETE FROM variants WHERE ref_id = $1', [refId]);
  for (const variant of record.variants) {
    await deps.db.query(
      'INSERT INTO variants (ref_id, variant_text, normalized_variant) VALUES ($1, $2, $3)',
      [refId, variant, normalize(variant)]
    );
  }

  await deps.db.query('DELETE FROM sources WHERE ref_id = $1', [refId]);
  for (const source of record.sources) {
    await deps.db.query(
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

  return { refId };
}
