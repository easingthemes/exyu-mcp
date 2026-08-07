# 02 — Data sources (MAIN FOCUS)

How we gather data, ranked by **marginal information gain over the base model** —
not by how clean or legal the source is. Reminder from the thesis: *ease of
ingestion is an anti-signal for value.* If it was easy and open, the model
already ate it.

Three functional layers:

- **Skeleton** — stable IDs + graph structure. Zero content value; pure grounding.
- **Payload** — the tail the model lacks. This is the whole point.
- **Eval floor** — what the model already knows; used to *measure* the gap, not shipped.

---

## Layer 0 — Skeleton (grounding, not knowledge)

Purpose: give every payload record a stable identity and an anti-hallucination
anchor. We reconcile *to* these; we do not serve their content.

| Source | Contributes | License | Notes |
|---|---|---|---|
| **Wikidata** | QIDs for films/people/characters/years; the graph edges | CC0 | The ID system. Reconcile every work + person to a QID. |
| **Wikipedia (sr/hr/bs/mk/sl)** | title variants, cast lists, disambiguation | CC BY-SA | Used for entity resolution + candidate lists, not as served text. |
| **MusicBrainz / Discogs** | MBIDs for artists/releases/tracks | CC0 (data) | The Wikidata-of-music. Music-domain skeleton. |

**Rule:** skeleton sources answer *"which entity is this?"* — never *"what does
it mean / how is it used?"*

---

## Layer 1 — Payload (the tail; this is the product)

### 1a. Subtitles — the primary resource

The only source that contains the **full dialogue tail**: every line, in order,
with timing. This is where verbatim wording, surrounding context, and timestamps
come from. Processing them well is the moat — see
[`04-subtitle-pipeline.md`](04-subtitle-pipeline.md).

| Source | Coverage | Access | Risk |
|---|---|---|---|
| **OpenSubtitles** | broad, multilingual | API | copyrighted → mine locally, emit short quotes only |
| **Titlovi.com** | ex-YU mainstay | scrape | same |
| **Podnapisi.net** | ex-YU / SI strong | scrape/API | same |

Output of this layer: **candidate quotes + context + timestamps**, opened as PRs.
Raw SRT files are **never committed** to the repo.

### 1b. Vukajlija.com — the modern-usage oracle

Crowd-sourced ex-YU slang/phrase dictionary with **usage examples and votes**.
This is the single best source for the fields models get generically wrong:

- `modern_usage` ← the definition + examples (how it's used *today*)
- `cultural_weight` signal ← vote counts
- slang drift, in-jokes, why a phrase is funny

Map Vukajlija entries onto references. Store the derived annotation + vote count,
attributed — do not clone the site. Respect ToS.

### 1c. Social cult-signal (derive metrics, store numbers not content)

The "is this actually a cult line?" signal is **social**, not textual — it can't
be extracted from the subtitle itself. We derive per-reference metrics:

| Source | Signal | What we store |
|---|---|---|
| **YouTube** | views/comments on "najbolje scene" clips; timestamps | counts, clip URL |
| **Reddit** (r/serbia, r/croatia, r/yugonostalgia, r/BiH, r/mkd) | quote frequency | mention count |
| **X/Twitter** quote accounts | daily re-quoting | frequency |
| **Meme pages** (IG/TikTok/FB, public) | reuse as meme | manual candidate input |

We store *derived numbers*, never republished posts. These feed the
`cultural_weight` score (see [`03-gap-scoring.md`](03-gap-scoring.md)).

### 1d. Domain expansion payloads

| Domain | Payload source (tail) | Signal |
|---|---|---|
| Music | **Genius** (line-level meaning annotations — mirrors our enrichment model), Tekstovi.net | Vukajlija, YouTube, radio play |
| Literature | public-domain texts; school-curriculum canon | Vukajlija, quote frequency |
| Language / slang | **Vukajlija** (primary), Rečnik SANU, Hrvatski jezični portal | Vukajlija votes |
| History | speech transcripts; oral-history archives | reuse in films/memes (cross-domain edges) |
| Memes | community PRs + manual | IG/TikTok/Reddit frequency |

Lyrics (Genius/Tekstovi) are copyrighted → same rule as subtitles: mine locally,
emit short excerpts + transformative annotation only. Genius is also worth
studying as a *structural* model — line-by-line meaning is exactly our schema.

---

## Layer 2 — Eval floor (measure the gap, don't ship)

| Source | Role |
|---|---|
| **Wikiquote (sr/hr/bs/mk/sl)** | Represents "already well-known / already in the model." A quote found *only* on Wikiquote is low information gain. Use it as the baseline the payload must beat, and as one ground-truth set for gap scoring. **Not shipped as data.** |
| **The base model itself** | The live measuring stick — see gap scoring. |

---

## Prior art to study (not just a source)

- **Leksikon Yu Mitologije** — a crowd-sourced encyclopedia of Yugoslav
  everyday-life/pop-culture "mythology." It is the closest existing thing to what
  we're building. Study its taxonomy and contribution model; verify licensing
  before ingesting anything.

---

## Provenance is a first-class column

With this many trust/licensing tiers, every record carries:

```
source_ref { source_id, source_type, url, license, retrieved_at, confidence }
```

…and **every enrichment field cites which source produced it**
(`modern_usage` from Vukajlija#12345, `cultural_weight` from a signal vector,
`meaning` from LLM+review). Payoffs:

1. Proves transformativeness per-field if we ever formalize copyright with
   institutions.
2. Lets agents and contributors see *why* the DB claims what it claims — the
   difference between a scrape dump and a citable knowledge base.

---

## Ingestion order (gap-first, not volume-first)

1. **Wikidata** — stand up the skeleton (IDs to hang everything on).
2. **Subtitle pipeline** — the primary tail payload. Start with the canonical
   cult films (*Valter*, *Maratonci*, *Ko to tamo peva*, *Balkanski špijun*,
   *Top lista nadrealista*, …).
3. **Vukajlija** — modern-usage + slang layer, mapped onto the skeleton.
4. **Social signals** (YouTube/Reddit) — compute `cultural_weight`.
5. **Wikiquote + base model** — run gap scoring to prioritize *which* of the
   above to enrich first.

Note what's deprioritized: bulk-ingesting open, clean, model-adjacent content.
That's the trap we're explicitly avoiding.
