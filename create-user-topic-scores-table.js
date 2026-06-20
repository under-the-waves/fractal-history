import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Incremental per-(user, anchor) mastery cache for the scoring engine.
// See: project knowledge/Scoring_Engine_Design.md
//   own_raw     = Σ retention over this node's scored cards (5 cores + <=3 personal slots per breadth)
//   subtree_raw = own_raw + w * Σ child.subtree_raw   (this is what display and the leaderboard use)
// Stores RAW values only; the 0-100 number is derived at read time as 100*(1 - exp(-subtree_raw/tau)).
async function createUserTopicScoresTable() {
    console.log('Creating user_topic_scores table...');

    await sql`
        CREATE TABLE IF NOT EXISTS user_topic_scores (
            user_id VARCHAR(255) NOT NULL,
            anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
            own_raw REAL NOT NULL DEFAULT 0,
            subtree_raw REAL NOT NULL DEFAULT 0,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (user_id, anchor_id)
        )
    `;

    // Per-node leaderboard: top users for a given anchor, ranked by rolled-up score.
    await sql`
        CREATE INDEX IF NOT EXISTS idx_uts_leaderboard
            ON user_topic_scores(anchor_id, subtree_raw DESC)
    `;

    // A single user's profile / progress page.
    await sql`
        CREATE INDEX IF NOT EXISTS idx_uts_user
            ON user_topic_scores(user_id)
    `;

    console.log('user_topic_scores table created successfully.');
}

createUserTopicScoresTable().catch(console.error);
