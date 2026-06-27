# Learn pipeline: research → generate → verify

Status: design + validated prototype (2026-06-27). Not yet wired into the live app.
Prototype artefacts: `scripts/learn-chain-harness.mjs`, `scripts/explore-facts-harness.mjs`,
`scripts/marking-harness.mjs`, `prompts/_explore-facts-prompt.md`, `prompts/_marking-pass.md`,
`prototype/` (fact base + marking endpoint), `src/components/GenerativeLearning.jsx`.

## What this is

Each anchor is something a user comes to **learn**, with a choice on arrival:

- **Read the guided narrative** — the existing narrative page (low effort).
- **Write your own** — study verified facts, then write the topic's history from memory and get
  it marked (high effort, higher retention). See the generative-learning design.

The tree's per-anchor action is now **Learn** (was Read) and points at `/learn/:id`, the choice
screen (`GenerativeLearning.jsx`). "Read" from there goes to `/narrative/:id`. Write-your-own is
gated to anchors that have study data; others show it as "coming soon".

## Model & timing decisions (2026-06-27)

- **Cards: Sonnet** (near-Opus quality, ~$0.07 vs $0.47). **Narrative: Opus** (for the voice).
- **The narrative is generated lazily, on the "Read" click — NOT up front.** Research + cards (+
  flashcards, see below) are what an anchor needs first; the narrative is the most expensive call and
  only the read path uses it, so defer it. The current prototype already does this: "Read the guided
  narrative" navigates to `/narrative/:id`, which generates on demand. Stage by path: read needs
  research + narrative; write needs research + cards.
- **Flashcards are sourced from the FACT CARDS, not the narrative** (see "Flashcards" below).

## Breadth: use Temporal (B) for write-your-own on event/era topics

The write-your-own task ("tell the history") is inherently chronological. Analytical (A) anchors
decompose by THEME and are deliberately not in time order, so for an event/era (a war, a revolution)
the A sub-anchors read out of sequence and miss the narrative spine. Temporal (B) anchors decompose
by period, so writing from them produces a natural chronological narrative. Validated 2026-06-27 on
World War I (`2A-XKOOC`): the A version (Total War Mobilization / Russian Revolution / US Entry /
Dissolution) was thematic and skipped the outbreak; the B version (Opening Campaigns 1914 / Stalemate
1915-16 / Global War & Resolution 1917-18 / Peace Settlement 1919) opened with the Sarajevo trigger
and ran in order — clearly the better learning experience. Emergence of Life worked on A only because
its analytical pieces happened to fall in rough chronological order. RULE: default write-your-own to
B for event/era topics; A suits concept-shaped topics. Study data is keyed by `${anchorId}:${breadth}`
(see registry below) so both can coexist.

## The generation pipeline

When an anchor is first opened, run research once and cache it; generate the rest by path.

```
1. RESEARCH   (Haiku + Serper)   -> verified evidence base + sources   [on first open]
2. CARDS      (Sonnet, hybrid)   -> study fact-cards                    [for the write/study path]
3. FLASHCARDS (Haiku)            -> Q&A cards derived from the FACT CARDS (no narrative needed)
4. NARRATIVE  (Opus, hybrid)     -> the guided narrative                [LAZY: only on Read click]
   VERIFY     (Haiku + Serper)   -> catch fabrications; freeze research base as marking ground-truth
```

**One research pass feeds four consumers:** the fact cards, the narrative, the citations, and the
marking ground-truth (the write-your-own grader needs a verified fact base anyway). This is the
core reason to research first.

### 1. Research (Haiku + Serper)

- For each sub-anchor (plus a "before this" prelude), generate ~3 targeted search queries, run
  them, **filter out low-authority domains** (reddit, youtube, facebook, quora, wikipedia-as-
  citation, etc. — same rule as `lib/factCheck.js`), **fetch and read the top authoritative
  pages** (not just snippets — this is where real dates and evidence live), and extract a list of
  facts, each tagged with a category (what happened / how we know / debates / story) and a source.
- Cheap model (Haiku) is enough here; this is search + extraction, not composition.

### 2. Generation (Opus, hybrid grounding)

- **Hybrid, not strict.** Strict "use ONLY the research" was tested and made output *worse* than
  the model's own knowledge — it dropped the ribozyme evidence and the good anecdotes that shallow
  research missed. So: research is the **factual anchor** (especially dates, names, citations); the
  model **may add well-established detail** from its own knowledge for richness; **conflicts defer
  to the research**; do not assert uncertain specifics.
- Cards use `prompts/_explore-facts-prompt.md`; narrative uses `prompts/narrative-a-prompt.md` +
  `_shared-voice.md`, both with the hybrid grounding block appended.

### 3. Verify (the safety net)

- Real-world truth enters during **research** (the web step). After generation, reuse
  `lib/factCheck.js` `factCheckNarrative` to catch claims the model fabricated beyond the base.
- In testing it caught a wrong date and an overstatement ("immobile" Ediacarans). Caveat: the
  verifier occasionally **over-corrects** a defensible claim (e.g. Miller 1952-conducted vs
  1953-published), so treat its corrections as strong suggestions, not gospel.
- This replaces the standalone post-narrative web fact-check; verification moves earlier (research)
  and lighter (catch-fabrication), rather than re-searching every claim after the fact.

## Flashcards (from the fact cards)

