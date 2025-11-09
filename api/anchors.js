import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get query parameters
        const { parentPositionId, breadth } = req.query;

        // Validate required parameters
        if (!parentPositionId || !breadth) {
            return res.status(400).json({
                error: 'Missing required parameters: parentPositionId and breadth'
            });
        }

        // Connect to database
        const sql = neon(process.env.DATABASE_URL);

        // Query for child positions
        const positions = await sql`
      SELECT 
        tp.position_id,
        tp.anchor_id,
        tp.position,
        a.title,
        a.scope,
        a.generation_status
      FROM tree_positions tp
      JOIN anchors a ON tp.anchor_id = a.id
      WHERE tp.parent_position_id = ${parentPositionId}
        AND tp.breadth = ${breadth}
      ORDER BY tp.position ASC
    `;

        // Return the results
        return res.status(200).json({
            success: true,
            count: positions.length,
            positions: positions
        });

    } catch (error) {
        console.error('Database error:', error);
        return res.status(500).json({
            error: 'Database query failed',
            details: error.message
        });
    }
}