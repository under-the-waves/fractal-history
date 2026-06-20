# Scoring Engine Design (Phase 2)

Status: agreed design, not yet wired in. Lives on branch `feat/scoring-engine`.
Builds on the core-flashcard / headline work (see `3D_learning_structure_and_flashcard_design`
and `Core_design_decisions`). Read those first.

## 1. What we are measuring

A per-topic **mastery score**: for any node in the tree, how much of that topic the user has
actually learned and still retains. Each node has its own score and its own high-score board
(someone can be an expert on World War II and a novice on Rome). The score is built only from
**answering flashcards** – reading a narrative is worth nothing on its own.

## 2. The node model (corrected)

A "node" is one anchor (`anchors.id`). Each node has **up to three narratives** – analytical (A),
temporal (B), and geographic (C) – each keyed `(anchor_id, breadth)` in `narratives`, each with its
own 5 frozen **core** cards plus up to 3 user-chosen **personal-slot** cards. (The data model can
grow to D/E/F analytical breadths later; the formulas below sum over whatever narratives exist, so
nothing changes when it does. The `flashcards`/`narratives` `breadth` check currently allows A/B/C
only.)

A node's **children** are all anchors directly beneath it in the tree, across every breadth
(WW2's 3A analytical anchors, its 3B geographic anchors, and its 3C temporal anchors all roll up
into WW2). The parent/child relationship and the ancestor walk come from `tree_positions`
(`parent_position_id`), via the existing `getAncestorPath()` in `api/utils/db.js`.

## 3. The formulas

### 3.1 Card retention (the only thing that decays)

Each scored card contributes its current **retention** `r ∈ [0, 1]`, an exponential forgetting
curve pinned to the card's existing SRS interval – no new per-card state needed:

```
r(card) = θ ^ ( days_since_last_review / max(interval_days, 1) )      θ = 0.9
```

- Just reviewed → `r = 1`; one interval later → `0.9`; two intervals → `0.81`; and so on.
- Better-learned cards (longer `interval_days`) decay slower in real time, automatically.
- Never reviewed (`last_reviewed_at IS NULL` or `repetitions = 0`) → `r = 0`. Saving a card is not
  learning it; only answering it counts.

### 3.2 A node's own contribution

```
own(n) = Σ r(card)   over the node's scored cards
```

**Scored cards** = for each of the node's narratives (A/B/C): its 5 core cards, plus up to 3
personal-slot cards. Every card is worth a base of 1 when fully retained. So a single fully-retained
narrative is worth up to 8, and a fully-retained node (all three narratives) up to 24. There is no
reading floor (`F_read = 0`).

Cores and personal slots are weighted equally; the personal slots are capped at 3 per narrative and
must be chosen from that narrative's generated candidate pool (grounded, comparable across users), so
the maximum achievable score is identical for everyone – which keeps the high-score board fair.

### 3.3 The recursive roll-up

```
raw(n) = own(n) + w · Σ raw(child)        w = 0.3
```

Depth is discounted geometrically (a direct child enters at `w = 0.3`, a grandchild at
`w² = 0.09`); breadth is rewarded (each engaged child adds). A low `w` means a topic's score is driven
mainly by mastering *that topic's own* cards, with sub-topics a bonus – chosen deliberately so users
are never forced to grind through less-relevant sub-branches (e.g. the internal geography of Fiji) to
look like they know the topic. `w` is a single config constant; nudge toward 0.4 later if children
feel under-rewarded.

### 3.4 What the user sees, and the leaderboard

Per-node display – a friendly 0–100 that climbs fast and approaches 100 without reaching it:

```
display(raw) = 100 · ( 1 − e^(−raw / τ) )        τ = 22
```

