import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Adding geographic coverage columns to anchors...\n');

try {
    // region_codes: the list of place codes (from the geography taxonomy) this
    // anchor covers. Populated only for geographic (breadth C) anchors. NULL for
    // everything else, which the generator treats as "the whole world".
    await sql`ALTER TABLE anchors ADD COLUMN IF NOT EXISTS region_codes JSONB`;

    // must_expand: set on a leftover ("Rest of the World") anchor when it still
    // contains a place with a significant connection to the topic, so the UI
    // never shows it as a finished leaf.
    await sql`ALTER TABLE anchors ADD COLUMN IF NOT EXISTS must_expand BOOLEAN DEFAULT FALSE`;

    console.log('Columns added (or already present).');

    const result = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'anchors'
        ORDER BY ordinal_position
    `;

    console.log('\nanchors table structure:');
    result.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}`);
    });

} catch (error) {
    console.error('Error altering table:', error);
    process.exit(1);
}
