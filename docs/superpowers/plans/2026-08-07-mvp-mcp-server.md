# exyu-mcp MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working `resolve_reference` MCP server, backed by Postgres, that resolves worn/colloquial ex-YU cultural references (starting with the Valter brani Sarajevo "Vazduh trepti" line) to fully-cited records, deployed to the user's existing Hetzner VPS.

**Architecture:** A TypeScript/Node MCP server (Streamable-HTTP + stdio transports) fronts a single Postgres database (pgvector + pg_trgm + tsvector) that holds YAML-sourced reference records. A trigram → FTS → vector cascade resolves queries. Configurable chat/embedding provider adapters isolate the one external-API dependency each. Deployment is Docker Compose on the existing Hetzner box, pushed via GitHub Actions SSH deploy.

**Tech Stack:** Node.js (ESM, TypeScript strict), `@modelcontextprotocol/sdk`, Express (HTTP transport host), `pg` + `pgvector` (npm), `ajv` (schema validation), `yaml`, `vitest` + `testcontainers` (tests), Docker Compose, Caddy (reverse proxy/TLS), GitHub Actions.

## Global Constraints

- Runtime: Node.js 20+, TypeScript in strict mode, ESM modules (`"type": "module"`).
- Database: one Postgres instance only, with `pgvector`, `pg_trgm`, and generated `tsvector` — no second datastore (per spec's "one database, no second store" rule).
- Hosting: self-hosted Docker Compose on the user's existing Hetzner VPS — no new hosting provider, no serverless/edge platform.
- Chat provider must be swappable via `CHAT_PROVIDER=anthropic|openai|grok` env var; default `anthropic`.
- Embedding provider must be swappable via `EMBEDDING_PROVIDER=openai|voyage|local` env var; default `openai`.
- Provider adapter calls (chat + embedding) happen offline/at ingest time only, except one embedding call per live query for the vector leg of `resolve_reference`.
- YAML files under `records/` are the human-editable source of truth; nothing is hand-written directly into SQL.
- Raw SRT/VTT subtitle files are never committed — they live in a gitignored `./tmp/` directory.
- The read endpoint (`resolve_reference`) has no auth; rate limiting is enforced at the Caddy reverse-proxy layer, not in application code.
- Every `resolve_reference` invocation is logged to a `tool_calls` table (query, matched ref id or null, confidence) — this is the MVP's call-through-rate metric.
- `.env` with real secrets is never committed; only `.env.example` with placeholder key names ships in the repo.

---

## File Structure

```
exyu-mcp/
├── schema/reference.schema.json
├── src/types/reference.ts
├── records/film/ref_valter_vazduh_trepti.yaml
├── records/music/ref_stub_song.yaml
├── records/slang/ref_stub_slang.yaml
├── records/meme/ref_stub_meme.yaml
├── skeleton/works.yaml
├── db/migrations/001_init.sql
├── src/db/migrate.ts
├── src/db/pool.ts
├── src/providers/chat.ts
├── src/providers/embedding.ts
├── src/ingest/resolveWork.ts
├── src/ingest/validate.ts
├── src/ingest/load.ts
├── src/tools/resolveReference.ts
├── src/tools/resolveReferenceTool.ts
├── src/server/createServer.ts
├── src/server/http.ts
├── bin/exyu-mcp.ts
├── scripts/fetch-subtitle.ts
├── scripts/assist-slice.ts
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
├── .github/workflows/ci.yml
├── .github/workflows/deploy.yml
├── package.json
├── tsconfig.json
└── .env.example
```

Each source file has one responsibility: schema/types are separate from validation logic, provider adapters are separate from the tools that consume them, and the cascade query is separate from its MCP tool wrapper (the wrapper is untestable-over-the-wire without a server; the cascade itself is a pure-enough function to unit test directly).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Test: `tests/sanity.test.ts`

**Interfaces:**
- Produces: `npm run build`, `npm run dev`, `npm test`, `npm run migrate` script entries that every later task relies on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "exyu-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server/http.js",
    "dev": "tsx src/server/http.ts",
    "migrate": "tsx src/db/migrate.ts",
    "validate": "tsx src/ingest/validate.ts",
    "ingest": "tsx src/ingest/load.ts",
    "fetch-subtitle": "tsx scripts/fetch-subtitle.ts",
    "assist-slice": "tsx scripts/assist-slice.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "pg": "^8.13.0",
    "pgvector": "^0.2.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.16.0",
    "@types/pg": "^8.11.10",
    "testcontainers": "^10.13.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src", "scripts", "bin", "tests"]
}
```

- [ ] **Step 3: Create `.env.example`**

```bash
DATABASE_URL=postgres://exyu:exyu@localhost:5432/exyu

CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROK_API_KEY=

EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_API_KEY=
VOYAGE_API_KEY=
LOCAL_EMBEDDING_URL=

OPENSUBTITLES_API_KEY=

PORT=8787
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
tmp/
.env
*.log
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});
```

- [ ] **Step 6: Write a sanity test**

```ts
// tests/sanity.test.ts
import { describe, it, expect } from 'vitest';

