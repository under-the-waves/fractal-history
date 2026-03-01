import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Re-parse justifications from raw LLM response if they're missing
function reparseJustifications(candidates, rawResponse) {
    if (!rawResponse || !candidates || candidates.length === 0) {
        return candidates;
    }

    // Check if any candidate is missing justifications
    const needsReparsing = candidates.some(c =>
        (!c.causalJustification || c.causalJustification === '') &&
        (!c.humanJustification || c.humanJustification === '')
    );

    if (!needsReparsing) {
        return candidates;
    }

    // Parse justifications from raw response
    try {
        const cleaned = rawResponse.replace(/```\n?/g, '');
        const step1Match = cleaned.match(/STEP 1:.*?CANDIDATE ANCHORS([\s\S]*?)STEP 2:/i);
        if (!step1Match) return candidates;

        const step1Content = step1Match[1];
        const candidateSections = step1Content.split(/\n\s*\d+\.\s*Title:/i);

        // Build a map of title -> justifications
        const justificationMap = {};
        for (let i = 1; i < candidateSections.length; i++) {
            const section = 'Title:' + candidateSections[i];

            const titleMatch = section.match(/Title:\s*([^\n]+)/i);
            if (!titleMatch) continue;
            const title = titleMatch[1].trim().replace(/^["']|["']$/g, '').toLowerCase();

            // Extract causal justification (follows "Causal Significance: X/10")
            const causalJustMatch = section.match(/Causal Significance:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*\n\s*Justification:\s*([^\n]+)/i);
            const causalJustification = causalJustMatch ? causalJustMatch[1].trim() : '';

            // Extract human justification (follows "Human Impact: X/10")
            const humanJustMatch = section.match(/Human Impact:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*\n\s*Justification:\s*([^\n]+)/i);
            const humanJustification = humanJustMatch ? humanJustMatch[1].trim() : '';

            justificationMap[title] = { causalJustification, humanJustification };
        }

        // Update candidates with parsed justifications
        return candidates.map(c => {
            const key = c.title.toLowerCase();
            if (justificationMap[key]) {
                return {
                    ...c,
                    causalJustification: c.causalJustification || justificationMap[key].causalJustification,
                    humanJustification: c.humanJustification || justificationMap[key].humanJustification
                };
            }
            return c;
        });
    } catch (error) {
        console.error('Error reparsing justifications:', error);
        return candidates;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, breadth } = req.query;

        if (!parentId) {
            return res.status(400).json({
                error: 'Missing required parameter: parentId'
            });
        }

        // If breadth is specified, get metadata for that specific breadth
        // Otherwise, get all metadata for this parent
        let metadata;
        if (breadth) {
            metadata = await sql`
                SELECT
                    id,
                    parent_anchor_id,
                    breadth,
                    candidates,
                    final_selection,
                    selection_reasoning,
                    raw_response,
                    generated_at
                FROM anchor_generation_metadata
                WHERE parent_anchor_id = ${parentId}
                AND breadth = ${breadth}
                LIMIT 1
            `;
        } else {
            metadata = await sql`
                SELECT
                    id,
                    parent_anchor_id,
                    breadth,
                    candidates,
                    final_selection,
                    selection_reasoning,
                    raw_response,
                    generated_at
                FROM anchor_generation_metadata
                WHERE parent_anchor_id = ${parentId}
                ORDER BY breadth ASC
            `;
        }

        if (metadata.length === 0) {
            return res.status(200).json({
                success: true,
                found: false,
                message: 'No generation metadata found for this anchor',
                parentId,
                breadth: breadth || 'all'
            });
        }

        // Get parent anchor title for context
        const parentAnchor = await sql`
            SELECT id, title, scope
            FROM anchors
            WHERE id = ${parentId}
            LIMIT 1
        `;

        const parentInfo = parentAnchor.length > 0 ? {
            id: parentAnchor[0].id,
            title: parentAnchor[0].title,
            scope: parentAnchor[0].scope
        } : null;

        // Process metadata to reparse justifications if missing
        const processedMetadata = metadata.map(m => {
            const candidates = reparseJustifications(m.candidates, m.raw_response);
            // Return metadata without raw_response (it's large and not needed by frontend)
            return {
                id: m.id,
                parent_anchor_id: m.parent_anchor_id,
                breadth: m.breadth,
                candidates: candidates,
                final_selection: m.final_selection,
                selection_reasoning: m.selection_reasoning,
                generated_at: m.generated_at
            };
        });

        // Return single object if specific breadth requested, array otherwise
        const result = breadth ? processedMetadata[0] : processedMetadata;

        return res.status(200).json({
            success: true,
            found: true,
            parentId,
            parentInfo,
            metadata: result
        });

    } catch (error) {
        console.error('Error fetching generation metadata:', error);
        return res.status(500).json({
            error: 'Failed to fetch generation metadata',
            details: error.message
        });
    }
}
