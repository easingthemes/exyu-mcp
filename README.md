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

Brainstorming stage, single focus (cultural reference resolution). See
[`brainstorming/`](brainstorming/) for the full design notes. No data, no
code yet.
