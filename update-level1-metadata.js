// Script to update Level 1 anchor generation metadata with justifications
// Run with: node update-level1-metadata.js

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Level 1A candidates with justifications
const level1ACandidates = [
    {
        title: "Emergence of Life on Earth",
        type: "Process",
        scope: "The origin and early evolution of life on Earth, from the first self-replicating molecules to complex multicellular organisms.",
        causalSignificance: 10,
        causalJustification: "Without life's emergence, no subsequent biological, cognitive, or cultural evolution would have been possible - it is the foundational prerequisite for everything that follows in human history.",
        humanImpact: 9,
        humanJustification: "While occurring billions of years before humans, this process created the entire biosphere that sustains human existence and shaped the oxygen-rich atmosphere essential for complex life.",
        finalScore: 9.6,
        selected: true
    },
    {
        title: "Evolution of Humans",
        type: "Process",
        scope: "The biological and cognitive evolution of the human species from early hominids to anatomically modern Homo sapiens, including the development of key human traits.",
        causalSignificance: 10,
        causalJustification: "Human cognitive abilities, social structures, and tool use directly enabled all subsequent technological, cultural, and societal developments throughout history.",
        humanImpact: 10,
        humanJustification: "This process created humanity itself and determined our physical and cognitive capabilities, directly affecting every human who has ever lived.",
        finalScore: 10.0,
        selected: true
    },
    {
        title: "Agricultural Revolution",
        type: "Process",
        scope: "The transition from hunter-gatherer lifestyles to settled agriculture, including plant and animal domestication, beginning around 10,000 BCE in multiple regions.",
        causalSignificance: 10,
        causalJustification: "Agriculture enabled population growth, permanent settlements, social stratification, and eventually civilization itself - fundamentally transforming human society's trajectory.",
        humanImpact: 10,
        humanJustification: "This revolution affected virtually all subsequent humans by changing diet, labor patterns, social structures, and enabling dense populations that characterize modern society.",
        finalScore: 10.0,
        selected: true
    },
    {
        title: "Industrial Revolution",
        type: "Process",
        scope: "The transformation from agrarian to industrial economies beginning in 18th century Britain, including mechanization, factory production, and fossil fuel energy.",
        causalSignificance: 10,
        causalJustification: "The Industrial Revolution created modern economic systems, global trade patterns, technological acceleration, and shaped contemporary geopolitical power structures.",
        humanImpact: 10,
        humanJustification: "It fundamentally altered work, living conditions, life expectancy, and consumption patterns for billions, creating both unprecedented prosperity and new forms of exploitation.",
        finalScore: 10.0,
        selected: true
    },
    {
        title: "Scientific Revolution",
        type: "Process",
        scope: "The emergence of modern scientific methodology and institutions in 16th-18th century Europe, establishing systematic empirical inquiry.",
        causalSignificance: 9,
        causalJustification: "Scientific methodology enabled the technological advances of the Industrial Revolution and continues to drive modern innovation and understanding.",
        humanImpact: 8,
        humanJustification: "Scientific advances have dramatically improved human health, agriculture, and quality of life, though benefits have been unevenly distributed globally.",
        finalScore: 8.6,
        selected: false
    },
    {
        title: "Development of Writing",
        type: "Technology",
        scope: "The invention and spread of writing systems, enabling record-keeping, literature, and complex administration beginning around 3200 BCE.",
        causalSignificance: 9,
        causalJustification: "Writing enabled the accumulation and transmission of knowledge across generations, making complex civilizations and historical records possible.",
        humanImpact: 8,
        humanJustification: "Writing transformed governance, commerce, education, and cultural expression, though literacy remained limited to elites for most of history.",
        finalScore: 8.6,
        selected: false
    },
    {
        title: "Formation of States",
        type: "Process",
        scope: "The emergence of centralized political authority, bureaucracy, and territorial governance from early city-states to nation-states.",
        causalSignificance: 8,
        causalJustification: "State formation enabled large-scale coordination, warfare, and infrastructure development that shaped political geography and power dynamics.",
        humanImpact: 8,
        humanJustification: "States have determined taxation, law, warfare, and citizens' rights, profoundly affecting human lives through both protection and oppression.",
        finalScore: 8.0,
        selected: false
    },
    {
        title: "Development of Religion",
        type: "Phenomenon",
        scope: "The emergence and evolution of religious beliefs, practices, and institutions across human societies throughout history.",
        causalSignificance: 8,
        causalJustification: "Religious institutions shaped political legitimacy, social cohesion, education, and cultural values across most human societies.",
        humanImpact: 9,
        humanJustification: "Religion has provided meaning, community, and moral frameworks while also motivating conflicts that have affected billions of lives.",
        finalScore: 8.4,
        selected: false
    },
    {
        title: "Global Trade Networks",
        type: "Process",
        scope: "The development of long-distance trade routes and commercial networks connecting distant regions, from ancient silk roads to modern globalization.",
        causalSignificance: 8,
        causalJustification: "Trade networks spread technologies, ideas, diseases, and resources, accelerating development in connected regions while marginalizing others.",
        humanImpact: 7,
        humanJustification: "Trade affected livelihoods, consumption patterns, and cultural exchange, though most people historically remained in subsistence economies.",
        finalScore: 7.6,
        selected: false
    },
    {
        title: "Climate and Environmental Change",
        type: "Phenomenon",
        scope: "Major climate shifts and environmental changes that shaped human migration, settlement patterns, and civilization development.",
        causalSignificance: 7,
        causalJustification: "Climate changes triggered migrations, agricultural innovations, and the rise and fall of civilizations in various regions.",
        humanImpact: 8,
        humanJustification: "Environmental conditions directly affected food security, disease patterns, and habitability, causing both prosperity and catastrophic famines.",
        finalScore: 7.4,
        selected: false
    }
];

