import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from '../lib/auth.js';
import { displayScore, computeBreadthBreakdown } from '../lib/scoring.js';

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
        return res.status(200).json({ success: true, scores, peaks, breadths });
    } catch (error) {
        console.error('Error fetching scores:', error);
        return res.status(500).json({ error: 'Failed to fetch scores', details: error.message });
    }
}
