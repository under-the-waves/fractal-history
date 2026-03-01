import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Testing get-tree query for 1B-F7G4H (Contemporary: 1900 - Present)...\n');

try {
    const parentId = '1B-F7G4H';
    const breadth = 'A';

    // First, check if the parent has a tree_position entry
    console.log('1. Checking parent tree_position...');
    const parentPos = await sql`
        SELECT position_id, anchor_id, level FROM tree_positions
        WHERE anchor_id = ${parentId}
    `;
    console.log('   Parent tree_position:', parentPos);

    // Run the same query as get-tree.js
    console.log('\n2. Running get-tree query...');
    const children = await sql`
        SELECT a.id, a.title, a.scope, tp.level, tp.breadth, tp.position, tp.parent_position_id
        FROM anchors a
        JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE tp.parent_position_id = (
            SELECT position_id FROM tree_positions WHERE anchor_id = ${parentId} LIMIT 1
        )
        AND tp.breadth = ${breadth}
        ORDER BY tp.position ASC
    `;

    console.log('   Children found:', children.length);
    children.forEach(c => console.log(`   - ${c.id}: ${c.title}`));

    // Simulate the API response
    console.log('\n3. Simulated API response:');
    console.log(JSON.stringify({
        success: true,
        count: children.length,
        parentId,
        breadth,
        anchors: children
    }, null, 2));

} catch (error) {
    console.error('Error:', error.message);
}
