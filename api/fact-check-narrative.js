import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { factCheckNarrative } from './utils/factCheck.js';

dotenv.config({ path: '.env.local' });

let sql = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
}

// Retroactive fact-check endpoint for existing narratives
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { anchorId, breadth } = req.body;

    if (!anchorId || !breadth) {
        return res.status(400).json({ error: 'anchorId and breadth are required' });
    }

    try {
        const db = getSql();

        const narratives = await db`
            SELECT id, narrative, anchor_id, breadth
            FROM narratives
            WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
        `;

        if (narratives.length === 0) {
            return res.status(404).json({ error: 'Narrative not found' });
        }

        const narrative = narratives[0];

        const anchors = await db`
            SELECT id, title, scope FROM anchors WHERE id = ${anchorId}
        `;
        const anchor = anchors[0];

        const result = await factCheckNarrative(
            narrative.narrative, anchor.title, anchor.scope, breadth
        );

        if (!result) {
            return res.status(500).json({ error: 'Failed to parse fact-check results' });
        }

        await db`
            UPDATE narratives
            SET fact_checked_narrative = ${result.narrative},
                sources = ${JSON.stringify(result.sources)},
                fact_checked_at = NOW()
            WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
        `;

        return res.status(200).json({
            success: true,
            narrative: result.narrative,
            sources: result.sources,
            corrections: result.corrections,
        });

    } catch (error) {
        console.error('Error fact-checking narrative:', error);
        return res.status(500).json({ error: 'Failed to fact-check narrative' });
    }
}
