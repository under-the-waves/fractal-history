import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { getAuthenticatedUser } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { generateAndStoreFlashcards } from './generate-flashcards.js';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Ensure the signed-in user has this narrative's 5 frozen CORE cards in their collection, tagged
// is_core = true, so they are reviewable and therefore scorable. Called automatically when a user
// opens a narrative (first study). Idempotent. If the stored pool has no marked cores yet (e.g. it
// pre-dates core marking, or was never generated), it (re)generates and marks the pool first.
// See: project knowledge/Scoring_Engine_Design.md (Phase 1).
export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = await getAuthenticatedUser(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const anchorId = req.query.id || req.body?.id;
    const breadth = req.query.breadth || req.body?.breadth || 'A';
    if (!anchorId) {
        return res.status(400).json({ error: 'Anchor ID is required' });
    }

    try {
        // Read the stored pool; (re)generate if it has no marked cores.
        const rows = await query(
            'SELECT questions FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
            [anchorId, breadth]
        );
        let questions = rows.length && rows[0].questions
            ? (typeof rows[0].questions === 'string' ? JSON.parse(rows[0].questions) : rows[0].questions)
            : [];
        let cores = questions.filter(q => q && q.core);

        if (cores.length === 0) {
            // No marked cores yet -> generate and mark them now (one-time per narrative, shared).
            questions = await generateAndStoreFlashcards(anchorId, breadth);
            cores = questions.filter(q => q && q.core);
        }

        if (cores.length === 0) {
            return res.status(200).json({ success: true, instantiated: 0, ready: false });
        }

        // Upsert each core as one of the user's flashcards, tagged is_core. Idempotent: if the user
        // already saved that question, it gets upgraded to a core rather than duplicated.
        for (const c of cores) {
            await sql`
                INSERT INTO flashcards (user_id, anchor_id, breadth, question, answer, is_core)
                VALUES (${userId}, ${anchorId}, ${breadth}, ${c.question}, ${c.answer}, true)
                ON CONFLICT (user_id, anchor_id, breadth, md5(question))
                DO UPDATE SET is_core = true
            `;
        }

        return res.status(200).json({ success: true, instantiated: cores.length, ready: true });

    } catch (error) {
        if (error.message === 'NARRATIVE_NOT_FOUND') {
            // Narrative text not generated yet; nothing to instantiate. Not an error for the caller.
            return res.status(200).json({ success: true, instantiated: 0, ready: false });
        }
        console.error('Error instantiating cores:', error);
        return res.status(500).json({ error: 'Failed to instantiate cores', details: error.message });
    }
}
