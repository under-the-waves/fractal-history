// Scoring engine for per-topic mastery (XP). See: project knowledge/Scoring_Engine_Design.md
//
// Model (brief):
//   retention r(card) = THETA ^ (days_since_last_review / max(interval_days, 1))   in [0, 1]
//   own(node)         = Σ over breadths of min(B, (B / FULL_CARDS) * Σ r in that breadth)
//                       -- each narrative (breadth A/B/C) is worth up to B for mastering its ~5 cards,
//                       so one narrative = B and a node with all three mastered = 3*B, any depth.
//   score(node)       = own(node) + R * Σ score(child)        (recursive; cached as subtree_raw)
//
// score(node) is an unbounded XP number shown directly (no 0-100 cap): own content is worth up to B,
// and each child's whole score rolls up discounted by R per level. The root aggregates everything,
// so it climbs into the thousands. Reviews raise scores immediately (propagated up the ancestor
// chain, O(depth)); the nightly pass applies forgetting (lowers them).

import { neon } from '@neondatabase/serverless';
import { getAncestorDistances } from './db.js';

const sql = neon(process.env.DATABASE_URL);

// --- tunable constants (single source of truth) ---
export const THETA = 0.9;             // retention at exactly one SRS interval
export const R = 0.95;                // how much a child's score rolls up into its parent (gentle taper)
export const B = 20;                  // points for fully mastering ONE narrative (breadth) of a node
export const FULL_CARDS = 5;          // retaining this many of a breadth's scored cards (its cores) = B

/** The number shown on a node is just the rounded raw XP (unbounded). */
export function displayScore(subtreeRaw) {
    return Math.round(subtreeRaw || 0);
}

/**
 * own(node) = Σ over the node's breadths of min(B, (B / FULL_CARDS) * retained-in-that-breadth). Each
 * narrative (A/B/C) is independently worth up to B for mastering its ~FULL_CARDS cards, so one
 * narrative = B and all three = 3*B, regardless of depth. Retention is computed live from the SRS
 * columns; a never-reviewed or absent card contributes 0.
 */
export async function computeOwnRaw(userId, anchorId) {
    const rows = await sql`
        SELECT breadth, COALESCE(SUM(
            CASE
                WHEN last_reviewed_at IS NULL OR repetitions = 0 THEN 0
                ELSE power(
                    ${THETA}::numeric,
                    (EXTRACT(EPOCH FROM (NOW() - last_reviewed_at)) / 86400.0)
                        / GREATEST(interval_days, 1)
                )
            END
        ), 0) AS retained
        FROM flashcards
        WHERE user_id = ${userId}
          AND anchor_id = ${anchorId}
          AND (is_core OR is_personal_slot)
        GROUP BY breadth
    `;
    let own = 0;
    for (const r of rows) own += Math.min(B, (B / FULL_CARDS) * Number(r.retained));
    return own;
}

/**
 * Per-breadth own score for every anchor the user has engaged: { anchorId: { A, B, C } } with each
 * value 0..B. Used by the UI to show which breadths of a node are complete. One grouped query.
 */
export async function computeBreadthBreakdown(userId) {
    const rows = await sql`
        SELECT anchor_id, breadth, COALESCE(SUM(
            CASE
                WHEN last_reviewed_at IS NULL OR repetitions = 0 THEN 0
                ELSE power(
                    ${THETA}::numeric,
                    (EXTRACT(EPOCH FROM (NOW() - last_reviewed_at)) / 86400.0)
                        / GREATEST(interval_days, 1)
                )
            END
        ), 0) AS retained
        FROM flashcards
        WHERE user_id = ${userId} AND (is_core OR is_personal_slot)
        GROUP BY anchor_id, breadth
    `;
    const map = {};
    for (const r of rows) {
        (map[r.anchor_id] ||= {})[r.breadth] = Math.min(B, (B / FULL_CARDS) * Number(r.retained));
    }
    return map;
}

