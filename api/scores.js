import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from '../lib/auth.js';
import { displayScore, computeBreadthBreakdown, computeBreadthSubtreeBreakdown } from '../lib/scoring.js';
import { bankMastery, computeStats, evaluateAchievements, getUnlocked } from '../lib/achievements.js';

const sql = neon(process.env.DATABASE_URL);

// Returns the signed-in user's per-node mastery scores as { anchor_id: 0-100 }, derived from the
// rolled-up subtree_raw in user_topic_scores. Used by the tree to draw mastery rings on nodes.
// See: project knowledge/Scoring_Engine_Design.md
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = await getAuthenticatedUser(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const rows = await sql`
            SELECT anchor_id, subtree_raw, subtree_peak FROM user_topic_scores WHERE user_id = ${userId}
        `;
        const scores = {};
        const peaks = {};
        for (const r of rows) {
            scores[r.anchor_id] = Math.round(displayScore(Number(r.subtree_raw)));
            peaks[r.anchor_id] = Math.round(displayScore(Number(r.subtree_peak)));
        }
        // Per-breadth own scores (0..B each) so the tree can show which breadths of a node are done.
        const rawBreadths = await computeBreadthBreakdown(userId);
        const breadths = {};
        for (const [anchorId, byBreadth] of Object.entries(rawBreadths)) {
            breadths[anchorId] = {};
            for (const [b, v] of Object.entries(byBreadth)) breadths[anchorId][b] = Math.round(v);
        }

        // Per-breadth split of each node's TOTAL score, so the tree can show how much of the badge
        // number came from the analytical (A), temporal (B), and geographic (C) pathways. Computed live,
        // then apportioned against the stored integer total with largest-remainder rounding, so the three
        // parts always sum EXACTLY to the badge — no "they don't add up" drift from mid-day decay.
        const rawBreadthSub = await computeBreadthSubtreeBreakdown(userId);
        const breadthScores = {};
        for (const [anchorId, parts] of Object.entries(rawBreadthSub)) {
            const total = scores[anchorId];
            if (total == null) continue;
            const sum = parts.A + parts.B + parts.C;
            if (sum <= 0) continue;
            const exact = { A: total * parts.A / sum, B: total * parts.B / sum, C: total * parts.C / sum };
            const split = { A: Math.floor(exact.A), B: Math.floor(exact.B), C: Math.floor(exact.C) };
            let remainder = total - (split.A + split.B + split.C);
            const order = ['A', 'B', 'C'].sort((x, y) => (exact[y] - split[y]) - (exact[x] - split[x]));
            for (let i = 0; i < remainder; i++) split[order[i]] += 1;
            breadthScores[anchorId] = split;
        }
        // Achievements: bank any currently-mastered narratives, then evaluate so a user who earned
        // something before this feature existed (or between sessions) has it unlocked on load. Returns
        // the full unlocked list plus the stats the Achievements page needs for progress hints, and
        // whatever this evaluation newly unlocked so the caller can toast it (unlocks that happen at
        // load time would otherwise be silent).
        let achievements = { unlocked: [], stats: null, newlyUnlocked: [] };
        try {
            await bankMastery(userId);
            const stats = await computeStats(userId);
            const newlyUnlocked = await evaluateAchievements(userId, stats);
            achievements = { unlocked: await getUnlocked(userId), stats, newlyUnlocked };
        } catch (achErr) {
            console.error('Achievement evaluation failed (non-fatal):', achErr);
        }

        return res.status(200).json({ success: true, scores, peaks, breadths, breadthScores, achievements });
    } catch (error) {
        console.error('Error fetching scores:', error);
        return res.status(500).json({ error: 'Failed to fetch scores', details: error.message });
    }
}
