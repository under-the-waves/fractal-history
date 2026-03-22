import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { factCheckNarrative } from './utils/factCheck.js';
import { linkChildAnchors } from './utils/linkChildAnchors.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize clients lazily to ensure env vars are available
let anthropic = null;
let sql = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return anthropic;
}

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
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

// Recursively fetch all ancestors of a given anchor
async function getAncestorPath(anchorId) {
    const ancestors = [];
    let currentId = anchorId;

    while (currentId && currentId !== '0-ROOT') {
        const result = await getSql()`
            SELECT
                a.id,
                a.title,
                a.scope,
                tp.level,
                tp.breadth,
                tp.parent_position_id
            FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE a.id = ${currentId}
            LIMIT 1
        `;

        if (result.length === 0) break;

        const anchor = result[0];
        ancestors.unshift({
            id: anchor.id,
            title: anchor.title,
            scope: anchor.scope || 'No scope defined',
            level: anchor.level,
            breadth: anchor.breadth
        });

        if (anchor.parent_position_id) {
            const parentResult = await getSql()`
                SELECT anchor_id
                FROM tree_positions
                WHERE position_id = ${anchor.parent_position_id}
                LIMIT 1
            `;

            if (parentResult.length > 0) {
                currentId = parentResult[0].anchor_id;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    // Add ROOT at the beginning
    ancestors.unshift({
        id: '0-ROOT',
        title: 'The Story of Everything',
        scope: 'All of history',
        level: 0,
        breadth: null
    });

    return ancestors;
}

// Get child anchors for a given parent and breadth
async function getChildAnchors(parentId, breadth) {
    const children = await getSql()`
        SELECT a.id, a.title, a.scope, tp.position
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

// Check if narrative already exists
async function getNarrative(anchorId, breadth) {
    const result = await getSql()`
        SELECT * FROM narratives
        WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
        LIMIT 1
    `;

    return result.length > 0 ? result[0] : null;
}

// Get anchor details
async function getAnchorDetails(anchorId) {
    const result = await getSql()`
        SELECT a.id, a.title, a.scope
        FROM anchors a
        WHERE a.id = ${anchorId}
        LIMIT 1
    `;

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
        if (!Array.isArray(data.questions)) {
            throw new Error('Response missing questions array');
        }

        return {
            narrative: data.narrative,
            keyConcepts: data.keyConcepts,
            questions: data.questions,
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
    const result = await getSql()`
        INSERT INTO narratives (anchor_id, breadth, narrative, key_concepts, questions, estimated_read_time)
        VALUES (
            ${anchorId},
            ${breadth},
            ${narrativeData.narrative},
            ${JSON.stringify(narrativeData.keyConcepts)},
            ${JSON.stringify(narrativeData.questions)},
            ${narrativeData.estimatedReadTime}
        )
        ON CONFLICT (anchor_id, breadth)
        DO UPDATE SET
            narrative = ${narrativeData.narrative},
            key_concepts = ${JSON.stringify(narrativeData.keyConcepts)},
            questions = ${JSON.stringify(narrativeData.questions)},
            estimated_read_time = ${narrativeData.estimatedReadTime}
        RETURNING *
    `;

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

        // Get anchor details
        const anchor = await getAnchorDetails(anchorId);
        if (!anchor) {
            return res.status(404).json({ error: 'Anchor not found' });
        }

        console.log(`Generating narrative for ${anchorId} (${anchor.title}) breadth ${breadth}`);

        // Step 2: Check for child anchors
        let children = await getChildAnchors(anchorId, breadth);
        console.log(`Found ${children.length} existing ${breadth}-children for ${anchorId}`);

        // Step 3: Generate children if needed
        if (children.length === 0) {
            // Check if we can generate this breadth type
            if (breadth === 'C') {
                // C-breadth anchor generation is not yet implemented
                return res.status(400).json({
                    success: false,
                    error: 'Geographic (C-breadth) narrative generation is not yet available. Please try Essential Aspects (A) or Timeline (B) instead.',
                    details: 'C-breadth anchor generation is planned for a future update.',
                    stage: 'generating_children'
                });
            }

            console.log(`No ${breadth}-children found. Generating them first...`);

            // Call the anchor generation endpoint internally
            // For now, we make an internal fetch - in production this could be a direct function call
            try {
                const baseUrl = process.env.VERCEL_ENV
                    ? `https://${process.env.VERCEL_URL}`
                    : `http://localhost:${process.env.PORT || 3000}`;
                const generateResponse = await fetch(`${baseUrl}/api/generate-anchors`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentId: anchorId,
                        parentTitle: anchor.title,
                        parentScope: anchor.scope,
                        breadth: breadth
                    })
                });

                if (!generateResponse.ok) {
                    const errorData = await generateResponse.json();
                    throw new Error(errorData.error || 'Failed to generate child anchors');
                }

                const generateResult = await generateResponse.json();
                console.log(`Generated ${generateResult.anchorsGenerated} ${breadth}-children`);

                // Refresh children list
                children = await getChildAnchors(anchorId, breadth);
            } catch (genError) {
                console.error('Error generating child anchors:', genError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate child anchors',
                    details: genError.message,
                    stage: 'generating_children'
                });
            }
        }

        if (children.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'No child anchors available after generation',
                stage: 'generating_children'
            });
        }

        // Step 4: Load and populate prompt template
        console.log('Loading prompt template...');
        const promptTemplate = loadPromptTemplate(breadth);

        // Get ancestor path
        const ancestors = await getAncestorPath(anchorId);

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
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
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
        narrativeData.narrative = linkChildAnchors(narrativeData.narrative, childLinks);

        // Step 7: Store in database
        const storedNarrative = await storeNarrative(anchorId, breadth, narrativeData);
        console.log('Narrative stored in database');

        // Step 8: Fact-check with web sources
        let factCheckedNarrative = null;
        let sources = null;
        try {
            if (process.env.SERPER_API_KEY) {
                console.log('Fact-checking narrative with web sources...');
                const factCheckResult = await factCheckNarrative(
                    narrativeData.narrative, anchor.title, anchor.scope, breadth
                );

                if (factCheckResult) {
                    factCheckedNarrative = linkChildAnchors(factCheckResult.narrative, childLinks);
                    sources = factCheckResult.sources;

                    await getSql()`
                        UPDATE narratives
                        SET fact_checked_narrative = ${factCheckedNarrative},
                            sources = ${JSON.stringify(sources)},
                            fact_checked_at = NOW()
                        WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
                    `;
                    console.log(`Fact-check complete: ${sources.length} sources found`);
                }
            } else {
                console.log('SERPER_API_KEY not set, skipping fact-check');
            }
        } catch (fcError) {
            console.error('Fact-check failed (narrative still saved):', fcError.message);
        }

        // Step 9: Return to frontend
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
