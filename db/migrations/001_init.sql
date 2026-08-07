-- db/migrations/001_init.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  year INTEGER,
  wikidata_qid TEXT,
  musicbrainz_mbid TEXT
);

CREATE TABLE refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL,
  canonical_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  function TEXT NOT NULL,
  work_id UUID REFERENCES works(id),
  extension JSONB,
  speaker JSONB,
  timestamp_start TEXT,
  timestamp_end TEXT,
  enrichment JSONB,
  signals JSONB,
  gap JSONB,
  embedding vector(1536),
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', canonical_text)) STORED
);

CREATE INDEX refs_normalized_trgm_idx ON refs USING GIN (normalized_text gin_trgm_ops);
CREATE INDEX refs_search_tsv_idx ON refs USING GIN (search_tsv);
CREATE INDEX refs_embedding_idx ON refs USING hnsw (embedding vector_cosine_ops);

CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id UUID NOT NULL REFERENCES refs(id) ON DELETE CASCADE,
  variant_text TEXT NOT NULL,
  normalized_variant TEXT NOT NULL
);
CREATE INDEX variants_normalized_trgm_idx ON variants USING GIN (normalized_variant gin_trgm_ops);
CREATE INDEX variants_ref_id_idx ON variants (ref_id);

CREATE TABLE refs_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id UUID NOT NULL REFERENCES refs(id) ON DELETE CASCADE,
  related_ref_id UUID REFERENCES refs(id) ON DELETE SET NULL,
  rel_type TEXT NOT NULL,
  note TEXT
);

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id UUID NOT NULL REFERENCES refs(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  license TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  confidence TEXT NOT NULL
);

CREATE TABLE tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  query TEXT NOT NULL,
  matched_ref_id UUID REFERENCES refs(id),
  confidence REAL
);
