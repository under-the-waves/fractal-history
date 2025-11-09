import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Checking database contents...\n');

// Check tree_positions
const positions = await sql`SELECT * FROM tree_positions ORDER BY position_id`;
console.log('=== TREE POSITIONS ===');
console.log(`Found ${positions.length} positions:`);
positions.forEach(p => {
    console.log(`  ${p.position_id} → anchor: ${p.anchor_id}, parent: ${p.parent_position_id}`);
});

console.log('\n=== ANCHORS ===');
// Check anchors
const anchors = await sql`SELECT * FROM anchors ORDER BY id`;
console.log(`Found ${anchors.length} anchors:`);
anchors.forEach(a => {
    console.log(`  ${a.id}: ${a.title}`);
});