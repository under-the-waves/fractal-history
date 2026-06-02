import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Inserting Level 1C (Geographic) anchors...\n');

try {
    // Insert the 5 Level 1C anchors (using full IDs to match treeStructure.js)
    await sql`
        INSERT INTO anchors (id, title, scope, generation_status) VALUES
        ('1C-I6J1K', 'Cosmic & Planetary', 'The history of the universe and the Earth itself before and beneath human history: cosmic origins, the formation of the solar system and Earth, and the geological, oceanic, and climatic systems that set the stage for life.', 'placeholder'),
        ('1C-L3M8N', 'Africa', 'The history of the African continent from the formation of its ancient cratons billions of years ago and its central place in the supercontinents Gondwana and Pangaea, through its geological and ecological evolution, to its role as the birthplace of humanity and the rise of its civilisations, empires, and trade networks.', 'placeholder'),
        ('1C-O9P5Q', 'Eurasia', 'The history of Earth''s largest landmass, assembled over hundreds of millions of years as tectonic plates collided to raise ranges like the Himalayas, through its geological and ecological development, to its emergence as the cradle of many of the world''s empires, religions, technologies, and trade networks.', 'placeholder'),
        ('1C-R2S7T', 'Americas', 'The history of North, Central, and South America, from the breakup of Pangaea that opened the Atlantic and the much later joining of the two continents at the Isthmus of Panama, through their geological and ecological evolution, to the first human migrations, indigenous civilisations, colonisation, and the modern era.', 'placeholder'),
        ('1C-U4V1W', 'Oceania', 'The history of Australia, New Zealand, and the Pacific Islands, from the rifting of Australia and Zealandia away from Gondwana and the volcanic birth of the Pacific islands, through their long ecological isolation, to the deep history of Aboriginal Australians and the maritime settlement of the Pacific.', 'placeholder')
        ON CONFLICT (id) DO NOTHING
    `;
    console.log('✅ Inserted 5 Level 1C anchors');

    // Insert their tree positions
    await sql`
        INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position) VALUES
        ('1C-I6J1K', '1C-I6J1K', '0-ROOT', 1, 'C', 1),
        ('1C-L3M8N', '1C-L3M8N', '0-ROOT', 1, 'C', 2),
        ('1C-O9P5Q', '1C-O9P5Q', '0-ROOT', 1, 'C', 3),
        ('1C-R2S7T', '1C-R2S7T', '0-ROOT', 1, 'C', 4),
        ('1C-U4V1W', '1C-U4V1W', '0-ROOT', 1, 'C', 5)
        ON CONFLICT (position_id) DO NOTHING
    `;
    console.log('✅ Inserted 5 tree positions');

    console.log('\n✅ SUCCESS! Level 1C anchors ready.');

} catch (error) {
    console.error('❌ Error:', error.message);
}
