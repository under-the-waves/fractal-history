import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Adds the two flags the scoring engine needs on per-user flashcards.
//   is_core          - the card is one of its narrative's 5 frozen, shared core cards
//   is_personal_slot - the user assigned this pool card to one of their 3 personal slots
// own_raw counts cards where (is_core OR is_personal_slot). Personal slots are capped at 3 per
// (user_id, anchor_id, breadth) by the slot-assignment endpoint, not by the DB.
// See: project knowledge/Scoring_Engine_Design.md
async function addFlashcardScoringColumns() {
    console.log('Adding scoring columns to flashcards...');

    await sql`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS is_core BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS is_personal_slot BOOLEAN NOT NULL DEFAULT false`;

    // Speeds up own_raw recomputation, which filters to a user's scored cards for one anchor.
    await sql`
        CREATE INDEX IF NOT EXISTS idx_flashcards_scored
            ON flashcards(user_id, anchor_id)
            WHERE is_core OR is_personal_slot
    `;

    console.log('Flashcard scoring columns added successfully.');
}

addFlashcardScoringColumns().catch(console.error);
