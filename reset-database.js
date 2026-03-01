import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// IDs to preserve
const PRESERVED_ANCHOR_IDS = [
    '0-ROOT',
    // Level 1A
    'E8F2G', 'Q7R2S', 'G7H2K', 'C9D3E',
    // Level 1B
    'T4U9V', 'W1X6Y', 'Z5A3B', 'C8D2E', 'F7G4H'
];

const PRESERVED_POSITION_IDS = [
    '0-ROOT',
    // Level 1A
    '1A-E8F2G', '1A-Q7R2S', '1A-G7H2K', '1A-C9D3E',
    // Level 1B
    '1B-T4U9V', '1B-W1X6Y', '1B-Z5A3B', '1B-C8D2E', '1B-F7G4H'
];

// Hard-coded metadata for Level 1A (Analytical anchors)
const LEVEL_1A_METADATA = {
    parent_anchor_id: '0-ROOT',
    breadth: 'A',
    candidates: [
        {
            title: 'Emergence of Life on Earth',
            scope: 'The origin and early evolution of life on Earth, from first self-replicating molecules to complex multicellular organisms.',
            causalSignificance: 10,
            humanImpact: 9,
            finalScore: 9.5,
            selected: true
        },
        {
            title: 'Evolution of Humans',
            scope: 'The evolutionary history of the human lineage from primate ancestors to modern Homo sapiens.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Agricultural Revolution',
            scope: 'The transition from hunter-gatherer societies to agricultural civilizations through plant and animal domestication.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Industrial Revolution',
            scope: 'The transformation from agrarian economies to industrial manufacturing through mechanization and fossil fuels.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Cognitive Revolution',
            scope: 'The emergence of language, abstract thinking, and symbolic culture in Homo sapiens ~70,000 years ago.',
            causalSignificance: 9,
            humanImpact: 9,
            finalScore: 9.0,
            selected: false
        },
        {
            title: 'Scientific Revolution',
            scope: 'The transformation in understanding nature through empirical observation and mathematical reasoning.',
            causalSignificance: 8,
            humanImpact: 8,
            finalScore: 8.0,
            selected: false
        },
        {
            title: 'Digital Revolution',
            scope: 'The shift from analog to digital technology, creating global information networks.',
            causalSignificance: 7,
            humanImpact: 8,
            finalScore: 7.5,
            selected: false
        },
        {
            title: 'Formation of Earth',
            scope: 'The accretion and differentiation of Earth from the solar nebula, creating conditions for life.',
            causalSignificance: 9,
            humanImpact: 6,
            finalScore: 7.5,
            selected: false
        },
        {
            title: 'Colonialism and Global Integration',
            scope: 'European expansion creating interconnected global systems of trade, migration, and cultural exchange.',
            causalSignificance: 7,
            humanImpact: 9,
            finalScore: 8.0,
            selected: false
        },
        {
            title: 'Rise of World Religions',
            scope: 'The emergence and spread of major religions shaping moral frameworks and social organization.',
            causalSignificance: 7,
            humanImpact: 8,
            finalScore: 7.5,
            selected: false
        }
    ],
    final_selection: [
        { id: 'E8F2G', title: 'Emergence of Life on Earth', position: 1 },
        { id: 'Q7R2S', title: 'Evolution of Humans', position: 2 },
        { id: 'G7H2K', title: 'Agricultural Revolution', position: 3 },
        { id: 'C9D3E', title: 'Industrial Revolution', position: 4 }
    ],
    selection_reasoning: `These four anchors represent the most fundamental phase transitions in the history of Earth and humanity:

1. **Emergence of Life** - Without this, nothing else follows. The origin of self-replicating molecules and their evolution into complex life is the foundation of all biological history.

2. **Evolution of Humans** - The emergence of Homo sapiens with our unique cognitive abilities made possible all subsequent human history, culture, and technology.

3. **Agricultural Revolution** - This transformation enabled permanent settlements, population growth, social stratification, and the rise of civilizations. It fundamentally changed how humans relate to nature and each other.

4. **Industrial Revolution** - The shift to fossil fuel energy and mechanized production created the modern world, enabling unprecedented population growth, technological advancement, and global integration.

These represent irreversible transformations where returning to the previous state became impossible. Each unlocked entirely new possibilities while closing off others.`
};

