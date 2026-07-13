# Geographic Temporal Threshold (66 Mya) — Design & Implementation Spec

Status: proposed (2026-07-13). Supersedes the per-continent temporal scoping in
`Level_1_Structure_-_Key_Decisions` (the "each geographic anchor defines its own start
date" rule and the "China ~5000 BCE" self-scoping).

## 1. The decision

A single global threshold **T = 66 million years ago** (the Cretaceous–Paleogene / K-Pg
boundary — the asteroid impact that ended the dinosaurs and opened the Cenozoic) partitions
the geographic (C) axis:

- **Cosmic & Planetary = [Big Bang (13.8 BYA), 66 Mya].** Cosmic origins, the formation of
  galaxies, stars, the solar system and Earth, the emergence and early evolution of life, and
  the deep geological ages through the Palaeozoic and Mesozoic — including the supercontinents
  Pangaea and Gondwana and their breakup, and the age of the dinosaurs. It ends at 66 Mya.
- **Each modern continent (Africa, Eurasia, Americas, Oceania) = [66 Mya, present].** The land
  from 66 Mya: its Cenozoic ecological and faunal evolution, the arrival or (for Africa) origin
  of humans, and all of human history to the present.

**One uniform rule for the whole geographic axis:** every geographic node is a *place*, and it
covers its place across the domain of its root continent. Modern names label the land at all
depths — "China" means the land now called China, from 66 Mya to present, with its deep natural
history first and Chinese civilisation as the recent chapters. A civilisation is the human-era
part of a place's timeline, sitting on the same node as the place's deep past. This uses the
convention the tree already applies to Sundaland/Beringia: modern names, with the changing map
explained in the narrative.

**Coverage follows signal, and is not hard-capped.** Continent- and region-level deep time is
genuinely differentiated (Australia's isolated marsupial rainforests vs Eurasia's placental
world and the rising Himalayas at 40 Mya are different stories worth comparing). It only goes
flat below the grain at which the natural-history signal varies — roughly the biogeographic
province — where "the land of Sydney vs the land of Canberra at 40 Mya" is the same Eocene
rainforest. That flattening is the tree's universal leaf condition, already handled by two
existing mechanisms: stop subdividing when a division adds nothing, and reuse a parent's content
when a child's would be identical (anchor reuse). No special "keep deep time brief" rule is
added; depth is governed by the same "only divide where there's a real difference" principle as
the rest of the tree.

### Why 66 Mya, and why uniform

66 Mya is a single, globally famous, unambiguous date, and it is roughly when the continents'
histories become independent enough to be worth telling apart. Before it the story is shared —
one fragmenting supercontinent, and behind that cosmic and planetary time — which is why it
belongs in the single Cosmic & Planetary branch. After it each continent diverges and carries
its own signal. A uniform threshold also replaces the current inconsistency (see §2), and it
serves the goal of letting a learner explore each continent's pre-human animal evolution.

The honest caveat, to be stated in content rather than hidden: at 66 Mya the continents are
distinct landmasses but not yet in their exact modern positions (India still crossing the ocean,
Australia still near Antarctica, the Isthmus of Panama not closed until ~3 Mya). The rule is
"distinct modern continents", not "the modern map".

## 2. What this replaces (current inconsistent state, observed in prod)

Each root C anchor currently picks its own temporal start, and Cosmic & Planetary overlaps them
all:

| Anchor | Current B-division span | Should become |
|---|---|---|
| Cosmic & Planetary | Big Bang → **present** (last period "Civilizations Rise: 10,000 BCE – present") | Big Bang → 66 Mya |
| Africa | **3000 BCE** → present | 66 Mya → present |
| Eurasia | **3.5 BYA** (geological formation) → present | 66 Mya → present |
| Americas | geological formation → present | 66 Mya → present |
| Oceania | human settlement → present | 66 Mya → present |

The standalone global level-1 **B (temporal) axis** (Deep Time 13.8 BYA–3 Mya, Foraging Era,
etc.) is **unaffected** — that is the pure time axis, not the geographic axis. The threshold
governs only what geographic framework applies at a given time.

## 3. Implementation

### 3.1 Root C anchor scopes + titles

Titles get an explicit range (decision: root C anchors only; deeper anchors inherit the
threshold as a constraint shown in the breadcrumb/UI, not in the title). Scopes are rewritten so
each continent starts at 66 Mya and Cosmic & Planetary owns everything before it.

- Files: `insert-level1c.js` (seed; note `ON CONFLICT (id) DO NOTHING`, so a separate DB UPDATE
  is required for the existing prod rows), and `src/data/treeStructure.js` (seed titles used by
  the frontend tree).

**Draft titles + scopes (for approval):**

- **Cosmic & Planetary (13.8 BYA – 66 Mya)** — "The history of the universe and of Earth before
  the modern continents took shape: the Big Bang and cosmic origins, the formation of galaxies,
  stars, the solar system and Earth, the emergence and early evolution of life, and the deep
  geological ages through the Palaeozoic and Mesozoic — including the supercontinents Pangaea and
  Gondwana and their breakup, and the age of the dinosaurs. It ends 66 million years ago at the
  Cretaceous–Paleogene extinction, when the modern continents begin their separate histories."

- **Africa (66 Mya – present)** — "The history of the African continent from 66 million years ago
  to the present: its Cenozoic ecological and faunal evolution, the formation of the Great Rift
  Valley, the emergence of humanity (Africa is the birthplace of our species), and the rise of
  its societies, kingdoms, empires, trade networks, colonial era, and modern nations. Africa's
  deeper geological past, as part of Gondwana and Pangaea, belongs to Cosmic & Planetary."

- **Eurasia (66 Mya – present)** — "The history of Earth's largest landmass from 66 million years
  ago to the present: the Cenozoic uplift of ranges such as the Himalayas as India collided with
  Asia, its ecological evolution, the spread of humans across it, and its emergence as the cradle
  of many of the world's empires, religions, technologies, and trade networks. Its deeper
  geological assembly belongs to Cosmic & Planetary."

- **Americas (66 Mya – present)** — "The history of North, Central, and South America from 66
  million years ago to the present: their long ecological isolation and distinctive faunas, the
  joining of the two continents at the Isthmus of Panama around 3 million years ago, the first
  human migrations via Beringia, indigenous civilisations, European colonisation, and the modern
  era. The earlier breakup of Pangaea belongs to Cosmic & Planetary."

- **Oceania (66 Mya – present)** — "The history of Australia, New Zealand, and the Pacific Islands
  from 66 million years ago to the present: their long ecological isolation and unique flora and
  fauna after separating from Gondwana, the final rifting of Australia from Antarctica, the
  volcanic birth of the Pacific islands, the deep history of Aboriginal Australians, the maritime
  settlement of the Pacific, European contact, and the modern era. The earlier breakup of
  Gondwana belongs to Cosmic & Planetary."

### 3.2 Threshold enforcement in generation

- Add a constant `GEO_THRESHOLD` (66 Mya) and a helper `geographicTemporalDomain(ancestorPath)`
  that finds the root-level C ancestor and returns its domain: Cosmic & Planetary (id
  `1C-I6J1K`) → `{ start: 'the Big Bang (13.8 BYA)', end: '66 million years ago' }`; any other
  continent → `{ start: '66 million years ago', end: 'the present' }`. (Ancestry-based, like the
  existing `SCIENCE_ROOTS` detection in narrative generation.)
- In `buildBreadthBPrompt` (`api/generate-anchors.js`): when the parent chain contains a
  geographic (C) ancestor, replace the vague "Time: Full historical timespan available" line
  with an explicit domain statement and a hard rule:
  - Continents: "This place's history runs from 66 million years ago to the present. Your
    **earliest** period MUST begin at 66 million years ago — the land's Cenozoic natural history
    and faunal evolution — never at the start of recorded civilisation."
  - Cosmic & Planetary: "This runs from the Big Bang to 66 million years ago. Your **latest**
    period MUST end at 66 million years ago (the Cretaceous–Paleogene boundary); it does not
    extend into human history."
- This also fixes the previously diagnosed "Africa B division starts at 3000 BCE" bug at its
  root, and the "Cosmic & Planetary extends to present" bug.

### 3.3 Design doc update

Update `Level_1_Structure_-_Key_Decisions` to state the uniform 66-Mya rule, correct the
per-continent dates (§2 table), and replace the "each geographic anchor defines its own temporal
scope / China ~5000 BCE" section with the "every place covers its land from 66 Mya; civilisation
is the recent chapters" rule.

### 3.4 Regeneration

Regenerate the B-division of all five root C anchors so their spans match the new rule
(continents start at 66 Mya; Cosmic & Planetary ends at 66 Mya). Then regenerate any
already-generated descendants of those periods (learn content, deeper anchors) — audit depth
first; most of the tree below level 1 is not yet generated. Sequence: anchors first (so the new
period boundaries exist), then learn content for periods that have it.

### 3.5 Verification

- Build green.
- After regenerating each root C anchor's B-division: confirm continents' earliest period begins
  ~66 Mya and Cosmic & Planetary's latest period ends ~66 Mya.
- Spot-check the five root titles/scopes live via `/api/get-tree` and `/api/get-generation-metadata`.

## 4. Open items / risks

- **Title format:** using "(66 Mya – present)" and "(13.8 BYA – 66 Mya)". Confirm concision vs
  spelling out "million years ago".
- **Regeneration blast radius:** five B-divisions plus any generated descendants; cost is one
  research + LLM pass per regenerated anchor. Audit descendant depth before running.
- **Anchor IDs / reuse:** regenerating a B-division creates new period anchors; existing learn
  content keyed to the old period IDs is orphaned. Confirm the regenerate path replaces cleanly
  (as the Africa learn-content regen did) and that anchor-reuse/dedup is unaffected.
- **The 66-Mya simplification** (continents not in exact modern positions at T) should be stated
  in the earliest-period content, not hidden.
