import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Adds the columns needed for (a) decaying write-your-own marks on their own spaced-repetition
// schedule, and (b) showing each node's all-time best score next to its current (decayed) score.
// See: project knowledge/Scoring_Engine_Design.md and lib/scoring.js.
async function migrate() {
    try {
        // Write marks get an SRS interval + last-written timestamp, so their XP decays like flashcards
        // (gentler) and re-writing advances the interval. Default interval 7 = the first rewrite gap.
        await sql`ALTER TABLE learn_marks ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 7`;
        await sql`ALTER TABLE learn_marks ADD COLUMN IF NOT EXISTS last_written_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`;
        console.log('✓ learn_marks: interval_days, last_written_at');

        // All-time peak of the rolled-up score, so the tree can show "current / best" and make decay legible.
        await sql`ALTER TABLE user_topic_scores ADD COLUMN IF NOT EXISTS subtree_peak DOUBLE PRECISION NOT NULL DEFAULT 0`;
        // Backfill peak to at least the current value for existing rows.
        await sql`UPDATE user_topic_scores SET subtree_peak = GREATEST(subtree_peak, subtree_raw)`;
        console.log('✓ user_topic_scores: subtree_peak (backfilled to current)');

        console.log('\n✅ Scoring-decay migration complete.');
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
