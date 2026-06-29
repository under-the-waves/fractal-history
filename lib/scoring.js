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
export const WRITE_FULL = 30;         // points for a perfect write-your-own of ONE breadth (> B: writing
                                      // earns more than reviewing flashcards). Scaled by the mark's score.
// Write-your-own marks decay on their OWN spaced-repetition schedule, gentler than flashcards (writing
// is effortful and lasts longer). THETA_WRITE = sqrt(THETA) makes the per-interval decay exactly half
// as severe as flashcards. Re-writing advances the interval (7 -> 14 -> 30 -> 60 days, then doubling);
// a re-write must score >= WRITE_PASS to advance, else the interval resets to the first step.
export const THETA_WRITE = Math.sqrt(THETA);   // ~0.949: half the per-interval decay of flashcards
export const WRITE_INTERVALS = [7, 14, 30, 60]; // days until the next rewrite is due
export const WRITE_PASS = 60;                   // min mark (0-100) for a rewrite to graduate to the next interval
// A scored card or write whose retention falls below this counts as fully lapsed (0), so the score
// reflects what you still know rather than carrying a long tail of near-forgotten points.
export const FLOOR_RETENTION = 0.2;

/** Next write interval after `current` days: the next step up the ladder, then doubling beyond it. */
export function nextWriteInterval(current) {
    for (const v of WRITE_INTERVALS) if (v > current) return v;
    return current * 2;
}

/** The number shown on a node is just the rounded raw XP (unbounded). */
export function displayScore(subtreeRaw) {
    return Math.round(subtreeRaw || 0);
}

/**
 * own(node) = the node's flashcard mastery PLUS its write-your-own mastery.
 *   flashcard term: Σ over breadths of min(B, (B / FULL_CARDS) * retained-in-that-breadth). Each
 *     narrative (A/B/C) is worth up to B for mastering its ~FULL_CARDS cards; retention is computed
 *     live from the SRS columns, so a never-reviewed or absent card contributes 0.
 *   write term: Σ over the breadths the user has a stored mark for, of min(WRITE_FULL, score/100 *
 *     WRITE_FULL). Additive on top of the flashcard term, so writing earns separately from reviewing.
 * Both halves go through this one function, so applyReviewDelta and the nightly recompute pick up
 * write marks automatically.
 */