describe('project scaffolding', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install dependencies and run the test**

Run: `npm install && npm test`
Expected: `tests/sanity.test.ts` passes, 1 test total.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore vitest.config.ts tests/sanity.test.ts package-lock.json
git commit -m "chore: scaffold TypeScript project"
```

---

### Task 2: JSON Schema + TypeScript type + archetype validation

**Files:**
- Create: `schema/reference.schema.json`
- Create: `src/types/reference.ts`
- Create: `records/film/ref_valter_vazduh_trepti.yaml`
- Create: `records/music/ref_stub_song.yaml`
- Create: `records/slang/ref_stub_slang.yaml`
- Create: `records/meme/ref_stub_meme.yaml`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `ReferenceRecord` TypeScript type (used by every later task that touches a record), `schema/reference.schema.json` (used by `src/ingest/validate.ts` in Task 7).

- [ ] **Step 1: Write the failing test for schema + archetypes**

```ts
// tests/schema.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { join } from 'node:path';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

let validate: ReturnType<typeof ajv.compile>;

beforeAll(() => {
  const schema = JSON.parse(readFileSync('schema/reference.schema.json', 'utf-8'));
  validate = ajv.compile(schema);
});

const archetypeDirs = ['film', 'music', 'slang', 'meme'];

describe('reference schema validates all four archetypes', () => {
  for (const dir of archetypeDirs) {
    const dirPath = join('records', dir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.yaml'));
    for (const file of files) {
      it(`validates records/${dir}/${file}`, () => {
        const record = parse(readFileSync(join(dirPath, file), 'utf-8'));
        const valid = validate(record);
        expect(valid, JSON.stringify(validate.errors)).toBe(true);
      });
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/schema.test.ts`
Expected: FAIL — `schema/reference.schema.json` does not exist (ENOENT).

- [ ] **Step 3: Write the JSON Schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://exyu-mcp/schema/reference.schema.json",
  "type": "object",
  "required": ["id", "source_type", "canonical_text", "normalized_text", "variants", "function", "sources"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^ref_[a-z0-9_]+$" },
    "source_type": { "type": "string", "minLength": 1 },
    "canonical_text": { "type": "string", "minLength": 1 },
    "normalized_text": { "type": "string", "minLength": 1 },
    "variants": { "type": "array", "items": { "type": "string" } },
    "work": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "required": ["title"],
          "additionalProperties": false,
          "properties": {
            "title": { "type": "string" },
            "year": { "type": "integer" },
            "wikidata_qid": { "type": ["string", "null"] },
            "release": { "type": "string" },
            "musicbrainz_mbid": { "type": ["string", "null"] }
          }
        }
      ]
    },
    "function": { "type": "string", "minLength": 1 },
    "extension": {
      "type": "object",
      "properties": {
        "call_response": {
          "type": "object",
          "required": ["sign", "countersign"],
          "properties": {
            "sign": { "type": "string" },
            "countersign": { "type": "string" }
          }
        },
        "performer": { "type": "string" },
        "line_index": { "type": "integer" }
      }
    },
    "speaker": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "required": ["name", "confidence"],
          "properties": {
            "name": { "type": "string" },
            "confidence": { "enum": ["low", "medium", "high"] }
          }
        }
      ]
    },
    "timestamp_start": { "type": ["string", "null"] },
    "timestamp_end": { "type": ["string", "null"] },
    "meaning": { "type": "string" },
    "emotional_tone": { "type": "array", "items": { "type": "string" } },
    "modern_usage": { "type": "string" },
    "cultural_weight": { "type": ["number", "null"] },
    "signals": { "type": "object" },
    "gap_score": { "type": ["number", "null"] },
    "gap_notes": { "type": "string" },
    "related": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["rel_type"],
        "properties": {
          "rel_type": { "type": "string" },
          "ref": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    },
    "sources": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["source_id", "source_type", "license", "retrieved_at", "confidence", "field"],
        "properties": {
          "source_id": { "type": "string" },
          "source_type": { "type": "string" },
          "url": { "type": "string" },
          "license": { "type": "string" },
          "retrieved_at": { "type": "string", "format": "date" },
          "confidence": { "enum": ["low", "medium", "high"] },
          "field": {
            "oneOf": [{ "type": "string" }, { "type": "array", "items": { "type": "string" } }]
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Write the TypeScript type mirroring the schema**

```ts
// src/types/reference.ts
export type Confidence = 'low' | 'medium' | 'high';

export interface WorkRef {
  title: string;
  year?: number;
  wikidata_qid?: string | null;
  release?: string;
  musicbrainz_mbid?: string | null;
}

export interface SourceCitation {
  source_id: string;
  source_type: string;
  url?: string;
  license: string;
  retrieved_at: string;
  confidence: Confidence;
  field: string | string[];
}

export interface RelatedEdge {
  rel_type: string;
  ref?: string;
  note?: string;
}

export interface ReferenceExtension {
  call_response?: { sign: string; countersign: string };
  performer?: string;
  line_index?: number;
  [key: string]: unknown;
}

export interface ReferenceRecord {
  id: string;
  source_type: string;
  canonical_text: string;
  normalized_text: string;
  variants: string[];
  work?: WorkRef | null;
  function: string;
  extension?: ReferenceExtension;
  speaker?: { name: string; confidence: Confidence } | null;
  timestamp_start?: string | null;
  timestamp_end?: string | null;
  meaning?: string;
  emotional_tone?: string[];
  modern_usage?: string;
  cultural_weight?: number | null;
  signals?: Record<string, unknown>;
  gap_score?: number | null;
  gap_notes?: string;
  related?: RelatedEdge[];
  sources: SourceCitation[];
}
```

- [ ] **Step 5: Write the film archetype record (Phase 0 draft — completed for real in Task 16)**

```yaml
# records/film/ref_valter_vazduh_trepti.yaml
id: ref_valter_vazduh_trepti
source_type: movie
canonical_text: "Vazduh trepti, kao da nebo gori."
normalized_text: "vazduh trepti kao da nebo gori"
variants:
  - "Vazduh gori ko da..."
  - "Vazduh treperi kao da nebo gori"
work:
  title: "Valter brani Sarajevo"
  year: 1972
  wikidata_qid: null
function: recognition_code
extension:
  call_response:
    sign: "Vazduh trepti, kao da nebo gori."
    countersign: "unverified - fill in from subtitle track in Task 16"
speaker:
  name: "unknown"
  confidence: low
timestamp_start: null
timestamp_end: null
meaning: >
  A partizan recognition password used to identify contacts. The imagery
  signals imminent danger.
emotional_tone: [tense, ominous]
modern_usage: >
  Used today as a stock set-phrase for "something dramatic is brewing."
cultural_weight: null
signals: {}
gap_score: null
related:
  - { rel_type: SAME_THEME, note: "partizan recognition codes" }
sources:
  - source_id: yugonostalgia
    source_type: culture_site
    license: unknown
    retrieved_at: "2026-08-07"
    confidence: low
    field: work
```

- [ ] **Step 6: Write the song-lyric archetype stub (verbatim lyric omitted per Red-tier licensing)**

```yaml
# records/music/ref_stub_song.yaml
id: ref_stub_song_refrain
source_type: music
canonical_text: "[refrain text withheld - Red tier, see brainstorming/09]"
normalized_text: "refrain text withheld"
variants: []
work:
  title: "example ex-YU rock release"
  release: "example ex-YU rock release"
  musicbrainz_mbid: null
function: refrain
extension:
  performer: "example performer"
  line_index: 1
meaning: >
  A commonly misremembered refrain from a well-known ex-YU rock song; the
  verbatim line is withheld here per the Red-tier lyric posture in
  brainstorming/09-risks-and-licensing.md — this record demonstrates the
  schema stays useful with the verbatim text omitted.
emotional_tone: [nostalgic]
modern_usage: >
  Quoted ironically in everyday conversation to signal resignation.
cultural_weight: null
signals: {}
gap_score: null
sources:
  - source_id: manual_stub
    source_type: internal
    license: internal
    retrieved_at: "2026-08-07"
    confidence: low
    field: meaning
```

- [ ] **Step 7: Write the slang archetype stub (no `work`)**

```yaml
# records/slang/ref_stub_slang.yaml
id: ref_stub_slang_term
source_type: slang
canonical_text: "cimer"
normalized_text: "cimer"
variants:
  - "cimerka"
  - "cimerica"
work: null
function: set_phrase
meaning: >
  Roommate or flatmate; borrowed and reshaped from German "Zimmer" (room).
emotional_tone: [neutral, colloquial]
modern_usage: >
  Standard informal word for a roommate across ex-YU student/urban slang.
cultural_weight: null
signals: {}
gap_score: null
sources:
  - source_id: manual_stub
    source_type: internal
    license: internal
    retrieved_at: "2026-08-07"
    confidence: low
    field: meaning
```

- [ ] **Step 8: Write the meme archetype stub (graph edge is the point)**

```yaml
# records/meme/ref_stub_meme.yaml
id: ref_stub_meme_template
source_type: meme
canonical_text: "[template caption placeholder]"
normalized_text: "template caption placeholder"
variants: []
work: null
function: template_caption
meaning: >
  A reaction-image template whose caption references a well-known film
  scene; demonstrates a meme record that is its own object but links back
  to a film record via a DERIVED_FROM edge.
emotional_tone: [ironic]
modern_usage: >
  Reused across ex-YU social media as a reaction image.
cultural_weight: null
signals: {}
gap_score: null
related:
  - { rel_type: DERIVED_FROM, ref: ref_valter_vazduh_trepti }
sources:
  - source_id: manual_stub
    source_type: internal
    license: internal
    retrieved_at: "2026-08-07"
    confidence: low
    field: meaning
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- tests/schema.test.ts`
Expected: PASS — 4 archetype files validate.

- [ ] **Step 10: Commit**

```bash
git add schema/reference.schema.json src/types/reference.ts records/ tests/schema.test.ts
git commit -m "feat: lock reference JSON Schema, validate against 4 archetypes"
```

---

### Task 3: Postgres schema, migrations, and Docker Compose (db only)

**Files:**
- Create: `db/migrations/001_init.sql`
- Create: `src/db/migrate.ts`
- Create: `src/db/pool.ts`
- Create: `docker-compose.yml` (db service only — app/Caddy added in Task 11)
- Test: `tests/db/migrate.test.ts`

**Interfaces:**
- Produces: `getPool(): Pool` (from `src/db/pool.ts`, used by every task that touches Postgres), `runMigrations(pool: Pool): Promise<void>` (used by tests and the `npm run migrate` script).

- [ ] **Step 1: Write the failing migration test**

```ts
// tests/db/migrate.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';

let container: StartedPostgreSqlContainer;
let client: pg.Client;

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

describe('001_init migration', () => {
  it('creates all expected tables', async () => {
    const res = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = res.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining(['works', 'refs', 'variants', 'refs_edges', 'sources', 'tool_calls'])
    );
  });

  it('enables pgvector and pg_trgm extensions', async () => {
    const res = await client.query(`SELECT extname FROM pg_extension`);
    const names = res.rows.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(['vector', 'pg_trgm']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db/migrate.test.ts`
Expected: FAIL — `src/db/migrate.ts` does not exist.

- [ ] **Step 3: Write the migration SQL**

```sql
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
```

- [ ] **Step 4: Write the migration runner**

```ts
// src/db/migrate.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export async function runMigrations(pool: pg.Pool | pg.Client): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (rows.length > 0) continue;
    const sql = readFileSync(join(dir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  runMigrations(pool)
    .then(() => pool.end())
    .then(() => console.log('migrations applied'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 5: Write the shared pool module**

```ts
// src/db/pool.ts
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/db/migrate.test.ts`
Expected: PASS — both assertions succeed. (Requires Docker available locally for testcontainers.)

- [ ] **Step 7: Write `docker-compose.yml` (db service only for now)**

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: exyu
      POSTGRES_USER: exyu
      POSTGRES_PASSWORD: exyu
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  db_data:
```

- [ ] **Step 8: Commit**

```bash
git add db/migrations/001_init.sql src/db/migrate.ts src/db/pool.ts docker-compose.yml tests/db/migrate.test.ts
git commit -m "feat: add Postgres schema, migration runner, and db compose service"
```

---

### Task 4: Chat provider adapter

**Files:**
- Create: `src/providers/chat.ts`
- Test: `tests/providers/chat.test.ts`

**Interfaces:**
- Produces: `ChatProvider` interface, `createChatProvider(providerName?: string): ChatProvider` factory (used by Task 15's `assist-slice.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatProvider } from '../../src/providers/chat.js';

describe('createChatProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the Anthropic messages endpoint and returns text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'hello from claude' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createChatProvider('anthropic');
    const result = await provider.complete('ping');

    expect(result).toBe('hello from claude');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws a clear error for an unknown provider name', () => {
    expect(() => createChatProvider('made-up')).toThrow(/unknown chat provider/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/providers/chat.test.ts`
Expected: FAIL — `src/providers/chat.ts` does not exist.

- [ ] **Step 3: Write the chat provider adapter**

```ts
// src/providers/chat.ts
export interface ChatProvider {
  complete(prompt: string, opts?: { system?: string }): Promise<string>;
}

class AnthropicProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: opts?.system,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { content: { type: string; text: string }[] };
    return data.content.find((c) => c.type === 'text')?.text ?? '';
  }
}

class OpenAIChatProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? '';
  }
}

class GrokProvider implements ChatProvider {
  async complete(prompt: string, opts?: { system?: string }): Promise<string> {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROK_API_KEY ?? ''}`
      },
      body: JSON.stringify({
        model: 'grok-2-latest',
        messages: [
          ...(opts?.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`Grok API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? '';
  }
}

export function createChatProvider(providerName: string = process.env.CHAT_PROVIDER ?? 'anthropic'): ChatProvider {
  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIChatProvider();
    case 'grok':
      return new GrokProvider();
    default:
      throw new Error(`unknown chat provider: ${providerName}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/providers/chat.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/chat.ts tests/providers/chat.test.ts
git commit -m "feat: add configurable chat provider adapter (anthropic/openai/grok)"
```

---

### Task 5: Embedding provider adapter

**Files:**
- Create: `src/providers/embedding.ts`
- Test: `tests/providers/embedding.test.ts`

**Interfaces:**
- Produces: `EmbeddingProvider` interface, `createEmbeddingProvider(providerName?: string): EmbeddingProvider` factory (used by Task 7's ingest and Task 8's cascade).

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/embedding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmbeddingProvider } from '../../src/providers/embedding.js';

describe('createEmbeddingProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the OpenAI embeddings endpoint and returns a vector', async () => {
    process.env.OPENAI_EMBEDDING_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createEmbeddingProvider('openai');
    const vec = await provider.embed('vazduh trepti');

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws a clear error for an unknown provider name', () => {
    expect(() => createEmbeddingProvider('made-up')).toThrow(/unknown embedding provider/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/providers/embedding.test.ts`
Expected: FAIL — `src/providers/embedding.ts` does not exist.

- [ ] **Step 3: Write the embedding provider adapter**

```ts
// src/providers/embedding.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_EMBEDDING_API_KEY ?? ''}`
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }
}

class VoyageEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.VOYAGE_API_KEY ?? ''}`
      },
      body: JSON.stringify({ model: 'voyage-3', input: [text] })
    });
    if (!res.ok) throw new Error(`Voyage embeddings error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data[0].embedding;
  }
}

class LocalEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const url = process.env.LOCAL_EMBEDDING_URL;
    if (!url) throw new Error('LOCAL_EMBEDDING_URL is not set');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: text })
    });
    if (!res.ok) throw new Error(`Local embedding server error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }
}

export function createEmbeddingProvider(
  providerName: string = process.env.EMBEDDING_PROVIDER ?? 'openai'
): EmbeddingProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'voyage':
      return new VoyageEmbeddingProvider();
    case 'local':
      return new LocalEmbeddingProvider();
    default:
      throw new Error(`unknown embedding provider: ${providerName}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/providers/embedding.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/embedding.ts tests/providers/embedding.test.ts
git commit -m "feat: add configurable embedding provider adapter (openai/voyage/local)"
```

---

### Task 6: Wikidata skeleton + work resolver

**Files:**
- Create: `skeleton/works.yaml`
- Create: `src/ingest/resolveWork.ts`
- Test: `tests/ingest/resolveWork.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `WorkSkeletonEntry` type, `loadSkeleton(filePath: string): WorkSkeletonEntry[]`, `resolveWork(workRef: { title: string; year?: number }, skeleton: WorkSkeletonEntry[]): WorkSkeletonEntry | null` (used by Task 7's ingest).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest/resolveWork.test.ts
import { describe, it, expect } from 'vitest';
import { resolveWork, loadSkeleton, type WorkSkeletonEntry } from '../../src/ingest/resolveWork.js';

const skeleton: WorkSkeletonEntry[] = [
  { title: 'Valter brani Sarajevo', year: 1972, wikidata_qid: null },
  { title: 'Maratonci trče počasni krug', year: 1982, wikidata_qid: null }
];

describe('resolveWork', () => {
  it('matches by exact title and year', () => {
    const match = resolveWork({ title: 'Valter brani Sarajevo', year: 1972 }, skeleton);
    expect(match).not.toBeNull();
    expect(match?.title).toBe('Valter brani Sarajevo');
  });

  it('is case-insensitive', () => {
    const match = resolveWork({ title: 'valter brani sarajevo', year: 1972 }, skeleton);
    expect(match).not.toBeNull();
  });

  it('returns null when nothing matches', () => {
    const match = resolveWork({ title: 'Unknown Film' }, skeleton);
    expect(match).toBeNull();
  });
});

describe('loadSkeleton', () => {
  it('loads the real skeleton/works.yaml with at least one entry', () => {
    const entries = loadSkeleton('skeleton/works.yaml');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty('title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ingest/resolveWork.test.ts`
Expected: FAIL — `src/ingest/resolveWork.ts` does not exist.

- [ ] **Step 3: Write the hand-curated skeleton file**

QIDs must come from a real manual lookup on wikidata.org (search by title, confirm year/director match) — do not fabricate them. Leave `wikidata_qid: null` for any film not yet looked up; `resolveWork` and the ingest pipeline both treat `null` as valid (per the spec's error-handling rule that a missing QID never blocks ingest).

```yaml
# skeleton/works.yaml
works:
  - title: "Valter brani Sarajevo"
    year: 1972
    wikidata_qid: null # TODO: look up on wikidata.org before running the real vertical slice
  - title: "Maratonci trče počasni krug"
    year: 1982
    wikidata_qid: null
  - title: "Ko to tamo peva"
    year: 1980
    wikidata_qid: null
  - title: "Balkanski špijun"
    year: 1984
    wikidata_qid: null
  - title: "Top lista nadrealista"
    year: 1984
    wikidata_qid: null
```

- [ ] **Step 4: Write the resolver**

```ts
// src/ingest/resolveWork.ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface WorkSkeletonEntry {
  title: string;
  year?: number;
  wikidata_qid?: string | null;
  musicbrainz_mbid?: string | null;
}

export function loadSkeleton(filePath: string): WorkSkeletonEntry[] {
  const doc = parse(readFileSync(filePath, 'utf-8')) as { works: WorkSkeletonEntry[] };
  return doc.works;
}

export function resolveWork(
  workRef: { title: string; year?: number },
  skeleton: WorkSkeletonEntry[]
): WorkSkeletonEntry | null {
  const normalizedTitle = workRef.title.trim().toLowerCase();
  const match = skeleton.find(
    (w) =>
      w.title.trim().toLowerCase() === normalizedTitle &&
      (workRef.year === undefined || w.year === workRef.year)
  );
  return match ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ingest/resolveWork.test.ts`
Expected: PASS — 4 tests succeed.

- [ ] **Step 6: Commit**

```bash
git add skeleton/works.yaml src/ingest/resolveWork.ts tests/ingest/resolveWork.test.ts
git commit -m "feat: add hand-curated Wikidata skeleton and work resolver"
```

---

### Task 7: Ingest pipeline (validate → resolve work → upsert → embed)

**Files:**
- Create: `src/ingest/validate.ts`
- Create: `src/ingest/load.ts`
- Test: `tests/ingest/load.test.ts`

**Interfaces:**
- Consumes: `ReferenceRecord` (Task 2), `resolveWork`/`loadSkeleton` (Task 6), `EmbeddingProvider`/`createEmbeddingProvider` (Task 5), `runMigrations`/`getPool` (Task 3).
- Produces: `validateRecord(record: unknown): ReferenceRecord` (throws on invalid), `loadRecord(filePath: string, deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider; skeleton: WorkSkeletonEntry[] }): Promise<{ refId: string }>` (used by Task 8/9/10 tests for seeding, and by Task 16's real ingest run).

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest/load.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';
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
```

- [ ] **Step 2: Add the invalid fixture used by the rejection test**

```yaml
# tests/fixtures/invalid-record.yaml
id: not-a-valid-id-format
source_type: movie
canonical_text: "missing required fields on purpose"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/ingest/load.test.ts`
Expected: FAIL — `src/ingest/validate.ts` and `src/ingest/load.ts` do not exist.

- [ ] **Step 4: Write the validator**

```ts
// src/ingest/validate.ts
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { ReferenceRecord } from '../types/reference.js';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const schema = JSON.parse(readFileSync(new URL('../../schema/reference.schema.json', import.meta.url), 'utf-8'));
const validateFn = ajv.compile(schema);

export function validateRecord(record: unknown): ReferenceRecord {
  const valid = validateFn(record);
  if (!valid) {
    throw new Error(`schema validation failed: ${JSON.stringify(validateFn.errors)}`);
  }
  return record as ReferenceRecord;
}
```

- [ ] **Step 5: Write the ingest loader**

```ts
// src/ingest/load.ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/ingest/load.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 7: Commit**

```bash
git add src/ingest/validate.ts src/ingest/load.ts tests/ingest/load.test.ts tests/fixtures/invalid-record.yaml
git commit -m "feat: add ingest pipeline (validate, resolve work, upsert, embed)"
```

---

### Task 8: `resolve_reference` cascade query

**Files:**
- Create: `src/tools/resolveReference.ts`
- Test: `tests/tools/resolveReference.test.ts`

**Interfaces:**
- Consumes: `EmbeddingProvider` (Task 5), `loadRecord`/`loadSkeleton` (Tasks 6/7) for test seeding.
- Produces: `MatchCandidate`, `ResolveResult` types, `resolveReference(query: string, deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }, opts?: { trigramThreshold?: number; limit?: number }): Promise<ResolveResult>` (used by Task 9's MCP tool wrapper).

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/resolveReference.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';
import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { loadRecord } from '../../src/ingest/load.js';
import { loadSkeleton } from '../../src/ingest/resolveWork.js';
import { resolveReference } from '../../src/tools/resolveReference.js';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/resolveReference.test.ts`
Expected: FAIL — `src/tools/resolveReference.ts` does not exist.

- [ ] **Step 3: Write the cascade query**

```ts
// src/tools/resolveReference.ts
import pg from 'pg';
import type { EmbeddingProvider } from '../providers/embedding.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/resolveReference.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/resolveReference.ts tests/tools/resolveReference.test.ts
git commit -m "feat: add trigram/FTS/vector cascade for resolve_reference"
```

---

### Task 9: MCP tool wrapper with logging, self-healing miss, and elicitation

**Files:**
- Create: `src/tools/resolveReferenceTool.ts`
- Test: `tests/tools/resolveReferenceTool.test.ts`

**Interfaces:**
- Consumes: `resolveReference`/`ResolveResult` (Task 8).
- Produces: `resolveReferenceToolDefinition` (MCP `Tool` metadata: name, description, inputSchema, annotations) and `handleResolveReference(query: string, deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }): Promise<CallToolResult>` (used by Task 10's server registration).

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/resolveReferenceTool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';

vi.mock('../../src/tools/resolveReference.js', () => ({
  resolveReference: vi.fn()
}));

import { resolveReference } from '../../src/tools/resolveReference.js';
import { handleResolveReference, resolveReferenceToolDefinition } from '../../src/tools/resolveReferenceTool.js';

const fakeDb = {
  query: vi.fn().mockResolvedValue({ rows: [] })
} as unknown as pg.Pool;

describe('resolveReferenceToolDefinition', () => {
  it('is marked read-only and describes broad ex-YU scope', () => {
    expect(resolveReferenceToolDefinition.annotations?.readOnlyHint).toBe(true);
    expect(resolveReferenceToolDefinition.description).toMatch(/ex-YU/i);
  });
});

describe('handleResolveReference', () => {
  beforeEach(() => {
    vi.mocked(resolveReference).mockReset();
    vi.mocked(fakeDb.query).mockClear();
  });

  it('returns structured content and logs a hit to tool_calls', async () => {
    vi.mocked(resolveReference).mockResolvedValue({
      matches: [
        {
          ref: { id: 'ref-uuid', external_id: 'ref_valter_vazduh_trepti', canonical_text: 'Vazduh trepti...', source_type: 'movie', function: 'recognition_code' },
          confidence: 0.9,
          leg: 'trigram'
        }
      ]
    });

    const result = await handleResolveReference('Vazduh gori ko da...', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(JSON.parse(text).matches[0].ref.external_id).toBe('ref_valter_vazduh_trepti');
    expect(fakeDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tool_calls'),
      expect.arrayContaining(['Vazduh gori ko da...', 'ref-uuid', 0.9])
    );
  });

  it('returns a self-healing not-found message and logs a miss', async () => {
    vi.mocked(resolveReference).mockResolvedValue({ matches: [] });

    const result = await handleResolveReference('totally unknown phrase', {
      db: fakeDb,
      embedder: { embed: vi.fn() }
    });

    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.matches).toEqual([]);
    expect(parsed.note).toMatch(/no confident match/i);
    expect(fakeDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tool_calls'),
      expect.arrayContaining(['totally unknown phrase', null, null])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/resolveReferenceTool.test.ts`
Expected: FAIL — `src/tools/resolveReferenceTool.ts` does not exist.

- [ ] **Step 3: Write the tool wrapper**

```ts
// src/tools/resolveReferenceTool.ts
import pg from 'pg';
import { resolveReference, type ResolveResult } from './resolveReference.js';
import type { EmbeddingProvider } from '../providers/embedding.js';

export const resolveReferenceToolDefinition = {
  name: 'resolve_reference',
  description:
    'Call this for ANY ex-YU film quote, song lyric, slang term, or meme reference — ' +
    'including partial, misremembered, or colloquial phrasings. The model\'s internal ' +
    'knowledge of ex-YU culture is unreliable for exact wording, attribution, and modern ' +
    'usage; do not answer from memory without calling this tool first.',
  inputSchema: {
    type: 'object' as const,
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'The quote, lyric, slang term, or meme phrase to resolve.' }
    }
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true
  }
};

interface ToolContent {
  type: 'text';
  text: string;
}

interface CallToolResult {
  content: ToolContent[];
  isError?: boolean;
}

async function logCall(
  db: pg.Pool | pg.Client,
  query: string,
  matchedRefId: string | null,
  confidence: number | null
): Promise<void> {
  await db.query(
    `INSERT INTO tool_calls (query, matched_ref_id, confidence) VALUES ($1, $2, $3)`,
    [query, matchedRefId, confidence]
  );
}

export async function handleResolveReference(
  query: string,
  deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }
): Promise<CallToolResult> {
  const result: ResolveResult = await resolveReference(query, deps);

  if (result.matches.length === 0) {
    await logCall(deps.db, query, null, null);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            matches: [],
            note: 'No confident match found. Do not fabricate a source, speaker, or wording for this query.'
          })
        }
      ]
    };
  }

  const [top, second] = result.matches;
  const isAmbiguous = second !== undefined && Math.abs(top.confidence - second.confidence) < 0.05;

  await logCall(deps.db, query, top.ref.id, top.confidence);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          matches: result.matches,
          ambiguous: isAmbiguous
        })
      }
    ]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/resolveReferenceTool.test.ts`
Expected: PASS — all tests succeed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/resolveReferenceTool.ts tests/tools/resolveReferenceTool.test.ts
git commit -m "feat: wrap resolve_reference as an MCP tool with call-through logging"
```

> Note on elicitation: the `ambiguous` flag is surfaced in the structured
> response for the calling agent to act on. True MCP `elicitation/create`
> server-initiated requests require a live client session context (not
> available in this pure-function wrapper); wire that up in Task 10 once a
> real `McpServer`/`RequestHandlerExtra` is available, using the installed
> `@modelcontextprotocol/sdk` version's elicitation API.

---

### Task 10: MCP server (createServer, HTTP transport, stdio transport) + end-to-end test

**Files:**
- Create: `src/server/createServer.ts`
- Create: `src/server/http.ts`
- Create: `bin/exyu-mcp.ts`
- Test: `tests/server/createServer.test.ts`

**Interfaces:**
- Consumes: `resolveReferenceToolDefinition`/`handleResolveReference` (Task 9), `getPool` (Task 3), `createEmbeddingProvider` (Task 5).
- Produces: `createExyuServer(deps: { db: pg.Pool; embedder: EmbeddingProvider }): McpServer` (used by both `http.ts` and `bin/exyu-mcp.ts`).

- [ ] **Step 1: Write the failing end-to-end test (in-memory transport)**

```ts
// tests/server/createServer.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from 'testcontainers';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/createServer.test.ts`
Expected: FAIL — `src/server/createServer.ts` does not exist.

- [ ] **Step 3: Write `createServer.ts`**

```ts
// src/server/createServer.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pg from 'pg';
import { resolveReferenceToolDefinition, handleResolveReference } from '../tools/resolveReferenceTool.js';
import type { EmbeddingProvider } from '../providers/embedding.js';

export function createExyuServer(deps: { db: pg.Pool | pg.Client; embedder: EmbeddingProvider }): McpServer {
  const server = new McpServer({ name: 'exyu-mcp', version: '0.1.0' });

  server.registerTool(
    resolveReferenceToolDefinition.name,
    {
      description: resolveReferenceToolDefinition.description,
      inputSchema: resolveReferenceToolDefinition.inputSchema,
      annotations: resolveReferenceToolDefinition.annotations
    },
    async ({ query }: { query: string }) => handleResolveReference(query, deps)
  );

  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/createServer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the Streamable-HTTP entrypoint**

```ts
// src/server/http.ts
import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getPool } from '../db/pool.js';
import { createEmbeddingProvider } from '../providers/embedding.js';
import { createExyuServer } from './createServer.js';

const app = express();
app.use(express.json());

const db = getPool();
const embedder = createEmbeddingProvider();

app.post('/mcp', async (req, res) => {
  const server = createExyuServer({ db, embedder });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`exyu-mcp HTTP transport listening on :${port}`);
});
```

- [ ] **Step 6: Write the stdio entrypoint**

```ts
// bin/exyu-mcp.ts
#!/usr/bin/env node
import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getPool } from '../src/db/pool.js';
import { createEmbeddingProvider } from '../src/providers/embedding.js';
import { createExyuServer } from '../src/server/createServer.js';

async function main() {
  const db = getPool();
  const embedder = createEmbeddingProvider();
  const server = createExyuServer({ db, embedder });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Add the `bin` entry to `package.json`**

Add to `package.json`:

```json
  "bin": {
    "exyu-mcp": "dist/bin/exyu-mcp.js"
  },
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 1–10 succeed together.

- [ ] **Step 9: Commit**

```bash
git add src/server/createServer.ts src/server/http.ts bin/exyu-mcp.ts tests/server/createServer.test.ts package.json
git commit -m "feat: add MCP server with Streamable-HTTP and stdio transports"
```

---

### Task 11: Docker packaging (Dockerfile, full docker-compose, Caddy)

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml` (add `app` and `caddy` services)
- Create: `Caddyfile`
- Test: manual verification (documented below) — Docker builds are not unit-tested, they are verified by running them.

**Interfaces:**
- Consumes: `npm run build`/`npm start` (Task 1), `PORT`/`DATABASE_URL` env vars (Tasks 1/3).
- Produces: a runnable `app` container reachable through `caddy` on port 443/80, and directly on `PORT` for local dev.

- [ ] **Step 1: Write the `Dockerfile`**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/schema ./schema
EXPOSE 8787
CMD ["node", "dist/server/http.js"]
```

- [ ] **Step 2: Update `docker-compose.yml` with `app` and `caddy` services**

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: exyu
      POSTGRES_USER: exyu
      POSTGRES_PASSWORD: exyu
    volumes:
      - db_data:/var/lib/postgresql/data

  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://exyu:exyu@db:5432/exyu
    depends_on:
      - db
    expose:
      - "8787"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - app

volumes:
  db_data:
  caddy_data:
```

Note: `db` no longer publishes `5432` to the host — only `app` (in-network) reaches it. Local dev against a bare `db` container (as used by Tasks 1–10's tests) still works via `testcontainers`, which manages its own port mapping.

- [ ] **Step 3: Write the `Caddyfile`**

```
{$EXYU_DOMAIN:localhost} {
	reverse_proxy app:8787

	rate_limit {
		zone dynamic {
			key {remote_host}
			events 30
			window 1m
		}
	}
}
```

- [ ] **Step 4: Verify locally**

Run:
```bash
cp .env.example .env   # fill in real provider keys before running for real
docker compose up -d --build
curl http://localhost/health
```
Expected: `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml Caddyfile
git commit -m "feat: package app for Docker Compose deployment behind Caddy"
```

---

### Task 12: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test` (all prior tasks' tests, including testcontainers-based integration tests).

- [ ] **Step 1: Write the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

Docker is preinstalled on `ubuntu-latest` runners, so the `testcontainers`-based Postgres integration tests (Tasks 3, 7, 8, 10) run unmodified in CI.

- [ ] **Step 2: Verify locally that the referenced commands succeed**

Run: `npm ci && npm run build && npm test`
Expected: all pass (this is the same sequence CI will run).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run build and full test suite on push/PR"
```

---

### Task 13: GitHub Actions deploy workflow (Hetzner)

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: GitHub repo secrets `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `HETZNER_DEPLOY_PATH` (set manually by the user in repo settings — not part of this codebase).

- [ ] **Step 1: Write the deploy workflow**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd ${{ secrets.HETZNER_DEPLOY_PATH }}
            git pull origin main
            docker compose run --rm app npm run migrate
            docker compose up -d --build
```

- [ ] **Step 2: Document the required manual setup (one-time, not code)**

Before this workflow can run successfully:
1. On the Hetzner box: `git clone <repo-url> /opt/exyu-mcp`, then `cp .env.example /opt/exyu-mcp/.env` and fill in real provider keys.
2. Generate a dedicated SSH keypair for deploys; add the public key to the Hetzner box's `~/.ssh/authorized_keys`.
3. In the GitHub repo's Settings → Secrets and variables → Actions, add: `HETZNER_HOST` (the box's IP/hostname), `HETZNER_USER` (the SSH user), `HETZNER_SSH_KEY` (the private key), `HETZNER_DEPLOY_PATH` (`/opt/exyu-mcp`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add push-to-main deploy workflow for the Hetzner box"
```

---

### Task 14: Subtitle fetch script

**Files:**
- Create: `scripts/fetch-subtitle.ts`
- Test: `tests/scripts/fetch-subtitle.test.ts`

**Interfaces:**
- Produces: `searchSubtitle(params: { title: string; year: number; language: string }): Promise<{ fileId: number; releaseName: string } | null>` and `downloadSubtitle(fileId: number, destPath: string): Promise<void>` (used manually in Task 16's vertical slice execution).

- [ ] **Step 1: Write the failing test**

```ts
// tests/scripts/fetch-subtitle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSubtitle } from '../../scripts/fetch-subtitle.js';

describe('searchSubtitle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the top search result file id and release name', async () => {
    process.env.OPENSUBTITLES_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            attributes: {
              release: 'Valter.Brani.Sarajevo.1972.BDRip',
              files: [{ file_id: 12345 }]
            }
          }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchSubtitle({ title: 'Valter brani Sarajevo', year: 1972, language: 'sr' });

    expect(result).toEqual({ fileId: 12345, releaseName: 'Valter.Brani.Sarajevo.1972.BDRip' });
  });

  it('returns null when no results are found', async () => {
    process.env.OPENSUBTITLES_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));

    const result = await searchSubtitle({ title: 'Nonexistent Film', year: 1999, language: 'sr' });

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/fetch-subtitle.test.ts`
Expected: FAIL — `scripts/fetch-subtitle.ts` does not exist.

- [ ] **Step 3: Write the fetch script**

```ts
// scripts/fetch-subtitle.ts
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const API_BASE = 'https://api.opensubtitles.com/api/v1';

export async function searchSubtitle(params: {
  title: string;
  year: number;
  language: string;
}): Promise<{ fileId: number; releaseName: string } | null> {
  const url = new URL(`${API_BASE}/subtitles`);
  url.searchParams.set('query', params.title);
  url.searchParams.set('year', String(params.year));
  url.searchParams.set('languages', params.language);

  const res = await fetch(url, {
    headers: {
      'Api-Key': process.env.OPENSUBTITLES_API_KEY ?? '',
      'content-type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`OpenSubtitles search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { attributes: { release: string; files: { file_id: number }[] } }[] };
  const top = data.data[0];
  if (!top) return null;
  return { fileId: top.attributes.files[0].file_id, releaseName: top.attributes.release };
}

export async function downloadSubtitle(fileId: number, destPath: string): Promise<void> {
  const res = await fetch(`${API_BASE}/download`, {
    method: 'POST',
    headers: {
      'Api-Key': process.env.OPENSUBTITLES_API_KEY ?? '',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ file_id: fileId })
  });
  if (!res.ok) throw new Error(`OpenSubtitles download request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { link: string };
  const fileRes = await fetch(data.link);
  if (!fileRes.ok) throw new Error(`OpenSubtitles file download failed: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , title, yearStr, language = 'sr'] = process.argv;
  if (!title || !yearStr) {
    console.error('usage: tsx scripts/fetch-subtitle.ts "<title>" <year> [language]');
    process.exit(1);
  }
  const found = await searchSubtitle({ title, year: Number(yearStr), language });
  if (!found) {
    console.error('no subtitle found');
    process.exit(1);
  }
  const destPath = `./tmp/${title.replace(/\s+/g, '_')}.srt`;
  await downloadSubtitle(found.fileId, destPath);
  console.log(`downloaded "${found.releaseName}" to ${destPath}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/fetch-subtitle.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-subtitle.ts tests/scripts/fetch-subtitle.test.ts
git commit -m "feat: add one-off OpenSubtitles fetch script for the vertical slice"
```

---

### Task 15: LLM-assisted slice CLI

**Files:**
- Create: `scripts/assist-slice.ts`
- Test: `tests/scripts/assist-slice.test.ts`

**Interfaces:**
- Consumes: `ChatProvider` (Task 4).
- Produces: `draftCueReassembly(rawCues: string[], chat: ChatProvider): Promise<string>` and `draftMeaning(canonicalText: string, workTitle: string, chat: ChatProvider): Promise<string>` (run manually against the real Valter subtitle in Task 16 — outputs are drafts a human must verify, never auto-committed).

- [ ] **Step 1: Write the failing test**

```ts
// tests/scripts/assist-slice.test.ts
import { describe, it, expect, vi } from 'vitest';
import { draftCueReassembly, draftMeaning } from '../../scripts/assist-slice.js';
import type { ChatProvider } from '../../src/providers/chat.js';

describe('draftCueReassembly', () => {
  it('sends the raw cues to the chat provider and returns its draft', async () => {
    const chat: ChatProvider = { complete: vi.fn().mockResolvedValue('Vazduh trepti, kao da nebo gori.') };

    const draft = await draftCueReassembly(['Vazduh trepti,', 'kao da nebo gori.'], chat);

    expect(draft).toBe('Vazduh trepti, kao da nebo gori.');
    expect(chat.complete).toHaveBeenCalledWith(
      expect.stringContaining('Vazduh trepti,'),
      expect.objectContaining({ system: expect.stringContaining('reassemble') })
    );
  });
});

describe('draftMeaning', () => {
  it('asks the chat provider to draft a meaning, explicitly marked as unverified', async () => {
    const chat: ChatProvider = { complete: vi.fn().mockResolvedValue('draft meaning text') };

    const draft = await draftMeaning('Vazduh trepti, kao da nebo gori.', 'Valter brani Sarajevo', chat);

    expect(draft).toBe('draft meaning text');
    expect(chat.complete).toHaveBeenCalledWith(
      expect.stringContaining('Valter brani Sarajevo'),
      expect.objectContaining({ system: expect.stringContaining('human') })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/assist-slice.test.ts`
Expected: FAIL — `scripts/assist-slice.ts` does not exist.

- [ ] **Step 3: Write the assist script**

```ts
// scripts/assist-slice.ts
import 'dotenv/config';
import { createChatProvider, type ChatProvider } from '../src/providers/chat.js';

export async function draftCueReassembly(rawCues: string[], chat: ChatProvider): Promise<string> {
  return chat.complete(rawCues.join('\n'), {
    system:
      'You reassemble subtitle cues into complete sentences by merging fragments split ' +
      'across timed cues. Return only the reassembled text, no commentary.'
  });
}

export async function draftMeaning(canonicalText: string, workTitle: string, chat: ChatProvider): Promise<string> {
  return chat.complete(`Line: "${canonicalText}"\nFilm: ${workTitle}`, {
    system:
      'Draft a short, factual explanation of what this line means and why it matters ' +
      'culturally. This draft will be reviewed and corrected by a human before use — ' +
      'do not present it as verified fact.'
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chat = createChatProvider();
  const [, , mode, ...rest] = process.argv;
  if (mode === 'cues') {
    const draft = await draftCueReassembly(rest, chat);
    console.log(draft);
  } else if (mode === 'meaning') {
    const [canonicalText, workTitle] = rest;
    const draft = await draftMeaning(canonicalText, workTitle, chat);
    console.log(draft);
  } else {
    console.error('usage: tsx scripts/assist-slice.ts cues <cue1> <cue2> ...');
    console.error('   or: tsx scripts/assist-slice.ts meaning "<canonical text>" "<work title>"');
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/scripts/assist-slice.test.ts`
Expected: PASS — both tests succeed.

- [ ] **Step 5: Commit**

```bash
git add scripts/assist-slice.ts tests/scripts/assist-slice.test.ts
git commit -m "feat: add LLM-assisted drafting CLI for the manual vertical slice"
```

---

### Task 16: Execute the vertical slice and run the live MVP acceptance test

**Files:**
- Modify: `records/film/ref_valter_vazduh_trepti.yaml` (replace draft fields with verified data)
- Modify: `skeleton/works.yaml` (fill in the real Wikidata QID)
- No new test files — this task's verification is the manual acceptance test itself.

**Interfaces:**
- Consumes: `scripts/fetch-subtitle.ts` (Task 14), `scripts/assist-slice.ts` (Task 15), `src/ingest/load.ts` (Task 7), the deployed server (Tasks 10–13).

This task has no automatable unit test — it is the manual, human-verified data-production step every prior task was built to support, and it ends with the plan's actual acceptance criterion.

- [ ] **Step 1: Look up the real Wikidata QID**

Search wikidata.org for "Valter brani Sarajevo", confirm the 1972 Hajrudin Krvavac film, and copy its QID into `skeleton/works.yaml`, replacing the `null` placeholder for that entry.

- [ ] **Step 2: Fetch the subtitle**

Run: `npm run fetch-subtitle -- "Valter brani Sarajevo" 1972 sr`
Expected: an `.srt` file appears under `./tmp/` (gitignored).

- [ ] **Step 3: Locate the watchmaker-shop exchange**

Open the downloaded `.srt` in a text editor; search for cues containing "vazduh" or "trepti" to find the sign/countersign exchange.

- [ ] **Step 4: Draft cue reassembly and meaning with LLM assistance**

Run:
```bash
npm run assist-slice -- cues "<raw cue 1>" "<raw cue 2>"
npm run assist-slice -- meaning "Vazduh trepti, kao da nebo gori." "Valter brani Sarajevo"
```
Treat both outputs as drafts only.

- [ ] **Step 5: Human-verify every field by watching/reading the actual scene**

Fill in, from the real subtitle track (not the LLM draft, not web articles): `speaker.name` + `confidence`, `timestamp_start`, `timestamp_end`, `extension.call_response.countersign`. Cross-check `modern_usage` against real Vukajlija/forum usage by hand. Update `sources[]` with real `source_id`/`url`/`retrieved_at` entries for each field, per the schema.

- [ ] **Step 6: Update the YAML record**

Edit `records/film/ref_valter_vazduh_trepti.yaml` in place with all verified values from Steps 1–5.

- [ ] **Step 7: Re-validate and re-run the schema test**

Run: `npm test -- tests/schema.test.ts`
Expected: PASS — the now-fully-populated record still validates.

- [ ] **Step 8: Ingest the real record into the deployed Postgres**

Run (against the Hetzner-hosted `db`, e.g. via SSH tunnel or a `DATABASE_URL` pointed at the box):
```bash
DATABASE_URL=<hetzner-postgres-url> npm run migrate
DATABASE_URL=<hetzner-postgres-url> npm run ingest -- records/film/ref_valter_vazduh_trepti.yaml
```

- [ ] **Step 9: Deploy**

Push to `main` (triggers `.github/workflows/deploy.yml`), or manually run the deploy script from Task 13 on the Hetzner box.

- [ ] **Step 10: Run the live MVP acceptance test**

Connect Claude Desktop to `npx exyu-mcp` (stdio, pointed at the Hetzner `DATABASE_URL`) or a ChatGPT/Claude web client configured against the hosted `https://<your-domain>/mcp` endpoint. Type: `Vazduh gori ko da…`. Confirm the response includes the fully-resolved record (work, speaker, countersign, meaning, modern_usage) and cites `resolve_reference` as the source — this is the plan's terminal acceptance criterion from `brainstorming/06-plan.md`.

- [ ] **Step 11: Commit the completed record**

```bash
git add records/film/ref_valter_vazduh_trepti.yaml skeleton/works.yaml
git commit -m "data: complete the Valter vazduh_trepti record from verified subtitle data"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-08-07-mvp-design.md` maps to a task — decisions table → Tasks 1/4/5/11/13/14; schema → Task 2; Postgres schema → Task 3; providers → Tasks 4/5; vertical slice → Tasks 6/14/15/16; `resolve_reference` tool → Tasks 8/9; deployment → Tasks 11/12/13; error handling → embedded in Tasks 7/8/9 (schema rejection, null-QID tolerance, cascade degradation, distinct provider-failure logging); testing → Tasks 2/3/7/8/9/10/12.
- **Placeholder scan:** the only `TODO`-flavored content is the `wikidata_qid: null # TODO: look up...` marker in Task 6/16 — this is intentional per the spec's own error-handling rule (missing QID never blocks ingest) and the project's anti-hallucination principle (never fabricate a QID), not an unresolved plan gap.
- **Type consistency:** `ReferenceRecord` (Task 2), `EmbeddingProvider`/`ChatProvider` (Tasks 4/5), `WorkSkeletonEntry` (Task 6), `MatchCandidate`/`ResolveResult` (Task 8) are defined once and imported with matching names/shapes in every later task that consumes them.