| raw (what you've mastered) | display |
|---|---|
| a node's own cores only (~15) | ~50 |
| own + 2 fully-mastered children | ~67 |
| own + 4 children | ~78 |
| own + 6 children | ~86 |
| own + 10 children | ~94 |

So reaching ~80 on a node means mastering its own essentials plus roughly 4–5 of its sub-topics. A
genuinely small topic has a lower practical ceiling (less raw to accumulate); that is the accepted
cost of not punishing irrelevant breadth (the alternative, normalising by the topic's total content,
would force learning every child and was rejected).

**Leaderboard** ranks on **raw** (the unsaturated `subtree_raw`), not the 0–100 number – otherwise
every committed learner clusters at 99-point-something. Range comes from depth: each newly mastered
layer adds another `wᵈ` term that never saturates. Display the leaderboard as a raw point total.
Ranking by `raw` and by `display` is identical (the curve is monotonic), so per-node boards are
unaffected by the choice.

### 3.5 Behaviour this produces (sanity checks)

- A direct child's cards are worth `w = 0.3` each to the parent; a level-deeper card only `w² = 0.09`.
  So tackling a neglected shallow child (e.g. the Holocaust under WW2) raises the parent more than
  grinding a deep card in an already-explored branch – the engine nudges users to fill breadth before
  going ever deeper.
- Scoring 50 on WW2 with 0 on the Holocaust child is fine and informative: the Holocaust's headline
  fact is a WW2-level core (it is a 3A anchor), so 50 reflects headline knowledge; the child node
  measures depth, and its 0 makes the gap visible. The engine treats all children equally, so it
  cannot *insist* a particular central child be learned – per-child importance weights are a possible
  future addition, not a v1 concern.

## 4. Storage

### 4.1 `user_topic_scores` (new) – the incremental cache

Per `(user_id, anchor_id)`:
- `own_raw REAL` – `Σ r` over this node's scored cards, as of last computation.
- `subtree_raw REAL` – `own_raw + w·Σ child.subtree_raw` (what display and the leaderboard use).
- `updated_at TIMESTAMPTZ`.
- Indexes: `(anchor_id, subtree_raw DESC)` for the per-node board; `(user_id)` for a profile page.

Stores **raw**, never the 0–100 number, so increments compose; saturation is applied only at read.

### 4.2 `flashcards` additions

- `is_core BOOLEAN DEFAULT false` – set when a narrative's frozen cores are instantiated as the
  user's reviewable cards.
- `is_personal_slot BOOLEAN DEFAULT false` – set when a user assigns a pool card to one of their 3
  slots; enforce ≤3 per `(user_id, anchor_id, breadth)` at assignment time.

`own_raw` then counts cards where `is_core OR is_personal_slot`. (Simpler no-flag alternative: count
cores plus the top-3-by-retention non-core cards per narrative via a window function. We use explicit
flags because the user-facing design is explicit slots.)

## 5. When scores change

- **On review** (`flashcards` PATCH, after the SRS update): recompute `own_raw` for that anchor
  (≤24 cards, cheap), take the delta versus the cached value, and propagate up the ancestor chain –
  `subtree_raw += wᵏ · Δ` at each ancestor `k` levels up. O(depth) writes (depth ≈ 6). See
  `applyReviewDelta()` in `api/utils/scoring.js`.
- **Selecting a personal slot** changes nothing until the card is answered (`r = 0` until reviewed).
- **Nightly decay pass** (cron, midnight): for each active user, recompute `own_raw` from current
  (now-decayed) retention and rebuild `subtree_raw`. This is the only thing that moves scores *down*;
  intra-day events only ever move them up. Per user this is cheap (they engage a bounded set of
  anchors). See `recomputeUserScores()`.

## 6. Constants (all tunable in one place)

| Symbol | Meaning | Value |
|---|---|---|
| θ | retention at one interval | 0.9 |
| w | depth discount per level | 0.3 |
| τ | display saturation scale | 22 |
| base | points per fully-retained card | 1 |
| cores / narrative | frozen, shared | 5 |
| personal slots / narrative | pool-picked, capped | 3 |
| reading floor | — | 0 |

## 7. Dependencies on Phase 1 (must exist before this is meaningful)

1. **Core marking:** each narrative's 5 cores identified (the headline-selection work) so they can be
   instantiated with `is_core = true`.
2. **Core instantiation:** when a user studies a narrative, its 5 cores become per-user `flashcards`
   rows (idempotent via the existing `(user_id, anchor_id, breadth, md5(question))` unique index),
   tagged `is_core`.
3. **Personal-slot assignment endpoint:** lets a user pick ≤3 pool cards per narrative, tagged
   `is_personal_slot`.
4. **Auth:** real Clerk production instance (currently dev-mode) before any public leaderboard.

## 8. Open / deferred

- Per-child importance weights (so a central child can be made non-skippable) – future.
- Typed-answer verification (currently the effort of reviewing is the only anti-cheat – this is a
  dedication board more than a verified-knowledge board) – future.
- Final `w` and `τ` tuning once real usage data exists.
