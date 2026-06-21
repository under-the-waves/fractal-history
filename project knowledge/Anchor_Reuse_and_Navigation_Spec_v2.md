# Anchor Reuse & Multi-Path Navigation — Design Spec (v2)

> **Status:** Proposed, not built. Drafted 2026-06-20.
> **Relationship to v1:** Supersedes the *detection* approach in
> `Anchor_Deduplication_Spec.md`, which matches on title only. That older spec's
> SQL scaffolding (multi-position inserts, cycle note, the verification query) is
> still useful, but its title-only matching must NOT be built as written — see
> "What changed from v1". This v2 also adds the navigation, breadcrumb, and
> scoring model the v1 doc never covered.

---

## 1. Why this matters now

A scoring system is being added. The moment a user earns a score on an anchor,
duplicate anchors for the *same concept* become a real, visible defect: a learner
would see "World War I: 80%" via one path and "World War One: 35%" via another,
for what is, to them, the same topic. Single score per concept is the requirement
that forces this work.

## 2. Root cause (why duplicates appear despite temporal/geographic scoping)

The intuition "the coordinates change the scope, so duplication should be rare"
holds for **scoped entities** (a place or a broad period viewed through a window)
but breaks for **bounded events**.

A bounded event carries its *own* fixed extent. World War I is 1914–1918 wherever
you meet it. It therefore sits **entirely inside every temporal window that
contains it**, and temporal windows nest. So an analytical decomposition of any
containing window legitimately surfaces it. Because each generation run is
*concept-blind* (it doesn't know an anchor for the event already exists
elsewhere), it mints a fresh one.

Observed example — the two WW1 anchors, both off the same temporal parent:

```
World War I   (2A-XKOOC): Root → Contemporary: 1900-Present → [A] → World War I
World War One (3A-FESJE): Root → Contemporary: 1900-Present → [B] → Imperial Crisis & World Wars: 1900-1945 → [A] → World War One
```

This is structural, not a fluke: every major datable event (WW1, WW2, the Black
Death, the Moon landing) is exposed to it.

## 3. The crux: what to merge, and what to leave alone

| Class | Example | Merge? | Why |
|-------|---------|--------|-----|
| Path-independent bounded event | World War I via two paths | **Yes** | Same intrinsic extent and meaning however reached |
| Path-dependent framing | "United States: 1900s" vs "United States: all history" | **No** | The window *defines* the content; they are genuinely different |
| Path-dependent framing | "Australia in WWI" vs "Australia" (the nation) | **No** | Different analytical frame and/or extent |

A reuse mechanism is only as good as its ability to tell these apart. This is the
single most important design point.

## 4. Identity key (the matching rule)

Two anchors are the same iff:

> **similar name** AND **same resolved own-extent**, across all three axes
> (Frame / When / Where).

The decisive subtlety: "extent" means the anchor's **own resolved extent, not its
parent window**.

- **When** = the anchor's *intrinsic* dates. For an event, World War I resolves to
  **1914–1918** regardless of whether its parent window was "1900–Present" or
  "1900–1945". Resolved at generation time, not inherited.
- **Where** = the anchor's own geographic extent (region codes / global).
- **Frame** = its analytical lineage (what it is *about*).

Why own-extent and not the parent window: the duplicates we want to merge live in
**different parent windows by construction** — that difference is *how* they arose.
A rule keyed on the parent window would refuse the merge we need. Worked through:

- WW1 vs WW1: name ~match; own When = 1914–1918 in **both**; Where = global in
  both; Frame = the war itself in both → **merge**.
- "United States: 1900s" vs "United States: all history": name match, but own When
  differs (1900–present vs all of history) → **do not merge**.

This is exactly the discriminator between the two classes in §3.

**Restriction:** own-extent is well-defined only for **datable events**. Ongoing
processes ("Nationalism", "the Factory System") have fuzzy extent — exclude them
from reuse. They also rarely duplicate identically, so little is lost. In
practice: only attempt reuse for anchors the generator can tag as a discrete event
with a resolvable start/end.

## 5. What changed from v1

1. **Detection.** v1 = `LOWER(TRIM(title))` exact match, nothing else. That
   false-merges path-dependent framings (the "United States" case) and has no
   notion of extent. v2 = name + own-extent (Frame/When/Where) + restricted to
   datable events. This is the core correction; v1's "Case 2: could enhance to
   check scope" is precisely this gap.
2. **Subtree handling.** v1 eagerly *copies* the whole subtree to the new location
   at merge time. v2 prefers lazy sharing (see §6) — don't copy; let an anchor's
   children resolve by `anchor_id` wherever it appears. (Open design fork.)

