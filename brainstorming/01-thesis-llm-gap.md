# 01 — The thesis: we build the LLM gap, not a generic DB

## The objective, stated precisely

The value of exyu-mcp equals the **marginal information gain over the base
model** — the difference between:

- what an agent (Claude, ChatGPT, …) already knows from pretraining, and
- what actually exists in ex-YU culture.

Models hold the **head of the distribution**: the five most-famous lines per
film, the plot summary, the cast. They **lack the long tail**: the exact
phrasing, the 200th-most-quoted line, the surrounding exchange, the timestamp,
the speaker, and how a phrase actually mutated in use. That tail is the product.

## Live proof (the test that started this)

Prompt: *"Vazduh gori ko da…"* — expecting the correct reference.

- **Un-augmented model:** could not reliably attribute it. Would either refuse or
  hallucinate a plausible-but-wrong source. This is the failure we exist to fix.
- **Resolved answer:** *"Vazduh trepti, kao da nebo gori"* — a recognition code
  (*lozinka*) from **Valter brani Sarajevo** (1972, dir. Hajrudin Krvavac).
- **Where the answer came from:** culture journalism, YugoNostalgia, a forum of
  *filmski citati*, YouTube scene clips — **not** Wikiquote/Wikidata.
- **What is still uncaptured anywhere clean:** the exact countersign, the
  timestamp, the speaker, the precise surrounding exchange. That lives only in
  the subtitle/scene layer nobody has structured.

Three lessons, and they define the whole project:

1. The model fails on the tail (honest refusal or hallucination).
2. The answer lives in **alternative sources**, not model-adjacent open data.
3. The *precise* payload requires the **subtitle/scene pipeline** — which is why
   that pipeline is the product, not a deferral.

## What this rules IN

- Exact, verbatim wording (models paraphrase; we don't).
- Attribution the model gets wrong: source, speaker, scene, function.
- **Function/pragmatics**: *"Vazduh trepti…"* is a recognition code, not just a
  line. Models miss this.
- `modern_usage`: how a phrase is deployed *today* (set-phrases, slang drift).
- `cultural_weight`: computed from real social signals, not guessed.
- Cross-references / edges: film→song, meme→film, lyric→historical event. Models
  almost never hold these links.

## What this rules OUT

- Re-ingesting Wikipedia/Wikiquote **content** — the model already has it.
- Plot summaries, generic trivia, anything the base model answers correctly.
- "Clean and easy" as a reason to include a source. Easy usually means the model
  already ate it.

## The reclassification this forces

| Source class | Old (wrong) role | Correct role |
|---|---|---|
| **Wikidata** | knowledge | **skeleton only** — stable IDs + graph to hang payload on, anti-hallucination grounding. Contributes structure, zero content. |
| **Wikiquote / Wikipedia** | seed corpus | **eval floor** — represents "already in the model." Tells us where the head ends and our tail begins. Not shipped as data. |
| **Subtitles** | deferred (noisy) | **primary payload** — the tail lives here. Processing them well *is* the moat. |
| **Vukajlija / forums / memes** | nice-to-have | **usage + meaning payload** — the part models get generically wrong. |

Full detail in [`02-data-sources.md`](02-data-sources.md).

## The guardrail

Because "clean and open" correlates with "already in the model," ease of
ingestion is an **anti-signal** for value. We deliberately invest where it is
hard: the noisy, copyrighted, pipeline-heavy sources — because that difficulty is
*why* the model doesn't already have the data.
