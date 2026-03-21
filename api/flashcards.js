import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from './utils/auth.js';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    const userId = await getAuthenticatedUser(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.method === 'GET') {
        return handleGet(req, res, userId);
    } else if (req.method === 'POST') {
        return handlePost(req, res, userId);
    } else if (req.method === 'DELETE') {
        return handleDelete(req, res, userId);
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

async function handleGet(req, res, userId) {
    try {
        const { anchorId } = req.query;

        let flashcards;
        if (anchorId) {
            flashcards = await sql`
                SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                       a.title as anchor_title
                FROM flashcards f
                JOIN anchors a ON f.anchor_id = a.id
                WHERE f.user_id = ${userId} AND f.anchor_id = ${anchorId}
                ORDER BY f.created_at DESC
            `;
        } else {
            flashcards = await sql`
                SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                       a.title as anchor_title
                FROM flashcards f
                JOIN anchors a ON f.anchor_id = a.id
                WHERE f.user_id = ${userId}
                ORDER BY f.created_at DESC
            `;
        }

        return res.status(200).json({ success: true, flashcards });
    } catch (error) {
        console.error('Error fetching flashcards:', error);
        return res.status(500).json({ error: 'Failed to fetch flashcards' });
    }
}

async function handlePost(req, res, userId) {
    try {
        const { anchorId, breadth, flashcards, question, answer } = req.body;

        if (!anchorId || !breadth) {
            return res.status(400).json({ error: 'anchorId and breadth are required' });
        }

        // Support both single and batch saves
        const items = flashcards || [{ question, answer }];

        if (!items.length || !items[0].question || !items[0].answer) {
            return res.status(400).json({ error: 'At least one flashcard with question and answer is required' });
        }

        const created = [];
        for (const item of items) {
            const result = await sql`
                INSERT INTO flashcards (user_id, anchor_id, breadth, question, answer)
                VALUES (${userId}, ${anchorId}, ${breadth}, ${item.question}, ${item.answer})
                ON CONFLICT (user_id, anchor_id, breadth, md5(question)) DO NOTHING
                RETURNING id
            `;
            if (result.length > 0) {
                created.push(result[0].id);
            }
        }

        return res.status(201).json({ success: true, created, count: created.length });
    } catch (error) {
        console.error('Error saving flashcards:', error);
        return res.status(500).json({ error: 'Failed to save flashcards' });
    }
}

async function handleDelete(req, res, userId) {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Flashcard id is required' });
        }

        const result = await sql`
            DELETE FROM flashcards
            WHERE id = ${id} AND user_id = ${userId}
            RETURNING id
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Flashcard not found or not owned by you' });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting flashcard:', error);
        return res.status(500).json({ error: 'Failed to delete flashcard' });
    }
}
