import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function createFlashcardsTable() {
    console.log('Creating flashcards table...');

    await sql`
        CREATE TABLE IF NOT EXISTS flashcards (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
            breadth CHAR(1) NOT NULL CHECK (breadth IN ('A', 'B', 'C')),
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            next_review_date TIMESTAMP WITH TIME ZONE,
            interval_days INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5,
            repetitions INTEGER DEFAULT 0,
            last_reviewed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id)
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_flashcards_user_anchor ON flashcards(user_id, anchor_id)
    `;

    await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_unique
            ON flashcards(user_id, anchor_id, breadth, md5(question))
    `;

    console.log('Flashcards table created successfully.');
}

createFlashcardsTable().catch(console.error);
