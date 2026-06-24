import { neon } from '@neondatabase/serverless';
import { getAuthenticatedUser } from '../lib/auth.js';
import { applyReviewDelta } from '../lib/scoring.js';

const sql = neon(process.env.DATABASE_URL);

const PERSONAL_SLOT_MAX = 3;

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
        if (mode === 'slots') {
            return handleGetSlots(req, res, userId);
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
        if (req.body?.action === 'set-slot') {
            return handleSetSlot(req, res, userId);
        }

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

// Anki-style SRS with two phases:
//   Learning (reps 0-1): fixed graduating intervals
//   Review   (reps 2+):  SM-2 with ease factor
// Rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
function calculateSRS(card, rating) {
    let { ease_factor, interval_days, repetitions } = card;
    ease_factor = ease_factor || 2.5;
    interval_days = interval_days || 0;
    repetitions = repetitions || 0;

    let newEase = ease_factor;
    let newInterval;
    let newReps;

    if (rating === 0) {
        // Again — always reset to re-show
        newEase = Math.max(1.3, ease_factor - 0.20);
        newInterval = 0;
        newReps = 0;
    } else if (repetitions === 0) {
        // New card — fixed graduating intervals
        newReps = 1;
        if (rating === 1) { newInterval = 1; newEase = Math.max(1.3, ease_factor - 0.15); }
        else if (rating === 2) { newInterval = 3; }
        else { newInterval = 5; newEase = ease_factor + 0.15; } // Easy
    } else if (repetitions === 1) {
        // Second review — Anki graduating interval
        newReps = 2;
        if (rating === 1) { newInterval = Math.max(interval_days + 1, Math.round(interval_days * 1.2)); newEase = Math.max(1.3, ease_factor - 0.15); }
        else if (rating === 2) { newInterval = 6; }
        else { newInterval = 8; newEase = ease_factor + 0.15; } // Easy
    } else {
        // Mature card — SM-2
        newReps = repetitions + 1;
        const base = Math.round(interval_days * ease_factor);
        if (rating === 1) {
            newEase = Math.max(1.3, ease_factor - 0.15);
            newInterval = Math.max(interval_days + 1, Math.round(interval_days * 1.2));
        } else if (rating === 2) {
            newInterval = Math.max(interval_days + 1, base);
        } else {
            // Easy
            newEase = ease_factor + 0.15;
            newInterval = Math.max(interval_days + 1, Math.round(base * 1.3));
        }
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
            SELECT id, anchor_id, ease_factor, interval_days, repetitions, is_core, is_personal_slot
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

        // Reviewing a scored card changes its retention, so update the mastery score up the tree.
        if (card.is_core || card.is_personal_slot) {
            await applyReviewDelta(userId, card.anchor_id);
        }

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

// Read the stored candidate pool for a narrative (parsed). Empty array if none yet.
async function readPool(anchorId, breadth) {
    const rows = await sql`
        SELECT questions FROM narratives WHERE anchor_id = ${anchorId} AND breadth = ${breadth} LIMIT 1
    `;
    if (!rows.length || !rows[0].questions) return [];
    return typeof rows[0].questions === 'string' ? JSON.parse(rows[0].questions) : rows[0].questions;
}

// GET ?mode=slots&anchorId=&breadth= : the user's current personal slots for a narrative, plus the
// non-core pool cards they can choose from (each flagged `selected`), and how many slots remain.
async function handleGetSlots(req, res, userId) {
    try {
        const { anchorId, breadth } = req.query;
        if (!anchorId || !breadth) {
            return res.status(400).json({ error: 'anchorId and breadth are required' });
        }
        const pool = await readPool(anchorId, breadth);
        const slotRows = await sql`
            SELECT question FROM flashcards
            WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth} AND is_personal_slot
        `;
        const selected = new Set(slotRows.map(r => r.question));
        const cores = pool
            .filter(q => q.core)
            .map(q => ({ question: q.question, answer: q.answer }));
        const available = pool
            .filter(q => !q.core)
            .map(q => ({ question: q.question, answer: q.answer, group: q.group, selected: selected.has(q.question) }));
        return res.status(200).json({
            success: true,
            cores,
            available,
            used: selected.size,
            max: PERSONAL_SLOT_MAX
        });
    } catch (error) {
        console.error('Error fetching slots:', error);
        return res.status(500).json({ error: 'Failed to fetch slots' });
    }
}

// POST { action: 'set-slot', anchorId, breadth, question, answer?, enabled? }
// Assign (enabled !== false) or unassign a personal-slot card. Slots must be NON-CORE cards drawn
// from the narrative's pool (so they are grounded and comparable across users), capped at 3 per
// narrative. The mastery score is recomputed afterwards because the set of scored cards changed.
async function handleSetSlot(req, res, userId) {
    try {
        const { anchorId, breadth, question, answer, enabled } = req.body;
        if (!anchorId || !breadth || !question) {
            return res.status(400).json({ error: 'anchorId, breadth, and question are required' });
        }
        const on = enabled !== false;

        if (on) {
            const pool = await readPool(anchorId, breadth);
            const match = pool.find(q => q.question === question);
            if (!match) {
                return res.status(400).json({ error: "Card is not in this narrative's pool" });
            }
            if (match.core) {
                return res.status(400).json({ error: 'Core cards already count; choose a non-core card for a slot' });
            }
            const countRows = await sql`
                SELECT count(*)::int AS n FROM flashcards
                WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth} AND is_personal_slot
            `;
            const alreadySlot = await sql`
                SELECT 1 FROM flashcards
                WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth}
                  AND question = ${question} AND is_personal_slot LIMIT 1
            `;
            if (countRows[0].n >= PERSONAL_SLOT_MAX && alreadySlot.length === 0) {
                return res.status(409).json({ error: `You already have ${PERSONAL_SLOT_MAX} personal slots for this narrative` });
            }
            await sql`
                INSERT INTO flashcards (user_id, anchor_id, breadth, question, answer, is_personal_slot)
                VALUES (${userId}, ${anchorId}, ${breadth}, ${question}, ${answer || match.answer}, true)
                ON CONFLICT (user_id, anchor_id, breadth, md5(question)) DO UPDATE SET is_personal_slot = true
            `;
        } else {
            await sql`
                UPDATE flashcards SET is_personal_slot = false
                WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth} AND question = ${question}
            `;
        }

        // The set of scored cards changed, so refresh the mastery score up the ancestor chain.
        await applyReviewDelta(userId, anchorId);

        const countRows = await sql`
            SELECT count(*)::int AS n FROM flashcards
            WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth} AND is_personal_slot
        `;
        return res.status(200).json({ success: true, used: countRows[0].n, max: PERSONAL_SLOT_MAX });
    } catch (error) {
        console.error('Error setting slot:', error);
        return res.status(500).json({ error: 'Failed to set slot' });
    }
}
