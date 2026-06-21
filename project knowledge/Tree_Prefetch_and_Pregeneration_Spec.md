# Tree Loading: Prefetch + Tiered Pre-generation — Design Spec

> **Status:** Proposed, not built. Drafted 2026-06-21. Design only, no code.

## Problem

Navigating the tree shows a loading screen on some clicks but not others. Root and
level-1 are instant because they ship in the static bundle (`src/data/treeStructure.js`);
everything deeper is loaded on demand. Two different waits hide behind that loading screen:

- **Fetch-wait** — the anchor already exists in the database; it just has to travel to the
  browser. ~100–500 ms.
- **Generation-wait** — the anchor does not exist yet; an LLM has to create it. ~30 s, and
  it costs money.

Goal: make navigation feel instant, without bloating the initial download (the static-bundle
route — see `Static_Bundle` discussion) and without blowing up generation cost or cluttering
the tree with un-reviewed content.

These are two mechanisms for two waits. Prefetch fixes fetch-wait; pre-generation targets
generation-wait. They compose.

---

## Part A — Prefetch existing anchors (cheap, fresh; do this first)

When a node N's children finish rendering, quietly fetch what the user is most likely to
touch next, in the background, so it is already cached when they click.

**Targets**
1. **N's other two breadths.** Viewing N's A-children → background-fetch N's B and C children,
   so tapping those tabs is instant.
2. **One level down.** For each visible child, fetch *its* children at the current breadth, so
   the next drill is instant.

**Mechanics**
- Run on idle (`requestIdleCallback`, or a short delay) so it never competes with the user's
  active click.
- Concurrency cap ~2–3 background requests.
- Write results into the same in-memory `treeData` cache normal fetches use; skip anything
  already cached.
- Optionally abort in-flight prefetches when the user navigates away.

**Cost / properties**
- Cheap DB reads via the existing `get-tree` endpoint; **no LLM calls**.
- Data stays **fresh** — it is just a normal fetch done early, so no staleness problem.
- **Limit:** only helps where the grandchildren already exist. Empty result = nothing to
  prefetch, and that case is a generation-wait, handled by Part B.

---

## Part B — Tiered pre-generation (structure only, stingy, budgeted)

Silently generate anchors that don't exist yet, so a future drill is instant. Tempting but
costly if naive; the policy below keeps it affordable.

**Three principles that shape the policy**
1. **Persistence amortises cost.** Generated anchors live in the database forever, so
   pre-generating a node's children is a **one-time cost** paid by whoever reaches it first,
   and every later visitor just fetches it. It is *not* a per-click-per-user cost.
2. **Tree structure is the cheap call.** Expanding the tree generates **anchors** (titles +
   scopes) via Haiku — cents-scale. The expensive pipeline is **narrative + fact-check**
   (~$0.13 each), which runs only when someone opens a narrative page. Pre-generating
   *structure* is affordable; narratives must stay on-demand.
3. **Fan-out is the real risk.** The tree branches ~5× per level per breadth. Pre-generating
   one level ahead across all breadths is **5 × 3 = 15×** the nodes a user actually visits,
   most never opened; two levels ahead is ~225×. So most pre-generated content is waste, and
   un-directed mass generation fills the tree with un-reviewed anchors — against the project's
   curation goals.

**Tiers (choose by appetite; each builds on the previous)**
- **Tier 0 — on-demand only (current).** No pre-generation.
- **Tier 1 — current node's other breadths (recommended baseline).** When viewing N's
  A-children, pre-generate N's B and C children on idle. **+2 calls per node**, one-time.
  Makes breadth-toggling — the most common next action — instant.
- **Tier 2 — one level ahead, current breadth only (optional).** Also pre-generate each
  visible child's children in the breadth the user is currently using. **+5 calls per node.**
  Catches "keep drilling the same way".
- **Avoid — all-children-all-breadths (15 calls) and any multi-level (exponential).** The
  fan-out waste is not worth it.

**Guards (required for any tier above 0)**
- **Structure only.** NEVER pre-generate narratives or flashcards. The expensive pipeline
  stays strictly pull-based.
