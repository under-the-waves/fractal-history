import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

let pool = null;

export function getPool() {
    if (!pool) {
        pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return pool;
}

export async function query(text, params = []) {
    const result = await getPool().query(text, params);
    return result.rows;
}

export async function getAncestorPath(anchorId) {
    // Breadcrumb chain. When an anchor is shared across several positions (reuse), follow its
    // CANONICAL position so a path-less arrival (deep link, search, leaderboard) gets one stable
    // home chain. On a plain tree every position is canonical, so this is unchanged.
    const rows = await query(`
        WITH RECURSIVE ancestors AS (
            SELECT a.id, a.title, a.scope, a.region_codes, tp.level, tp.breadth, tp.parent_position_id
            FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id AND tp.is_canonical
            WHERE a.id = $1

            UNION ALL

            SELECT a2.id, a2.title, a2.scope, a2.region_codes, tp2.level, tp2.breadth, tp2.parent_position_id
            FROM ancestors anc
            JOIN tree_positions tp_parent ON tp_parent.position_id = anc.parent_position_id
            JOIN anchors a2 ON a2.id = tp_parent.anchor_id
            JOIN tree_positions tp2 ON tp2.anchor_id = a2.id AND tp2.is_canonical
            WHERE anc.parent_position_id IS NOT NULL
              AND a2.id != '0-ROOT'
        )
        SELECT * FROM ancestors ORDER BY level ASC
    `, [anchorId]);

    const ancestors = rows.map(r => ({
        id: r.id,
        title: r.title,
        scope: r.scope || 'No scope defined',
        region_codes: r.region_codes,
        level: r.level,
        breadth: r.breadth
    }));

    ancestors.unshift({
        id: '0-ROOT',
        title: 'The Story of Everything',
        scope: 'All of history',
        region_codes: null,
        level: 0,
        breadth: null
    });

    return ancestors;
}

/**
 * Shortest distance from an anchor up to each of its ancestor anchors, used by the scoring roll-up.
 * Walks upward from EVERY position the anchor sits at (not just the canonical one) and keeps the
 * MIN distance per ancestor, so a repeated anchor is counted once, by its nearest route — exactly
 * the agreed rule. Includes the anchor itself at distance 0. On a plain tree an anchor has one
 * position, so this is the same single chain the roll-up used before (distance == depth).
 *
 * @returns {Promise<Array<{id: string, dist: number}>>}
 */
export async function getAncestorDistances(anchorId) {
    // dist < 50 is a cycle backstop; the real tree is <=8 deep and insertion guards against loops.
    const rows = await query(`
        WITH RECURSIVE up AS (
            SELECT tp.anchor_id, tp.parent_position_id, 0 AS dist
            FROM tree_positions tp
            WHERE tp.anchor_id = $1

            UNION ALL

            SELECT p.anchor_id, p.parent_position_id, up.dist + 1
            FROM up
            JOIN tree_positions p ON p.position_id = up.parent_position_id
            WHERE up.dist < 50
        )
        SELECT anchor_id AS id, MIN(dist) AS dist
        FROM up
        GROUP BY anchor_id
    `, [anchorId]);
    return rows.map(r => ({ id: r.id, dist: Number(r.dist) }));
}

/**
 * Conservative match for anchor REUSE at generation time. Returns the id of an existing anchor that
 * is the SAME bounded datable event as the one being generated, or null. The match is deliberately
 * strict (event-restricted + own-extent, per the reuse spec): only datable events are eligible, and
 * a candidate must share the same normalised title, the same own start/end years, and the same
 * geography (global, i.e. no region_codes — analytical A-anchors are global). A wrong merge corrupts
 * the tree, so we prefer to MISS a synonym ("Great War" vs "World War I") and mint a fresh anchor
 * than to risk a false merge; tightening detection (embeddings/LLM) is deferred.
 */
export async function findExistingEventAnchor(title, startYear, endYear) {
    const rows = await query(`
        SELECT id FROM anchors
        WHERE is_datable_event
          AND lower(trim(title)) = lower(trim($1))
          AND event_start_year IS NOT DISTINCT FROM $2
          AND event_end_year IS NOT DISTINCT FROM $3
          AND (region_codes IS NULL OR region_codes = '[]'::jsonb)
        LIMIT 1
    `, [title, startYear ?? null, endYear ?? null]);
    return rows.length ? rows[0].id : null;
}

/** Every tree position an anchor occupies (one row on a plain tree, several once it is reused). */
export async function getAnchorPositionIds(anchorId) {
    const rows = await query(
        `SELECT position_id FROM tree_positions WHERE anchor_id = $1`, [anchorId]);
    return rows.map(r => r.position_id);
}

/**
 * Would placing `anchorId` under `parentPositionId` close a loop? True if the anchor is already an
 * ancestor of that parent position. Call before inserting a reuse position so the tree stays a DAG.
 */
export async function wouldCreateCycle(anchorId, parentPositionId) {
    if (!parentPositionId) return false;
    const rows = await query(`
        WITH RECURSIVE up AS (
            SELECT position_id, anchor_id, parent_position_id
            FROM tree_positions WHERE position_id = $1

            UNION ALL

            SELECT p.position_id, p.anchor_id, p.parent_position_id
            FROM up JOIN tree_positions p ON p.position_id = up.parent_position_id
        )
        SELECT 1 FROM up WHERE anchor_id = $2 LIMIT 1
    `, [parentPositionId, anchorId]);
    return rows.length > 0;
}
