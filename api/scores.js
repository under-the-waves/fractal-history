import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from '../lib/auth.js';
import { displayScore } from '../lib/scoring.js';

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
            SELECT anchor_id, subtree_raw FROM user_topic_scores WHERE user_id = ${userId}
        `;
        const scores = {};
        for (const r of rows) {
            scores[r.anchor_id] = Math.round(displayScore(Number(r.subtree_raw)));
        }
        return res.status(200).json({ success: true, scores });
    } catch (error) {
        console.error('Error fetching scores:', error);
        return res.status(500).json({ error: 'Failed to fetch scores', details: error.message });
    }
}
