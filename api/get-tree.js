import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, breadth } = req.query;

        // If no parentId provided, return root
        if (!parentId) {
            const root = await sql`
        SELECT a.id, a.title, a.scope, a.region_codes, tp.level, tp.breadth, tp.position
        FROM anchors a
        LEFT JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE a.id = '0-ROOT'
        LIMIT 1
      `;

            return res.status(200).json({
                success: true,
                anchors: root
            });
        }

        // Get children of specified parent and breadth. A parent anchor may sit at more than one
        // tree position once anchors are reused, so gather children under ANY of its positions
        // (lazy shared-by-anchor rendering) rather than one arbitrary position. On a plain tree the
        // parent has a single position, so this returns exactly the same rows as before.
        const children = await sql`
      SELECT a.id, a.title, a.scope, a.region_codes, tp.level, tp.breadth, tp.position, tp.parent_position_id
      FROM anchors a
      JOIN tree_positions tp ON a.id = tp.anchor_id
      WHERE tp.parent_position_id IN (
        SELECT position_id FROM tree_positions WHERE anchor_id = ${parentId}
      )
      AND tp.breadth = ${breadth || 'A'}
      ORDER BY tp.position ASC
    `;

        return res.status(200).json({
            success: true,
            count: children.length,
            parentId,
            breadth: breadth || 'A',
            anchors: children
        });

    } catch (error) {
        console.error('Error fetching tree data:', error);
        return res.status(500).json({
            error: 'Failed to fetch tree data',
            details: error.message
        });
    }
}