# Learn flow reorder — spec (2026-07-05)

Supersedes the read/write *choice* entry in `Learn_Pipeline_Design.md`. The Learn experience becomes a
single linear path built around writing first, with the guided narrative moved to the end as the reveal.
Rationale (settled with the user 2026-07-05): the generation effect — producing an account from partial
knowledge — is what builds retention, so the polished narrative must come *after* the write, not before,
or the write collapses into transcription.

## The flow

```
study (fact cards + sources)  ->  write (from memory, cards hidden)  ->  mark
   ->  flashcards (save to deck)  ->  choice: rewrite  |  read the narrative (terminal reveal)
```

Stages in `GenerativeLearning.jsx` (`stage` state machine):

`start -> generating -> study -> write -> marking -> result -> flashcards`
with `result`/`flashcards` offering **rewrite** (back to `write`) and **read narrative** (navigate to
`/narrative/:id`, the terminal reveal).

1. **start** — replaces the old two-card choice. Title, scope, one line ("Study the facts, then write the
   history yourself"), a single Start button. Logged out: a sign-in gate (generation + marking are per-user
   and cost API spend). An unobtrusive escape hatch — "Prefer to just read it? →" → `/narrative/:id` — stays
   for casual users; the linear write path is the default, not forced.
2. **study** — the fact cards, now with per-fact source superscripts (see below). "I'm ready to write →".
3. **write** — blank textarea, cards hidden, ≥20 words to submit. Unchanged.
4. **mark** (`marking` → `result`) — grades against the fact base (derived from the cards), shows
   score/coverage/errors/misconceptions/missing/interpretation. The mark runs **without the narrative
   existing**, so the whole loop below is free of the expensive Opus call.
5. **flashcards** — NEW stage, entered from the result. The 5 cores + the pool, each card savable to the
   user's spaced-repetition deck. Seeded/ordered so the facts the mark flagged as *missing* surface first
   ("you skipped these — add them"). Then the fork: **rewrite** or **read the narrative**.

Ordering rules that must hold:
- Rewrites happen **before** the narrative reveal. Once the model answer is seen, a further "from memory"
  write is contaminated, so reading the narrative is terminal.
- The immediate flashcard study is *first exposure into the schedule*, not a scored mastery review — it must
  not inflate scores or pre-answer a rewrite.

## What generates when (cost)

Unchanged from the lazy model, and the reorder reinforces it: `research → cards → fact base → flashcards`
are what the write path needs and are generated on first open (~$0.05 research + Sonnet cards). The
**narrative (Opus, ~$0.37) is generated only when the user clicks "read the narrative"** at the very end, so
you pay for it only for users who finish the loop and opt in. `/narrative/:id` already generates lazily.

## Sources on fact cards (point 3)

Data already exists: research tags every extracted fact with a source URL (`evidenceBySection[title] =
[{fact, category, url}]`); the anchor-level deduped list is in `learn_content.sources` and already shipped to
the client via `/api/learn` but unused.

- **Generation:** add to `prompts/_explore-facts-section.md` a rule that each emitted fact includes a
  `sources` array of the 1–2 evidence URLs that support it, chosen only from the provided evidence. Card
  facts pass through `generateCards` verbatim, so `fact.sources` arrives with no other code change.
- **Render:** `FactCard` shows a small superscript marker after the headline; click/hover opens a popover
  listing those sources — domain as the label, full URL as the link. No marker when a fact has no sources.
- **Fallback:** cached content generated before this change has no `fact.sources`; those cards show no
  superscript and the page keeps an anchor-level "Sources" list at the foot of the study screen (from
  `data.sources`). Regenerate the two demo anchors (Emergence `1A-E8F2G`, WWI `2A-XKOOC:A/B`) to populate.
- **Safety:** the research domain filter already drops low-authority sites, so popover links are vetted.

## Flashcards in the flow (point 4)

Reuse the existing machinery unchanged — `api/flashcards.js` (`mode=slots`, `set-slot`), `api/instantiate-cores.js`,
the `flashcards` table and SM-2 engine. The only change is **placement and framing**: the save UI (ported from
`PersonalSlots`/`FlashcardSaveSection` in `NarrativeReading.jsx`) now appears as the post-mark `flashcards`
stage in the write flow, not only on the narrative page. Cores auto-instantiate; the learner adds up to 3
personal picks. "Study these now" links into the existing `/flashcards` deck surface.

## Concrete changes (files)

- `prompts/_explore-facts-section.md` — per-fact `sources` rule. (Phase 1)
- `src/components/GenerativeLearning.jsx` — new state machine, `start` stage, `flashcards` stage, FactCard
  superscripts + popover, escape-hatch link, source fallback list. (Phase 1)
- `src/components/generative.css` — styles for the source superscript/popover and the flashcards stage. (Phase 1)
- Regenerate demo anchors' learn content to populate `fact.sources`. (Phase 1)
- No new `api/*.js` — the API is AT the 12-function cap. Flashcard save reuses existing endpoints.

## Phase 2 (separate, needs its own validation — not in this change)

- **Narrative derived from the fact base (point 2).** Today `api/generate-narrative.js` is a standalone Opus
  call that never touches the research/fact base, and its citations come from a *separate* fact-check pass
  (`lib/factCheck.js`). Rewire it to consume the same fact base + source list the cards use, and retire the
  duplicate citation path, so narrative, cards, and flashcards cite one shared numbered source set and cannot
  contradict each other. Deferred because strict grounding was shown to *worsen* narratives (2026-06-27), so
  this needs the hybrid-grounding rule and a quality re-validation, independent of the flow work.

## Open decisions (recommended calls, easily reversed)

- **A. Drop the up-front read/write choice screen** → yes; single Start entry + escape-hatch link. The
  narrative moves to the terminal reveal.
- **B. Source granularity** → per-fact superscripts now (cheap: additive prompt rule + verbatim passthrough),
  section/anchor-level fallback for old cached content.
- **C. Narrative-from-fact-base** → Phase 2, after the flow ships and can be tested.