export async function computeOwnRaw(userId, anchorId) {
    // Flashcard term: per-card retention, with anything below FLOOR_RETENTION treated as lapsed (0).
    const rows = await sql`
        SELECT breadth, COALESCE(SUM(
            CASE
                WHEN last_reviewed_at IS NULL OR repetitions = 0 THEN 0
                WHEN power(${THETA}::numeric,
                        (EXTRACT(EPOCH FROM (NOW() - last_reviewed_at)) / 86400.0) / GREATEST(interval_days, 1)
                     ) < ${FLOOR_RETENTION} THEN 0
                ELSE power(${THETA}::numeric,
                        (EXTRACT(EPOCH FROM (NOW() - last_reviewed_at)) / 86400.0) / GREATEST(interval_days, 1)
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

    // Write term: each mark's magnitude (score-scaled, capped at WRITE_FULL) times its decayed
    // retention on the gentler write curve; below FLOOR_RETENTION it counts as lapsed (0).
    const writeRows = await sql`
        SELECT COALESCE(SUM(
            LEAST(${WRITE_FULL}, (score / 100.0) * ${WRITE_FULL}) * (
                CASE
                    WHEN last_written_at IS NULL THEN 0
                    WHEN power(${THETA_WRITE}::numeric,
                            (EXTRACT(EPOCH FROM (NOW() - last_written_at)) / 86400.0) / GREATEST(interval_days, 1)
                         ) < ${FLOOR_RETENTION} THEN 0
                    ELSE power(${THETA_WRITE}::numeric,
                            (EXTRACT(EPOCH FROM (NOW() - last_written_at)) / 86400.0) / GREATEST(interval_days, 1)
                         )
                END
            )
        ), 0) AS write_own
        FROM learn_marks
        WHERE user_id = ${userId} AND anchor_id = ${anchorId}
    `;
    own += Number(writeRows[0].write_own);

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
                INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, subtree_peak, updated_at)
                VALUES (${userId}, ${id}, ${newOwn}, ${delta}, GREATEST(${delta}::double precision, 0), NOW())
                ON CONFLICT (user_id, anchor_id) DO UPDATE
                SET own_raw = ${newOwn},
                    subtree_raw = user_topic_scores.subtree_raw + ${delta},
                    subtree_peak = GREATEST(user_topic_scores.subtree_peak, user_topic_scores.subtree_raw + ${delta}),
                    updated_at = NOW()
            `;
        } else {
            const inc = Math.pow(R, dist) * delta;
            await sql`
                INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, subtree_peak, updated_at)
                VALUES (${userId}, ${id}, 0, ${inc}, GREATEST(${inc}::double precision, 0), NOW())
                ON CONFLICT (user_id, anchor_id) DO UPDATE
                SET subtree_raw = user_topic_scores.subtree_raw + ${inc},
                    subtree_peak = GREATEST(user_topic_scores.subtree_peak, user_topic_scores.subtree_raw + ${inc}),
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
        UNION
        SELECT DISTINCT anchor_id FROM learn_marks WHERE user_id = ${userId}
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

    // Preserve each node's all-time peak across the rebuild (the peak is the high-water mark, not a
    // decayed value, so it must survive the nightly recompute that lowers current scores).
    const oldPeaks = new Map(
        (await sql`SELECT anchor_id, subtree_peak FROM user_topic_scores WHERE user_id = ${userId}`)
            .map(r => [r.anchor_id, Number(r.subtree_peak)])
    );

    // Rewrite this user's cache in full.
    await sql`DELETE FROM user_topic_scores WHERE user_id = ${userId}`;
    for (const [id, subtree] of subtreeMap) {
        const own = ownMap.get(id) || 0;
        const peak = Math.max(oldPeaks.get(id) || 0, subtree);
        await sql`
            INSERT INTO user_topic_scores (user_id, anchor_id, own_raw, subtree_raw, subtree_peak, updated_at)
            VALUES (${userId}, ${id}, ${own}, ${subtree}, ${peak}, NOW())
        `;
    }
}

/** A user's score at one node: raw XP (for ranking), the rounded number shown, and the all-time peak. */
export async function getUserNodeScore(userId, anchorId) {
    const rows = await sql`
        SELECT subtree_raw, subtree_peak FROM user_topic_scores
        WHERE user_id = ${userId} AND anchor_id = ${anchorId}
    `;
    const raw = rows.length ? Number(rows[0].subtree_raw) : 0;
    const peak = rows.length ? Number(rows[0].subtree_peak) : 0;
    return { raw, display: displayScore(raw), peak: displayScore(peak) };
}

/**
 * Persist a write-your-own mark and fold it into the score cache. The mark reflects CURRENT mastery,
 * so it stores the LATEST score (not the best ever) — a worse rewrite means you've forgotten some, and
 * the score should drop. Re-writing advances the spaced-repetition interval (7 -> 14 -> 30 -> 60 ...)
 * when the mark clears WRITE_PASS; a failing rewrite resets it to the first step. last_written_at is
 * refreshed either way, so the freshly-written points are at full value, then decay on the new interval.
 * Returns the XP just earned, the node's resulting score, the days until the next rewrite is due, and
 * whether this attempt advanced the schedule.
 */
export async function recordWriteMark(userId, anchorId, breadth, score, covered = 0, total = 0) {
    const prior = await sql`
        SELECT interval_days FROM learn_marks
        WHERE user_id = ${userId} AND anchor_id = ${anchorId} AND breadth = ${breadth}
    `;
    const passed = Number(score) >= WRITE_PASS;
    const interval = prior.length
        ? (passed ? nextWriteInterval(Number(prior[0].interval_days)) : WRITE_INTERVALS[0])
        : WRITE_INTERVALS[0];

    await sql`
        INSERT INTO learn_marks (user_id, anchor_id, breadth, score, covered, total, attempts, interval_days, last_written_at, updated_at)
        VALUES (${userId}, ${anchorId}, ${breadth}, ${score}, ${covered}, ${total}, 1, ${interval}, NOW(), NOW())
        ON CONFLICT (user_id, anchor_id, breadth) DO UPDATE SET
            score = EXCLUDED.score,
            covered = EXCLUDED.covered,
            total = EXCLUDED.total,
            attempts = learn_marks.attempts + 1,
            interval_days = ${interval},
            last_written_at = NOW(),
            updated_at = NOW()
    `;

    await applyReviewDelta(userId, anchorId);

    const writeXp = Math.min(WRITE_FULL, (Number(score) / 100) * WRITE_FULL); // at-write retention ≈ 1
    const node = await getUserNodeScore(userId, anchorId);
    return { writeXp: Math.round(writeXp), nodeScore: node.display, nextReviewDays: interval, passed };
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
