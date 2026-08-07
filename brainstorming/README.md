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

## Documents

| File | What it covers |
|---|---|
| [`01-thesis-llm-gap.md`](01-thesis-llm-gap.md) | Why "the gap" is the product, and what that rules in/out |
| [`02-data-sources.md`](02-data-sources.md) | **Main focus** — where the data comes from, ranked by information gain |
| [`03-gap-scoring.md`](03-gap-scoring.md) | The mechanism that keeps us honest: probe the model, ingest its failures |
| [`04-subtitle-pipeline.md`](04-subtitle-pipeline.md) | Turning noisy subtitles (the primary payload) into clean records |
| [`05-example-record.md`](05-example-record.md) | One finished entry, fully populated, to design the pipeline backward from |

## Status

Greenfield. This folder is design/brainstorming only — no data, no code yet.
Copyright posture for now: **bold on short quotes + transformative enrichment;
never commit raw subtitle/lyrics corpora to the repo** (a takedown would kill the
hosted endpoint the whole project depends on).
