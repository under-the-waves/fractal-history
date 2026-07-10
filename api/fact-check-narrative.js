import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { factCheckNarrative } from '../lib/factCheck.js';
import { getLearnContent } from '../lib/learnContent.js';
import { citeFromFactBase } from '../lib/narrativeGrounding.js';

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

        // Prefer citing the study fact base (one LLM call, no web search) when it exists — it holds the
        // same research-derived sources the study cards use, so the narrative cites the same set and
        // cannot contradict them. Fall back to the full web re-search only for anchors with no fact base
        // (the "just read it" escape hatch). Retires the duplicate ~64-search citation path for the
        // common flow. See: project knowledge/Learn_Flow_Reorder_Spec.md (Phase 2).
        const learnContent = await getLearnContent(anchorId, breadth);
        const result = learnContent
            ? await citeFromFactBase(narrative.narrative, learnContent)
            : await factCheckNarrative(narrative.narrative, anchor.title, anchor.scope, breadth);

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
