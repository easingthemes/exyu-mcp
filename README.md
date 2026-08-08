# exyu-mcp

An MCP server that gives AI agents (Claude, ChatGPT, and others) the ex-Yugoslav
cultural context they're currently missing.

## The problem

LLMs are fluent in ex-YU languages but culturally thin. They know the
five most-famous lines of a cult film, not the 200th-most-quoted one, the
exact wording, or who actually said it. The exact quote, the correct
attribution, the slang meaning, the modern usage — that long tail is missing
or hallucinated. This repo builds the layer that fills it: a factual,
citable, safe-by-construction cultural-reference database exposed as an MCP
server, so any connected agent (Claude, ChatGPT, others) can look it up
instead of guessing.

## Scope

This repo is deliberately narrow: **cultural reference resolution only** —
quotes, attribution, timestamps, slang meaning, cultural weight. Safe,
factual, sourced. Full design in [`brainstorming/`](brainstorming/).

We don't try to convince or configure the host platforms — we build the data
and the MCP, ship it, and let each platform decide whether to use it. The
lever we control is trust: transparent sourcing and per-field provenance, not
permission-seeking.

**Explicitly out of scope here:** shaping *how* a model talks — tone,
directness, swearing as normal register rather than something to sanitize.
That's a different kind of problem (what a model is willing to say, not what
it knows) and needs a different delivery mechanism than an MCP tool call to
someone else's chat app. Planned as a separate future project — a
skills/harness layer for a custom chat app or direct API use, potentially
reusing this repo's MCP/data. Not started; revisit once this repo's MVP is
live.

## Current-phase decisions

- **Copyright/licensing: deferred.** We go bold on short-quote usage for now
  and treat it as a solved problem — there's no way around ingesting
  copyrighted subtitles/lyrics for the payload this project needs, and
  stalling on it blocks everything else. The full risk/tier analysis is kept
  in [`brainstorming/09-risks-and-licensing.md`](brainstorming/09-risks-and-licensing.md)
  for when this needs a real answer (before any wide/public distribution) —
  it's deferred, not forgotten.

## Status

**Working MVP, not yet through live acceptance.** The Phases 0–2 build from the
design spec is implemented and green in CI:

- TypeScript MCP server exposing `resolve_reference` over Streamable-HTTP
  (`src/server/http.ts`) and an npx stdio twin (`bin/exyu-mcp.ts`).
- Postgres + `pgvector`/`pg_trgm`/`tsvector` storage, with a trigram → FTS →
  vector cascade and fully-cited results (work, speaker, timestamps,
  countersign, meaning, modern usage, per-field provenance).
- YAML records validated against a locked JSON Schema, ingested into Postgres
  transactionally and idempotently.
- Docker Compose deployment behind Caddy (TLS + rate limiting), with
  push-to-`main` CI/CD to a Hetzner box.

Not done yet: the **live vertical-slice acceptance test** — the Valter record is
still a stub with `⚠ TO-VERIFY` fields (countersign, speaker, timestamps) that
need real subtitle data, and the `06-plan.md` acceptance test (type
`"Vazduh gori ko da…"` into a real Claude/ChatGPT chat and get the resolved
record back) has not been run against a live deploy.

Full design: [`docs/superpowers/specs/`](docs/superpowers/specs/) and
[`docs/superpowers/plans/`](docs/superpowers/plans/); original design notes in
[`brainstorming/`](brainstorming/).

## Quickstart

```bash
cp .env.example .env          # then fill in the values below
npm ci
docker compose up -d db       # or `docker compose up -d --build` for the full stack
npm run build                 # required: `npm run migrate` runs the compiled output
npm run migrate               # apply db/migrations/
npm run validate              # schema-check every records/**/*.yaml
npm run ingest -- records/film/ref_valter_vazduh_trepti.yaml
npm run dev                   # http://localhost:8787/mcp  (or `npm start` after build)
```

Other scripts: `npm test` (vitest; the DB-backed tests need Docker for
testcontainers), `npm run migrate:dev` (migrate via `tsx`, no build needed).

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | e.g. `postgres://exyu:exyu@localhost:5432/exyu` |
| `PORT` | no | HTTP transport port, default `8787` |
| `CHAT_PROVIDER` | ingest only | `anthropic` \| `openai` \| `grok`, default `anthropic` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROK_API_KEY` | ingest only | key for the selected `CHAT_PROVIDER` |
| `EMBEDDING_PROVIDER` | yes | `openai` \| `voyage` \| `local`, default `openai` |
| `OPENAI_EMBEDDING_API_KEY` / `VOYAGE_API_KEY` / `LOCAL_EMBEDDING_URL` | yes | credential for the selected `EMBEDDING_PROVIDER` |
| `OPENSUBTITLES_API_KEY` | no | only for `npm run fetch-subtitle` |
| `EXYU_DOMAIN` | production | public hostname Caddy terminates TLS for; falls back to `localhost` |

> The `refs.embedding` column is `vector(1536)`, matching the default OpenAI
> `text-embedding-3-small` model. Switching `EMBEDDING_PROVIDER` to a
> different-dimension model (voyage-3 is 1024) requires altering that column;
> ingest and resolve both fail with an explicit dimension-mismatch error
> otherwise.
