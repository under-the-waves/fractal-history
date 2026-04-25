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
    const rows = await query(`
        WITH RECURSIVE ancestors AS (
            SELECT a.id, a.title, a.scope, tp.level, tp.breadth, tp.parent_position_id
            FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE a.id = $1

            UNION ALL

            SELECT a2.id, a2.title, a2.scope, tp2.level, tp2.breadth, tp2.parent_position_id
            FROM ancestors anc
            JOIN tree_positions tp_parent ON tp_parent.position_id = anc.parent_position_id
            JOIN anchors a2 ON a2.id = tp_parent.anchor_id
            JOIN tree_positions tp2 ON tp2.anchor_id = a2.id
            WHERE anc.parent_position_id IS NOT NULL
              AND a2.id != '0-ROOT'
        )
        SELECT * FROM ancestors ORDER BY level ASC
    `, [anchorId]);

    const ancestors = rows.map(r => ({
        id: r.id,
        title: r.title,
        scope: r.scope || 'No scope defined',
        level: r.level,
        breadth: r.breadth
    }));

    ancestors.unshift({
        id: '0-ROOT',
        title: 'The Story of Everything',
        scope: 'All of history',
        level: 0,
        breadth: null
    });

    return ancestors;
}
