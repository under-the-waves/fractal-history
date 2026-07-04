import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Achievements support tables:
//   user_achievements   - which achievements a user has permanently unlocked (+ when).
//   mastered_narratives - a permanent ledger: the first time a user masters a given (anchor, breadth)
//                         narrative. Banked forever, so volume/coverage achievements survive later decay
//                         (the live score still decays; the milestone does not).
//   user_activity_days  - one row per (user, calendar day) with any review/write activity, for streaks.
async function createAchievementsTables() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS user_achievements (
                user_id TEXT NOT NULL,
                achievement_key TEXT NOT NULL,
                unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (user_id, achievement_key)
            )
        `;
        console.log('✓ Created user_achievements table');

        await sql`
            CREATE TABLE IF NOT EXISTS mastered_narratives (
                user_id TEXT NOT NULL,
                anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
                breadth CHAR(1) NOT NULL CHECK (breadth IN ('A', 'B', 'C')),
                first_mastered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (user_id, anchor_id, breadth)
            )
        `;
        console.log('✓ Created mastered_narratives table');
        await sql`CREATE INDEX IF NOT EXISTS idx_mastered_narratives_user ON mastered_narratives(user_id)`;
        console.log('✓ Created index on mastered_narratives(user_id)');

        await sql`
            CREATE TABLE IF NOT EXISTS user_activity_days (
                user_id TEXT NOT NULL,
                day DATE NOT NULL,
                PRIMARY KEY (user_id, day)
            )
        `;
        console.log('✓ Created user_activity_days table');

        console.log('\n✅ Achievements tables created successfully!');
    } catch (error) {
        console.error('Error creating achievements tables:', error);
        process.exit(1);
    }
}

createAchievementsTables();
