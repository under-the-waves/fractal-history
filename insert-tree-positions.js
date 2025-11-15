import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Inserting tree positions for Level 1A anchors...\n');

try {
    // First insert ROOT if it doesn't exist
    await sql`
        INSERT INTO anchors (id, title, scope, generation_status) 
        VALUES ('0-ROOT', 'The Story of Everything', 'The complete history of the universe, Earth, life, and humanity from the Big Bang to the present day.', 'complete')
        ON CONFLICT (id) DO NOTHING
    `;
    console.log('✅ ROOT anchor ready');

    // Insert tree positions for ROOT and Level 1A
    await sql`
        INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position) VALUES
        ('0-ROOT', '0-ROOT', NULL, 0, 'ROOT', 1),
        ('1A-E8F2G', 'E8F2G', '0-ROOT', 1, 'A', 1),
        ('1A-Q7R2S', 'Q7R2S', '0-ROOT', 1, 'A', 2),
        ('1A-G7H2K', 'G7H2K', '0-ROOT', 1, 'A', 3),
        ('1A-C9D3E', 'C9D3E', '0-ROOT', 1, 'A', 4)
        ON CONFLICT (position_id) DO NOTHING
    `;
    console.log('✅ Inserted tree positions');

    console.log('\n✅ SUCCESS! All tree positions inserted.');

} catch (error) {
    console.error('❌ Error:', error.message);
}