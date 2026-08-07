# 09 — Risks, non-goals, and licensing tiers

The plan docs are optimistic by design. This one is the counterweight: the
things that can kill the project, stated plainly, so no decision is made without
them in view. Three of these are load-bearing.

---

## Risk 1 — The tool never gets called (MVP-killer)

The acceptance test is *"type `'Vazduh gori ko da…'` into a real chat and get the
record back."* But the thesis in [`01`](01-thesis-llm-gap.md) says the model
**confidently hallucinates** on exactly these inputs. A model that doesn't know
that it doesn't know **will not decide to call `resolve_reference`** — it'll just
answer wrong. The tool is least likely to fire precisely when it's most needed.

This is a bigger MVP risk than the data pipeline, and it's currently invisible in
the plan. Mitigations, in order of honesty:

1. **Aggressive tool description / annotations.** The `resolve_reference`
   description must claim broad scope and warn the model off its own priors:
   *"Call this for ANY ex-YU quote, lyric, slang term, or meme — the model's
   internal knowledge of ex-YU culture is unreliable and should not be trusted
   without this lookup."* Lean on MCP annotations (`readOnly`, discovery
   Resources) to make it discoverable.
2. **Honest MVP framing.** The first live demo may need an always-retrieve / RAG
   setup or an explicit *"look this up"* phrasing — not a cold chat that relies
   on the model choosing to doubt itself. Say so in the demo; don't fake a
   spontaneous call.
3. **Measure it.** Track *call-through rate* (did the agent invoke the tool for
   an in-scope query?) as a first-class MVP metric alongside answer correctness.
   A correct record nobody fetched is a product that doesn't work.

## Risk 2 — Copyright takedown kills the hosted endpoint

The whole project depends on the served endpoint staying up. The README's
"be bold on short quotes" is too thin for a load-bearing dependency. Two facts
change the posture:

- **Systematic extraction weakens the "short quote" defense.** Pulling the
  *most valuable / most quoted* lines out of every copyrighted work at scale is a
  different legal animal from one incidental quote. The systematic-ness is the
  exposure.
- **Lyrics are far more aggressively litigated than film quotes.** Genius and
  Tekstovi verbatim lyric text carries real risk. Recommendation: **defer or drop
  verbatim lyrics** (Genius stays as a *structural* model to study, not a text
  source) until there's a reason to take the risk.

**The escape hatch is the same as the durable moat (see [`07`](07-durable-moat.md)):**
the enrichment layer (`meaning`, `modern_usage`, pragmatics, provenance) is
commentary/criticism — strongly transformative, the copyright-safest *and* most
durable payload. Design so a record is **useful with the verbatim text truncated
or omitted**. If the enrichment carries the record, the verbatim line becomes a
thin, hedgeable layer we can drop under pressure without losing the product.

### Licensing tiers (every source gets a tier)

| Tier | Sources | Posture |
|---|---|---|
| **Green — ship freely** | Wikidata (CC0), MusicBrainz/Discogs IDs (CC0), computed signals (our numbers), user-contributed original annotations | Serve directly, attributed. |
| **Yellow — transformative only** | Vukajlija-derived `modern_usage`, forum/journalism-sourced `meaning` | Store derived annotation + citation, never clone the source. Per-field provenance is the defense. |
| **Orange — short quote + hedge** | Film/TV dialogue via subtitles | Short verbatim quote max; enrichment must carry the record; raw SRT never committed; be ready to truncate. |
| **Red — defer / drop** | Verbatim song lyrics (Genius/Tekstovi) | Don't ship verbatim. Study structure only. Revisit only with a deliberate risk decision. |

Provenance-per-field (already in [`02`](02-data-sources.md#provenance-is-a-first-class-column))
is what makes tiering enforceable: each field knows its tier and can be dropped
independently.

## Risk 3 — The moat is defined to shrink

Covered in full in [`07`](07-durable-moat.md). Summary: don't make *"N references
the model gets wrong"* the product's reason to exist — it's a variable we don't
control that only moves down. Lead with the durable, structural properties;
keep gap-score as the internal compass.

---

## Lesser risks (track, don't obsess)

- **Open endpoint abuse / cost.** "No auth on the read endpoint" ([`06`](06-plan.md))
  + free vector search per request = cost and abuse exposure. Add basic **rate
  limiting** and a cache before the endpoint is public. Auth-free is fine;
  limit-free is not.
- **Signal-source brittleness.** `cultural_weight` depends on scraping YouTube /
  Reddit / Vukajlija, whose APIs and ToS shift. Keep signal ingestion behind an
  adapter so one source breaking doesn't break the score; store the last-good
  numbers so the served value degrades gracefully.
- **Schema overfit to one archetype.** See [`08`](08-schema-archetypes.md). Fixed
  by validating four archetypes in Phase 0.

## Non-goals (promoted from `06`, stated once, plainly)

- Not a generic cultural encyclopedia (that's a copy of the model — see [`01`](01-thesis-llm-gap.md)).
- No bulk ingestion of clean/open/model-adjacent sources.
- No second datastore or graph engine until a real multi-hop query hurts in SQL.
- No enrichment at query time — offline batch only.
- No mass subtitle scraping before the manual vertical slice proves the pipeline.
- Not a volume play. "We have X thousand quotes" is explicitly **not** the pitch.

## The higher-yield candidate generator we're under-weighting

[`04`](04-subtitle-pipeline.md) invests heavily in five hard automation problems
(cue reassembly, speaker diarization, cross-ref detection, …). But an ex-YU film
buff can fill every `⚠ TO-VERIFY` field for the Valter record correctly in ten
minutes — faster and more accurately than an audio-diarization pipeline will for
a long time. Leksikon Yu Mitologije (our cited prior art) won on **community**,
not pipeline.

Reframe: the subtitle pipeline is **one** candidate generator; expert/community
PRs are another, likely higher-yield per unit effort in Phases 1–3. Pull a
lightweight contribution path earlier; let heavy automation arrive when volume
justifies it, not as a critical-path prerequisite.
