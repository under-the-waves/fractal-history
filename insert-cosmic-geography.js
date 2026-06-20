// Seed the hand-curated cosmic geography under "Cosmic & Planetary" (1C-I6J1K).
// Walks the COSMIC taxonomy in lib/geography.js and inserts one anchor per
// node, with bracketed time-period titles and region_codes pointing at the
// taxonomy. Idempotent (ON CONFLICT DO NOTHING).
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { COSMIC, displayTitle } from './lib/geography.js';

config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

const COSMIC_ROOT_ANCHOR = '1C-I6J1K'; // "Cosmic & Planetary" == the UNIVERSE node

// Point the existing Cosmic & Planetary anchor at the cosmic root so the ledger
// walks this tree instead of falling back to modern continents.
await sql`UPDATE anchors SET region_codes = ${JSON.stringify(['UNIVERSE'])} WHERE id = ${COSMIC_ROOT_ANCHOR}`;
console.log('Set Cosmic & Planetary region_codes = ["UNIVERSE"]');

let inserted = 0;
async function seed(code, parentPositionId, level) {
  const children = COSMIC[code].children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const id = `${level}C-${child}`; // id == position_id, matching the 1C seed style
    const title = displayTitle(child);
    const scope = COSMIC[child].scope || '';
    await sql`
      INSERT INTO anchors (id, title, scope, generation_status, region_codes)
      VALUES (${id}, ${title}, ${scope}, 'placeholder', ${JSON.stringify([child])})
      ON CONFLICT (id) DO NOTHING`;
    await sql`
      INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position)
      VALUES (${id}, ${id}, ${parentPositionId}, ${level}, 'C', ${i + 1})
      ON CONFLICT (position_id) DO NOTHING`;
    inserted++;
    await seed(child, id, level + 1);
  }
}

// UNIVERSE is level 1 (the Cosmic & Planetary anchor); its children start at level 2.
await seed('UNIVERSE', COSMIC_ROOT_ANCHOR, 2);
console.log(`Seeded ${inserted} cosmic anchors under Cosmic & Planetary.`);
process.exit(0);
