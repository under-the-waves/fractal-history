// Seed the real 0-ROOT anchor + tree position, then rebuild every active user's score cache so the
// root accumulates a score. One-off migration, safe to re-run (both inserts are ON CONFLICT DO NOTHING
// and the recompute is the same rebuild the nightly decay pass runs).
//
// Why: the root only ever existed as a synthetic object (lib/db.js getAncestorPath unshifts it), but
// every level-1 tree position already points at parent_position_id = '0-ROOT', and the whole global
// layer reads a '0-ROOT' row in user_topic_scores: the header rank badge (peaks['0-ROOT']), the global
// level-up toasts (levelSnapshot in api/flashcards.js and api/learn.js), and the five rank achievements
// (globalLevel in lib/achievements.js computeStats). With no root position, getAncestorDistances
// stopped at level 1, no root score row was ever written, and all three features were silently dead.
// Seeding the position closes the chain; recomputeUserScores backfills existing users' root rows, and
// applyReviewDelta keeps them current from then on.
//
// Run:  node seed-root-position.js   (reads DATABASE_URL from .env.local)

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);
const { recomputeUserScores, displayScore } = await import('./lib/scoring.js');
const { levelForScore } = await import('./shared/levels.js');

// 1. The root anchor (title/scope match the synthetic root in lib/db.js and the static tree data).
await sql`
    INSERT INTO anchors (id, title, scope, generation_status, is_datable_event, created_at, updated_at)
    VALUES ('0-ROOT', 'The Story of Everything', 'All of history', 'pending', false, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
`;

// 2. The root tree position, at the position_id every level-1 row already points to. breadth is
// NOT NULL in the schema; the root has no meaningful breadth, so 'A' is a placeholder — nothing
// reads a parent's own breadth (edges take the CHILD's breadth, see getAncestorEdges).
await sql`
    INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position, is_canonical)
    VALUES ('0-ROOT', '0-ROOT', NULL, 0, 'A', 1, true)
    ON CONFLICT (position_id) DO NOTHING
`;
console.log('Root anchor + position seeded.');

// 3. Rebuild every active user's score cache (same user set as scripts/decay-scores.mjs) so the
// root row appears with the correct discounted-sum score.
const users = await sql`
    SELECT user_id FROM flashcards WHERE is_core OR is_personal_slot
    UNION
    SELECT user_id FROM learn_marks
`;
for (const { user_id } of users) {
    await recomputeUserScores(user_id);
    const root = await sql`
        SELECT subtree_raw, subtree_peak FROM user_topic_scores
        WHERE user_id = ${user_id} AND anchor_id = '0-ROOT'
    `;
    if (root.length) {
        const score = displayScore(Number(root[0].subtree_raw));
        const peak = displayScore(Number(root[0].subtree_peak));
        console.log(`${user_id}: root score ${score}, peak ${peak}, global level ${levelForScore(peak)}`);
    } else {
        console.log(`${user_id}: no root row (no live score mass)`);
    }
}
console.log(`Recomputed ${users.length} user(s). Done.`);
