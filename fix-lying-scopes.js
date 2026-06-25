import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { findScopeViolations, describeMembership } from './lib/scopeGrounding.js';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Fix the geographic anchors whose scope named a place outside their membership (found by the
// sweep). Each rewrite removes only the out-of-region claim; connections ("traded with X") are kept.
// The one flagged anchor NOT fixed is 3A-M7BO1 "Indus Valley" — its "connecting to Mesopotamia" is a
// legitimate connection, not a membership claim, so it is left alone.
//
// DRY-RUN by default (shows before/after + re-checks each rewrite). Pass --execute to apply.
const EXECUTE = process.argv.includes('--execute');

const FIXES = [
    { id: 'anc-7O13G7NV', scope: "The Ottoman Empire's Asian territories, the Arabian Peninsula, and the Central Asian khanates—contested between European powers (Britain, Russia, France), undergoing territorial dismemberment, oil and trade competition, and resistance to imperial partition schemes." },
    { id: '3A-H0BYT', scope: "The Levant, Mesopotamia, Anatolia, and the Arabian Peninsula; centers of empire, trade, and religious development throughout history." },
    { id: 'anc-N0V74T64', scope: "Central America and South America under Spanish rule: indigenous civilizations, conquest and colonial administration, encomienda and labor systems, creole societies, independence movements, and post-colonial state formation." },
    { id: '2A-SBNT6', scope: "Western and Northern Europe (Britain, France, the Netherlands, Belgium) as the primary driver of exploration, colonialism, the scientific revolution, and the industrial revolution. These nations led global trade networks, established overseas empires, and exported capital, technology, and political models worldwide." },
    { id: '3A-D8XEL', scope: "France, the Netherlands, and Belgium—Western European nations that drove exploration, colonialism, the scientific revolution, the industrial revolution, and global trade dominance. Their governments, merchants, scientists, and military forces established overseas empires, controlled trade networks, and exported capital, technology, and political models worldwide." },
    { id: 'anc-IV0C6IYE', scope: "Turkmenistan, which connected Central Asia to the Persian Gulf, Caspian trade routes, and Indian Ocean networks. It hosted important trade cities and was a crucial intermediary in the flow of goods, ideas, and peoples between the Persian world and the steppes." },
    { id: '4A-ID8OY', scope: "Belgium as a merchant and colonial power controlling trade networks, financing exploration, and exporting capital and technology worldwide. A core power in this topic." },
];

let allClean = true;
for (const f of FIXES) {
    const [row] = await sql`SELECT title, region_codes, scope FROM anchors WHERE id = ${f.id}`;
    const after = findScopeViolations(f.scope, row.region_codes);
    if (after.length) allClean = false;
    console.log(`\n=== ${f.id} "${row.title}" ===`);
    console.log(`covers: ${describeMembership(row.region_codes)}`);
    console.log(`  OLD: ${row.scope}`);
    console.log(`  NEW: ${f.scope}`);
    console.log(`  re-check on NEW: ${after.length === 0 ? 'clean ✓' : 'STILL FLAGS: ' + after.map(v => v.place).join(', ')}`);
}

if (!EXECUTE) {
    console.log(`\nDRY-RUN. ${allClean ? 'All rewrites pass the check.' : 'Some rewrites still flag — review before executing.'} Re-run with --execute to apply.`);
    process.exit(0);
}

for (const f of FIXES) {
    await sql`UPDATE anchors SET scope = ${f.scope}, updated_at = NOW() WHERE id = ${f.id}`;
}
console.log(`\nEXECUTED: ${FIXES.length} scopes updated.`);
