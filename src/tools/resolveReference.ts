// src/tools/resolveReference.ts
import pg from 'pg';
import { assertEmbeddingDimension, type EmbeddingProvider } from '../providers/embedding.js';
import type { Confidence, ReferenceExtension } from '../types/reference.js';

export interface MatchedWork {
  title: string;
  year: number | null;
  wikidata_qid: string | null;
  musicbrainz_mbid: string | null;
}

export interface MatchedSource {
  source_id: string;
  source_type: string;
  url: string | null;
  license: string;
  retrieved_at: string;
  confidence: Confidence;
  field: string;
}

/**
 * A fully-cited reference, as returned to the calling model. The whole point of the
 * project is that a caller can quote *and attribute* without inventing anything, so
 * everything it might cite — work, speaker, timestamps, countersign, meaning, modern
 * usage, provenance — travels with the match.
 */
export interface MatchedRef {
  id: string;
  external_id: string;
  canonical_text: string;
  normalized_text: string;
  source_type: string;
  function: string;
  work: MatchedWork | null;
  speaker: { name: string; confidence: Confidence } | null;
  timestamp_start: string | null;
  timestamp_end: string | null;
  /** Per-archetype block; carries `call_response.countersign` for recognition codes. */
  extension: ReferenceExtension | null;
  meaning: string | null;
  emotional_tone: string[] | null;
  modern_usage: string | null;
  sources: MatchedSource[];
}

export interface MatchCandidate {
  ref: MatchedRef;
  confidence: number;
  leg: 'trigram' | 'fts' | 'vector';
}

export interface ResolveResult {
  matches: MatchCandidate[];
  /**
   * True when a cascade leg could not run (e.g. the embedding provider was down).
   * Lets a caller tell "we couldn't check" apart from "we checked and found nothing",
   * per the spec's error-handling rules.
   */
  degraded?: boolean;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const HYDRATE_SQL = `
  SELECT r.id, r.external_id, r.canonical_text, r.normalized_text, r.source_type, r.function,
         r.extension, r.speaker, r.timestamp_start, r.timestamp_end, r.enrichment,
         w.title AS work_title, w.year AS work_year,
         w.wikidata_qid AS work_wikidata_qid, w.musicbrainz_mbid AS work_musicbrainz_mbid,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'source_id', s.source_id,
              'source_type', s.source_type,
              'url', s.url,
              'license', s.license,
              'retrieved_at', s.retrieved_at,
              'confidence', s.confidence,
              'field', s.field
            ) ORDER BY s.source_id)
            FROM sources s WHERE s.ref_id = r.id),
           '[]'::json
         ) AS sources
  FROM refs r
  LEFT JOIN works w ON w.id = r.work_id
  WHERE r.id = ANY($1::uuid[])
`;

/**
 * Turn `(ref id, score)` pairs from a cascade leg into fully-cited matches.
 *
 * Hydration lives here rather than in the tool wrapper because the cascade returns
 * early — whichever leg fires returns its top-N and that *is* the result set, so there
 * are no discarded candidates whose hydration we'd be wasting. One extra query per call
 * buys a richer `MatchCandidate.ref` for every consumer and keeps the join SQL in one place.
 */
async function hydrate(
  db: pg.Pool | pg.Client,
  scored: { id: string; confidence: number }[],
  leg: MatchCandidate['leg']
): Promise<MatchCandidate[]> {
  if (scored.length === 0) return [];

  const { rows } = await db.query(HYDRATE_SQL, [scored.map((s) => s.id)]);
  const byId = new Map<string, (typeof rows)[number]>(rows.map((row) => [row.id, row]));

  return scored.flatMap(({ id, confidence }) => {
    const row = byId.get(id);
    if (!row) return [];
    const enrichment = (row.enrichment ?? {}) as {
      meaning?: string;
      emotional_tone?: string[];
      modern_usage?: string;
    };
    const ref: MatchedRef = {
      id: row.id,
      external_id: row.external_id,
      canonical_text: row.canonical_text,
      normalized_text: row.normalized_text,
      source_type: row.source_type,
      function: row.function,
      work: row.work_title
        ? {
            title: row.work_title,
            year: row.work_year ?? null,
            wikidata_qid: row.work_wikidata_qid ?? null,
            musicbrainz_mbid: row.work_musicbrainz_mbid ?? null
          }
        : null,
      speaker: row.speaker ?? null,
      timestamp_start: row.timestamp_start ?? null,
      timestamp_end: row.timestamp_end ?? null,
      extension: row.extension ?? null,
      meaning: enrichment.meaning ?? null,
      emotional_tone: enrichment.emotional_tone ?? null,
      modern_usage: enrichment.modern_usage ?? null,
      sources: row.sources ?? []
    };
    return [{ ref, confidence, leg }];
  });
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
    `SELECT r.id,
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
    const scored = trigramRes.rows.map((row) => ({ id: row.id as string, confidence: Number(row.sim) }));
    return { matches: await hydrate(deps.db, scored, 'trigram') };
  }

  const ftsRes = await deps.db.query(
    `SELECT id, ts_rank(search_tsv, plainto_tsquery('simple', $1)) AS rank
     FROM refs
     WHERE search_tsv @@ plainto_tsquery('simple', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [query, limit]
  );
  if (ftsRes.rows.length > 0) {
    const scored = ftsRes.rows.map((row) => ({ id: row.id as string, confidence: Number(row.rank) }));
    return { matches: await hydrate(deps.db, scored, 'fts') };
  }

  // The vector leg is the only one that depends on an external API. Per the spec, an
  // embedding-provider outage must degrade rather than error the whole call: trigram and
  // FTS have already run and found nothing, so we return an empty-but-degraded result and
  // log the provider failure so it stays distinguishable from a genuine miss.
  try {
    const queryEmbedding = await deps.embedder.embed(query);
    assertEmbeddingDimension(queryEmbedding);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    const vectorRes = await deps.db.query(
      `SELECT id, 1 - (embedding <=> $1) AS score
       FROM refs
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [vectorLiteral, limit]
    );
    const scored = vectorRes.rows
      .filter((row) => Number(row.score) > 0.75)
      .map((row) => ({ id: row.id as string, confidence: Number(row.score) }));
    return { matches: await hydrate(deps.db, scored, 'vector') };
  } catch (err) {
    console.error('[resolve_reference] vector leg unavailable, degrading to trigram+FTS only:', err);
    return { matches: [], degraded: true };
  }
}
