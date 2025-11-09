import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Inserting Level 1A anchors...\n');

try {
    // Insert the 4 Level 1A anchors with scope
    await sql`
    INSERT INTO anchors (id, title, scope, generation_status) VALUES
    ('E8F2G', 'Emergence of Life on Earth', 'The origin and early evolution of life on Earth, from first self-replicating molecules to complex multicellular organisms. ~4 billion years ago to ~600 million years ago.', 'placeholder'),
    ('Q7R2S', 'Evolution of Humans', 'The evolutionary history of the human lineage from primate ancestors to modern Homo sapiens, including cognitive and physical adaptations. ~7 million years ago to ~300,000 years ago.', 'placeholder'),
    ('G7H2K', 'Agricultural Revolution', 'The transition from hunter-gatherer societies to agricultural civilizations through plant and animal domestication. ~10,000 BCE to ~3,000 BCE.', 'placeholder'),
    ('C9D3E', 'Industrial Revolution', 'The transformation from agrarian economies to industrial manufacturing through mechanization, fossil fuels, and factory production. ~1750 to ~1900 CE.', 'placeholder')
  `;
    console.log('✅ Inserted 4 anchors');

    // Insert their tree positions
    await sql`
    INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position) VALUES
    ('1A-E8F2G', 'E8F2G', '0-ROOT', 1, 'A', 1),
    ('1A-Q7R2S', 'Q7R2S', '0-ROOT', 1, 'A', 2),
    ('1A-G7H2K', 'G7H2K', '0-ROOT', 1, 'A', 3),
    ('1A-C9D3E', 'C9D3E', '0-ROOT', 1, 'A', 4)
  `;
    console.log('✅ Inserted 4 tree positions');

    console.log('\n✅ SUCCESS! All Level 1A anchors inserted.');

} catch (error) {
    console.error('❌ Error:', error.message);
}