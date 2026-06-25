# Geographic Division by Country Grouping — Design Note

> **Status:** Proposed, not built. Worked through 2026-06-25.
> **Supersedes (if adopted):** the UN-subregion building blocks in `lib/geography.js` for the
> *division* step. Relates to the deferred "curated override" idea in
> `fractal_geographic_taxonomy` and to the scope-grounding fix already shipped.

---

## 1. The problem this fixes

Geographic (breadth-C) division currently builds regions out of **UN subregions** (the
`world-countries` `subregion` field). The model picks and bundles whole subregions; code forms the
leftover. Two failures follow:

1. **Counterintuitive, inflexible groupings.** A region can only be made of whole subregions, so
   groupings that cut across subregion lines can't be expressed: there is no "Middle East" (it is
   Western Asia + Egypt, which sits in Northern Africa), Iran is filed under Southern Asia, and a
   "Western colonial powers" group (Britain + France + Spain + Portugal + Netherlands + Belgium)
   spans three subregions. The model either over-includes whole subregions or mislabels one — which
   is what produced the lying scopes (e.g. "Middle East and Central Asia" claiming Iran).

2. **Hollow justification.** The model is asked to explain *why* it grouped regions this way, but it
   can only ever bundle pre-drawn UN lines — it cannot draw a boundary the UN didn't. So the
   "why these regions" rationale is post-hoc dressing on a division the taxonomy already made. For a
   learning tool that teaches *how history is organised*, that explanation should be genuine.

## 2. The core idea

Make the **country** the atomic unit. The model groups countries directly into topic-driven
historical categories ("the Allied powers", "the Middle East", "the colonial metropoles"). The
grouping — and its justification — becomes a real choice that reflects the topic.

Completeness ("every country has a home, none appears twice") is **not** the model's job. It is
guaranteed by code, via the same leftover mechanism already in place.

## 3. How code and the LLM split the work

This is the key point: the hard part (completeness over ~193 countries) stays with code, so the
model's task stays small.

**Code (deterministic, no judgement):**
- Compute the node's **universe** — the set of countries in scope. For a geographic parent, that is
  the countries its membership resolves to; for a global/analytical parent, it is all countries.
- Expand to **candidate countries**, capped for tractability (see §5).
- After the model responds: **leftover = universe − claimed countries**, swept into a single
  "rest of the world / elsewhere" bucket. This guarantees no gaps. Reject or repair any country a
  model places in two groups, guaranteeing no overlaps.

**LLM (judgement only):**
- Given the candidate countries and the analytical frame, group the **relevant** ones into 2–4 named
  historical categories — each with its member country codes, a scope, and a genuine one-line reason.
- Leave everything else unclaimed. The model does **not** enumerate all 193; code handles the rest.

So the model is answering "which countries are the players here, and how do they belong together?" —
a knowledge question it is good at — and never has to account for every country on Earth.

## 4. Does this need more API calls?

**No.** It is still **one model call per geographic division**, generated lazily when a user drills
into that node — exactly as today. Specifically:

- The completeness/leftover step is **pure code → 0 calls**. No verification or "did you cover
  everything" call is needed, because coverage is computed, not asked.
- What changes is the *input* to the existing call: a list of candidate countries (tens) instead of
  a handful of subregions → **modestly more input tokens per call, not more calls.** The candidate
  cap bounds this.
- Total divisions across a branch do **not** rise, and may fall: you can go World → country-groups
  directly, skipping the subregion layer, so a branch can be *shallower* than today.

The only genuine cost is that grouping N countries is more judgement per call than bundling
subregions, so an occasional grouping may be weak — handled by the normal retry path, not a designed
extra call.

(For contrast: the rejected alternative — a second AI pass to *check* each scope — would have added
a call per generation. This design deliberately avoids that by letting code, not a model, own
completeness.)

## 5. Dividing from the whole world is the normal first geographic step

The universe for a C division is **the whole world, unless an ancestor C anchor has already narrowed
it.** A path can pass through any number of analytical (A) and temporal (B) anchors without touching
geography, so the **first** C division in a path divides the whole world. This is the common case,
not an edge case — and it is fine by design:

- A geographic anchor is about a place's **connection** to the topic, not events located there. So
  "divide the European Renaissance by geography" legitimately ranges over the whole world — it is
  meaningful to ask about, say, Fiji's connection to the Renaissance.
- As the fractal deepens, some place×topic cells are sparse. That is **a feature, not a defect**: a
  thin cell can surface a non-obvious connection no one had drawn before. Sparse depth is an
  intentional property of the whole project, here as elsewhere.

What this means mechanically — and why the large universe is not a wall:

