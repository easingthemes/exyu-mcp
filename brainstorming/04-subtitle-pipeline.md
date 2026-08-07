# 04 — Subtitle pipeline (the primary payload)

Subtitles are the primary resource because they contain the **full dialogue tail**
— the exact wording, ordering, and timing that models lack and hallucinate. The
difficulty of processing them is not a reason to defer; the difficulty is *why*
the model doesn't already have this data. Doing it well is the moat.

**Repo rule:** raw SRT/VTT files are never committed. They are a local processing
input. Only short quotes + transformative enrichment leave the pipeline as PRs.

## The hard sub-problems (solving these IS the product)

### 1. Cue reassembly
SRT splits one sentence across multiple timed cues. Reconstruct utterances before
anything else is meaningful.
- Merge cues by punctuation continuity + timing gaps.
- Preserve original cue spans for later timestamp mapping.

### 2. Speaker attribution
SRT has no speaker labels. Signals, weakest to strongest:
- dash convention for dialogue turns within a cue,
- name-cues ("MIRKO: …") when present,
- (Phase 2) audio diarization aligned to the cast list from the Wikidata skeleton.
- Honest fallback: `speaker: unknown, confidence: low`. Mark it; don't fabricate.

### 3. Scene segmentation
Group utterances into exchanges using timing gaps + scene-change heuristics. This
is what produces `surrounding_context` — the thing the model cannot fabricate and
the thing that makes a quote *usable* rather than orphaned.

### 4. Cross-reference detection (the special sauce)
Detect where one work quotes/references another (film→song, meme→film,
lyric→historical event). This is graph-edge extraction and it is *pure*
information gain — models almost never hold these links.

### 5. Dedup + variant clustering
The same cult line appears across many rips with different phrasing and OCR noise.
Cluster to one **canonical reference** with a `variants[]` set. Critically, this
is also what lets a worn colloquial input (`"Vazduh gori ko da…"`) resolve to the
canonical line (`"Vazduh trepti, kao da nebo gori"`).

## Flow

```
SRT/VTT (local only, never committed)
   │
   ├─ parse + normalize (encoding, diacritics, Cyrillic/Latin)
   ├─ cue reassembly ─────────────► utterances
   ├─ scene segmentation ─────────► exchanges (surrounding context)
   ├─ speaker attribution ────────► speaker + confidence
   ├─ variant clustering ─────────► canonical reference + variants[]
   ├─ cross-ref detection ────────► candidate edges
   │
   ├─ GAP SCORING (probe base model) ─► gap_score   (see 03)
   ├─ CULT SIGNAL join (Vukajlija/YouTube/Reddit) ─► cultural_weight
   │
   ▼
candidate records, sorted by priority = cultural_weight * gap_score
   │
   ▼
LLM enrichment (offline batch) + human review for high-priority
   │
   ▼
PR into data-as-code repo  ──►  compiled into serving index (pgvector + FTS + trgm)
```

## Enrichment (offline batch, never at query time)

Fill the interpretive fields, versioned and source-cited:
- `meaning`, `function` (e.g. recognition-code), `emotional_tone`
- `modern_usage` (sourced from Vukajlija, not invented)
- `related` edges

Gate anything high-`cultural_weight` behind human review — this is where models
hallucinate confident cultural claims, and our audience notices instantly. Store
`model`, `confidence`, `reviewed_by`, `version`.

## Why not just embed the subtitles and call it search?

Because that reproduces the noisy, orphaned, mis-attributed corpus that has no
speaker, no context, no canonicalization, and no cult signal — i.e. it adds
nothing over the model's fuzzy memory. The transformation from raw cues to clean,
attributed, contextualized, gap-scored references is the entire value.
