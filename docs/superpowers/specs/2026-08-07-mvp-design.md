# exyu-mcp MVP design (Phases 0–2)

Status: approved by user, 2026-08-07.
Scope: `brainstorming/06-plan.md` Phases 0–2 only — schema/storage/skeleton,
one-film vertical slice, and a live `resolve_reference` MCP endpoint. Phases
3–5 (automated gap-scoring, scaled pipeline, open contribution, domain
expansion) are explicitly out of scope for this spec; they remain future work
described in the `brainstorming/` docs.

This spec assumes familiarity with `brainstorming/01`–`09`. It does not
restate the thesis, data-source strategy, gap-scoring rationale, or
risk/licensing analysis — it only makes the concrete engineering decisions
needed to build the MVP acceptance test from `06-plan.md`:

> Type `"Vazduh gori ko da…"` into a real Claude/ChatGPT chat and get back the
> fully-resolved record from `05-example-record.md`.

## Decisions locked by this spec

| Decision | Choice | Why |
|---|---|---|
| Language/runtime | TypeScript / Node.js | First-class official MCP SDK; one codebase serves both the HTTP endpoint and the npx stdio twin; matches prior AEM-pattern reuse note in `06`. |
| Hosting | Self-hosted Docker Compose on existing Hetzner VPS | User already owns Hetzner hosting; avoids a new provider/account. Drops the "edge/serverless" framing from `06` — a plain long-running Node process behind a reverse proxy is fine for a stateless HTTP MCP transport. |
| Database | Postgres + `pgvector` + `pg_trgm` + `tsvector`, in a container on the same box | Per `06`'s "one database, no second store" rule. |
| Chat model provider | Configurable adapter (Anthropic / OpenAI / Grok), default Anthropic | Gap-scoring (`03`) is defined as "probe a frozen base model" — swappable providers are core to that mechanism, not a convenience. |
| Embedding provider | Configurable adapter (OpenAI / Voyage / local), default OpenAI | Neither Anthropic nor xAI expose public embedding APIs; kept as a separate adapter from the chat provider for that reason. |
| Data source of truth | YAML files in-repo, validated against a locked JSON Schema, from day one | Makes the Phase 0 "validate 4 archetypes" step (`08`) a real artifact instead of a conceptual exercise; zero throwaway when Phase 4 formalizes PR-based contribution later. |
| Vertical-slice subtitle acquisition | Small one-off fetch script against the OpenSubtitles API | Avoids manual out-of-band file handling; still a one-time utility, not bulk scraping (respects `09`'s "no scraping before the manual slice" rule). |
| Wikidata skeleton | Hand-curated `skeleton/works.yaml` for the ~10-film canonical corpus | Small, fixed list — not worth building reconciliation automation at this scale. |
| Deployment | GitHub Actions, push-to-`main` triggers SSH + `git pull` + `docker compose up -d --build` on the Hetzner box | No container registry needed; secrets (`.env`) stay server-resident and never pass through CI. |

## Repo layout

```
exyu-mcp/
├── brainstorming/                 # existing design docs (unchanged)
├── docs/superpowers/specs/        # this spec
├── schema/
│   └── reference.schema.json      # locked JSON Schema (validates all 4 archetypes)
├── records/                       # YAML source-of-truth, one file per reference
│   ├── film/ref_valter_vazduh_trepti.yaml
│   ├── music/…yaml                # archetype B stub
│   ├── slang/…yaml                # archetype C stub
│   └── meme/…yaml                 # archetype D stub
├── skeleton/
│   └── works.yaml                 # hand-curated: the ~10 films + Wikidata QIDs
├── src/
│   ├── server/                    # MCP server: Streamable-HTTP + stdio entry points
│   ├── providers/                 # chat-model adapter + embedding adapter (configurable)
│   ├── ingest/                    # YAML validate → QID check → Postgres loader
│   └── tools/                     # resolve_reference implementation
├── scripts/
│   ├── fetch-subtitle.ts          # one-off OpenSubtitles fetch (local only, gitignored output)
│   └── assist-slice.ts            # interactive CLI: LLM-assisted cue/meaning drafting for the slice
├── db/
│   └── migrations/                # Postgres schema: tables, pgvector, trgm, FTS indexes
├── bin/
│   └── exyu-mcp                   # npx stdio entrypoint
├── .github/workflows/
│   ├── deploy.yml                 # push-to-main → SSH deploy to Hetzner
│   └── ci.yml                     # schema/archetype tests + docker-compose integration test
├── docker-compose.yml             # app container + postgres(pgvector) container
├── Dockerfile
└── .env.example                   # provider keys, model selection, DB url (never committed with real values)
```

## Data flow

```
subtitle file (local only, never committed)
   → scripts/fetch-subtitle.ts (OpenSubtitles API)
   → hand/LLM-assisted processing (scripts/assist-slice.ts drafts, human verifies)
   → records/*.yaml (validated against schema/reference.schema.json)
   → src/ingest/load.ts (validate → resolve QID against skeleton/works.yaml → upsert Postgres → embed)
   → resolve_reference (trigram → FTS → vector cascade over Postgres)
   → MCP client (Claude / ChatGPT) over Streamable-HTTP or npx stdio
```

Raw SRT/VTT files are never committed (per `04`'s repo rule) — they live in a
gitignored `./tmp/` directory used only by the fetch/assist scripts.

## Schema

`schema/reference.schema.json`, generalized from the single record in `05`
and stress-tested against the four archetypes in `08`:

- `id`, `source_type` (open string: `movie`, `music`, `slang`, `meme`, …)
- `canonical_text`, `normalized_text`, `variants[]`
- `work`: nullable — `{ title, year, wikidata_qid }` **or**
  `{ title, release, musicbrainz_mbid }` **or** `null` (slang has no work)
- `function`: open string vocab (`recognition_code`, `refrain`, `hook`,
  `set_phrase`, `template_caption`, …)
- `extension`: optional typed block, keyed by `source_type` — e.g.
  `call_response { sign, countersign }` only present for archetype A;
  `performer`/`line_index` for archetype B. This is how per-domain fields are
  absorbed without special-casing the top-level schema (the `08` "done
  criterion").
- `speaker`/`performer`, `timestamp_start`/`timestamp_end` — nullable, with a
  `confidence: low|medium|high` alongside any field that can be uncertain
- `meaning`, `emotional_tone[]`, `modern_usage` — enrichment fields
- `cultural_weight`, `signals{}`, `gap_score`, `gap_notes` — computed, never
  hand-guessed
- `related[]`: `{ rel_type, ref | note }` — graph edges (`SAME_WORK`,
  `SAME_THEME`, `DERIVED_FROM`, …)
- `sources[]`: `{ source_id, source_type, url, license, retrieved_at,
  confidence, field }` — per-field provenance, required for any field sourced
  from copyrighted/tiered material (per the licensing tiers in `09`)

Acceptance for this section: the four archetype stubs from `08` (film line,
song lyric, slang word, meme) all validate against this schema — expressed as
an automated test (see Testing), not just a manual check.

## Postgres schema

One database, per `06`'s "no second store" rule:

- `works` — id, title, year, wikidata_qid, musicbrainz_mbid (skeleton, Layer 0)
- `refs` — flattened reference row: canonical_text, normalized_text,
  source_type, function, work_id (FK, nullable), jsonb columns for
  `extension`, `speaker`, `enrichment`, `signals`, `gap`, plus:
  - `normalized_text` → `pg_trgm` GIN index (fuzzy leg)
  - `to_tsvector(canonical_text || variants)` → GIN index (FTS leg)
  - `embedding vector(n)` → `pgvector` HNSW/IVFFlat index (vector leg)
- `variants` — ref_id, variant_text (lets trigram/FTS match any worn form,
  not just the canonical text)
- `refs_edges` — ref_id, related_ref_id, rel_type (graph edges)
- `sources` — ref_id, field, source_id, source_type, url, license,
  retrieved_at, confidence (per-field provenance as real, queryable rows)
- `tool_calls` — timestamp, query, matched_ref_id (nullable), confidence
  (call-through-rate logging, see Risk 1 mitigation below)

The YAML file is the human-editable source of truth; `src/ingest/load.ts`
flattens it into these tables. Nothing is hand-written directly into SQL.

## Provider adapters

```ts
// src/providers/chat.ts — used by gap-scoring probes (03) and offline enrichment (04)
interface ChatProvider {
  complete(prompt: string, opts?: { system?: string }): Promise<string>
}
// implementations: AnthropicProvider, OpenAIProvider, GrokProvider
// selected by CHAT_PROVIDER=anthropic|openai|grok

// src/providers/embedding.ts — used only by the vector leg of resolve_reference + ingest
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}
// implementations: OpenAIEmbeddingProvider, VoyageEmbeddingProvider, LocalEmbeddingProvider
// selected by EMBEDDING_PROVIDER=openai|voyage|local
```

Both adapters run offline/at ingest time only for enrichment and embedding
generation, never inside the live `resolve_reference` request path — except
for embedding the incoming query text for the vector leg (one cheap
embedding call per query). For the MVP, only the default provider pair
(Anthropic + OpenAI) needs working credentials; the others are implemented
but untested until the corresponding env var is flipped.

## Vertical slice process (Valter brani Sarajevo)

1. **Fetch** — `scripts/fetch-subtitle.ts` searches the OpenSubtitles API by
   title/year/language and downloads the best-match SRT to gitignored
   `./tmp/`. Requires `OPENSUBTITLES_API_KEY` (free-tier registration is a
   prerequisite, not part of this repo).
2. **Process** — manual, per `06` Phase 1 (not pipeline automation):
   - Locate the watchmaker-shop sign/countersign exchange in the SRT.
   - `scripts/assist-slice.ts` uses the `ChatProvider` adapter interactively
     to draft cue reassembly and candidate `meaning`/`modern_usage` text; a
     human verifies and fills every `⚠ TO-VERIFY` field from `05` (speaker,
     timestamp, countersign, exact wording) — the model drafts, the human
     confirms, matching `04`'s human-review gate for high-`cultural_weight`
     entries.
   - Cross-check `modern_usage` against real Vukajlija/forum usage by hand
     (no scraper at this scale).
   - Hand-pick ~15–20 additional candidate lines from the same film and
     gap-score them by prompting the configured `ChatProvider` cold (no
     retrieval) and comparing to ground truth — this is `03`'s gap-scoring
     mechanism run manually/interactively rather than batched.
3. **Write + validate** — author `records/film/ref_valter_vazduh_trepti.yaml`
   (plus the highest-gap candidates) by hand; `npm run validate` checks
   against `schema/reference.schema.json` before ingest.
4. **Ingest** — `src/ingest/load.ts`: validate → resolve `work.wikidata_qid`
   against `skeleton/works.yaml` → upsert `works`/`refs`/`variants`/
   `refs_edges`/`sources` → generate + store the embedding.

Done-when (matches `06` Phase 1's exit criterion): the Valter record is fully
populated from real subtitle data, ingested, and queryable in Postgres — not
yet exposed over MCP (that's the next section).

## `resolve_reference` MCP tool

**Cascade** (per `06` step 8): trigram (`pg_trgm` on `normalized_text` +
`variants`, cheapest/highest-precision for near-matches) → FTS (`tsvector`
on canonical + variants, catches keyword/partial matches) → vector (embed
query via `EmbeddingProvider`, `pgvector` cosine search, catches paraphrases).
Fall through legs only when the prior leg's top similarity is below
threshold; merge + rank candidates; return top-N with a confidence score
each.

**Tool annotations**, directly addressing Risk 1 from `09` (the tool never
gets called because a confidently-wrong model doesn't know to doubt itself):

- `readOnly: true` annotation.
- Description: *"Call this for ANY ex-YU film quote, song lyric, slang term,
  or meme reference — including partial, misremembered, or colloquial
  phrasings. The model's internal knowledge of ex-YU culture is unreliable
  for exact wording, attribution, and modern usage; do not answer from
  memory without calling this tool first."*
- Structured JSON output (full record or top-N candidates + confidence), not
  prose, so the calling model can cite fields directly.
- **Self-healing miss**: if all three legs return nothing/low-confidence,
  respond with a structured "not found, here's the closest partial match"
  rather than an empty result.
- **Elicitation on ambiguity**: if multiple distinct references tie at
  similar confidence, use MCP elicitation to ask which one was meant rather
  than guessing.

**Call-through-rate logging**: every invocation (query, matched ref id or
miss, confidence) is written to the `tool_calls` table — the MVP's second
success metric alongside answer correctness, per `09`'s Risk 1 mitigation #3.

## Deployment

**Hetzner box:**
- `docker-compose.yml`: `app` (Node/TS MCP server, Streamable-HTTP
  transport, built from `Dockerfile`) + `db` (Postgres with `pgvector`
  enabled, named volume for persistence).
- `.env` lives only on the server (never committed) — `DATABASE_URL`,
  `CHAT_PROVIDER` + its API key, `EMBEDDING_PROVIDER` + its API key.
- Caddy in front of `app` for automatic TLS and basic rate limiting (per
  `09`'s "limit-free is not fine" note on the open, auth-free endpoint).

**GitHub Actions (`.github/workflows/deploy.yml`):**
- Trigger: push to `main`.
- SSH into the Hetzner box (deploy key stored as a GitHub secret) and run
  `cd /opt/exyu-mcp && git pull origin main && docker compose up -d --build`.
- No container registry — image builds on the box itself. `.env` is
  untouched by deploy, so secrets never pass through CI.
- DB migrations (`db/migrations/`) run as a pre-`up` step so schema changes
  ship with the code that needs them.

**npx stdio twin**: the same `src/server/` code exposes a stdio entrypoint
(`bin/exyu-mcp`), published to npm, so Claude Desktop can run it via
`npx exyu-mcp` against the same Hetzner-hosted Postgres (or a local instance
for dev) — no separate deployment path for this twin.

## Error handling

- Ingest: schema validation failure → reject the YAML with a clear
  field-level error; never partially insert.
- Missing/unresolvable Wikidata QID → ingest still succeeds with
  `work.wikidata_qid: null` + a warning; the skeleton is grounding, not a
  hard dependency.
- `resolve_reference` cascade failure at any leg (e.g. embedding API down) →
  degrade to the remaining legs (trigram/FTS never depend on external APIs);
  log the failure; still return best-effort results rather than erroring the
  whole call.
- Provider adapter failures (chat/embedding API errors) are surfaced
  distinctly from "no match found," so logs/callers can tell "we don't know"
  apart from "we couldn't check."

## Testing

- **Unit**: trigram/FTS/vector cascade logic against a fixture set
  (including the Valter record + deliberately-worn variants) — the concrete
  regression test for the MVP acceptance criterion.
- **Schema**: the four archetype stubs from `08` must all validate against
  `schema/reference.schema.json` — the `08` "done criterion" expressed as an
  automated test.
- **Integration** (CI, `.github/workflows/ci.yml`): spin up the Compose
  stack, run the ingest script against fixture YAML, call `resolve_reference`
  over HTTP, assert the Valter record is returned for a worn-input query.
- **Manual/live acceptance test** (not automated, run once per deploy): the
  actual `06` acceptance test — type the query into Claude/ChatGPT and
  confirm the resolved record comes back end-to-end.

## Non-goals (reaffirmed for this spec's scope)

Everything in `09`'s non-goals list applies unchanged. Specifically for
Phases 0–2: no automated Wikidata reconciliation, no bulk subtitle
scraping, no automated gap-scoring batch job (it's run manually/
interactively during the vertical slice instead), no PR-based external
contribution flow, no auth on the read endpoint (rate-limited via Caddy
instead), no second datastore. All of these are explicitly Phase 3+ per
`06-plan.md` and out of scope here.
