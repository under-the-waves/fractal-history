// Delete a parent anchor's geographic (breadth-C) division and its whole subtree, so the next
// drill-in regenerates it under the country-grouping scheme (see
// "project knowledge/Geographic_Country_Grouping_Design.md").
//
// Usage:
//   node regenerate-c-division.js <parent-anchor-id>            # dry run: print what would go
//   node regenerate-c-division.js <parent-anchor-id> --commit   # actually delete
//
// What it deletes:
//   - every tree_position in the subtree rooted at the parent's C children
//   - every anchor in that subtree that is not mounted at a position outside it
//     (flashcards, user_topic_scores, learn_content, learn_marks, mastered_narratives
//     cascade with the anchor; narratives do not and are deleted explicitly)
//   - anchor_generation_metadata for deleted anchors, plus the parent's own C-division row
//
// Anchors also mounted outside the subtree keep their anchor row and all content; only
// their positions inside the subtree are removed. The parent's other breadths (A/B) are
// untouched. generation_locks needs no cleanup: locks are released after generation and
// stale ones are stolen after 90 seconds.

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const rawSql = neon(process.env.DATABASE_URL);

// The Neon HTTP driver intermittently drops connections (ECONNRESET). Retry each statement a few
// times so a transient flake cannot abort the script mid-deletion and leave a partial state.
async function sql(strings, ...values) {
    let lastErr;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            return await rawSql(strings, ...values);
        } catch (err) {
            lastErr = err;
            const transient = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(String(err?.message) + String(err?.sourceError));
            if (!transient || attempt === 4) throw err;
            console.log(`  (transient connection error, retry ${attempt}/3...)`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw lastErr;
}

const parentId = process.argv[2];
const commit = process.argv.includes('--commit');

if (!parentId) {
    console.error('Usage: node regenerate-c-division.js <parent-anchor-id> [--commit]');
    process.exit(1);
}

const parent = await sql`SELECT id, title FROM anchors WHERE id = ${parentId}`;
if (parent.length === 0) {
    console.error(`No anchor found with id ${parentId}`);
    process.exit(1);
}
console.log(`Parent: ${parent[0].id} — ${parent[0].title}`);
console.log(commit ? 'MODE: COMMIT (deleting)\n' : 'MODE: DRY RUN (nothing will be deleted)\n');

// Collect the full subtree under the parent's C children.
const subtree = await sql`
    WITH RECURSIVE sub AS (
        SELECT tp.position_id, tp.anchor_id
        FROM tree_positions tp
        WHERE tp.parent_position_id IN (
            SELECT position_id FROM tree_positions WHERE anchor_id = ${parentId}
        ) AND tp.breadth = 'C'
        UNION ALL
        SELECT tp.position_id, tp.anchor_id
        FROM tree_positions tp
        JOIN sub s ON tp.parent_position_id = s.position_id
    )
    SELECT * FROM sub`;

if (subtree.length === 0) {
    console.log('No C children found — nothing to delete.');
    process.exit(0);
}

const positionIds = subtree.map(s => s.position_id);
const anchorIds = [...new Set(subtree.map(s => s.anchor_id))];

// Anchors also mounted at positions outside the subtree survive; only exclusive ones go.
const shared = await sql`
    SELECT DISTINCT tp.anchor_id FROM tree_positions tp
    WHERE tp.anchor_id = ANY(${anchorIds})
      AND NOT (tp.position_id = ANY(${positionIds}))`;
const sharedIds = new Set(shared.map(r => r.anchor_id));
const exclusiveIds = anchorIds.filter(id => !sharedIds.has(id));

console.log(`Subtree positions:            ${positionIds.length}`);
console.log(`Distinct anchors:             ${anchorIds.length}`);
console.log(`  kept (mounted elsewhere):   ${sharedIds.size}  ${[...sharedIds].join(', ')}`);
console.log(`  deleted (exclusive):        ${exclusiveIds.length}`);

const count = async (label, rows) => console.log(`${label} ${rows[0].n}`);
await count('Narratives to delete:         ', await sql`SELECT count(*)::int n FROM narratives WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Flashcards (cascade):         ', await sql`SELECT count(*)::int n FROM flashcards WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Score rows (cascade):         ', await sql`SELECT count(*)::int n FROM user_topic_scores WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Learn content (cascade):      ', await sql`SELECT count(*)::int n FROM learn_content WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Learn marks (cascade):        ', await sql`SELECT count(*)::int n FROM learn_marks WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Mastered narratives (cascade):', await sql`SELECT count(*)::int n FROM mastered_narratives WHERE anchor_id = ANY(${exclusiveIds})`);
await count('Generation metadata:          ', await sql`SELECT count(*)::int n FROM anchor_generation_metadata WHERE parent_anchor_id = ANY(${exclusiveIds}) OR (parent_anchor_id = ${parentId} AND breadth = 'C')`);

if (!commit) {
    console.log('\nDry run complete. Re-run with --commit to delete.');
    process.exit(0);
}

console.log('\n--- Deleting ---');
const delNarr = await sql`DELETE FROM narratives WHERE anchor_id = ANY(${exclusiveIds}) RETURNING id`;
console.log(`narratives: ${delNarr.length}`);
const delMeta = await sql`
    DELETE FROM anchor_generation_metadata
    WHERE parent_anchor_id = ANY(${exclusiveIds}) OR (parent_anchor_id = ${parentId} AND breadth = 'C')
    RETURNING id`;
console.log(`anchor_generation_metadata: ${delMeta.length}`);
const delPos = await sql`DELETE FROM tree_positions WHERE position_id = ANY(${positionIds}) RETURNING position_id`;
console.log(`tree_positions: ${delPos.length}`);
const delAnchors = await sql`DELETE FROM anchors WHERE id = ANY(${exclusiveIds}) RETURNING id`;
console.log(`anchors: ${delAnchors.length} (dependent flashcards/scores/learn rows cascaded)`);

// Verify no orphans were left behind (a position whose parent no longer exists).
const orphans = await sql`
    SELECT count(*)::int n FROM tree_positions tp
    WHERE tp.parent_position_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tree_positions p WHERE p.position_id = tp.parent_position_id)`;
console.log(`\nVerification — orphaned positions remaining: ${orphans[0].n}`);
console.log('Done. Next drill into this parent\'s C axis will regenerate under country grouping.');
