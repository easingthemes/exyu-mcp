// src/tools/resolveReference.ts
import pg from 'pg';
import { assertEmbeddingDimension, type EmbeddingProvider } from '../providers/embedding.js';

export interface MatchCandidate {
  ref: { id: string; external_id: string; canonical_text: string; source_type: string; function: string };
  confidence: number;
  leg: 'trigram' | 'fts' | 'vector';
}

export interface ResolveResult {
  matches: MatchCandidate[];
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export async function resolveReference(
  query: string,
  deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider },
  opts: { trigramThreshold?: number; limit?: number } = {}
): Promise<ResolveResult> {
  const trigramThreshold = opts.trigramThreshold ?? 0.3;
  const limit = opts.limit ?? 5;
  const normalizedQuery = normalize(query);

  const trigramRes = await deps.db.query(
    `SELECT r.id, r.external_id, r.canonical_text, r.source_type, r.function,
            GREATEST(similarity(r.normalized_text, $1), COALESCE(MAX(similarity(v.normalized_variant, $1)), 0)) AS sim
     FROM refs r
     LEFT JOIN variants v ON v.ref_id = r.id
     WHERE similarity(r.normalized_text, $1) > $2 OR similarity(v.normalized_variant, $1) > $2
     GROUP BY r.id
     ORDER BY sim DESC
     LIMIT $3`,
    [normalizedQuery, trigramThreshold, limit]
  );
  if (trigramRes.rows.length > 0) {
    return {
      matches: trigramRes.rows.map((row) => ({
        ref: {
          id: row.id,
          external_id: row.external_id,
          canonical_text: row.canonical_text,
          source_type: row.source_type,
          function: row.function
        },
        confidence: Number(row.sim),
        leg: 'trigram' as const
      }))
    };
  }

  const ftsRes = await deps.db.query(
    `SELECT id, external_id, canonical_text, source_type, function,
            ts_rank(search_tsv, plainto_tsquery('simple', $1)) AS rank
     FROM refs
     WHERE search_tsv @@ plainto_tsquery('simple', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [query, limit]
  );
  if (ftsRes.rows.length > 0) {
    return {
      matches: ftsRes.rows.map((row) => ({
        ref: {
          id: row.id,
          external_id: row.external_id,
          canonical_text: row.canonical_text,
          source_type: row.source_type,
          function: row.function
        },
        confidence: Number(row.rank),
        leg: 'fts' as const
      }))
    };
  }

  const queryEmbedding = await deps.embedder.embed(query);
  assertEmbeddingDimension(queryEmbedding);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const vectorRes = await deps.db.query(
    `SELECT id, external_id, canonical_text, source_type, function,
            1 - (embedding <=> $1) AS score
     FROM refs
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, limit]
  );

  return {
    matches: vectorRes.rows
      .filter((row) => Number(row.score) > 0.75)
      .map((row) => ({
        ref: {
          id: row.id,
          external_id: row.external_id,
          canonical_text: row.canonical_text,
          source_type: row.source_type,
          function: row.function
        },
        confidence: Number(row.score),
        leg: 'vector' as const
      }))
  };
}
