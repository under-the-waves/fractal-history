// Achievement engine. Builds a per-user stats object, evaluates the definitions in
// shared/achievements.js, and persists unlocks. Also banks narrative mastery permanently and records
// daily activity for streaks. See shared/achievements.js for the definitions.

import { neon } from '@neondatabase/serverless';
import { computeBreadthBreakdown } from './scoring.js';
import { levelForScore } from '../shared/levels.js';
import { ACHIEVEMENTS, earnedKeys, achievementByKey } from '../shared/achievements.js';

const sql = neon(process.env.DATABASE_URL);

// A narrative counts as "mastered" once its own breadth score reaches this (matches the green
// completion underline on the tree tiles: own >= 19 of a possible 20).
const MASTERY_THRESHOLD = 19;

/** Bank every narrative the user has currently mastered into the permanent ledger (idempotent).
 *  Called after a review and on load, so mastery is captured even if the live score later decays. */
export async function bankMastery(userId) {
    const breakdown = await computeBreadthBreakdown(userId); // { anchorId: { A, B, C } } live own scores
    const rows = [];
    for (const [anchorId, byBreadth] of Object.entries(breakdown)) {
        for (const [breadth, score] of Object.entries(byBreadth)) {
            if (score >= MASTERY_THRESHOLD) rows.push({ anchorId, breadth });
        }
    }
    for (const { anchorId, breadth } of rows) {
        await sql`
            INSERT INTO mastered_narratives (user_id, anchor_id, breadth)
            VALUES (${userId}, ${anchorId}, ${breadth})
            ON CONFLICT (user_id, anchor_id, breadth) DO NOTHING
        `;
    }
}

/** Record that the user did something today (for streaks). Idempotent per day. */
export async function recordActivityDay(userId) {
    await sql`
        INSERT INTO user_activity_days (user_id, day)
        VALUES (${userId}, CURRENT_DATE)
        ON CONFLICT (user_id, day) DO NOTHING
    `;
}

/** Current consecutive-day streak, counting back from today (or yesterday, so a not-yet-studied today
 *  doesn't break a run). Uses UTC day strings to match CURRENT_DATE on Neon. */
async function computeStreak(userId) {
    const rows = await sql`
        SELECT to_char(day, 'YYYY-MM-DD') AS d
        FROM user_activity_days WHERE user_id = ${userId}
        ORDER BY day DESC LIMIT 400
    `;
    const days = new Set(rows.map(r => r.d));
    const fmt = (dt) => dt.toISOString().slice(0, 10);
    const cursor = new Date();
    if (!days.has(fmt(cursor))) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);      // allow the streak to stand if today is unstudied
        if (!days.has(fmt(cursor))) return 0;
    }
    let streak = 0;
    while (days.has(fmt(cursor))) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
}

