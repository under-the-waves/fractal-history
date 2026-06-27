# Learn pipeline — implementation plan (for the build session)

This turns the validated prototype into a real, deployed feature. Read `Learn_Pipeline_Design.md`
(same folder) first for the architecture and rationale, and the memory note
`fractal_generative_learning` for the full decision history. This file is the concrete build plan.

## Where we are (prototyped + validated, all LOCAL-ONLY)

The whole flow works behind a local dev server; nothing is in the DB or deployed yet.

- **Frontend flow:** `src/components/GenerativeLearning.jsx` + `generative.css`, route `/learn/:id` in
  `App.jsx`. Flow: choice (read vs write) → study (fact cards with 4 expandable layers) → write (blank
  page, hard two-step) → marking spinner → mark report. Tree action renamed Read→Learn, points at
  `/learn/:id`.
- **Study data:** registry `src/data/learnData.js` → `getLearnData(id, breadth)`, keyed by
  `${id}:${breadth}`. Entries: Emergence of Life `1A-E8F2G:A` (hand-authored, `src/data/emergenceFacts.js`),
  World War I `2A-XKOOC:A` and `2A-XKOOC:B` (generated, `src/data/learn/<id>-<breadth>.js`).
- **Card shape:** `{ id, breadth, title, scope, prelude:{title,facts[]}, subAnchors:[{title, facts[]}] }`.
  Each fact = `{ headline, when, what[], how[], debates[], vignettes[] }`. Layers render only if non-empty.
- **Generation pipeline (offline harness):** `scripts/learn-chain-harness.mjs` —
  research (Haiku + Serper, authoritative-domain filter, fetches & reads top pages) → cards (Sonnet,
  hybrid grounding) → narrative (Opus, optional) → verify (reuses `lib/factCheck.js`). `--save-id`
  writes a study-data module per breadth. Prompts: `prompts/_explore-facts-prompt.md` (cards),
  `prompts/narrative-a-prompt.md` + `_shared-voice.md` (narrative).
- **Marking (offline/local):** `lib/marking.js` (`markNarrative(narrative,{anchorId,breadth})`, Opus,
  prompt `prompts/_marking-pass.md`); fact base = hand-authored file for Emergence
  (`FACT_BASE_FILES['1A-E8F2G:A']`) else derived from the cards. Served locally by `prototype/mark.js`
  via `dev-api-server.mjs`'s `prototype/` fallback. NOT a deployed function.
- **Flashcards-from-cards (validated, not wired):** `scripts/flashcards-from-cards-harness.mjs` —
  reuses real `normaliseQuestions`/`selectCores` from `api/generate-flashcards.js`; needs the
  title-echo guard added to `selectCores`.

Run locally: `node dev-api-server.mjs` (:3001) + `npx vite --config vite.dev-local.config.js` (:3000).
Live demos: `/learn/1A-E8F2G` (Emergence), `/learn/2A-XKOOC?breadth=A` vs `?breadth=B` (WWI).

## Locked decisions

- Pipeline: **research (Haiku) → cards (Sonnet) → verify (Haiku)**; **narrative (Opus), generated
  LAZILY on the Read click**. Cost ≈ $0.50/anchor with Sonnet cards (research ≈ $0.05; narrative
  ≈ $0.37 paid only when read). One-time per (anchor,breadth), cached.
- Fact cards have 4 layers: what happened / how we know (sources & evidence) / debates / **vignettes**.
- **Flashcards come from the fact cards** (headline + what-happened ONLY), 5 core (one per child
  sub-anchor) + 3 optional slots. Needs the title-echo guard.
- **Write-your-own defaults to TEMPORAL (B)** for event/era topics; Analytical (A) for concept topics.
- On-demand for the whole tree (only pay for visited anchors), cached forever.

## Constraints (do not skip)

1. **Vercel function cap = 12, currently AT 12** (`git ls-files 'api/' | grep -c '\.js$'`). New
   endpoints (marking, generation, learn-data) CANNOT each be a new `api/*.js` file. Either consolidate
   into ONE dispatcher endpoint (`api/learn.js?action=...`) or upgrade to Vercel Pro. Decide first.
2. **Vercel serverless cannot fire-and-forget** after responding. On-demand generation that must
   survive the user navigating away needs a real job mechanism (jobs table + external cron/worker, or
   GitHub Action), NOT an in-request background promise.
3. Backend helpers go in `lib/` (not `api/`). See CLAUDE.md.

## Decisions settled with the user (2026-06-27)

1. **Function cap — no Pro upgrade.** The 12: reads (`get-tree`, `anchors`, `get-generation-metadata`,
   `get-narrative`, `scores`), narrative (`generate-narrative`, `fact-check-narrative`),
   `generate-anchors`, flashcards/scoring (`generate-flashcards`, `flashcards`, `instantiate-cores`,
   `cron-decay-scores`). PLAN: (a) move `cron-decay-scores` OUT to a GitHub Action (it was always
   meant to be an external cron, not a Vercel function), freeing a slot; (b) add ONE consolidated
   `api/learn.js?action=get|generate|mark|flashcards` for everything new → stays at 12. Optional later
   headroom: merge the 5 GET reads into one `api/read.js?resource=` dispatcher (frees ~4).
2. **On-demand, synchronous — NO background worker (for now).** Generate on first visit with a loading
   screen, like `generate-narrative` already does. Staged by path: cards on "Write your own" (~55s),
   narrative on "Read" (~30s). Accept that navigating away mid-generation wastes the work (same as the
   current narrative flow). Drop the jobs-table/worker from the near-term build.
