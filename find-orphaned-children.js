import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Finding anchors with null or wrong parent_position_id...\n');

try {
    // Find tree_positions with null parent_position_id (except ROOT)
    console.log('--- Tree positions with NULL parent_position_id ---');
    const nullParent = await sql`
        SELECT tp.position_id, tp.anchor_id, tp.level, tp.breadth, a.title
        FROM tree_positions tp
        LEFT JOIN anchors a ON tp.anchor_id = a.id
        WHERE tp.parent_position_id IS NULL
        AND tp.anchor_id != '0-ROOT'
    `;
    console.log('Found:', nullParent.length);
    nullParent.forEach(n => console.log(`  ${n.position_id}: ${n.title || '(no title)'}`));

    // Find all level 2+ anchors and show their parent_position_id
    console.log('\n--- All Level 2+ tree_positions with their parent_position_id ---');
    const level2 = await sql`
        SELECT tp.position_id, tp.anchor_id, tp.parent_position_id, tp.level, tp.breadth, a.title
        FROM tree_positions tp
        LEFT JOIN anchors a ON tp.anchor_id = a.id
        WHERE tp.level >= 2
        ORDER BY tp.level, tp.parent_position_id
    `;
    level2.forEach(l => console.log(`  L${l.level}${l.breadth} ${l.anchor_id} -> parent: ${l.parent_position_id || 'NULL'} (${l.title || 'no title'})`));

} catch (error) {
    console.error('Error:', error.message);
}