/** Build the full stats object the achievement predicates read. */
export async function computeStats(userId) {
    // Permanent mastery ledger: totals, per-axis, and fully-mastered anchors.
    const byBreadth = await sql`
        SELECT breadth, COUNT(*)::int AS c FROM mastered_narratives
        WHERE user_id = ${userId} GROUP BY breadth
    `;
    const axisMastered = { A: 0, B: 0, C: 0 };
    for (const r of byBreadth) axisMastered[r.breadth] = r.c;
    const narrativesMastered = axisMastered.A + axisMastered.B + axisMastered.C;

    const fullRows = await sql`
        SELECT COUNT(*)::int AS c FROM (
            SELECT anchor_id FROM mastered_narratives WHERE user_id = ${userId}
            GROUP BY anchor_id HAVING COUNT(*) = 3
        ) t
    `;
    const anchorsFullyMastered = fullRows[0].c;

    // Distinct world regions among mastered geographic (C) narratives.
    const regionRows = await sql`
        SELECT COUNT(DISTINCT elem) AS c
        FROM mastered_narratives mn
        JOIN anchors a ON a.id = mn.anchor_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(COALESCE(a.region_codes::jsonb, '[]'::jsonb)) = 'array'
                 THEN a.region_codes::jsonb ELSE '[]'::jsonb END
        ) AS elem
        WHERE mn.user_id = ${userId} AND mn.breadth = 'C'
    `;
    const regionsC = Number(regionRows[0].c) || 0;

    // Deepest anchor the user has any score on.
    const depthRows = await sql`
        SELECT COALESCE(MAX(tp.level), 0)::int AS m
        FROM user_topic_scores uts
        JOIN tree_positions tp ON tp.anchor_id = uts.anchor_id
        WHERE uts.user_id = ${userId}
    `;
    const maxDepth = depthRows[0].m;

    // Levels from peak scores (global = root anchor, plus the best single-node level).
    const scoreRows = await sql`
        SELECT anchor_id, subtree_peak FROM user_topic_scores WHERE user_id = ${userId}
    `;
    let globalLevel = 0, maxNodeLevel = 0;
    for (const r of scoreRows) {
        const lvl = levelForScore(Number(r.subtree_peak));
        if (r.anchor_id === '0-ROOT') globalLevel = lvl;
        if (lvl > maxNodeLevel) maxNodeLevel = lvl;
    }

    // Write-your-own stats.
    const writeRows = await sql`
        SELECT COUNT(*)::int AS c, COALESCE(MAX(score), 0)::int AS best
        FROM learn_marks WHERE user_id = ${userId}
    `;
    const writeCount = writeRows[0].c;
    const bestWrite = writeRows[0].best;
    const writeAllRows = await sql`
        SELECT 1 FROM learn_marks WHERE user_id = ${userId}
        GROUP BY anchor_id HAVING COUNT(DISTINCT breadth) = 3 LIMIT 1
    `;
    const writeAllBreadthsNode = writeAllRows.length > 0;

    // Narratives currently at full retention (live, for Total Recall).
    const liveBreakdown = await computeBreadthBreakdown(userId);
    let currentFresh = 0;
    for (const byB of Object.values(liveBreakdown)) {
        for (const score of Object.values(byB)) if (score >= MASTERY_THRESHOLD) currentFresh += 1;
    }

    const streak = await computeStreak(userId);

    return {
        narrativesMastered, anchorsFullyMastered, axisMastered, regionsC, maxDepth,
        globalLevel, maxNodeLevel, writeCount, bestWrite, writeAllBreadthsNode, currentFresh, streak,
    };
}

/** Evaluate all achievements for a user, persist any newly unlocked, and return the new ones (as
 *  definition objects). Idempotent: already-unlocked achievements are never re-inserted or re-returned. */
export async function evaluateAchievements(userId, stats) {
    const s = stats || await computeStats(userId);
    const earned = earnedKeys(s);
    if (earned.length === 0) return [];

    const existing = new Set(
        (await sql`SELECT achievement_key FROM user_achievements WHERE user_id = ${userId}`)
            .map(r => r.achievement_key)
    );
    const newlyKeys = earned.filter(k => !existing.has(k));
    for (const key of newlyKeys) {
        await sql`
            INSERT INTO user_achievements (user_id, achievement_key)
            VALUES (${userId}, ${key})
            ON CONFLICT (user_id, achievement_key) DO NOTHING
        `;
    }
    return newlyKeys.map(k => achievementByKey(k)).filter(Boolean)
        .map(({ key, name, category, description }) => ({ key, name, category, description }));
}

/** The user's unlocked achievements (keys + timestamps) for display. */
export async function getUnlocked(userId) {
    const rows = await sql`
        SELECT achievement_key, unlocked_at FROM user_achievements WHERE user_id = ${userId}
    `;
    return rows.map(r => ({ key: r.achievement_key, at: r.unlocked_at }));
}

/** Global and node level for a single anchor, for level-up detection around a review/write. */
export async function levelSnapshot(userId, anchorId) {
    const rows = await sql`
        SELECT anchor_id, subtree_peak FROM user_topic_scores
        WHERE user_id = ${userId} AND anchor_id IN (${anchorId}, '0-ROOT')
    `;
    let node = 0, global = 0;
    for (const r of rows) {
        const lvl = levelForScore(Number(r.subtree_peak));
        if (r.anchor_id === anchorId) node = lvl;
        if (r.anchor_id === '0-ROOT') global = lvl;
    }
    return { node, global };
}