// Level 1B candidates with subdivision schemes (temporal anchors)
const level1BCandidates = [
    {
        name: "By Major Transitions",
        anchors: [
            "Deep Time: 13.8 BYA - 3 MYA",
            "Foraging Era: 3 MYA - 10,000 BCE",
            "Agricultural Civilizations: 10,000 BCE - 1500 CE",
            "Early Modern: 1500 - 1900 CE",
            "Contemporary: 1900 - Present"
        ],
        ratings: {
            naturalBreakpoints: {
                score: 3,
                justification: "Each boundary marks a fundamental transformation in human existence: hominid emergence, agricultural revolution, global interconnection, and industrialization."
            },
            comparableDepth: {
                score: 2,
                justification: "Deep Time is vastly longer but has less human-relevant content, while later periods pack more learning into shorter spans."
            },
            historicalConvention: {
                score: 3,
                justification: "This periodization aligns with standard world history curricula and major historical syntheses like those of McNeill and Harari."
            }
        },
        totalScore: 8,
        selected: true
    },
    {
        name: "By Dominant Mode of Production",
        anchors: [
            "Pre-Human Era: 13.8 BYA - 300,000 BCE",
            "Hunter-Gatherer Societies: 300,000 BCE - 10,000 BCE",
            "Agrarian Societies: 10,000 BCE - 1750 CE",
            "Industrial Societies: 1750 CE - Present"
        ],
        ratings: {
            naturalBreakpoints: {
                score: 2,
                justification: "Economic mode transitions are meaningful but the shift from agrarian to industrial was gradual and regionally varied."
            },
            comparableDepth: {
                score: 2,
                justification: "The Pre-Human Era is disproportionately long with minimal content relevant to understanding human history."
            },
            historicalConvention: {
                score: 2,
                justification: "Common in Marxist historiography but less standard in mainstream world history education."
            }
        },
        totalScore: 6,
        selected: false
    },
    {
        name: "By Information Technology Revolutions",
        anchors: [
            "Pre-Symbolic: 13.8 BYA - 70,000 BCE",
            "Oral Cultures: 70,000 BCE - 3000 BCE",
            "Literate Civilizations: 3000 BCE - 1450 CE",
            "Print Era: 1450 - 1990 CE",
            "Digital Age: 1990 - Present"
        ],
        ratings: {
            naturalBreakpoints: {
                score: 2,
                justification: "Writing and printing are clear breakpoints, but the cognitive revolution date is debated and the digital age is very recent."
            },
            comparableDepth: {
                score: 1,
                justification: "Print Era and especially Digital Age contain far less content than the multi-millennia Literate Civilizations period."
            },
            historicalConvention: {
                score: 1,
                justification: "This framework is used in media studies but is not standard in general world history education."
            }
        },
        totalScore: 4,
        selected: false
    }
];

