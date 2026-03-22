import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { factCheckNarrative } from './api/utils/factCheck.js';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function main() {
    const anchorId = process.argv[2] || '0-ROOT';
    const breadth = process.argv[3] || 'A';

    console.log(`Fact-checking narrative for ${anchorId} breadth ${breadth}...`);

    const narratives = await sql`
        SELECT narrative FROM narratives
        WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
    `;

    if (narratives.length === 0) {
        console.error('No narrative found.');
        process.exit(1);
    }

    const anchors = await sql`
        SELECT title, scope FROM anchors WHERE id = ${anchorId}
    `;
    const anchor = anchors[0];

    console.log(`Anchor: ${anchor.title}`);
    console.log('Running fact-check (this may take 30-60 seconds)...');

    const result = await factCheckNarrative(
        narratives[0].narrative, anchor.title, anchor.scope, breadth
    );

    if (!result) {
        console.error('Fact-check returned no results.');
        process.exit(1);
    }

    console.log(`Found ${result.sources.length} sources.`);
    if (result.corrections.length > 0) {
        console.log(`Made ${result.corrections.length} corrections:`);
        result.corrections.forEach(c => console.log(`  - "${c.original}" → "${c.corrected}" (${c.reason})`));
    }

    await sql`
        UPDATE narratives
        SET fact_checked_narrative = ${result.narrative},
            sources = ${JSON.stringify(result.sources)},
            fact_checked_at = NOW()
        WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
    `;

    console.log('Database updated. Done.');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
