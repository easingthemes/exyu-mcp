# 05 — Canonical example record

One finished entry, fully populated, so we can design the pipeline *backward* from
a concrete target. This is the reference that started the whole discussion —
proof that the payload we need is exactly what current models lack.

Fields marked `⚠ TO-VERIFY` are the ones that **only the subtitle/scene pipeline
can fill precisely** — models and web articles paraphrase or drop them. That's the
point: those fields are the moat.

## The record

```yaml
id: ref_valter_vazduh_trepti
source_type: movie

# --- what was said (fact) ---
canonical_text: "Vazduh trepti, kao da nebo gori."
normalized_text: "vazduh trepti kao da nebo gori"     # lowercased, deaccented, for matching
variants:                                              # from variant clustering (see 04)
  - "Vazduh gori ko da..."                             # worn colloquial form (the user's input)
  - "Vazduh treperi kao da nebo gori"
  - "Vazduh trepti kao da zemlja gori"                 # common misquote

# --- where it's from (skeleton / Wikidata-grounded) ---
work:
  title: "Valter brani Sarajevo"
  year: 1972
  director: "Hajrudin 'Šiba' Krvavac"
  wikidata_qid: "⚠ TO-VERIFY"                          # reconcile to real QID
speaker:
  name: "⚠ TO-VERIFY"                                  # the courier in the watchmaker scene
  character_qid: null
  confidence: low
timestamp_start: "⚠ TO-VERIFY"                         # from subtitle track, not article
timestamp_end: "⚠ TO-VERIFY"

# --- function & context (the part models miss) ---
function: recognition_code                             # a lozinka, NOT just a line of dialogue
call_response:
  sign: "Vazduh trepti, kao da nebo gori."
  countersign: "⚠ TO-VERIFY against subtitle"          # articles paraphrase/drop this
surrounding_context: "⚠ TO-VERIFY"                     # the exchange in the watchmaker's shop

# --- enrichment (LLM + human review, source-cited) ---
meaning: >
  A partizan recognition password used to identify contacts. The imagery
  ('the air trembles as if the sky is burning') signals imminent danger / a storm
  coming.
emotional_tone: [tense, ominous, conspiratorial]
modern_usage: >
  Used today as a stock set-phrase for 'something dramatic/ominous is brewing',
  often with a knowing, half-ironic nod to the film.
  # source: Vukajlija / forum usage, NOT invented

# --- cultural importance (computed, never guessed) ---
cultural_weight: "⚠ COMPUTE from signals"
signals:
  wikiquote_present: true          # weak positive → also means low gap_score alone
  youtube_scene_clips: many
  reddit_mentions: "⚠ TO-COLLECT"
  vukajlija_votes: "⚠ TO-COLLECT"

# --- the gap this entry fills (see 03) ---
gap_score: 0.9                      # base model failed source+speaker, hallucinated wording
gap_notes: >
  Frozen base model could not attribute the worn form 'Vazduh gori ko da...' and
  would fabricate a source. Exact wording, countersign, speaker, timestamp all
  absent from model priors.

# --- relationships (graph edges) ---
related:
  - { rel_type: SAME_WORK, ref: "other Valter lozinke" }
  - { rel_type: SAME_THEME, note: "partizan recognition codes" }

# --- provenance (per-field citation; first-class) ---
sources:
  - { source_id: yugonostalgia, type: culture_site, license: unknown, field: work }
  - { source_id: telegraf,      type: journalism,   license: unknown, field: meaning }
  - { source_id: youtube_clip,  type: video,        license: unknown, field: scene }
  - { source_id: subtitle,      type: subtitle,     license: copyrighted,
      field: [canonical_text, timestamp, speaker, countersign], note: "local-only, transformative output" }
```

## What this record demonstrates

1. **The model failed the tail** — `gap_score: 0.9`. This is a real blind spot,
   not a contrived one.
2. **The valuable fields are `⚠ TO-VERIFY`** — and they all come from the
   subtitle/scene pipeline. If we only ingested clean open data, this record
   would be a stub with a paraphrased line and a wrong speaker.
3. **`function: recognition_code`** captures pragmatics the model misses entirely
   — it's a password, not a quote.
4. **`variants[]` bridges the worn input to the canonical line** — the core
   `resolve_reference` behavior.
5. **Provenance is per-field** — proving where each claim came from, and which
   claims are transformative outputs of copyrighted input.

## Design instruction

Design the schema and the pipeline so that **producing this record end-to-end**
— from the input `"Vazduh gori ko da…"` to this populated YAML — is the concrete
acceptance test. Everything in `02`/`03`/`04` exists to fill the `⚠` fields
correctly and at scale.
