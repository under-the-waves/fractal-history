import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { findScopeViolations, describeMembership } from './lib/scopeGrounding.js';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// READ-ONLY sweep: report every geographic anchor whose scope names a place outside its membership.
// Flagged = CANDIDATE lie (a scope may legitimately mention where members acted), so this reports
// with context for human review rather than changing anything.

const anchors = await sql`
    SELECT id, title, scope, region_codes
    FROM anchors
    WHERE region_codes IS NOT NULL
      AND region_codes::text NOT IN ('[]', 'null')
      AND region_codes::text NOT ILIKE '%cosmic%'
    ORDER BY title
`;

console.log(`Checking ${anchors.length} geographic anchors...\n`);

let flaggedCount = 0;
let violationCount = 0;
const byCountry = new Map();

for (const a of anchors) {
    const violations = findScopeViolations(a.scope, a.region_codes);
    if (violations.length === 0) continue;
    flaggedCount++;
    violationCount += violations.length;

    console.log(`■ ${a.id}  "${a.title}"`);
    console.log(`   covers: ${describeMembership(a.region_codes)}`);
    for (const v of violations) {
        console.log(`   ⚠ names "${v.place}" (${v.cca2s.join('/')}, ${v.kind}) — not in region`);
        console.log(`       …${v.context}…`);
        byCountry.set(v.place, (byCountry.get(v.place) || 0) + 1);
    }
    console.log('');
}

console.log('─'.repeat(70));
console.log(`${flaggedCount} of ${anchors.length} geographic anchors flagged, ${violationCount} candidate violations total.`);
console.log('\nMost-named out-of-region places:');
for (const [place, n] of [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`   ${String(n).padStart(3)}  ${place}`);
}
