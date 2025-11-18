import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Inserting Level 1B (Temporal) anchors...\n');

try {
    // Insert the 5 Level 1B anchors
    await sql`
        INSERT INTO anchors (id, title, scope, generation_status) VALUES
        ('T4U9V', 'Deep Time: 13.8 BYA - 3 MYA', 'The universe from the Big Bang through the formation of Earth and the evolution of life until the emergence of the human lineage.', 'placeholder'),
        ('W1X6Y', 'Foraging Era: 3 MYA - 10,000 BCE', 'Human evolution and the long period of hunter-gatherer societies, including migration across the globe and adaptation to diverse environments.', 'placeholder'),
        ('Z5A3B', 'Agricultural Civilizations: 10,000 BCE - 1500 CE', 'The rise of agriculture, cities, states, empires, and world religions. Covers ancient and medieval civilizations globally.', 'placeholder'),
        ('C8D2E', 'Early Modern: 1500 - 1900 CE', 'Global integration through exploration, colonialism, scientific revolution, industrial revolution, and democratic revolutions.', 'placeholder'),
        ('F7G4H', 'Contemporary: 1900 - Present', 'The modern era including world wars, decolonization, Cold War, digital revolution, globalization, and climate crisis.', 'placeholder')
        ON CONFLICT (id) DO NOTHING
    `;
    console.log('✅ Inserted 5 Level 1B anchors');

    // Insert their tree positions
    await sql`
        INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position) VALUES
        ('1B-T4U9V', 'T4U9V', '0-ROOT', 1, 'B', 1),
        ('1B-W1X6Y', 'W1X6Y', '0-ROOT', 1, 'B', 2),
        ('1B-Z5A3B', 'Z5A3B', '0-ROOT', 1, 'B', 3),
        ('1B-C8D2E', 'C8D2E', '0-ROOT', 1, 'B', 4),
        ('1B-F7G4H', 'F7G4H', '0-ROOT', 1, 'B', 5)
        ON CONFLICT (position_id) DO NOTHING
    `;
    console.log('✅ Inserted 5 tree positions');

    console.log('\n✅ SUCCESS! Level 1B anchors ready.');

} catch (error) {
    console.error('❌ Error:', error.message);
}