import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Cleaning up orphaned anchors (NULL parent_position_id)...\n');

try {
    // First show what will be deleted
    console.log('--- Orphaned tree_positions to be deleted ---');
    const orphaned = await sql`
        SELECT tp.position_id, tp.anchor_id, a.title
        FROM tree_positions tp
        LEFT JOIN anchors a ON tp.anchor_id = a.id
        WHERE tp.parent_position_id IS NULL
        AND tp.anchor_id != '0-ROOT'
    `;
    console.log('Found:', orphaned.length);
    orphaned.forEach(o => console.log(`  ${o.position_id}: ${o.title || '(no title)'}`));

    if (orphaned.length === 0) {
        console.log('\nNo orphaned records to clean up!');
        process.exit(0);
    }

    // Get the anchor_ids to delete
    const anchorIds = orphaned.map(o => o.anchor_id);

    // Delete from tree_positions first (due to foreign key)
    console.log('\n--- Deleting from tree_positions ---');
    const deletedPositions = await sql`
        DELETE FROM tree_positions
        WHERE parent_position_id IS NULL
        AND anchor_id != '0-ROOT'
        RETURNING position_id
    `;
    console.log(`Deleted ${deletedPositions.length} tree_positions`);

    // Delete from anchors
    console.log('\n--- Deleting from anchors ---');
    const deletedAnchors = await sql`
        DELETE FROM anchors
        WHERE id = ANY(${anchorIds})
        RETURNING id, title
    `;
    console.log(`Deleted ${deletedAnchors.length} anchors`);
    deletedAnchors.forEach(a => console.log(`  ${a.id}: ${a.title}`));

    console.log('\n✅ Cleanup complete!');

    // Verify
    console.log('\n--- Verification ---');
    const remaining = await sql`
        SELECT tp.position_id, tp.anchor_id
        FROM tree_positions tp
        WHERE tp.parent_position_id IS NULL
        AND tp.anchor_id != '0-ROOT'
    `;
    console.log('Remaining orphaned:', remaining.length);

} catch (error) {
    console.error('Error:', error.message);
    console.error(error);
}
