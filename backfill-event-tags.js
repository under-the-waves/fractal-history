import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { findExistingEventAnchor, wouldCreateCycle } from './lib/db.js';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Backfill own-extent tags on the retrofitted event anchors so NEW generation reuses them instead of
// re-minting the duplicates we just merged. Only genuine bounded datable events (WW1, WW2); the
// Industrial Revolution is an open-ended process, so it stays untagged (not reuse-eligible).
const EXECUTE = process.argv.includes('--execute');
const EVENTS = [
    { id: '2A-XKOOC', title: 'World War I', start: 1914, end: 1918 },
    { id: '2A-ZXA2P', title: 'World War II', start: 1939, end: 1945 },
];

console.log('Will tag as datable events:');
for (const e of EVENTS) console.log(`  ${e.id} "${e.title}"  ${e.start}-${e.end}`);

if (!EXECUTE) {
    console.log('\nDRY-RUN only. Re-run with --execute to apply.');
    process.exit(0);
}

for (const e of EVENTS) {
    await sql`UPDATE anchors SET is_datable_event = true, event_start_year = ${e.start}, event_end_year = ${e.end} WHERE id = ${e.id}`;
}
console.log('\nTagged. Verifying the reuse-detection path:');

// 1. exact title + dates -> matches the tagged anchor
const m1 = await findExistingEventAnchor('World War I', 1914, 1918);
console.log(`  findExistingEventAnchor('World War I', 1914, 1918) = ${m1}  ${m1 === '2A-XKOOC' ? 'PASS' : 'FAIL'}`);
// 2. case/space-insensitive title still matches
const m2 = await findExistingEventAnchor('  world war ii ', 1939, 1945);
console.log(`  case/space-insensitive 'World War II' = ${m2}  ${m2 === '2A-ZXA2P' ? 'PASS' : 'FAIL'}`);
// 3. wrong dates -> no false match (conservative)
const m3 = await findExistingEventAnchor('World War I', 1914, 1919);
console.log(`  wrong end-year -> ${m3}  ${m3 === null ? 'PASS (no false match)' : 'FAIL'}`);
// 4. synonym we deliberately DON'T catch -> null (mint fresh instead of risk a wrong merge)
const m4 = await findExistingEventAnchor('The Great War', 1914, 1918);
console.log(`  synonym 'The Great War' = ${m4}  ${m4 === null ? 'PASS (conservatively missed, by design)' : 'unexpected match'}`);
// 5. cycle guard: WW1 cannot be placed under its own descendant position
const ww1pos = (await sql`SELECT position_id FROM tree_positions WHERE anchor_id='2A-XKOOC' AND is_canonical`)[0].position_id;
const cyc = await wouldCreateCycle('2A-XKOOC', ww1pos);
console.log(`  wouldCreateCycle(WW1, its own position) = ${cyc}  ${cyc === true ? 'PASS (loop refused)' : 'FAIL'}`);