- The model does **not** need all ~193 countries shown to it as candidates. It names the countries
  with a real connection (from its own knowledge), groups them, and code computes
  `leftover = world − claimed` into a "rest of the world / minor or uncharted connection" bucket. A
  **large leftover at a first-from-world division is expected and correct** — most of the world is
  peripheral to most topics, and the leftover stays reachable for the curious.
- So we can skip passing a 193-item candidate list entirely: let the model return country
  names/codes from knowledge, and have code **validate** them against the country set (rejecting
  anything unrecognised) and **complete** the partition via the leftover. No cap problem, no
  tractability wall.

The single place a *comprehensive, balanced* world map matters (rather than salient-groups +
leftover) is the **root's own** geographic division. There — and only there — a coarse first cut
into continents/macro-regions is worth keeping. Everywhere else, salient groups + leftover is right.

> Implementation note to confirm: the universe should inherit the narrowing of the nearest **ancestor**
> C anchor, even across intervening A/B anchors — not just the immediate parent. Worth verifying the
> current handler does this rather than resetting to the whole world after an A/B step.

## 6. What we keep, gain, and lose

- **Keep:** the completeness guarantee, lazy on-demand generation, breadcrumbs/drill-down, and ISO
  subdivisions below the country level.
- **Gain:** intuitive groupings (a Middle East that contains Iran; a real colonial-powers group),
  genuinely topic-driven divisions, and honest justifications.
- **Lose:** a single fixed reference map. "The Middle East" under one topic may differ slightly from
  another. For **path-dependent** geographic anchors this is acceptable — arguably correct — and it
  does **not** create a deduplication problem: geographic anchors were already classified as
  path-dependent and excluded from dedup, so making them genuinely topic-specific is consistent with
  that, not in tension with it. (Variation-by-topic ≠ the same anchor replicated in two places.)

## 7. Scope accuracy (the lying-scope problem) under this design

The lying scope ("Middle East and Central Asia" claiming Iran) happened because the model named a
place that the region's UN-derived membership **excluded** — the description and the membership
disagreed. Under country grouping, **the model chooses its own members**, so the description and the
membership agree by construction: if the model talks about Iran, it puts Iran in the group. The root
cause of the lie largely disappears — the model is no longer fighting a taxonomy that filed Iran
elsewhere.

A smaller residual risk remains: the prose could name a country the model did **not** put in that
group's own member list (e.g. a "Renaissance centres" group of {Italy, France, England} whose scope
also name-drops Spain). This is handled two ways, neither of which is an extra API call:

- **Preventive (in the prompt):** echo each group's chosen member countries back and instruct the
  scope to describe only those — "name only these as part of the group; mention any other place only
  as something it connected to." Because the model picked the members itself, this is easy for it to
  follow (unlike fighting the UN taxonomy).
- **Backstop (in code):** keep `lib/scopeGrounding.js` as a cheap, zero-call guard. It now becomes
  **more precise**, because membership is the model's explicit country list — no subregion fuzziness.
  It can run at generation (flag/regenerate) or as a periodic sweep.

So: prompt grounding makes a lie unlikely, and the existing code check catches the residue — no
second model is needed to verify scopes.

## 8. Interaction with work already shipped

- The **trap-list prompt** was a patch for the model fighting the taxonomy; under this design that
  pressure is gone, so the trap list can retire. The **scope-grounding checker** stays as the §7
  backstop.
- `region_codes` already accepts country codes (not just subregion names), so existing anchors keep
  working with no forced migration. New generation uses country grouping; notable mis-scoped anchors
  (e.g. "Core Western European Powers", "Low Countries Trade Hub") can be regenerated opportunistically.

## 9. Build sketch

1. `lib/geography.js` / `expandToCandidates`: add an option to expand a universe down to **country**
   level rather than stopping at subregion; keep the candidate cap.
2. `buildBreadthCPrompt`: pass candidate **countries** (optionally annotated with a conventional
   grouping as a hint, not a constraint); ask for topic-driven country-groups + a genuine
   justification; drop the subregion framing and the trap list.
3. Leftover: compute over countries (same pattern as today's subregion leftover).
4. Top-level policy: implement the §5 coarse-first-cut for the root.
5. Optional hybrid: offer UN (or custom) subregions as *suggested* groupings the model may adopt or
   override, to aid consistency without forcing it.

## 10. Open questions

- Candidate cap value at country granularity (today 40).
- Exact root-level macro-regions for the coarse first cut.
- Whether to show users an explicit "covers: [countries]" line (data-derived) alongside the prose, so
  membership is always authoritative regardless of the prose.

---

*Origin: design discussion 2026-06-25 (the Iran / "Middle East and Central Asia" case). See memory
`fractal_geographic_taxonomy`, and `lib/scopeGrounding.js` for the interim checker.*
