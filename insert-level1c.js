import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Inserting Level 1C (Geographic) anchors...\n');

try {
    // Insert the 5 Level 1C anchors (using full IDs to match treeStructure.js)
    await sql`
        INSERT INTO anchors (id, title, scope, generation_status) VALUES
        ('1C-I6J1K', 'Cosmic & Planetary (13.8 BYA – 66 Mya)', 'The history of the universe and of Earth before the modern continents took shape: the Big Bang and cosmic origins, the formation of galaxies, stars, the solar system and Earth, the emergence and early evolution of life, and the deep geological ages through the Palaeozoic and Mesozoic – including the supercontinents Pangaea and Gondwana and their breakup, and the age of the dinosaurs. It ends 66 million years ago at the Cretaceous–Paleogene extinction, when the modern continents begin their separate histories.', 'placeholder'),
        ('1C-L3M8N', 'Africa (66 Mya – present)', 'The history of the African continent from 66 million years ago to the present: its Cenozoic ecological and faunal evolution, the formation of the Great Rift Valley, the emergence of humanity (Africa is the birthplace of our species), and the rise of its societies, kingdoms, empires, trade networks, colonial era, and modern nations. Africa''s deeper geological past, as part of Gondwana and Pangaea, belongs to Cosmic & Planetary.', 'placeholder'),
        ('1C-O9P5Q', 'Eurasia (66 Mya – present)', 'The history of Earth''s largest landmass from 66 million years ago to the present: the Cenozoic uplift of ranges such as the Himalayas as India collided with Asia, its ecological evolution, the spread of humans across it, and its emergence as the cradle of many of the world''s empires, religions, technologies, and trade networks. Its deeper geological assembly belongs to Cosmic & Planetary.', 'placeholder'),
        ('1C-R2S7T', 'Americas (66 Mya – present)', 'The history of North, Central, and South America from 66 million years ago to the present: their long ecological isolation and distinctive faunas, the joining of the two continents at the Isthmus of Panama around 3 million years ago, the first human migrations via Beringia, indigenous civilisations, European colonisation, and the modern era. The earlier breakup of Pangaea belongs to Cosmic & Planetary.', 'placeholder'),
        ('1C-U4V1W', 'Oceania (66 Mya – present)', 'The history of Australia, New Zealand, and the Pacific Islands from 66 million years ago to the present: their long ecological isolation and unique flora and fauna after separating from Gondwana, the final rifting of Australia from Antarctica, the volcanic birth of the Pacific islands, the deep history of Aboriginal Australians, the maritime settlement of the Pacific, European contact, and the modern era. The earlier breakup of Gondwana belongs to Cosmic & Planetary.', 'placeholder')
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