3. **Breadth labels and ordering: LEAVE AS-IS for this build (user instruction 2026-06-27).** Do NOT
   rename A/B/C, do NOT change the default, do NOT reorder. The learn flow keeps the current breadth
   handling (breadth comes from the URL, default A; existing breadth tabs unchanged). The validated
   FINDING that temporal reads better for "tell the history" (see Learn_Pipeline_Design.md) stands as
   a documented insight to revisit LATER — it is not a change to make now.
4. **Wire the mark into scoring NOW.** Convert mark (score + coverage) → XP and feed through
   `applyReviewDelta` in `lib/scoring.js` (writing earns more than reading, per the scoring design).
   DEPENDENCY: scoring is per-user but the marking prototype has no auth — this pulls in Clerk auth on
   the mark endpoint + persisting the mark. Copy the pattern the flashcards already use. The XP maths
   is simple; the auth wiring is the real work.

## Build phases

### Phase 1 — Persistence (move learn data into the DB)
- Add tables (Neon), e.g. `learn_content(anchor_id, breadth, title, scope, prelude jsonb, sub_anchors
  jsonb, fact_base text, rubric jsonb, sources jsonb, generated_at, model_meta jsonb)`. One row per
  (anchor, breadth). Migration script in repo root (pattern: existing `create-*-table.js`).
- Seed Emergence (hand-authored, from `emergenceFacts.js` + `prototype/emergence-of-life-facts.md`)
  and WWI A/B (from `src/data/learn/*.js`).
- Replace the static `getLearnData` import path with a DB read (via an endpoint, see Phase 2).
- Acceptance: cards + fact base for all three entries served from the DB; static `src/data/learn/*`
  and `learnData.js` retired (or kept only as a seed source).

### Phase 2 — Generation as a service + endpoints
- Port `learn-chain-harness.mjs` into `lib/` modules: `lib/research.js`, `lib/generateCards.js`
  (uses `_explore-facts-prompt.md`, Sonnet), reuse `lib/factCheck.js` for verify. Derive the marking
  fact base from cards (logic already in `lib/marking.js` `buildFactBaseFromCards`).
- One consolidated endpoint `api/learn.js` dispatching on `?action=`: `get` (cards+factbase for an
  anchor/breadth), `generate` (kick a job), `mark` (move `prototype/mark.js` here), `flashcards`.
  Keeps the function count flat. (Or per-endpoint if upgraded to Pro.)
- Background generation: a `learn_jobs` table + an external trigger (cron/GitHub Action or a worker)
  that runs research→cards→store and flips status. First-view UX: show "preparing this topic" and
  poll; or generate synchronously if scoped to a curated set (Phase-0 decision).
- Lazy narrative: keep using the existing `/narrative/:id` generation on the Read click; add the
  hybrid grounding (pass the stored research evidence base; narrative prompt rule "use only this
  evidence"). The research base must be stored in Phase 1 for this.
- Acceptance: visiting a new anchor generates + caches cards (and marking base) once; marking works
  via the real endpoint; narrative still generates on Read.

### Phase 3 — Flashcards from fact cards
- Change `api/generate-flashcards.js` input from the narrative to the fact cards' `headline` +
  `what` (per `fractal_flashcard_single_source` memory). Keep 5 core (one per child) + 3 slots.
- Add the **title-echo guard** to `selectCores`: reject a core whose normalised answer is a substring
  of its sub-anchor title; swap in a non-echoing card from the same group. (Prototype proves it works.)
- Acceptance: cores are non-circular; flashcards exist for write-only users (no narrative dependency).

### Phase 4 — Frontend integration
- `GenerativeLearning.jsx`: fetch learn data from `api/learn?action=get` instead of the static
  registry; loading/empty states; submit posts `{anchorId, breadth, narrative}` to the real mark
  endpoint (already shaped this way).
- Breadth: default event/era anchors to B (per Phase-0 decision) and/or an A/B toggle on the choice
  screen.
- Hook the mark into XP (Phase-0 decision): map score → XP boost per `fractal_history_scoring_design`.
- Acceptance: full flow works against the deployed backend on a preview deploy; the tree's Learn
  action lands on a working choice screen for any anchor.

### Phase 5 — Cost & polish
- Prompt caching on the static prompt scaffolding (cards + narrative prompts are identical across
  anchors) to cut input cost.
- Re-measure $/anchor at the chosen models; confirm the 12-function cap held; production Clerk before
  any public scoring/leaderboard.

## Parallel-sessions / git
Per the repo protocol: branch `feat/learn-pipeline` in its own worktree; merge to `main` via PR only;
test on the branch's Vercel preview, never on production. The prototype currently sits UNTRACKED on
`improve/narrative-voice` — the build session should move these files onto `feat/learn-pipeline`.

## Inventory of prototype files to carry into the build
- `src/components/GenerativeLearning.jsx`, `src/components/generative.css`
- `src/data/learnData.js`, `src/data/emergenceFacts.js`, `src/data/learn/2A-XKOOC-A.js`, `…-B.js`
- `prompts/_explore-facts-prompt.md`, `prompts/_marking-pass.md`
- `lib/marking.js`, `prototype/mark.js` (handler to move into `api/learn.js`)
- `scripts/learn-chain-harness.mjs`, `scripts/flashcards-from-cards-harness.mjs`,
  `scripts/explore-facts-harness.mjs`, `scripts/marking-harness.mjs`
- `prototype/emergence-of-life-facts.md` (hand-authored marking fact base + study facts source)
- `dev-api-server.mjs` change (the `prototype/` fallback) — keep for local dev
- `App.jsx` route, `TreeVisualization.jsx` Read→Learn rename
