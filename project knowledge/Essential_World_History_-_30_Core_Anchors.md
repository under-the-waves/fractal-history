# Essential World History – 30 Core Anchors

> **Status:** Rewritten 2026-06-07. This supersedes the earlier version, whose
> anchor IDs no longer matched the seeded Level 1 and whose coverage was heavily
> weighted to post-1500 Europe (it openly dropped India, Islam, the medieval
> world, the pre-Columbian Americas, and most of Africa). Those gaps are restored
> below.

## Design constraints

- **Big History scope.** The sequence starts before humans (cosmos, Earth, life),
  consistent with the seeded Level 1 (Deep Time, Cosmic & Planetary, Emergence of
  Life, Evolution of Humans). It is not human-only world history.
- **Single-barrel topics.** Every anchor names one concept, matching the
  generator's design. No "X & Y" compounds.
- **Exactly 30, one per day.** Designed as a 30-day programme, one narrative per
  day, broad to specific.
- **Weighting:** deep time trimmed to 5 days; the post-1900 world expanded to 4
  (the old single catch-all "Modern World" day is split into Cold War,
  Decolonisation, and Digital Age).

## The 30

Breadth: T = temporal, A = analytical, G = geographic. "Seeded" = already exists
as a hand-seeded Level-1 anchor.

| #  | Narrative          | Breadth | Seeded |
|----|--------------------|---------|--------|
| 1  | Everything         | root    | yes    |
| 2  | Cosmos             | T       | yes    |
| 3  | Life               | A       | yes    |
| 4  | Humans             | A       | yes    |
| 5  | Foragers           | T       | yes    |
| 6  | Agriculture        | A       | yes    |
| 7  | Cities             | A       |        |
| 8  | Writing            | A       |        |
| 9  | Empires            | A       |        |
| 10 | Greece             | G       |        |
| 11 | Rome               | G       |        |
| 12 | India              | G       |        |
| 13 | China              | G       |        |
| 14 | Religion           | A       |        |
| 15 | Islam              | G       |        |
| 16 | Africa             | G       |        |
| 17 | Americas           | G       |        |
| 18 | Silk Road          | A       |        |
| 19 | Mongols            | G       |        |
| 20 | Exploration        | T       |        |
| 21 | Columbian Exchange | A       |        |
| 22 | Slavery            | A       |        |
| 23 | Science            | A       | (gap)  |
| 24 | Industry           | A       | yes    |
| 25 | Revolutions        | A       |        |
| 26 | Colonialism        | A       |        |
| 27 | World Wars         | T       |        |
| 28 | Cold War           | T       |        |
| 29 | Decolonisation     | A       |        |
| 30 | Digital Age        | T       |        |

The arc: cosmos to Earth to life to humans to farming to cities to classical
civilisations to world religions to the connected medieval world to the
early-modern joining of the hemispheres to the scientific, industrial, and
political transformations to the contemporary world.

## Deliberately omitted

- **Climate** and **Globalisation** did not make the 30. Decolonisation earned its
  slot because it created most of today's national map. The Digital Age narrative
  should absorb globalisation; Climate is the first addition if the 30 cap is ever
  relaxed.
- **Decolonisation (29) overlaps Cold War (28)** in time (both ~1945–1990). The
  ordering is thematic; each narrative should note they are the same decades seen
  through different lenses.

## Reachability (tested 2026-06-07)

Most of these 30 do not exist yet and must be generated. Generation is reachable
but path-dependent:

- **Narrow time before asking analytically.** Analytical generation on a coarse
  era yields foundational themes (surplus, writing, cities, states), not specific
  topics. Drill to the right temporal band first, then generate analytical
  children. Worked example – the Mongols were reached at level 3:
  `0-ROOT → Agricultural Civilizations (1B) → Medieval 500–1500 CE (2B) →
  Mongol Empire Expansion (3A-BGHWQ)`.
- **Open issue – geographic path mis-scoped.** Eurasia, Africa, Americas, and
  Oceania have `region_codes = NULL`, so generating their geographic (C) children
  divides the whole world, not the continent. The geographic anchors above
  (Greece, India, China, Africa, Americas) are still reachable via the
  temporal→analytical route, but the direct geographic path needs a `region_codes`
  backfill first.
- **Open issue – Level 1A is missing the Scientific Revolution.** Only four of the
  five designed turning points are seeded. Science (#23) depends on it.
