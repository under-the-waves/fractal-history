import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
    console.log('Creating flashcard review index...');

    await sql`
        CREATE INDEX IF NOT EXISTS idx_flashcards_user_review
        ON flashcards(user_id, next_review_date)
    `;

    console.log('Index created successfully.');
}

migrate().catch(console.error);
