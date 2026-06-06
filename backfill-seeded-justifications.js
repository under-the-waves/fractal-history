// Backfill "Why these Anchors?" metadata for the hand-seeded groupings (the
// Level-1 continents and the cosmic scaffold), which have no AI generation
// reasoning. Matches the shape the generator writes: candidates with title +
// scope, plus a short selection_reasoning. Idempotent (won't overwrite real rows).
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// parent anchor id -> curated reasoning (id == position_id for these seeded anchors)
const REASONINGS = {
  '0-ROOT': 'These five anchors give complete spatial coverage of all history: Cosmic & Planetary holds everything before regional divisions exist, while Africa, Eurasia, the Americas, and Oceania each carry one of the great landmasses from its geological origins to the present.',
  '1C-I6J1K': "Our galaxy and everything outside it together span the whole cosmos: the Milky Way contains the Sun and the Solar System where Earth's story unfolds, while Beyond the Milky Way gathers the wider universe of other galaxies and large-scale structure.",
  '2C-MILKY_WAY': 'The Solar System is singled out as the corner of the galaxy that produced the Sun, the planets, and Earth, while the Wider Milky Way covers the rest of our galaxy — its core, other stars, and nebulae.',
  '3C-SOLAR_SYSTEM': 'These four divisions cover everything bound to the Sun — the star itself, the rocky inner planets, the giant outer planets, and the small bodies of leftover debris — the standard way astronomers partition the Solar System.',
  '4C-TERRESTRIAL_PLANETS': 'The four rocky inner planets each take an anchor; Earth carries by far the richest history and branches on into its Moon and its deep-time geography.',
  '4C-GIANT_PLANETS': 'The four large outer planets split by composition: the hydrogen-and-helium gas giants Jupiter and Saturn, and the ice-rich Uranus and Neptune.',
  '5C-EARTH_BODY': 'Earth divides into the Moon, formed alongside it from a giant impact, and its deep-time geography — the changing face of the young planet before the modern continents took shape.',
  '5C-GAS_GIANTS': 'Jupiter and Saturn, the two largest planets, each anchored together with its extensive system of moons.',
  '5C-ICE_GIANTS': 'Uranus and Neptune, the outermost major planets, each carrying its principal moons.',
  '6C-EARTH_DEEP_TIME': "The major stages of Earth's pre-continental surface: the earliest Hadean and Archean crust, then the great supercontinents Rodinia, Gondwana, and Pangaea, whose breakup led to today's continents.",
  '6C-JUPITER': 'Jupiter’s four large Galilean moons — the first worlds ever seen orbiting another planet — from volcanic Io to ocean-bearing Europa and giant Ganymede.',
  '6C-SATURN': 'Saturn’s most significant moons, led by Titan with its thick atmosphere and the ocean-venting Enceladus, alongside the icy Rhea and two-toned Iapetus.',
  '6C-URANUS': 'The four largest moons of Uranus, from bright, geologically young Ariel to the heavily cratered Titania and Oberon.',
  '6C-NEPTUNE': "Triton, Neptune's large moon, which orbits backwards and is most likely a Kuiper-belt object captured by the planet's gravity.",
};

let done = 0;
for (const [parentId, reasoning] of Object.entries(REASONINGS)) {
  const children = await sql`
    SELECT a.title, a.scope
    FROM anchors a JOIN tree_positions tp ON a.id = tp.anchor_id
    WHERE tp.parent_position_id = ${parentId} AND tp.breadth = 'C'
    ORDER BY tp.position`;
  if (children.length === 0) { console.log(`skip ${parentId}: no C children found`); continue; }
  const candidates = children.map(c => ({ title: c.title, scope: c.scope, selected: true }));
  const finalSelection = children.map(c => ({ title: c.title, scope: c.scope }));
  await sql`
    INSERT INTO anchor_generation_metadata
      (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning, raw_response)
    VALUES (${parentId}, 'C', ${JSON.stringify(candidates)}, ${JSON.stringify(finalSelection)}, ${reasoning}, NULL)
    ON CONFLICT (parent_anchor_id, breadth) DO NOTHING`;
  done++;
  console.log(`backfilled ${parentId} (${children.length} children)`);
}
console.log(`\nBackfilled ${done} seeded grouping(s).`);
process.exit(0);
