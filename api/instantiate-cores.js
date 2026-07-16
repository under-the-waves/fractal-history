import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { getAuthenticatedUser } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { generateAndStoreFlashcards } from './generate-flashcards.js';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Ensures this narrative's pool exists and its 5 CORE cards are marked, then either previews them
// (GET) or adds them to the signed-in user's collection as is_core = true, so they become reviewable
// and therefore scorable (POST). If the stored pool has no marked cores yet (e.g. it pre-dates core
// marking, or was never generated), it (re)generates and marks the pool first.
//
// Adding core cards is an explicit user action (see project knowledge/Scoring_Engine_Design.md, Phase
// 1, and the opt-in-core-cards change): the frontend calls GET on mount to show each core card with
// its current added/not-added state, then calls POST per card ("Add") or for the remaining cards
// ("Add all core cards"). Nothing is inserted on GET.
//
// GET  /api/instantiate-cores?id=&breadth=
//   -> { success, ready, cores: [{ question, answer, added }] }  (no DB writes for the user)
//
// POST /api/instantiate-cores?id=&breadth=  body: { questions?: string[] }
//   - questions omitted -> upsert every core card ("Add all core cards")
//   - questions given   -> upsert only the core cards whose question is in the list ("Add" one card)
//   -> { success, ready, added: string[], total: number }
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
            return res.status(200).json(
                req.method === 'GET' ? { success: true, ready: false, cores: [] }
                                      : { success: true, ready: false, added: [], total: 0 }
            );
        }

        if (req.method === 'GET') {
            // Preview only: report which cores the user already has, without writing anything.
            const existing = await sql`
                SELECT question FROM flashcards
                WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth} AND is_core
            `;
            const addedQuestions = new Set(existing.map(r => r.question));
            const coreCards = cores.map(c => ({
                question: c.question,
                answer: c.answer,
                added: addedQuestions.has(c.question)
            }));
            return res.status(200).json({ success: true, ready: true, cores: coreCards });
        }

        // POST: an explicit list of questions adds only those cores; no list adds all of them.
        const requested = Array.isArray(req.body?.questions) ? new Set(req.body.questions) : null;
        const toAdd = requested ? cores.filter(c => requested.has(c.question)) : cores;

        // Upsert each requested core as one of the user's flashcards, tagged is_core. Idempotent: if
        // the user already saved that question, it gets upgraded to a core rather than duplicated.
        const added = [];
        for (const c of toAdd) {
            await sql`
                INSERT INTO flashcards (user_id, anchor_id, breadth, question, answer, is_core)
                VALUES (${userId}, ${anchorId}, ${breadth}, ${c.question}, ${c.answer}, true)
                ON CONFLICT (user_id, anchor_id, breadth, md5(question))
                DO UPDATE SET is_core = true
            `;
            added.push(c.question);
        }

        return res.status(200).json({ success: true, ready: true, added, total: cores.length });

    } catch (error) {
        if (error.message === 'NARRATIVE_NOT_FOUND') {
            // Narrative text not generated yet; nothing to instantiate. Not an error for the caller.
            return res.status(200).json(
                req.method === 'GET' ? { success: true, ready: false, cores: [] }
                                      : { success: true, ready: false, added: [], total: 0 }
            );
        }
        console.error('Error instantiating cores:', error);
        return res.status(500).json({ error: 'Failed to instantiate cores', details: error.message });
    }
}
