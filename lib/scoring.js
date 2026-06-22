// Scoring engine for per-topic mastery (XP). See: project knowledge/Scoring_Engine_Design.md
//
// Model (brief):
//   retention r(card) = THETA ^ (days_since_last_review / max(interval_days, 1))   in [0, 1]
//   own(node)         = min(B, (B / FULL_CARDS) * Σ r over the node's scored cards)
//                       -- up to B points for mastering ~FULL_CARDS of its cards (cores/slots),
//                       the SAME wherever the node sits, so every node is worth as much to itself.
//   score(node)       = own(node) + R * Σ score(child)        (recursive; cached as subtree_raw)
//
// score(node) is an unbounded XP number shown directly (no 0-100 cap): own content is worth up to B,
// and each child's whole score rolls up discounted by R per level. The root aggregates everything,
// so it climbs into the thousands. Reviews raise scores immediately (propagated up the ancestor
// chain, O(depth)); the nightly pass applies forgetting (lowers them).

import { neon } from '@neondatabase/serverless';
import { getAncestorPath } from './db.js';

const sql = neon(process.env.DATABASE_URL);

// --- tunable constants (single source of truth) ---
export const THETA = 0.9;             // retention at exactly one SRS interval
export const R = 0.95;                // how much a child's score rolls up into its parent (gentle taper)
export const B = 20;                  // points for fully mastering a single node's own cards
export const FULL_CARDS = 5;          // retaining this many scored cards (its cores) fully masters a node (= B)

/** The number shown on a node is just the rounded raw XP (unbounded). */
export function displayScore(subtreeRaw) {
    return Math.round(subtreeRaw || 0);
}

/**
 * own(node) = min(B, (B / FULL_CARDS) * retained), where `retained` is the live sum of retention over
 * the user's scored cards for this anchor (cores + personal slots). Mastering its ~FULL_CARDS cards is
 * worth B regardless of depth, so every node is worth the same to itself; extra retained cards (more
 * slots / other breadths) help reach and hold B but cannot push a single node above it. Retention is
 * computed live from the SRS columns; a never-reviewed or absent card contributes 0.
 */
export async function computeOwnRaw(userId, anchorId) {
    const rows = await sql`
        SELECT COALESCE(SUM(
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
    `;
    return Math.min(B, (B / FULL_CARDS) * Number(rows[0].retained));
}

/**
 * Incremental update after a review. Recompute this anchor's own_raw, take the delta versus the
 * cached value, and add R^k * delta to every ancestor k levels up. O(depth) writes.
 * Safe to call for any reviewed card: a non-scored card yields delta 0 and writes nothing.
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

    // [anchor (k=0), parent (k=1), ..., root]. Dedupe by id: getAncestorPath lists the root anchor
    // twice when the node IS the root, which would otherwise double-count it.
    const seen = new Set();
    const chain = (await getAncestorPath(anchorId)).reverse().filter(n => !seen.has(n.id) && seen.add(n.id));

    for (let k = 0; k < chain.length; k++) {
        const id = chain[k].id;
        if (k === 0) {
            await sql`
                INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, updated_at)
                VALUES (${userId}, ${id}, ${newOwn}, ${delta}, NOW())
                ON CONFLICT (user_id, anchor_id) DO UPDATE
                SET own_raw = ${newOwn},
                    subtree_raw = user_topic_scores.subtree_raw + ${delta},
                    updated_at = NOW()
            `;
        } else {
            const inc = Math.pow(R, k) * delta;
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

    // subtree(node) = Σ over engaged descendants d (incl. node) of R^distance * own(d)
    const subtreeMap = new Map();
    for (const [anchorId, own] of ownMap) {
        if (own === 0) continue;
        const seen = new Set();
        const chain = (await getAncestorPath(anchorId)).reverse().filter(n => !seen.has(n.id) && seen.add(n.id));
        for (let k = 0; k < chain.length; k++) {
            const id = chain[k].id;
            subtreeMap.set(id, (subtreeMap.get(id) || 0) + Math.pow(R, k) * own);
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
