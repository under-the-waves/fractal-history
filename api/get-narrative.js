import { neon } from '@neondatabase/serverless';
import { linkChildAnchors } from './utils/linkChildAnchors.js';

const sql = neon(process.env.DATABASE_URL);

// Recursively fetch all ancestors of a given anchor
async function getAncestorPath(anchorId) {
    const ancestors = [];
    let currentId = anchorId;

    while (currentId && currentId !== '0-ROOT') {
        // Get current anchor details and its parent
        const result = await sql`
            SELECT
                a.id,
                a.title,
                tp.parent_position_id
            FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE a.id = ${currentId}
            LIMIT 1
        `;

        if (result.length === 0) break;

        const anchor = result[0];

        // Get parent anchor ID from parent_position_id
        if (anchor.parent_position_id) {
            const parentResult = await sql`
                SELECT anchor_id
                FROM tree_positions
                WHERE position_id = ${anchor.parent_position_id}
                LIMIT 1
            `;

            if (parentResult.length > 0) {
                currentId = parentResult[0].anchor_id;

                // Add parent to ancestors (we'll build the path in reverse)
                const parentDetails = await sql`
                    SELECT id, title FROM anchors WHERE id = ${currentId} LIMIT 1
                `;
                if (parentDetails.length > 0) {
                    ancestors.unshift({
                        id: parentDetails[0].id,
                        title: parentDetails[0].title
                    });
                }
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Add ROOT at the beginning if not already there
    if (ancestors.length === 0 || ancestors[0].id !== '0-ROOT') {
        ancestors.unshift({
            id: '0-ROOT',
            title: 'The Story of Everything'
        });
    }

    return ancestors;
}

// Get child anchors for a specific breadth
async function getChildAnchors(parentId, breadth) {
    const children = await sql`
        SELECT a.id, a.title
        FROM anchors a
        JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE tp.parent_position_id = (
            SELECT position_id
            FROM tree_positions
            WHERE anchor_id = ${parentId}
            LIMIT 1
        )
        AND tp.breadth = ${breadth}
        ORDER BY tp.position ASC
    `;

    return children;
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
        // Fetch anchor data
        const anchorResult = await sql`
            SELECT
                a.id,
                a.title,
                a.scope,
                a.generation_status
            FROM anchors a
            WHERE a.id = ${id}
            LIMIT 1
        `;

        if (anchorResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Anchor not found'
            });
        }

        const anchor = anchorResult[0];

        // Check if narrative exists in the narratives table for this breadth
        const narrativeResult = await sql`
            SELECT
                narrative,
                key_concepts,
                questions,
                estimated_read_time,
                fact_checked_narrative,
                sources,
                fact_checked_at
            FROM narratives
            WHERE anchor_id = ${id} AND breadth = ${breadth}
            LIMIT 1
        `;

        // Check if child anchors exist for this breadth
        const childAnchors = await getChildAnchors(id, breadth);

        // Fetch ancestors
        const ancestors = await getAncestorPath(id);

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
        const linkedNarrative = linkChildAnchors(narrativeData.narrative, childLinks);
        const linkedFactChecked = narrativeData.fact_checked_narrative
            ? linkChildAnchors(narrativeData.fact_checked_narrative, childLinks)
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
