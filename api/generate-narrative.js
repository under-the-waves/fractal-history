import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { factCheckNarrative } from './utils/factCheck.js';
import { linkChildAnchors } from './utils/linkChildAnchors.js';
import { query, getAncestorPath } from './utils/db.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

let anthropic = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return anthropic;
}

// Load prompt template from file
function loadPromptTemplate(breadth) {
    const promptFiles = {
        'A': 'narrative-a-prompt.md',
        'B': 'narrative-b-prompt.md',
        'C': 'narrative-c-prompt.md'
    };

    const filename = promptFiles[breadth];
    if (!filename) {
        throw new Error(`Invalid breadth: ${breadth}`);
    }

    // In Vercel serverless, we need to read from the project root
    const promptPath = path.join(process.cwd(), 'prompts', filename);

    try {
        return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error(`Error loading prompt template: ${promptPath}`, error);
        throw new Error(`Failed to load prompt template for breadth ${breadth}`);
    }
}

// Get child anchors for a given parent and breadth
async function getChildAnchors(parentId, breadth) {
    return await query(
        `SELECT a.id, a.title, a.scope, tp.position
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

// Check if narrative already exists
async function getNarrative(anchorId, breadth) {
    const result = await query(
        'SELECT * FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
        [anchorId, breadth]
    );
    return result.length > 0 ? result[0] : null;
}

// Get anchor details
async function getAnchorDetails(anchorId) {
    const result = await query(
        'SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1',
        [anchorId]
    );
    return result.length > 0 ? result[0] : null;
}

// Format ancestor path for the prompt
function formatAncestorPath(ancestors) {
    if (ancestors.length <= 1) {
        return 'This is a top-level anchor.';
    }

    return ancestors.map((a, i) =>
        `${i + 1}. **${a.title}** (Level ${a.level}${a.breadth ? `, Breadth ${a.breadth}` : ''})\n   Scope: ${a.scope}`
    ).join('\n\n');
}

// Format child anchors for the prompt
function formatChildAnchors(children, breadth) {
    const labels = {
        'A': 'A-Anchor',
        'B': 'Period',
        'C': 'Region'
    };
    const label = labels[breadth] || 'Anchor';

    return children.map((c, i) =>
        `${i + 1}. **${c.title}**\n   Scope: ${c.scope || 'No scope defined'}`
    ).join('\n\n');
}

// Populate prompt template with actual values
function populatePromptTemplate(template, data) {
    return template
        .replace(/\{\{anchorId\}\}/g, data.anchorId)
        .replace(/\{\{anchorTitle\}\}/g, data.anchorTitle)
        .replace(/\{\{anchorScope\}\}/g, data.anchorScope)
        .replace(/\{\{ancestorPath\}\}/g, data.ancestorPath)
        .replace(/\{\{prerequisites\}\}/g, data.prerequisites)
        .replace(/\{\{childAnchors\}\}/g, data.childAnchors);
}

// Parse the LLM response JSON
function parseNarrativeResponse(response) {
    try {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const data = JSON.parse(cleaned);

        // Validate required fields
        if (!data.narrative) {
            throw new Error('Response missing narrative field');
        }
        if (!Array.isArray(data.keyConcepts)) {
            throw new Error('Response missing keyConcepts array');
        }

        return {
            narrative: data.narrative,
            keyConcepts: data.keyConcepts,
            questions: data.questions || [],
            estimatedReadTime: data.estimatedReadTime || 5
        };
    } catch (error) {
        console.error('Error parsing narrative response:', error);
        console.error('Raw response:', response);
        throw new Error(`Failed to parse narrative response: ${error.message}`);
    }
}

// Store narrative in database
async function storeNarrative(anchorId, breadth, narrativeData) {
    const result = await query(
        `INSERT INTO narratives (anchor_id, breadth, narrative, key_concepts, questions, estimated_read_time)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (anchor_id, breadth)
         DO UPDATE SET
             narrative = $3,
             key_concepts = $4,
             questions = $5,
             estimated_read_time = $6
         RETURNING *`,
        [anchorId, breadth, narrativeData.narrative,
         JSON.stringify(narrativeData.keyConcepts),
         JSON.stringify(narrativeData.questions),
         narrativeData.estimatedReadTime]
    );
    return result[0];
}

export default async function handler(req, res) {
    // Support both GET and POST for flexibility
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get parameters from query (GET) or body (POST)
    const anchorId = req.query.id || req.body?.id;
    const breadth = req.query.breadth || req.body?.breadth || 'A';
    const forceRegenerate = req.query.regenerate === 'true' || req.body?.regenerate === true;

    if (!anchorId) {
        return res.status(400).json({ error: 'Anchor ID is required' });
    }

    if (!['A', 'B', 'C'].includes(breadth)) {
        return res.status(400).json({ error: 'Breadth must be A, B, or C' });
    }

    try {
        // Step 1: Check if narrative already exists
        if (!forceRegenerate) {
            const existingNarrative = await getNarrative(anchorId, breadth);
            if (existingNarrative) {
                console.log(`Returning existing narrative for ${anchorId} breadth ${breadth}`);

                // Get ancestor path for display
                const ancestors = await getAncestorPath(anchorId);
                const anchor = await getAnchorDetails(anchorId);

                return res.status(200).json({
                    success: true,
                    cached: true,
                    stage: 'complete',
                    anchor: {
                        id: anchorId,
                        title: anchor?.title || 'Unknown',
                        scope: anchor?.scope || '',
                        breadth,
                        narrative: existingNarrative.narrative,
                        factCheckedNarrative: existingNarrative.fact_checked_narrative || null,
                        sources: existingNarrative.sources || null,
                        keyConcepts: existingNarrative.key_concepts,
                        questions: existingNarrative.questions,
                        estimatedReadTime: existingNarrative.estimated_read_time,
                        ancestors
                    }
                });
            }
        }

        // Fetch anchor details, children, and ancestors in parallel
        const [anchor, children, ancestors] = await Promise.all([
            getAnchorDetails(anchorId),
            getChildAnchors(anchorId, breadth),
            getAncestorPath(anchorId)
        ]);

        if (!anchor) {
            return res.status(404).json({ error: 'Anchor not found' });
        }

        console.log(`Generating narrative for ${anchorId} (${anchor.title}) breadth ${breadth}`);
        console.log(`Found ${children.length} existing ${breadth}-children for ${anchorId}`);

        // Children must exist before narrative generation (frontend generates them separately)
        if (children.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No child anchors exist. Generate child anchors first.',
                stage: 'generating_children'
            });
        }

        // Load and populate prompt template
        const promptTemplate = loadPromptTemplate(breadth);

        // Populate template
        const prompt = populatePromptTemplate(promptTemplate, {
            anchorId: anchorId,
            anchorTitle: anchor.title,
            anchorScope: anchor.scope || 'No scope defined',
            ancestorPath: formatAncestorPath(ancestors),
            prerequisites: 'None', // Can be expanded later to track user progress
            childAnchors: formatChildAnchors(children, breadth)
        });

        // Step 5: Call LLM API
        console.log('Calling Anthropic API for narrative generation...');
        const completion = await getAnthropicClient().messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2500,
            system: 'You are an expert historian and educational writer. You write engaging, accurate historical narratives in the style of Dan Carlin\'s Hardcore History podcast. Always respond with valid JSON as specified in the prompt.',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const response = completion.content[0].text;
        console.log('Anthropic response received');

        // Step 6: Parse response
        const narrativeData = parseNarrativeResponse(response);
        console.log('Narrative parsed successfully');

        // Post-process: convert child anchor <strong> tags to navigational links
        const childLinks = children.map(c => ({ id: c.id, title: c.title }));
        narrativeData.narrative = linkChildAnchors(narrativeData.narrative, childLinks, breadth);

        // Step 7: Store in database
        const storedNarrative = await storeNarrative(anchorId, breadth, narrativeData);
        console.log('Narrative stored in database');

        // Fact-checking skipped on deploy (done locally via run-factcheck.js to avoid timeout)
        let factCheckedNarrative = null;
        let sources = null;

        // Return to frontend
        return res.status(200).json({
            success: true,
            cached: false,
            stage: 'complete',
            anchor: {
                id: anchorId,
                title: anchor.title,
                scope: anchor.scope,
                breadth,
                narrative: narrativeData.narrative,
                factCheckedNarrative,
                sources,
                keyConcepts: narrativeData.keyConcepts,
                questions: narrativeData.questions,
                estimatedReadTime: narrativeData.estimatedReadTime,
                ancestors,
                childAnchors: children.map(c => ({ id: c.id, title: c.title }))
            }
        });

    } catch (error) {
        console.error('Error generating narrative:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate narrative',
            details: error.message,
            stage: 'error'
        });
    }
}
