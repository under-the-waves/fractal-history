import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
    console.log('Adding fact-check columns to narratives table...');

    await sql`ALTER TABLE narratives ADD COLUMN IF NOT EXISTS fact_checked_narrative TEXT`;
    await sql`ALTER TABLE narratives ADD COLUMN IF NOT EXISTS sources JSONB`;
    await sql`ALTER TABLE narratives ADD COLUMN IF NOT EXISTS fact_checked_at TIMESTAMP WITH TIME ZONE`;

    console.log('Columns added successfully.');
}

migrate().catch(console.error);
