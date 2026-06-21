import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Hand-curated, pre-seeded flashcard pools for the ROOT narratives. Root is unique and is the first
// thing every user sees, so its cores are authored rather than generated. Each card's answer is
// grounded in the corresponding Root narrative (verified by checkGrounding below).
//   A (analytical) cores = the ESSENCE of each great transition (concept, not a date).
//   B (temporal) cores    = the defining date/turning point of each era (the timeline).
// See: project knowledge/Scoring_Engine_Design.md. Re-runnable (overwrites questions for 0-ROOT A/B).

const ROOT_A = [
    // Emergence of Life on Earth
    { group: 'sub:Emergence of Life on Earth', core: true, question: 'What kind of organisms did all complex life on Earth develop from?', answer: 'Single-celled organisms' },
    { group: 'sub:Emergence of Life on Earth', core: false, question: 'What process made life grow more complex over billions of years?', answer: 'Evolution by natural selection' },
    { group: 'sub:Emergence of Life on Earth', core: false, question: 'What is the name for the burst of diverse animal life first seen in the fossil record?', answer: 'The Cambrian Explosion' },
    // Evolution of Humans
    { group: 'sub:Evolution of Humans', core: true, question: 'What is the scientific name for the species of modern humans?', answer: 'Homo sapiens' },
    { group: 'sub:Evolution of Humans', core: false, question: 'From which animals did the human lineage split, around 7 million years ago in Africa?', answer: 'Chimpanzees' },
    { group: 'sub:Evolution of Humans', core: false, question: 'What is the term for the upright walking that early hominids developed?', answer: 'Bipedalism' },
    // Agricultural Revolution
    { group: 'sub:Agricultural Revolution', core: true, question: 'What did agriculture produce that let some people stop growing food and specialise in other work?', answer: 'Food surpluses' },
    { group: 'sub:Agricultural Revolution', core: false, question: 'How did humans feed themselves before farming, moving in small groups?', answer: 'As hunter-gatherers' },
    { group: 'sub:Agricultural Revolution', core: false, question: 'What did villages grow into as agriculture spread?', answer: 'Cities' },
    // Industrial Revolution
    { group: 'sub:Industrial Revolution', core: true, question: 'What coal-powered machine drove the factories of the Industrial Revolution?', answer: 'The steam engine' },
    { group: 'sub:Industrial Revolution', core: false, question: 'What fuel provided the energy to run industrial machines?', answer: 'Coal' },
    { group: 'sub:Industrial Revolution', core: false, question: 'In which country did the Industrial Revolution begin in the mid-1700s?', answer: 'Britain' },
    // General / across the topic
    { group: 'general', core: true, question: 'What name is given to the beginning of the universe, when it started expanding from a hot, dense state?', answer: 'The Big Bang' },
    { group: 'general', core: false, question: 'What faint radiation, detected in 1964, is the leftover afterglow of the Big Bang?', answer: 'Cosmic microwave background radiation' },
    { group: 'general', core: false, question: 'What did every great transition in this story have in common?', answer: 'A shift in how energy and information were organised' },
];

