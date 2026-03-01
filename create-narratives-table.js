import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function createNarrativesTable() {
    console.log('Creating narratives table...');

    try {
        // Create the narratives table
        await sql`
            CREATE TABLE IF NOT EXISTS narratives (
                id SERIAL PRIMARY KEY,
                anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
                breadth CHAR(1) NOT NULL CHECK (breadth IN ('A', 'B', 'C')),
                narrative TEXT NOT NULL,
                key_concepts JSONB NOT NULL DEFAULT '[]',
                questions JSONB NOT NULL DEFAULT '[]',
                estimated_read_time INTEGER NOT NULL DEFAULT 5,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(anchor_id, breadth)
            )
        `;
        console.log('✓ Created narratives table');

        // Create index for faster lookups
        await sql`
            CREATE INDEX IF NOT EXISTS idx_narratives_anchor_breadth
            ON narratives(anchor_id, breadth)
        `;
        console.log('✓ Created index on narratives(anchor_id, breadth)');

        // Create trigger to update updated_at timestamp
        await sql`
            CREATE OR REPLACE FUNCTION update_narratives_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        `;

        await sql`
            DROP TRIGGER IF EXISTS narratives_updated_at ON narratives
        `;

        await sql`
            CREATE TRIGGER narratives_updated_at
            BEFORE UPDATE ON narratives
            FOR EACH ROW
            EXECUTE FUNCTION update_narratives_updated_at()
        `;
        console.log('✓ Created updated_at trigger');

        console.log('\n✅ Narratives table created successfully!');
        console.log('\nTable structure:');
        console.log('  - id: SERIAL PRIMARY KEY');
        console.log('  - anchor_id: VARCHAR(50) NOT NULL (FK to anchors)');
        console.log('  - breadth: CHAR(1) NOT NULL (A, B, or C)');
        console.log('  - narrative: TEXT NOT NULL');
        console.log('  - key_concepts: JSONB (array of 5 strings)');
        console.log('  - questions: JSONB (array of 5 {question, answer} objects)');
        console.log('  - estimated_read_time: INTEGER (minutes)');
        console.log('  - created_at: TIMESTAMP WITH TIME ZONE');
        console.log('  - updated_at: TIMESTAMP WITH TIME ZONE');
        console.log('  - UNIQUE constraint on (anchor_id, breadth)');

    } catch (error) {
        console.error('Error creating narratives table:', error);
        process.exit(1);
    }
}

createNarrativesTable();
