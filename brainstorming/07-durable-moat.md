# 07 — The durable moat: gap-score is the compass, not the product

## The problem with the headline in `03`

Doc [`03`](03-gap-scoring.md) proposes the moat metric:

> *"exyu-mcp resolves **N** references the base model gets wrong."*

That number is honest and useful — but it is **defined to shrink**. By our own
design, `gap_score` drops as models improve, and a reference ages out of our
differentiated value the moment a new base model learns it. If we make that `N`
the *product*, we've made "models get better" our failure condition. We don't
control that variable, and it only moves one way.

A smart critic kills the whole project in one sentence: *"models will just learn
this."* We need an answer that doesn't depend on models staying dumb.

## The reframe

**Gap-score is the discovery mechanism, not the deliverable.** It tells us
*where to spend effort* — which references are worth enriching first. It is the
compass, not the destination.

The *product* is the set of properties a model will **never reliably hold** no
matter how large it gets, because they are structural — not "facts the model
happens to lack today":

| Durable property | Why a bigger model can't absorb it |
|---|---|
| **Exact timestamps + per-field provenance** | Verifiable grounding. A model can memorize a line; it cannot *cite* the subtitle cue it came from. Grounding is a database property, not a parameter count property. |
| **Live social signals → `cultural_weight`** | A 2026 model can't know what trended on Balkan TikTok last week. This is a live feed, not a fact. Structurally outside the weights. |
| **Canonical variant resolution** | Worn colloquial input → canonical line (`"Vazduh gori ko da…"` → `"Vazduh trepti, kao da nebo gori"`). This is a retrieval + clustering behavior over a curated variant set, not recall. |
| **Structured graph edges** | film→song→historical-event links, queryable and typed. Models hold these fuzzily and un-traversably; we hold them as data you can join on. |
| **Transformative enrichment (`meaning`, `modern_usage`, pragmatics)** | Human/community-authored commentary. Even a model that memorizes it can't attribute or version it — and it's the copyright-safest layer (see [`09`](09-risks-and-licensing.md)). |

Note the overlap: the **most durable** payload (enrichment, provenance, live
signals) is also the **copyright-safest** payload. That is not a coincidence —
it's a signal about where the center of gravity of the project should sit.

## What changes in practice

Almost nothing about the *pipeline* — everything about the *pitch and the
priorities*:

1. **Keep** gap-scoring exactly as `03` describes it, internally. It's the best
   prioritizer we have.
2. **Stop** reporting `N` as the headline value. Report it as an internal
   backlog metric ("we know our current blind-spot coverage"), not the product's
   reason to exist.
3. **Lead the pitch with the durable properties.** The one-liner becomes:
   *"structured, verifiable, live-signal-backed cultural grounding for ex-YU
   culture,"* with the gap as the internal engine that decides what to ground
   next.
4. **When a reference's `gap_score` drops to zero** (the model learned it), we
   don't lose it — we still hold its timestamp, provenance, variants, edges, and
   live weight. It just stops being a *priority* for new enrichment. The moat
   didn't move; the backlog did.

## The one-line restatement

> The gap tells us **what to build next**. The structure, provenance, live
> signals, and enrichment are **why it stays valuable after the model catches
> up.** Don't confuse the compass with the treasure.