const ROOT_B = [
    // Deep Time
    { group: 'sub:Deep Time: 13.8 BYA - 3 MYA', core: true, question: 'How long ago did the universe begin, in the Big Bang?', answer: 'About 13.8 billion years ago' },
    { group: 'sub:Deep Time: 13.8 BYA - 3 MYA', core: false, question: 'How long ago did Earth form from stellar debris?', answer: 'About 4.6 billion years ago' },
    { group: 'sub:Deep Time: 13.8 BYA - 3 MYA', core: false, question: "Roughly how long ago did life first emerge in Earth's oceans?", answer: 'About 3.8 billion years ago' },
    // Foraging Era
    { group: 'sub:Foraging Era: 3 MYA - 10,000 BCE', core: true, question: 'Around when did Homo sapiens evolve?', answer: 'About 300,000 years ago' },
    { group: 'sub:Foraging Era: 3 MYA - 10,000 BCE', core: false, question: 'Around when did humans begin migrating out of Africa?', answer: 'About 70,000 years ago' },
    { group: 'sub:Foraging Era: 3 MYA - 10,000 BCE', core: false, question: 'In what kind of groups did hunter-gatherers live?', answer: 'Small bands of 20-50 people' },
    // Agricultural Civilizations
    { group: 'sub:Agricultural Civilizations: 10,000 BCE - 1500 CE', core: true, question: 'Around when did people begin farming, launching the first agricultural civilizations?', answer: 'About 10,000 BCE' },
    { group: 'sub:Agricultural Civilizations: 10,000 BCE - 1500 CE', core: false, question: "Where did the world's first cities arise around 3500 BCE?", answer: 'Mesopotamia' },
    { group: 'sub:Agricultural Civilizations: 10,000 BCE - 1500 CE', core: false, question: 'What technology emerged to record transactions and laws?', answer: 'Writing' },
    // Early Modern
    { group: 'sub:Early Modern: 1500 - 1900 CE', core: true, question: 'In what year did European explorers reach the Americas, beginning sustained global contact?', answer: '1492' },
    { group: 'sub:Early Modern: 1500 - 1900 CE', core: false, question: 'Roughly how many Africans were forcibly transported in the Atlantic slave trade?', answer: 'Over 12 million' },
    { group: 'sub:Early Modern: 1500 - 1900 CE', core: false, question: 'In which country did the Industrial Revolution begin around 1760?', answer: 'Britain' },
    // Contemporary
    { group: 'sub:Contemporary: 1900 - Present', core: true, question: 'What two global wars in the first half of the 1900s killed over 100 million people?', answer: 'The two World Wars' },
    { group: 'sub:Contemporary: 1900 - Present', core: false, question: 'What weapon, first built in 1945, created unprecedented destructive power?', answer: 'Nuclear weapons' },
    { group: 'sub:Contemporary: 1900 - Present', core: false, question: 'What rivalry from 1947 to 1991 divided the world between the US and the USSR?', answer: 'The Cold War' },
];

// Warn if an answer's content words do not appear in the narrative (loose; ignores spelling/number-only).
function checkGrounding(label, pool, narrative) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const stem = w => w.replace(/(ments?|tions?|ing|edly|ed|es|s)$/, '');
    const narrTokens = new Set(norm(narrative).split(/\s+/).map(stem));
    let warnings = 0;
    for (const c of pool) {
        const at = norm(c.answer).split(/\s+/).filter(w => w.length >= 4).map(stem);
        if (!at.length) continue; // numeric / very short answers: verified by hand
        const present = at.filter(w => narrTokens.has(w)).length;
        if (present / at.length < 0.5) {
            warnings++;
            console.log(`  [${label}] GROUNDING? "${c.answer}" (${present}/${at.length} words found) -- Q: ${c.question}`);
        }
    }
    if (!warnings) console.log(`  [${label}] grounding OK (${pool.length} cards, ${pool.filter(c => c.core).length} cores)`);
}

async function seed() {
    for (const [breadth, pool] of [['A', ROOT_A], ['B', ROOT_B]]) {
        const rows = await sql`SELECT narrative FROM narratives WHERE anchor_id='0-ROOT' AND breadth=${breadth} LIMIT 1`;
        if (!rows.length || !rows[0].narrative) {
            console.log(`  [Root ${breadth}] no narrative -- skipped`);
            continue;
        }
        checkGrounding(`Root ${breadth}`, pool, rows[0].narrative);
        await sql`UPDATE narratives SET questions = ${JSON.stringify(pool)} WHERE anchor_id='0-ROOT' AND breadth=${breadth}`;
        console.log(`  [Root ${breadth}] seeded ${pool.length} cards (${pool.filter(c => c.core).length} cores)`);
    }
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