/**
 * Incremental update after a review. Recompute this anchor's own_raw, take the delta versus the
 * cached value, and add R^dist * delta to every ancestor at its shortest distance. O(ancestors)
 * writes. Safe to call for any reviewed card: a non-scored card yields delta 0 and writes nothing.
 *
 * getAncestorDistances counts each ancestor ONCE at its nearest route, so a reused (repeated) anchor
 * never double-counts into a shared ancestor: the ancestor takes the anchor by its shortest path and
 * ignores the longer one. On a plain tree distance == depth, so this matches the old behaviour.
 */
export async function applyReviewDelta(userId, anchorId) {
    const newOwn = await computeOwnRaw(userId, anchorId);

    const prev = await sql`
        SELECT own_raw FROM user_topic_scores
        WHERE user_id = ${userId} AND anchor_id = ${anchorId}
    `;
    const prevOwn = prev.length ? Number(prev[0].own_raw) : 0;
    const delta = newOwn - prevOwn;
    if (Math.abs(delta) < 1e-9) return;

    // { id, dist } for the node (dist 0) and each ancestor at its shortest distance, deduped by id.
    const ancestors = await getAncestorDistances(anchorId);

    for (const { id, dist } of ancestors) {
        if (dist === 0) {
            await sql`
                INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, updated_at)
                VALUES (${userId}, ${id}, ${newOwn}, ${delta}, NOW())
                ON CONFLICT (user_id, anchor_id) DO UPDATE
                SET own_raw = ${newOwn},
                    subtree_raw = user_topic_scores.subtree_raw + ${delta},
                    updated_at = NOW()
            `;
        } else {
            const inc = Math.pow(R, dist) * delta;
            await sql`
                INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, updated_at)
                VALUES (${userId}, ${id}, 0, ${inc}, NOW())
                ON CONFLICT (user_id, anchor_id) DO UPDATE
                SET subtree_raw = user_topic_scores.subtree_raw + ${inc},
                    updated_at = NOW()
            `;
        }
    }
}

/**
 * Nightly decay pass for one user: recompute every engaged anchor's own_raw from current
 * (now-decayed) retention and rebuild the subtree roll-ups from scratch. Cheap per user because a
 * user only engages a bounded set of anchors. Run from a cron job over active users.
 */
export async function recomputeUserScores(userId) {
    const owned = await sql`
        SELECT DISTINCT anchor_id FROM flashcards
        WHERE user_id = ${userId} AND (is_core OR is_personal_slot)
    `;

    const ownMap = new Map();
    for (const { anchor_id } of owned) {
        ownMap.set(anchor_id, await computeOwnRaw(userId, anchor_id));
    }

    // subtree(node) = Σ over engaged descendants d (incl. node) of R^distance * own(d), where each
    // descendant is counted once at its SHORTEST distance — so a reused anchor adds to a shared
    // ancestor by its nearest route only, never twice.
    const subtreeMap = new Map();
    for (const [anchorId, own] of ownMap) {
        if (own === 0) continue;
        for (const { id, dist } of await getAncestorDistances(anchorId)) {
            subtreeMap.set(id, (subtreeMap.get(id) || 0) + Math.pow(R, dist) * own);
        }
    }

    // Rewrite this user's cache in full.
    await sql`DELETE FROM user_topic_scores WHERE user_id = ${userId}`;
    for (const [id, subtree] of subtreeMap) {
        const own = ownMap.get(id) || 0;
        await sql`
            INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, updated_at)
            VALUES (${userId}, ${id}, ${own}, ${subtree}, NOW())
        `;
    }
}

/** A user's score at one node: raw XP (for ranking) and the rounded number shown. */
export async function getUserNodeScore(userId, anchorId) {
    const rows = await sql`
        SELECT subtree_raw FROM user_topic_scores
        WHERE user_id = ${userId} AND anchor_id = ${anchorId}
    `;
    const raw = rows.length ? Number(rows[0].subtree_raw) : 0;
    return { raw, display: displayScore(raw) };
}

/** Per-node leaderboard, ranked on raw (not the saturated display, which would cluster at the top). */
export async function getNodeLeaderboard(anchorId, limit = 20) {
    return await sql`
        SELECT user_id, subtree_raw
        FROM user_topic_scores
        WHERE anchor_id = ${anchorId}
        ORDER BY subtree_raw DESC
        LIMIT ${limit}
    `;
}
