# 03 — Gap scoring: probe the model, ingest its failures

This is the mechanism that operationally guarantees we build the **complement** of
the LLM instead of a copy of it. Without it, "we solve the LLM gap" is a slogan;
with it, it's a measurable pipeline stage.

## Core idea

> For every candidate reference, ask a frozen base model (no tools) to identify
> it. If the model already nails it → **low information gain, deprioritize.**
> If the model whiffs, hallucinates, or misattributes → **high gain, prioritize
> ingestion + enrichment.**

We chase the model's failures, not raw volume.

## The probe

For a candidate quote/fragment `q` (ideally the *worn colloquial form*, like a
user would type it — e.g. `"Vazduh gori ko da…"`):

1. Ask a frozen base model, no retrieval:
   - source (work + year)
   - speaker
   - meaning / function
   - continuation / countersign (if applicable)
2. Compare against ground truth (Wikiquote where it exists, human-verified
   otherwise).
3. Emit a **gap vector**, e.g.:

```json
{
  "candidate": "Vazduh gori ko da...",
  "model_source_correct": false,
  "model_speaker_correct": false,
  "model_meaning_correct": "partial",
  "model_hallucinated": true,
  "gap_score": 0.9
}
```

`gap_score` high ⇒ this is exactly the kind of entry we exist to hold.

## How the score is used

- **Ingestion priority.** Sort the candidate backlog by `gap_score`. Enrich the
  high-gap tail first; skip candidates the model already answers correctly.
- **Enrichment budget.** Spend expensive LLM+human enrichment only where
  `gap_score` is high. Low-gap entries get minimal treatment or are dropped.
- **Regression tracking.** Re-run the probe as models improve. If a new base
  model starts answering a reference correctly, its `gap_score` drops and it
  quietly ages out of our differentiated value — we always know our real moat
  size.

## The moat metric (report this)

> "exyu-mcp correctly resolves **N** references that the current base model gets
> wrong or hallucinates."

That number *is* the product's value, quantified. It's also the honest headline
for the README/marketing — not "we have X thousand quotes" (volume is not the
point) but "we cover the model's blind spots, measured."

## `cultural_weight` (separate from gap score — don't confuse them)

- **`gap_score`** = "does the model already know this?" (information gain)
- **`cultural_weight`** = "does it matter culturally?" (social importance)

A line can be high-weight but low-gap (famous *and* already in the model — e.g.
the single most iconic line) or high-gap but low-weight (obscure deep cut the
model lacks but nobody quotes). We want the intersection first:
**high weight AND high gap** = famous enough to be asked about, obscure enough
that the model fails. That's the sweet spot the backlog should surface.

`cultural_weight` is a computed function of the social signals from
[`02-data-sources.md`](02-data-sources.md):

```
cultural_weight = f(
  vukajlija_votes,
  youtube_views,
  reddit_mentions,
  x_quote_frequency,
  wikiquote_present,        # weak positive
  meme_count
)
```

Recomputed on refresh; never guessed by an LLM (models confidently hallucinate
cultural importance).

## Prioritization, in one line

```
priority = cultural_weight * gap_score
```

Enrich the top of that list. It automatically focuses effort on culturally
important references that current models get wrong — which is the entire mission.
