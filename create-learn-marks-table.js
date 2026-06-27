import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// learn_marks: a user's best write-your-own mark per (anchor, breadth). One row per user+anchor+breadth,
// holding their best score so far. This is what wires the "write your own" feature into the scoring
// engine: computeOwnRaw (lib/scoring.js) reads it and adds a WRITE_FULL-capped XP term per breadth, so
// writing earns mastery points on top of flashcard retention. See: Learn_Build_Plan.md (decision 4),
// project knowledge/Scoring_Engine_Design.md.
async function createLearnMarksTable() {
    console.log('Creating learn_marks table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS learn_marks (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
                breadth CHAR(1) NOT NULL CHECK (breadth IN ('A', 'B', 'C')),
                score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
                covered INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_id, anchor_id, breadth)
            )
        `;
        console.log('✓ Created learn_marks table');

        await sql`
            CREATE INDEX IF NOT EXISTS idx_learn_marks_user
            ON learn_marks(user_id)
        `;
        console.log('✓ Created index on learn_marks(user_id)');
        console.log('\n✅ learn_marks table created successfully!');
    } catch (error) {
        console.error('Error creating learn_marks table:', error);
        process.exit(1);
    }
}

createLearnMarksTable();
