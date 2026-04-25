import { linkChildAnchors } from './utils/linkChildAnchors.js';
import { query, getAncestorPath } from './utils/db.js';

// Get child anchors for a specific breadth
async function getChildAnchors(parentId, breadth) {
    return await query(
        `SELECT a.id, a.title
         FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id = (
             SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1
         )
         AND tp.breadth = $2
         ORDER BY tp.position ASC`,
        [parentId, breadth]
    );
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id, breadth = 'A' } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Anchor ID is required' });
    }

    if (!['A', 'B', 'C'].includes(breadth)) {
        return res.status(400).json({ error: 'Breadth must be A, B, or C' });
    }

    try {
        // Fetch anchor, narrative, children, and ancestors in parallel
        const [anchorResult, narrativeResult, childAnchors, ancestors] = await Promise.all([
            query(
                'SELECT id, title, scope, generation_status FROM anchors WHERE id = $1 LIMIT 1',
                [id]
            ),
            query(
                `SELECT narrative, key_concepts, questions, estimated_read_time,
                        fact_checked_narrative, sources, fact_checked_at
                 FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1`,
                [id, breadth]
            ),
            getChildAnchors(id, breadth),
            getAncestorPath(id)
        ]);

        if (anchorResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Anchor not found'
            });
        }

        const anchor = anchorResult[0];

        // If no narrative exists
        if (narrativeResult.length === 0) {
            return res.status(200).json({
                success: true,
                anchor: {
                    id: anchor.id,
                    title: anchor.title,
                    scope: anchor.scope,
                    breadth,
                    narrativeExists: false,
                    childAnchorsExist: childAnchors.length > 0,
                    childAnchorsCount: childAnchors.length,
                    ancestors
                },
                needsGeneration: true
            });
        }

        const narrativeData = narrativeResult[0];

        // Calculate word count from narrative HTML
        const textContent = narrativeData.narrative.replace(/<[^>]*>/g, ' ');
        const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;

        // Post-process: convert child anchor <strong> tags to navigational links
        const childLinks = childAnchors.map(c => ({ id: c.id, title: c.title }));
        const linkedNarrative = linkChildAnchors(narrativeData.narrative, childLinks, breadth);
        const linkedFactChecked = narrativeData.fact_checked_narrative
            ? linkChildAnchors(narrativeData.fact_checked_narrative, childLinks, breadth)
            : null;

        return res.status(200).json({
            success: true,
            anchor: {
                id: anchor.id,
                title: anchor.title,
                scope: anchor.scope,
                breadth,
                narrative: linkedNarrative,
                factCheckedNarrative: linkedFactChecked,
                sources: narrativeData.sources || null,
                factCheckedAt: narrativeData.fact_checked_at || null,
                keyConcepts: narrativeData.key_concepts || [],
                questions: narrativeData.questions || [],
                estimatedReadTime: narrativeData.estimated_read_time || 5,
                wordCount,
                ancestors,
                childAnchors: childAnchors.map(c => ({ id: c.id, title: c.title })),
                narrativeExists: true
            },
            needsGeneration: false
        });

    } catch (error) {
        console.error('Error fetching narrative:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch narrative',
            details: error.message
        });
    }
}
