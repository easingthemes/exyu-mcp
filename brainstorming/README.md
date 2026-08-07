# exyu-mcp — Brainstorming

Design notes for **exyu-mcp**: an MCP server that exposes a machine-readable
cultural memory layer for ex-YU / Balkan culture (films, TV, music, literature,
language, memes, history) to any AI agent.

## The one thing that must not be forgotten

> **We are building the *complement* of what current LLMs already know — not a
> generic cultural database.**

A generic DB re-ingests Wikipedia/Wikiquote/Wikidata and re-serves the model its
own training data. That adds nothing. Our value is the **delta**: the exact
wording, attribution, context, and modern usage that models *lack* and
*hallucinate*. Every design decision is judged against one question:

**"Does this capture something the base model doesn't already have?"**

If the answer is no, it is out of scope — no matter how easy or clean the source.

> **Refinement (see [`07`](07-durable-moat.md)):** "the gap" is how we decide
> *what to build next* — it is the compass, not the treasure. The value that
> *survives* models catching up is the structural layer: provenance, exact
> timestamps, live social signals, variant resolution, graph edges, and
> transformative enrichment. Don't make "N references the model gets wrong"
> (a number designed to shrink) the product's reason to exist.

## Documents

| File | What it covers |
|---|---|
| [`01-thesis-llm-gap.md`](01-thesis-llm-gap.md) | Why "the gap" is the product, and what that rules in/out |
| [`02-data-sources.md`](02-data-sources.md) | **Main focus** — where the data comes from, ranked by information gain |
| [`03-gap-scoring.md`](03-gap-scoring.md) | The mechanism that keeps us honest: probe the model, ingest its failures |
| [`04-subtitle-pipeline.md`](04-subtitle-pipeline.md) | Turning noisy subtitles (the primary payload) into clean records |
| [`05-example-record.md`](05-example-record.md) | One finished entry, fully populated, to design the pipeline backward from |
| [`06-plan.md`](06-plan.md) | The step-by-step, dependency-ordered plan to the MVP |
| [`07-durable-moat.md`](07-durable-moat.md) | Why gap-score is the **compass, not the product** — what keeps value after models catch up |
| [`08-schema-archetypes.md`](08-schema-archetypes.md) | Validate "same schema, new rows" against 4 archetypes **before** locking the schema |
| [`09-risks-and-licensing.md`](09-risks-and-licensing.md) | The MVP-killers (tool-never-called, takedown, shrinking moat), licensing tiers, non-goals |

## Scope of this repo

This project is scoped to **cultural reference resolution only** — factual,
citable, safe-by-construction. We ship the data/MCP and let host platforms
decide to adopt it; we earn that by transparent sourcing, not by asking
permission.

**Out of scope here:** shaping *how* a model talks (tone, directness,
swearing as normal register). That's a willingness problem, not a knowledge
gap, and needs a different delivery mechanism than an MCP call into someone
else's chat app. Planned as a separate future project — a skills/harness
layer for a custom chat app or direct API use. Not started.

## Status

Greenfield. This folder is design/brainstorming only — no data, no code yet.
Copyright posture for now: **bold on short quotes + transformative enrichment,
treated as solved for the current phase**; never commit raw subtitle/lyrics
corpora to the repo (a takedown would kill the hosted endpoint the whole
project depends on). See [`09`](09-risks-and-licensing.md) for the full
tier analysis to revisit later.
