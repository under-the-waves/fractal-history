import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Checking database state...\n');

try {
    // Check for any anchors that are children of 1B-F7G4H
    console.log('--- Children of 1B-F7G4H (Contemporary: 1900 - Present) ---');
    const children = await sql`
        SELECT tp.position_id, tp.anchor_id, tp.breadth, tp.level, a.title
        FROM tree_positions tp
        LEFT JOIN anchors a ON tp.anchor_id = a.id
        WHERE tp.parent_position_id = '1B-F7G4H'
        ORDER BY tp.breadth, tp.position
    `;
    console.log('Children found:', children.length);
    children.forEach(c => console.log(`  ${c.breadth}: ${c.anchor_id} - ${c.title || '(no anchor record)'}`));

    // Check for orphaned tree_positions (no matching anchor)
    console.log('\n--- Orphaned tree_positions (no matching anchor) ---');
    const orphaned = await sql`
        SELECT tp.position_id, tp.anchor_id, tp.parent_position_id, tp.level, tp.breadth
        FROM tree_positions tp
        LEFT JOIN anchors a ON tp.anchor_id = a.id
        WHERE a.id IS NULL
    `;
    console.log('Orphaned count:', orphaned.length);
    orphaned.forEach(o => console.log(`  ${o.position_id} -> anchor_id: ${o.anchor_id} (missing)`));

    // Check all level 2+ anchors
    console.log('\n--- All Level 2+ anchors in database ---');
    const level2plus = await sql`
        SELECT a.id, a.title, tp.level, tp.breadth, tp.parent_position_id
        FROM anchors a
        JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE tp.level >= 2
        ORDER BY tp.parent_position_id, tp.level, tp.breadth, tp.position
    `;
    console.log('Level 2+ anchors:', level2plus.length);
    level2plus.forEach(a => console.log(`  L${a.level}${a.breadth} [parent: ${a.parent_position_id}] ${a.id}: ${a.title}`));

    // Check for any old-format IDs still in the database
    console.log('\n--- Checking for old-format short IDs ---');
    const oldFormat = await sql`
        SELECT id, title FROM anchors
        WHERE id !~ '^[0-9]+[A-Z]-' AND id != '0-ROOT'
    `;
    console.log('Anchors with old format IDs:', oldFormat.length);
    oldFormat.forEach(a => console.log(`  ${a.id}: ${a.title}`));

} catch (error) {
    console.error('Error:', error.message);
}