- **Budget cap.** A per-session and/or global ceiling on background generation; stop when
  exceeded. (Set the number against real Haiku pricing.)
- **Idle + cancellable.** Only on idle; cancel if the user navigates away or reaches the node
  on-demand first.
- **Idempotency / no races.** Reuse the existing "skip if children already exist" logic so
  pre-generation never double-generates or races with an on-demand request for the same node.
- **Concurrency cap** on background generation calls.

---

## Interactions
- **Static bundle:** orthogonal. If levels 0–2/3 are later bundled, prefetch/pre-gen handle
  everything below the bundled trunk.
- **Anchor reuse/dedup** (`Anchor_Reuse_and_Navigation_Spec_v2.md`): if reuse lands, pre-gen
  must reuse an existing matching anchor rather than pre-generate a duplicate.
- **Vercel 12-function cap:** no new endpoints — prefetch uses `get-tree`, pre-gen uses
  `generate-anchors`.

## Build order
1. **Prefetch (Part A)** — self-contained frontend change; biggest win per effort.
2. **Pre-gen Tier 1** — other breadths on idle, with the guards.
3. **Instrument the hit rate** (how often prefetched/pre-generated content is actually used)
   *before* going to Tier 2. Let measured usage justify more spend.

## Open questions
- **Hit-rate telemetry first.** Measure how often prefetch/pre-gen pays off before expanding.
- **Client-triggered vs server queue** for pre-gen. Client-triggered (reuse `generate-anchors`)
  is simplest; the idempotency guard covers multi-user races.
- **Budget numbers** — set once Haiku per-call cost is confirmed from the API reference.

---

## Implementation status (2026-06-21)

**Built** (PR #3, `src/components/TreeVisualization.jsx`): Part A prefetch + pre-generation
of the current node's other two breadths and one level ahead in the current breadth. A
background effect fires ~600 ms after the active node settles, runs prefetch (Phase 1) then
pre-generation (Phase 2), and cancels on navigation. NOT yet behaviourally verified in a
browser — verify on a preview deploy before relying on it.

**Guards in the code — keep these; each prevents a specific problem:**
- **`inFlightGenRef`** (shared foreground + background set) — the important one. `generate-anchors`
  is not atomic: it checks "do children exist?" then inserts. Two concurrent POSTs for the same
  node (e.g. the user taps the B tab while the background warmer is also generating B) would both
  pass the check and **double-insert children**. This set makes foreground and background skip a
  node already being generated. Removing it reintroduces duplicate children.
- **`PREGEN_SESSION_CAP` (40)** — the runaway backstop. Pre-generation spends money and writes to
  the DB automatically as the user browses; the cap bounds the blast radius of any bug or unusually
  long session. Tune against real Haiku cost + observed hit-rate; do not remove.
- **`warmedRef`** — per-(node, breadth) dedupe, so the effect re-running on every navigation doesn't
  re-attempt the same targets. Cheap insurance against redundant fetches.
- **Cancellation (`cancelled` flag)** — does NOT abort an in-flight API call. A generation already
  started runs to completion and its result is saved to the DB (so the spend is never wasted — a
  later visitor benefits). Cancellation only stops the loop from *queuing more* work for a branch
  the user has left, redirecting the session budget to where the user actually is. It is an
  economy, not a waste.
- **600 ms defer** — keeps warm-up from competing with the user's active click.

**Future tuning / TODO (later session):**
- Add **hit-rate telemetry** (how often warmed content is actually used) before scaling tiers.
- Set `PREGEN_SESSION_CAP` and consider a per-day/global cost ceiling once Haiku per-call cost is
  confirmed from the API reference.
- **Behaviour to monitor:** browsing now auto-generates structure — watch tree growth and cost.
  `PREGEN_ENABLED = false` is the kill-switch.
- Consider a **persistent client cache** (survives refresh) — separate from warm-up.
- Deferred: "all breadths one level ahead" (15×) and multi-level pre-generation — only if telemetry
  justifies the cost.

---

*Origin: design discussion 2026-06-21 (why some tree clicks load and others don't). See
`Anchor_Reuse_and_Navigation_Spec_v2.md`.*
