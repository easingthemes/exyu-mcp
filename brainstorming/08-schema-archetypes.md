# 08 — Schema archetypes: validate generalization before locking

## Why this exists

Doc [`05`](05-example-record.md) designs the schema backward from **one** record:
the Valter recognition-code line. It's a great target, but it is a single
archetype — *film dialogue with a call/response structure*. Fields like
`function: recognition_code` and `call_response { sign, countersign }` are
shaped by that one case.

Plan [`06`](06-plan.md) defers testing the "same schema, new rows" assumption to
**Phase 5** (domain expansion). That is the most expensive possible time to
discover the schema doesn't generalize — we'd migrate exactly when we have the
most data and the most live consumers.

**The `source_type` field is the entire MCP-boundary thesis.** If one schema
can't hold a film line, a song lyric, a slang word, and a meme, the "one server,
many domains" bet is wrong — and we want to know that on day one, for the price
of writing four YAML stubs, not after building a pipeline around a bad shape.

## The rule

> Before locking the JSON Schema in Phase 0.1, populate **one record per
> archetype below** and confirm a single schema validates all of them. Divergent
> fields must fit a **shared `function` + optional typed extension** pattern —
> not per-domain bolt-ons.

## The four archetypes

Full records are stubbed as a Phase-0 task, not written out here (they need the
same care as `05`). What matters now is the *shape stress-test* each one applies:

### A. Film dialogue — already have it (`05`)
- Stress: `call_response`, `function: recognition_code`, speaker attribution,
  timestamp from a subtitle cue.
- Reference: `ref_valter_vazduh_trepti`.

### B. Song lyric
- Candidate: a cult ex-YU lyric with a known "worn" misquote (e.g. a
  Bijelo Dugme / Azra / Riblja Čorba line people misremember).
- **New stress on the schema:**
  - `work` points to a *release/track* (MusicBrainz MBID), not a film QID —
    skeleton must hold both without special-casing.
  - no `speaker`/`timestamp` in the film sense; instead `performer`, and
    position is a line index, not a clock time.
  - `function` is not `recognition_code` — maybe `refrain`, `hook`, `aphorism`.
    Does `function` stay an open vocab, or does it need per-type enums?
  - **Copyright:** lyrics are higher-risk than film quotes (see [`09`](09-risks-and-licensing.md)).
    The record must be expressible with the verbatim line *omitted or truncated*
    and still be useful — a real test of whether enrichment-first works.

### C. Pure slang / phrase (Vukajlija-native)
- Candidate: a slang word or set-phrase with **no single source work** (born on
  the street / internet, not in a film).
- **New stress on the schema:**
  - `work` is `null` / `source_type: slang` — does every downstream assumption
    survive a record with no skeleton work at all?
  - the *definition itself* is the payload; `canonical_text` is the term, and
    `meaning` + `modern_usage` carry everything.
  - `variants[]` are spellings/inflections, not misquotes.
  - This is the record that proves the schema isn't secretly "a quotes table."

### D. Meme
- Candidate: an image/format meme or a catchphrase that *references* a film but
  lives as its own object (tests cross-domain edges from [`04`](04-subtitle-pipeline.md#4-cross-reference-detection-the-special-sauce)).
- **New stress on the schema:**
  - a first-class `related` edge of type `DERIVED_FROM` pointing at a film/lyric
    record — the graph edge is the *whole point* of the record.
  - `cultural_weight` is dominated by a different signal mix (IG/TikTok reuse,
    not YouTube scene clips).
  - non-text payload: does the schema tolerate an image-format reference where
    `canonical_text` is a template caption, not a quote?

## Done criterion (added to Phase 0)

One schema validates A–D, where per-domain differences are absorbed by:
- `source_type` (movie / music / slang / meme / …),
- an **open** `function` vocabulary (not a closed film-only enum),
- an optional typed extension block per `source_type` (e.g. `call_response` only
  present when it applies),
- a `work` that is **nullable** and can reference either a Wikidata QID *or* a
  MusicBrainz MBID.

If any archetype forces a field that breaks the others, resolve it **now** —
that's the schema decision the whole project hangs on.
