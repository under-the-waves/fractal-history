import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from './utils/auth.js';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    console.log('Flashcards API:', req.method, req.url);
    const userId = await getAuthenticatedUser(req);
    if (!userId) {
        console.log('Flashcards API: Auth failed, returning 401');
        return res.status(401).json({ error: 'Authentication required' });
    }
    console.log('Flashcards API: Authenticated as', userId);

    if (req.method === 'GET') {
        return handleGet(req, res, userId);
    } else if (req.method === 'POST') {
        return handlePost(req, res, userId);
    } else if (req.method === 'PATCH') {
        return handlePatch(req, res, userId);
    } else if (req.method === 'DELETE') {
        return handleDelete(req, res, userId);
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

async function handleGet(req, res, userId) {
    try {
        const { anchorId, mode } = req.query;

        if (mode === 'review') {
            return handleGetReview(req, res, userId);
        }
        if (mode === 'stats') {
            return handleGetStats(req, res, userId);
        }

        let flashcards;
        if (anchorId) {
            flashcards = await sql`
                SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                       f.next_review_date, f.interval_days, f.ease_factor, f.repetitions, f.last_reviewed_at,
                       a.title as anchor_title
                FROM flashcards f
                JOIN anchors a ON f.anchor_id = a.id
                WHERE f.user_id = ${userId} AND f.anchor_id = ${anchorId}
                ORDER BY f.created_at DESC
            `;
        } else {
            flashcards = await sql`
                SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                       f.next_review_date, f.interval_days, f.ease_factor, f.repetitions, f.last_reviewed_at,
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

async function handleGetReview(req, res, userId) {
    try {
        const newCardLimit = parseInt(req.query.newLimit) || 20;

        // Overdue cards first (oldest due date first), then new cards (oldest first)
        const dueCards = await sql`
            SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                   f.next_review_date, f.interval_days, f.ease_factor, f.repetitions, f.last_reviewed_at,
                   a.title as anchor_title
            FROM flashcards f
            JOIN anchors a ON f.anchor_id = a.id
            WHERE f.user_id = ${userId}
              AND f.next_review_date IS NOT NULL
              AND f.next_review_date <= NOW()
            ORDER BY f.next_review_date ASC
        `;

        const newCards = await sql`
            SELECT f.id, f.anchor_id, f.breadth, f.question, f.answer, f.created_at,
                   f.next_review_date, f.interval_days, f.ease_factor, f.repetitions, f.last_reviewed_at,
                   a.title as anchor_title
            FROM flashcards f
            JOIN anchors a ON f.anchor_id = a.id
            WHERE f.user_id = ${userId}
              AND f.next_review_date IS NULL
            ORDER BY f.created_at ASC
            LIMIT ${newCardLimit}
        `;

        const flashcards = [...dueCards, ...newCards];
        return res.status(200).json({ success: true, flashcards });
    } catch (error) {
        console.error('Error fetching review cards:', error);
        return res.status(500).json({ error: 'Failed to fetch review cards' });
    }
}

async function handleGetStats(req, res, userId) {
    try {
        const stats = await sql`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE next_review_date IS NOT NULL AND next_review_date <= NOW()) as due,
                COUNT(*) FILTER (WHERE next_review_date IS NULL) as new,
                COUNT(*) FILTER (WHERE last_reviewed_at IS NOT NULL AND last_reviewed_at >= CURRENT_DATE) as reviewed_today
            FROM flashcards
            WHERE user_id = ${userId}
        `;

        const row = stats[0];
        return res.status(200).json({
            success: true,
            stats: {
                total: parseInt(row.total),
                due: parseInt(row.due),
                new: parseInt(row.new),
                reviewedToday: parseInt(row.reviewed_today)
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        return res.status(500).json({ error: 'Failed to fetch stats' });
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

// SM-2 algorithm with Anki's 4-button simplification
// Rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
function calculateSRS(card, rating) {
    let { ease_factor, interval_days, repetitions } = card;
    ease_factor = ease_factor || 2.5;
    interval_days = interval_days || 0;
    repetitions = repetitions || 0;

    let newEase = ease_factor;
    let newInterval;
    let newReps = repetitions;

    switch (rating) {
        case 0: // Again
            newEase = Math.max(1.3, ease_factor - 0.20);
            newInterval = 0;
            newReps = 0;
            break;
        case 1: // Hard
            newEase = Math.max(1.3, ease_factor - 0.15);
            newInterval = Math.max(1, Math.round(interval_days * 1.2));
            break;
        case 2: // Good
            newEase = ease_factor;
            newReps = repetitions + 1;
            if (repetitions === 0) {
                newInterval = 1;
            } else if (repetitions === 1) {
                newInterval = 6;
            } else {
                newInterval = Math.round(interval_days * ease_factor);
            }
            break;
        case 3: // Easy
            newEase = ease_factor + 0.15;
            newReps = repetitions + 1;
            if (repetitions === 0) {
                newInterval = 4;
            } else if (repetitions === 1) {
                newInterval = 6;
            } else {
                newInterval = Math.round(interval_days * ease_factor);
            }
            newInterval = Math.round(newInterval * 1.3);
            break;
        default:
            throw new Error(`Invalid rating: ${rating}`);
    }

    return {
        ease_factor: newEase,
        interval_days: newInterval,
        repetitions: newReps
    };
}

async function handlePatch(req, res, userId) {
    try {
        const { id, rating } = req.body;

        if (id === undefined || rating === undefined) {
            return res.status(400).json({ error: 'id and rating are required' });
        }

        if (rating < 0 || rating > 3) {
            return res.status(400).json({ error: 'rating must be 0-3 (Again/Hard/Good/Easy)' });
        }

        // Fetch current card
        const cards = await sql`
            SELECT id, ease_factor, interval_days, repetitions
            FROM flashcards
            WHERE id = ${id} AND user_id = ${userId}
        `;

        if (cards.length === 0) {
            return res.status(404).json({ error: 'Flashcard not found' });
        }

        const card = cards[0];
        const srs = calculateSRS(card, rating);

        const updated = await sql`
            UPDATE flashcards
            SET ease_factor = ${srs.ease_factor},
                interval_days = ${srs.interval_days},
                repetitions = ${srs.repetitions},
                next_review_date = NOW() + INTERVAL '1 day' * ${srs.interval_days},
                last_reviewed_at = NOW()
            WHERE id = ${id} AND user_id = ${userId}
            RETURNING id, ease_factor, interval_days, repetitions, next_review_date, last_reviewed_at
        `;

        return res.status(200).json({ success: true, flashcard: updated[0] });
    } catch (error) {
        console.error('Error reviewing flashcard:', error);
        return res.status(500).json({ error: 'Failed to review flashcard' });
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