## 6. Mechanism — reuse at generation time

When generating children, for each *proposed* child:

1. Compute its identity key (§4).
2. If an existing anchor matches, **do not create a new anchor** — insert a new
   `tree_positions` row pointing at the existing `anchor_id` under the current
   parent. The schema already supports one anchor at many positions (it is why the
   deletion path checks "is this anchor still referenced by another position?").
3. Otherwise, create a new anchor as today.

`narratives`, `flashcards`, and **score** key off `anchor_id`, so they are shared
automatically — one narrative, one score, per concept.

### Design fork — children of a shared anchor
When an anchor sits at two positions P1 and P2, how do its children show under P2
(its children's `parent_position_id` points at P1)?

- **(a) Eager copy (v1):** mirror child positions under P2. Children appear
  immediately; cost is extra positions, some never visited, and bookkeeping when
  the shared subtree grows later.
- **(b) Lazy / shared-by-anchor (recommended):** render an anchor's children by
  looking up children of *any* of its positions, keyed on `anchor_id`. No copying;
  the subtree is genuinely shared. Cost: the tree renderer and `getChildren` must
  resolve children through the anchor, not a single position, and breadcrumbs must
  be path-aware (they already are — see §7).

Recommend (b): it matches the "one shared concept" goal and avoids position
sprawl, at the price of a render-layer change.

## 7. Navigation & breadcrumbs (the "ghost breadcrumb" model)

Key principle: **a breadcrumb is a property of how the user travelled, not a
property of the anchor.** This is what makes the graph tractable.

- **Shared on the anchor:** narrative, flashcards, score.
- **Per-traversal:** the breadcrumb / ancestor chain.

The front end already separates these: `activePath` is the route taken this
session, and deep links carry `?path=id0,id1,…,target`. So "navigate back up the
way I came" already falls out — the breadcrumb follows session history, not a
stored chain. The "You are here" panel computes Frame/When/Where from `activePath`,
so it adapts to the route automatically.

The one new piece: **arrival without a path** (a deep link, a search result, a
leaderboard click). Then there is no traversal to show, so each shared anchor
designates a **canonical/primary position** (e.g. the first place it was created)
for the default breadcrumb; the others are secondary "ghost" appearances —
reachable, but not the default chain. (The Windows folder-shortcut analogy: the
item has one canonical home and is reachable from elsewhere.)

## 8. Scoring interaction

- Score is stored against `anchor_id` → one score per concept, the whole point.
- Open question: does the *depth/context* at which an anchor was reached affect
  scoring (e.g. should mastering WW1 reached at level 5 count differently from
  level 2)? Default assumption: no — the concept is the concept. Revisit when the
  scoring model (discounted-sum, retention curve, frozen core cards) is specified.

## 9. Costs & risks (in priority order)

1. **Detection accuracy.** Tight enough to never false-merge a path-dependent
   framing, loose enough to catch "World War I" vs "World War One". Likely an
   embedding or LLM check on candidates that already share an overlapping own-extent
   and similar name. This is make-or-break — a wrong merge corrupts the structure
   and is worse than a duplicate.
2. **Cycle prevention.** With multiple parents the tree becomes a DAG; guard
   against an anchor becoming its own ancestor (track ancestor `anchor_id`s and
   refuse the position if it would close a loop).
3. **Children-rendering decision** (§6 fork) — pick (a) or (b) before building.
4. **Canonical-parent selection** for path-less arrivals (§7).
5. **Intrinsic-date resolution** — small generation add: tag datable events and
   resolve their own start/end.

## 10. Out of scope / explicit non-goals

- **No blanket/global deduplication.** It would wrongly merge the path-dependent
  framings that the tree is *designed* to keep distinct.
- **No ID migration.** Anchor ids stay opaque unique keys; the level/breadth letters
  remain non-authoritative (separate decision).
- **No retrofit decision yet.** Whether to merge the existing duplicates (WW1/WW2
  etc.) or only apply reuse to new generation is left open — retrofit is a one-off
  migration that can follow once the mechanism is trusted.

## 11. Suggested build order (when picked up)

1. Tag-and-resolve own-extent for datable events at generation time.
2. Identity-key + `findExistingAnchor` keyed on name + own-extent (not title).
3. Reuse-on-match: insert a position, with cycle guard.
4. Children-rendering: implement the §6(b) shared lookup.
5. Canonical-parent + path-less breadcrumb fallback.
6. (Optional, later) retrofit existing duplicates.

---

*Origin: design discussion 2026-06-20 (the two-WW1 case). See memory
`fractal_id_and_dedup_decision` and `fractal_anchor_coordinates_spec`.*
