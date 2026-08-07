# 06 — The plan, step by step

Sequenced by dependency and by the **gap-first** principle. Guiding rule for every
phase: *if a step doesn't move us toward capturing what the base model lacks, it's
out of scope.*

**MVP acceptance test (one sentence):** type `"Vazduh gori ko da…"` into a real
Claude/ChatGPT chat and get back the fully-resolved record from
[`05-example-record.md`](05-example-record.md).

---

## Phase 0 — Foundations (skeleton + decisions, no payload yet)

1. **Lock the schema.** Turn the `05` YAML into a validated JSON Schema. The
   record *is* the spec.
2. **Stand up storage.** Postgres + pgvector + `tsvector` (FTS) + `pg_trgm`
   (fuzzy). One database, no second store.
3. **Wikidata skeleton.** Reconcile ex-YU films/people/characters to QIDs.
   Contributes IDs + grounding only, zero content.
4. **Pick the canonical corpus.** ~10 cult films (*Valter*, *Maratonci*, *Ko to
   tamo peva*, *Balkanski špijun*, *Top lista nadrealista*, …). This bounds Phase 1.

*Done when:* schema validates the Vazduh record; the 10 works exist as skeleton
rows with QIDs.

## Phase 1 — Vertical slice (one film, end to end, by hand)

5. Run **one film** (*Valter*) through the pipeline **manually**: subtitle → cue
   reassembly → scene segmentation → variant clustering → candidate quotes.
   Local only; no SRT committed.
6. **Produce the Vazduh record for real** — fill every `⚠ TO-VERIFY` field (exact
   wording, speaker, timestamp, countersign) from the subtitle track.
7. **Manually gap-score ~20 candidates**: probe the base model, keep the ones it
   fails.

*Done when:* the `05` record is fully populated from real source data, not
paraphrase. Proves the payload thesis before any automation.

## Phase 2 — Serving (make it reachable from a real chat) → **MVP**

8. Build **`resolve_reference`**: trigram → FTS → vector cascade, `readOnly`,
   structured output, self-healing miss, elicitation on ambiguity.
9. Ship a **stateless Streamable-HTTP MCP endpoint** (edge/serverless, auth-free)
   + an **npx stdio** twin. Reuse AEM patterns (`verbosity`, `group` annotations,
   Resources as discovery catalogs).
10. **Connect to Claude and ChatGPT**; run the acceptance test live.

*Done when:* `"Vazduh gori ko da…"` in a real chat returns the record. **This is
the MVP.**

## Phase 3 — The gap-scoring loop (make the thesis measurable)

11. Automate the probe from `03`: batch-score candidates → `gap_score`.
12. Compute `cultural_weight` from social signals (start: YouTube + Vukajlija votes).
13. Sort the backlog by `priority = cultural_weight * gap_score`.

*Done when:* we can state a real number — *"resolves N references the base model
gets wrong."* The moat metric.

## Phase 4 — Scale the pipeline + open contribution

14. Automate the subtitle pipeline across the 10 films, then widen.
15. Stand up **data-as-code**: quotes as YAML in the repo, PR-based, **CI
    validates schema + reconciles QIDs**, enrichment on merge, build step compiles
    the serving index.
16. Subtitle miner opens **candidate PRs** (never commits raw SRT).

*Done when:* a stranger can add a verified quote via PR and it appears in the
served index.

## Phase 5 — Enrichment at scale + domain expansion

17. Offline LLM enrichment + human-review gate for high-`cultural_weight` entries.
18. Add Vukajlija/Reddit signal feeds properly; recompute weights on refresh.
19. Expand `source_type`: music → literature → language → memes. Same schema, new
    rows. The MCP boundary was the point all along.

---

## Critical path (shortest route to the moat)

```
schema (0.1) → storage (0.2) → Valter slice by hand (1.5) →
Vazduh record (1.6) → resolve_reference (2.8) → hosted endpoint (2.9) →
LIVE in a real chat (2.10 = MVP) → gap-scoring loop (3) → scale (4,5)
```

Everything before Phase 2.10 is throwaway-able scaffolding except the schema and
the one real record. Get to the live chat as fast as possible, then let
gap-scoring drive what to build next.

## What we deliberately do NOT do early

- No bulk ingestion of clean/open sources (the model already has them).
- No mass subtitle scraping before the manual slice proves the pipeline.
- No second database, no knowledge-graph engine, until a real multi-hop query
  hurts in SQL.
- No auth on the public read endpoint.
- No enrichment at query time (offline batch only).