The flashcard system stays structurally the same — keep the existing generate-flashcards / cores /
personal-slots / scoring machinery. The ONLY change is the SOURCE: generate from the fact cards
instead of the narrative.

- **Source: each child sub-anchor fact card's `headline` + `what happened` bullets ONLY.** Do NOT
  draw from `how we know`, `debates`, or `story`.
- **They test the child anchors.** One **core** card per child sub-anchor (its headline fact) = 5
  cores (filled/capped to 5 per the existing rule when a node has ≠5 children), plus up to **3
  optional** personal-slot cards drawn from the what-happened pool.
- The scene-setting prelude is study-only; it is not a child, so it is not tested.
- Everything else is unchanged: headline-first + direction-awareness prompt, Haiku generation, cores
  frozen, scoring on the `flashcards` table.
- Benefit: flashcards no longer depend on the narrative, so they exist for write-your-own users who
  never read it, and they test the verified facts. Generated right after the cards step (step 3).

**Prototype validated 2026-06-27** (`scripts/flashcards-from-cards-harness.mjs`, reuses the real
`normaliseQuestions` + `selectCores`): from the Emergence of Life fact cards it produced 5 clean
cores (RNA, oxygen, iron, chloroplasts, multicellular life) + a 10-card pool, at ~$0.007 and ~7s on
Haiku. **Required fix discovered:** what-happened-only makes cores go *circular* for sub-topics named
after a process/event (e.g. core answer "Great Oxidation Event" for the GOE sub-topic), because the
distinctive specifics sit in the excluded how-we-know/debates layers. Fix = (a) headline-rule wording
that forbids the answer being the sub-topic's own name, and (b) a deterministic **title-echo guard**
in `selectCores`: reject any core whose answer echoes its sub-topic title and swap in a non-echoing
card from the same group. Add the guard to `generate-flashcards.js`. Minor tunables: pick the *best*
substitute (mitochondria over chloroplasts for endosymbiosis), and a couple of soft answers.

## Measured cost & latency (one anchor, Emergence of Life, 2026-06-27)

| Stage | Model | Time | Cost (approx) |
|---|---|---|---|
| Research | Haiku + Serper (18 searches, 18 pages) | 16.7s | $0.05 |
| Cards | Opus 4.8 | (parallel) | $0.47 |
| Narrative | Opus 4.8 | ~58.6s parallel | $0.37 |
| Verify | Haiku + Serper | 27.8s | ~$0.05 |
| **Total** | | **~100s** (~75s without verify) | **~$1.00** |

Prices approximate (Opus ~$15/$75 per M in/out, Haiku ~$1/$5, Serper ~$0.001/search). One-time
per anchor, then cached.

**Cost is dominated by Opus generation, not research.** Output tokens at $75/M drive it,
especially the cards (lots of structured output).

**Measured cards-model comparison (2026-06-27, same anchor):**

| Cards model | Cards cost | Cards time | Total pipeline | Quality |
|---|---|---|---|---|
| Opus | $0.47 | ~40s | ~$0.94 | excellent |
| Sonnet | $0.07 | ~72s* | ~$0.54 | ≈ Opus (clean dates, good stories) |
| Haiku | $0.023 | ~32s | ~$0.49 | good but looser (4.6 vs 4.54 Gya, internal date inconsistency, weak/misplaced stories) |

\*Sonnet's run was oddly slow once; likely transient, re-measure.

**DECISION: cards on Sonnet.** Cuts total ~43% at near-Opus quality. Haiku saves only ~$0.05 more
on the total (because once cards leave Opus, the **narrative becomes the dominant cost**), at a real
quality cost — not worth it unless first-view latency becomes the priority, where Haiku is fastest.

Remaining levers:
1. **Narrative ($0.37, Opus) is now the biggest single cost.** Keep on Opus for voice, or test
   Sonnet narrative if pushing cheaper.
2. **Prompt caching** on the static scaffolding (long narrative + voice prompts, identical across
   anchors) — cuts input cost on cache hits.
3. Research is already cheap (5 cents); leave it on Haiku.

Optimised target with Sonnet cards: ~$0.50/anchor, headroom below that via prompt caching.

## Caching & on-demand (whole tree)

- **On-demand, lazy, cached forever.** Generate an anchor the first time someone opens it, freeze
  it (as narratives/cards already are), and never regenerate. You only ever pay to research the
  anchors people actually visit — pre-generating the whole tree would waste money on the ~99% never
  opened.
- **First-viewer latency is the cost.** Mitigate by: caching; running cards + narrative in parallel
  (done in the harness); and **staging by the chosen path** — "read" needs research + narrative,
  "write" needs research + cards + marking base, so don't generate everything up front.
- **A real background worker is required.** Vercel serverless cannot reliably fire-and-forget after
  responding, so an in-request job dies if the user navigates away and wastes the partial work.
  Generation must run on a queue/worker (or a faster reduced-research fallback flagged as draft).

## Open build items

- Caching schema for the research base + generated outputs per anchor.
- Background worker / queue for generation.
- Wire the marking ground-truth from the research base (closes the loop with write-your-own).
- Move cards to Sonnet; add prompt caching; measure again.
- Tighten the explore-facts prompt so every card carries a concrete date range.
- Build study data for anchors beyond the prototype so write-your-own un-gates across the tree.