// Hard-coded metadata for Level 1B (Temporal anchors)
const LEVEL_1B_METADATA = {
    parent_anchor_id: '0-ROOT',
    breadth: 'B',
    candidates: [
        {
            title: 'Deep Time: 13.8 BYA - 3 MYA',
            scope: 'The universe from the Big Bang through the formation of Earth and evolution of life until the human lineage.',
            causalSignificance: 10,
            humanImpact: 8,
            finalScore: 9.0,
            selected: true
        },
        {
            title: 'Foraging Era: 3 MYA - 10,000 BCE',
            scope: 'Human evolution and hunter-gatherer societies, including migration across the globe.',
            causalSignificance: 9,
            humanImpact: 9,
            finalScore: 9.0,
            selected: true
        },
        {
            title: 'Agricultural Civilizations: 10,000 BCE - 1500 CE',
            scope: 'The rise of agriculture, cities, states, empires, and world religions globally.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Early Modern: 1500 - 1900 CE',
            scope: 'Global integration through exploration, colonialism, scientific and industrial revolutions.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Contemporary: 1900 - Present',
            scope: 'World wars, decolonization, Cold War, digital revolution, globalization, and climate crisis.',
            causalSignificance: 10,
            humanImpact: 10,
            finalScore: 10.0,
            selected: true
        },
        {
            title: 'Cosmic Era: 13.8 BYA - 4.5 BYA',
            scope: 'From the Big Bang to the formation of our solar system, before Earth existed.',
            causalSignificance: 8,
            humanImpact: 5,
            finalScore: 6.5,
            selected: false
        },
        {
            title: 'Ancient Era: 3000 BCE - 500 CE',
            scope: 'Classical antiquity including ancient Egypt, Greece, Rome, Persia, India, and China.',
            causalSignificance: 8,
            humanImpact: 8,
            finalScore: 8.0,
            selected: false
        },
        {
            title: 'Medieval Era: 500 - 1500 CE',
            scope: 'Post-classical period including Byzantine, Islamic Golden Age, European Middle Ages, and Song China.',
            causalSignificance: 7,
            humanImpact: 7,
            finalScore: 7.0,
            selected: false
        },
        {
            title: 'Long 19th Century: 1789 - 1914',
            scope: 'From French Revolution to World War I, era of nationalism, industrialization, and imperialism.',
            causalSignificance: 8,
            humanImpact: 9,
            finalScore: 8.5,
            selected: false
        },
        {
            title: 'Post-War Era: 1945 - 1991',
            scope: 'Cold War period, decolonization, space race, and emergence of global institutions.',
            causalSignificance: 7,
            humanImpact: 8,
            finalScore: 7.5,
            selected: false
        }
    ],
    final_selection: [
        { id: 'T4U9V', title: 'Deep Time: 13.8 BYA - 3 MYA', position: 1 },
        { id: 'W1X6Y', title: 'Foraging Era: 3 MYA - 10,000 BCE', position: 2 },
        { id: 'Z5A3B', title: 'Agricultural Civilizations: 10,000 BCE - 1500 CE', position: 3 },
        { id: 'C8D2E', title: 'Early Modern: 1500 - 1900 CE', position: 4 },
        { id: 'F7G4H', title: 'Contemporary: 1900 - Present', position: 5 }
    ],
    selection_reasoning: `These five periods provide complete temporal coverage of all history, with boundaries at major transition points:

1. **Deep Time** - Covers cosmic and geological history before humans existed. Essential context for understanding our place in the universe.

2. **Foraging Era** - The vast majority of human existence was spent as hunter-gatherers. This period shaped our biology, psychology, and social instincts.

3. **Agricultural Civilizations** - The longest period of "historical" time, covering the rise and fall of all pre-modern civilizations across every continent.

4. **Early Modern** - A period of accelerating change as the world became interconnected through trade, colonialism, and technological innovation.

5. **Contemporary** - The most recent period where change has been fastest and most globally synchronized.

These periods are not equal in duration (Deep Time spans billions of years while Contemporary spans just over a century) but are roughly equal in historical significance and the amount there is to learn about each.`
};

async function resetDatabase() {
    console.log('🔄 Starting database reset...\n');

    try {
        // Step 1: Delete tree positions beyond level 1
        console.log('Deleting tree positions beyond level 1...');
        const deletedPositions = await sql`
            DELETE FROM tree_positions
            WHERE level > 1
            RETURNING position_id
        `;
        console.log(`  ✅ Deleted ${deletedPositions.length} tree positions`);

        // Step 2: Delete anchors not in preserved list
        console.log('\nDeleting non-preserved anchors...');
        const deletedAnchors = await sql`
            DELETE FROM anchors
            WHERE id NOT IN ('0-ROOT', 'E8F2G', 'Q7R2S', 'G7H2K', 'C9D3E', 'T4U9V', 'W1X6Y', 'Z5A3B', 'C8D2E', 'F7G4H')
            RETURNING id
        `;
        console.log(`  ✅ Deleted ${deletedAnchors.length} anchors`);

        // Step 3: Clear all generation metadata
        console.log('\nClearing generation metadata...');
        const deletedMetadata = await sql`
            DELETE FROM anchor_generation_metadata
            RETURNING id
        `;
        console.log(`  ✅ Deleted ${deletedMetadata.length} metadata records`);

        // Step 4: Insert hard-coded metadata for Level 1A
        console.log('\nInserting Level 1A metadata...');
        await sql`
            INSERT INTO anchor_generation_metadata
            (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning)
            VALUES (
                ${LEVEL_1A_METADATA.parent_anchor_id},
                ${LEVEL_1A_METADATA.breadth},
                ${JSON.stringify(LEVEL_1A_METADATA.candidates)},
                ${JSON.stringify(LEVEL_1A_METADATA.final_selection)},
                ${LEVEL_1A_METADATA.selection_reasoning}
            )
        `;
        console.log('  ✅ Inserted Level 1A metadata');

        // Step 5: Insert hard-coded metadata for Level 1B
        console.log('\nInserting Level 1B metadata...');
        await sql`
            INSERT INTO anchor_generation_metadata
            (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning)
            VALUES (
                ${LEVEL_1B_METADATA.parent_anchor_id},
                ${LEVEL_1B_METADATA.breadth},
                ${JSON.stringify(LEVEL_1B_METADATA.candidates)},
                ${JSON.stringify(LEVEL_1B_METADATA.final_selection)},
                ${LEVEL_1B_METADATA.selection_reasoning}
            )
        `;
        console.log('  ✅ Inserted Level 1B metadata');

        // Verification
        console.log('\n📊 Verification:');

        const anchorCount = await sql`SELECT COUNT(*) as count FROM anchors`;
        console.log(`  Anchors remaining: ${anchorCount[0].count}`);

        const positionCount = await sql`SELECT COUNT(*) as count FROM tree_positions`;
        console.log(`  Tree positions remaining: ${positionCount[0].count}`);

        const metadataCount = await sql`SELECT COUNT(*) as count FROM anchor_generation_metadata`;
        console.log(`  Metadata records: ${metadataCount[0].count}`);

        console.log('\n✅ Database reset complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

resetDatabase();