async function updateMetadata() {
    try {
        console.log('Connecting to database...');

        // Update Level 1A metadata
        console.log('Updating Level 1A metadata for 0-ROOT...');
        await sql`
            INSERT INTO anchor_generation_metadata
            (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning, raw_response)
            VALUES (
                '0-ROOT',
                'A',
                ${JSON.stringify(level1ACandidates)},
                ${JSON.stringify(level1ACandidates.filter(c => c.selected))},
                'These four anchors represent the most transformative turning points in the story of everything. Each fundamentally altered the trajectory of existence: life''s emergence made biology possible, human evolution created our species'' unique capabilities, the agricultural revolution enabled civilization, and industrialization shaped the modern world. Together they form a coherent narrative of increasing complexity and human agency.',
                'Hardcoded Level 1A anchors with manually added justifications'
            )
            ON CONFLICT (parent_anchor_id, breadth)
            DO UPDATE SET
                candidates = ${JSON.stringify(level1ACandidates)},
                final_selection = ${JSON.stringify(level1ACandidates.filter(c => c.selected))},
                selection_reasoning = 'These four anchors represent the most transformative turning points in the story of everything. Each fundamentally altered the trajectory of existence: life''s emergence made biology possible, human evolution created our species'' unique capabilities, the agricultural revolution enabled civilization, and industrialization shaped the modern world. Together they form a coherent narrative of increasing complexity and human agency.',
                generated_at = NOW()
        `;
        console.log('Level 1A metadata updated successfully!');

        // Update Level 1B metadata
        console.log('Updating Level 1B metadata for 0-ROOT...');
        await sql`
            INSERT INTO anchor_generation_metadata
            (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning, raw_response)
            VALUES (
                '0-ROOT',
                'B',
                ${JSON.stringify(level1BCandidates)},
                ${JSON.stringify(level1BCandidates.filter(c => c.selected))},
                'The "By Major Transitions" scheme scored highest because it uses universally recognized breakpoints (hominid emergence, agricultural revolution, global interconnection, industrialization), aligns with standard world history curricula, and provides complete chronological coverage while keeping periods at comparable levels of complexity.',
                'Hardcoded Level 1B anchors with subdivision scheme format'
            )
            ON CONFLICT (parent_anchor_id, breadth)
            DO UPDATE SET
                candidates = ${JSON.stringify(level1BCandidates)},
                final_selection = ${JSON.stringify(level1BCandidates.filter(c => c.selected))},
                selection_reasoning = 'The "By Major Transitions" scheme scored highest because it uses universally recognized breakpoints (hominid emergence, agricultural revolution, global interconnection, industrialization), aligns with standard world history curricula, and provides complete chronological coverage while keeping periods at comparable levels of complexity.',
                generated_at = NOW()
        `;
        console.log('Level 1B metadata updated successfully!');

        console.log('\nAll Level 1 metadata updated successfully!');
        console.log('The "Why these Anchors?" panel will now show justifications for Level 1 anchors.');

    } catch (error) {
        console.error('Error updating metadata:', error);
        process.exit(1);
    }
}

updateMetadata();
