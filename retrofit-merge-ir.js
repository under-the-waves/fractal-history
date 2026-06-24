import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Industrial Revolution merge (the involved case). KEEP the hand-seeded level-1 anchor 1A-C9D3E;
// merge away the level-2 duplicate 2A-X1918. ALL children of BOTH copies (5 away + 7 canonical) are
// empty placeholders from the OLD generation pass, so they are DELETED outright (per user: the
// generation function has since been updated and will repopulate). Industrial Revolution is left
// childless, as one shared concept reachable from both places, with one score. The away anchor's
// position is repointed at the keep anchor (non-canonical), then the away anchor is deleted.
//
// DRY-RUN by default. --execute applies, writing a JSON backup of every deleted/changed row first.
const EXECUTE = process.argv.includes('--execute');
const KEEP = '1A-C9D3E';
const AWAY = '2A-X1918';

// Derive ALL children of both IR copies live, and assert each is an empty stub before deleting.
const allChildren = await sql`
    SELECT a.id, a.title, tp.breadth, tp.position_id,
        (SELECT count(*) FROM tree_positions t2 WHERE t2.parent_position_id = tp.position_id) AS grandkids,
        (SELECT count(*) FROM narratives n WHERE n.anchor_id = a.id) AS narratives,
        (SELECT count(*) FROM flashcards f WHERE f.anchor_id = a.id) AS cards,
        (SELECT count(*) FROM user_topic_scores s WHERE s.anchor_id = a.id) AS scores
    FROM tree_positions tp JOIN anchors a ON a.id = tp.anchor_id
    WHERE tp.parent_position_id IN (
        SELECT position_id FROM tree_positions WHERE anchor_id IN (${KEEP}, ${AWAY}))`;

const unsafe = allChildren.filter(c => Number(c.grandkids) || Number(c.narratives) || Number(c.cards) || Number(c.scores));

console.log(`Industrial Revolution: KEEP ${KEEP} <- MERGE AWAY ${AWAY}`);
console.log(`\nAway anchor ${AWAY} position will repoint to ${KEEP} (non-canonical), then ${AWAY} deleted.`);
console.log(`ALL ${allChildren.length} IR children (both copies) will be DELETED (must be empty stubs):`);
for (const c of allChildren) {
    console.log(`  [${c.breadth}] ${c.id} "${c.title}"  grandkids=${c.grandkids} narratives=${c.narratives} cards=${c.cards} scores=${c.scores}`);
}
if (unsafe.length) {
    console.log(`\nABORT: ${unsafe.length} child has real content; not safe to delete blindly. No changes made.`);
    process.exit(1);
}

console.log(`\nAfter this, Industrial Revolution (${KEEP}) will have 0 children, ready for regeneration.`);

if (!EXECUTE) {
    console.log('\nDRY-RUN only. Re-run with --execute to apply.');
    process.exit(0);
}

// Backup
const childAnchorIds = allChildren.map(c => c.id);
const childPositionIds = allChildren.map(c => c.position_id);
const backup = {
    ranAt: new Date().toISOString(), keep: KEEP, away: AWAY,
    awayAnchor: (await sql`SELECT * FROM anchors WHERE id = ${AWAY}`)[0],
    awayPosition: await sql`SELECT * FROM tree_positions WHERE anchor_id = ${AWAY}`,
    deletedChildAnchors: await sql`SELECT * FROM anchors WHERE id = ANY(${childAnchorIds})`,
    deletedChildPositions: await sql`SELECT * FROM tree_positions WHERE position_id = ANY(${childPositionIds})`,
};

await sql.transaction([
    // 1. delete ALL (empty) children of both IR copies: their positions, then their anchor rows
    sql`DELETE FROM tree_positions WHERE position_id = ANY(${childPositionIds})`,
    sql`DELETE FROM anchors WHERE id = ANY(${childAnchorIds})`,
    // 2. tidy now-stale generation metadata recorded under either IR copy as a parent
    sql`DELETE FROM anchor_generation_metadata WHERE parent_anchor_id IN (${KEEP}, ${AWAY})`,
    // 3. repoint the away position at the kept anchor (non-canonical), then delete the away anchor
    sql`UPDATE tree_positions SET anchor_id = ${KEEP}, is_canonical = false WHERE anchor_id = ${AWAY}`,
    sql`DELETE FROM anchors WHERE id = ${AWAY}`,
]);

const file = `backup-retrofit-ir-${backup.ranAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`\nEXECUTED. Backup written to ${file}`);

console.log('\n=== verification ===');
const awayGone = (await sql`SELECT count(*) n FROM anchors WHERE id = ${AWAY}`)[0].n === '0';
const childrenGone = (await sql`SELECT count(*) n FROM anchors WHERE id = ANY(${childAnchorIds})`)[0].n === '0';
const positions = await sql`SELECT position_id, level, is_canonical FROM tree_positions WHERE anchor_id = ${KEEP} ORDER BY is_canonical DESC`;
const canon = positions.filter(p => p.is_canonical).length;
const kids = (await sql`SELECT count(*) n FROM tree_positions WHERE parent_position_id IN (SELECT position_id FROM tree_positions WHERE anchor_id = ${KEEP})`)[0].n;
console.log(`  away-anchor deleted: ${awayGone ? 'yes' : 'NO'}`);
console.log(`  all ${childAnchorIds.length} children deleted: ${childrenGone ? 'yes' : 'NO'}`);
console.log(`  ${KEEP} positions: ${positions.map(p => `${p.position_id}(L${p.level},canon=${p.is_canonical})`).join('  ')}  canonical=${canon}`);
console.log(`  ${KEEP} children: ${kids} (expected 0)`);
