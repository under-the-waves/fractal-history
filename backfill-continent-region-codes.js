// Backfill region_codes for the four terrestrial Level-1 continents.
//
// Why: insert-level1c.js seeded Africa, Eurasia, Americas, and Oceania WITHOUT
// region_codes (only Cosmic & Planetary was later backfilled, in
// insert-cosmic-geography.js). The generator treats NULL region_codes as "the
// whole world", so drilling geographically (breadth C) into Eurasia currently
// divides the entire planet instead of just Eurasia. Setting proper codes scopes
// each continent's geographic subdivision to itself, as the Level-1 design intends
// (e.g. Eurasia -> East Asia, South Asia, Europe, Middle East, Central Asia).
//
// Safety:
//   - DRY RUN by default. Pass --apply to write.
//   - Validates every code against the geography ledger before doing anything.
//   - Only touches the four named anchor IDs; never Cosmic & Planetary or anything
//     the system has generated.
//   - No deletes. Nothing in the codebase cleans up anchors by region_codes
//     (cleanup-orphaned.js keys off parent_position_id IS NULL, not region_codes),
//     so this is purely additive.
//
// Usage:
//   node backfill-continent-region-codes.js          # dry run, prints plan
//   node backfill-continent-region-codes.js --apply   # writes the updates

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { getLevel, getName, expandToCandidates, WORLD } from './lib/geography.js';

config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes('--apply');

// The four terrestrial continents and the ledger region codes each should cover.
// Note: the ledger has no single "Eurasia" code — world-countries splits it into
// the Asia and Europe regions — so Eurasia takes both.
const TARGETS = [
  { id: '1C-L3M8N', title: 'Africa',   codes: ['Africa'] },
  { id: '1C-O9P5Q', title: 'Eurasia',  codes: ['Asia', 'Europe'] },
  { id: '1C-R2S7T', title: 'Americas', codes: ['Americas'] },
  { id: '1C-U4V1W', title: 'Oceania',  codes: ['Oceania'] },
];

function preview(codes) {
  const cands = expandToCandidates(codes);
  return { count: cands.length, sample: cands.slice(0, 8).map(getName) };
}

console.log(`\n=== Backfill continent region_codes (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

// 1. Validate all codes are real region-level places before touching anything.
let invalid = false;
for (const t of TARGETS) {
  for (const code of t.codes) {
    const level = getLevel(code);
    if (level !== 'region') {
      console.error(`  ✗ ${t.title}: "${code}" is not a region code (ledger level: ${level ?? 'unknown'})`);
      invalid = true;
    }
  }
}
if (invalid) {
  console.error('\nAborting: one or more codes are not valid region codes.');
  process.exit(1);
}
console.log('All target codes validated as region-level places.\n');

// 2. Show the before/after for each continent, including what its breadth-C
//    subdivision offers now (NULL -> whole world) versus after the backfill.
for (const t of TARGETS) {
  const rows = await sql`SELECT region_codes FROM anchors WHERE id = ${t.id} LIMIT 1`;
  if (rows.length === 0) {
    console.log(`  ! ${t.id} (${t.title}) not found — skipping.`);
    continue;
  }
  const current = rows[0].region_codes; // null today
  const now = preview(Array.isArray(current) && current.length ? current : [WORLD]);
  const after = preview(t.codes);

  console.log(`${t.title}  (${t.id})`);
  console.log(`  current region_codes : ${current ? JSON.stringify(current) : 'NULL  -> falls back to WORLD'}`);
  console.log(`  divides NOW   into ${now.count} places: ${now.sample.join(', ')}${now.count > 8 ? ', …' : ''}`);
  console.log(`  will set region_codes: ${JSON.stringify(t.codes)}`);
  console.log(`  divides AFTER into ${after.count} places: ${after.sample.join(', ')}${after.count > 8 ? ', …' : ''}`);
  console.log('');
}

// 3. Apply, or explain how to.
if (!APPLY) {
  console.log('DRY RUN — no changes written. Re-run with --apply to write the four updates.\n');
  process.exit(0);
}

console.log('Applying updates...\n');
for (const t of TARGETS) {
  const updated = await sql`
    UPDATE anchors
    SET region_codes = ${JSON.stringify(t.codes)}
    WHERE id = ${t.id}
    RETURNING id, title, region_codes`;
  if (updated.length > 0) {
    console.log(`  ✅ ${updated[0].title} (${updated[0].id}) -> ${JSON.stringify(updated[0].region_codes)}`);
  } else {
    console.log(`  ! ${t.id} (${t.title}) not updated (not found).`);
  }
}

// 4. Verify final state of all five Level-1 geographic anchors.
console.log('\n--- Verification: all Level-1 C anchors ---');
const final = await sql`
  SELECT a.id, a.title, a.region_codes
  FROM anchors a
  JOIN tree_positions tp ON a.id = tp.anchor_id
  WHERE tp.level = 1 AND tp.breadth = 'C'
  ORDER BY tp.position ASC`;
final.forEach(r => console.log(`  ${r.title}: ${r.region_codes ? JSON.stringify(r.region_codes) : 'NULL'}`));

console.log('\n✅ Backfill complete.\n');
process.exit(0);
