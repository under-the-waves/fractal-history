import { neon } from '@neondatabase/serverless';
import { recomputeUserScores } from '../lib/scoring.js';

const sql = neon(process.env.DATABASE_URL);

// Nightly forgetting-curve decay (Vercel Cron, once a day). Rebuilds every active user's score cache
// from CURRENT (now-decayed) retention, so mastery scores fall over time when cards are not reviewed.
//
// Why this is needed: applyReviewDelta only ever RAISES a score (on a review). The decay half of the
// model lives entirely in recomputeUserScores, which has to be driven on a schedule — without this
// endpoint, scores would only ever climb. See lib/scoring.js + project knowledge/Scoring_Engine_Design.md.
export default async function handler(req, res) {
    // Lock to Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>` when the env var is set).
    // If CRON_SECRET is unset the endpoint is open — set it in the Vercel project to protect it.
    if (process.env.CRON_SECRET) {
        if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const startedAt = Date.now();
    try {
        // Active users = anyone with scored cards (cores or personal slots); this is exactly the set
        // recomputeUserScores reads from, so users with nothing to score are skipped.
        const users = await sql`
            SELECT DISTINCT user_id FROM flashcards WHERE is_core OR is_personal_slot
        `;

        let recomputed = 0;
        const failures = [];
        for (const { user_id } of users) {
            try {
                await recomputeUserScores(user_id);
                recomputed++;
            } catch (e) {
                failures.push(user_id);
                console.error(`Score decay failed for user ${user_id}:`, e.message);
            }
        }

        const ms = Date.now() - startedAt;
        console.log(`Score decay: recomputed ${recomputed}/${users.length} users, ${failures.length} failed, ${ms}ms`);
        return res.status(200).json({
            success: true,
            users: users.length,
            recomputed,
            failed: failures.length,
            ms,
        });
    } catch (error) {
        console.error('Score decay cron failed:', error);
        return res.status(500).json({ error: 'Score decay failed', details: error.message });
    }
}
