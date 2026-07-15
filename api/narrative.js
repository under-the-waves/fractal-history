// Unified narrative endpoint. One Vercel function dispatching three actions on `?action=`:
//   action=get        (GET)        fetch an existing narrative + children + ancestors for display
//   action=generate   (GET|POST)   generate (or return the cached) narrative via the LLM
//   action=fact-check  (POST)       retroactively fact-check / cite an existing narrative
//
// Consolidated from the former api/get-narrative.js, api/generate-narrative.js, and
// api/fact-check-narrative.js to stay under the Vercel Hobby 12-function cap (see CLAUDE.md).
// Each handler's logic is preserved verbatim; only the entry dispatch is new.

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { linkChildAnchors } from '../lib/linkChildAnchors.js';
import { query, getAncestorPath } from '../lib/db.js';
import { getLearnContent } from '../lib/learnContent.js';
import { buildNarrativeGrounding, citeFromFactBase } from '../lib/narrativeGrounding.js';
import { factCheckNarrative } from '../lib/factCheck.js';

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

let sql = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
}

// ---------------------------------------------------------------------------
// Shared / generation helpers
// ---------------------------------------------------------------------------

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

// Narrative generation model. Opus follows the voice bans far more reliably than
// Sonnet and explains mechanisms (not just event sequences); narratives are cached
// per anchor, so this cost is one-time per anchor, not per reader.
const NARRATIVE_MODEL = 'claude-opus-4-8';

// Roots whose subtrees are natural-science / pre-civilisational, where explaining the
// physical mechanism matters more than narrating a sequence of events. Detected by
// ancestry, so every descendant narrative inherits science-mode.
const SCIENCE_ROOTS = new Set([
    '1A-E8F2G', // Emergence of Life on Earth
    '1A-Q7R2S', // Evolution of Humans
    '1B-T4U9V', // Deep Time: 13.8 BYA - 3 MYA
    '1B-W1X6Y', // Foraging Era: 3 MYA - 10,000 BCE
    '1C-I6J1K'  // Cosmic & Planetary
]);

const SCIENCE_MODE_BLOCK = `## SCIENCE TOPIC: EXPLAIN THE MECHANISM

This is a natural-science / pre-civilisational topic. Most readers have no scientific background, so leaning on a sequence of events ("this happened, then that happened") teaches them little.

- For each major development, explain the MECHANISM: what physically happened at the level of molecules, cells, bodies, or geology, and why that produced the effect it did. "Walking upright freed the hands" is an assertion; explain what changed in the skeleton and why that mattered.
- Establish the BASELINE first. Before describing a change, say what the world was like just before it, so the reader has something to measure the change against (e.g. what life or the planet looked like before this step).
- Define every scientific term in passing, the first time you use it, in a few plain words.`;

// Load shared voice/style guidance used across all breadths.
// Single source of truth: prompts/_shared-voice.md, split into VOICE, BANS, and
// TIGHTENING sections by sentinel comments. Read fresh each call so edits apply live.
function loadSharedVoice() {
    const sharedPath = path.join(process.cwd(), 'prompts', '_shared-voice.md');
    const raw = fs.readFileSync(sharedPath, 'utf-8');
    const m = raw.match(/<!-- VOICE -->([\s\S]*?)<!-- BANS -->([\s\S]*?)<!-- TIGHTENING -->([\s\S]*)/);
    if (m) {
        return { voice: m[1].trim(), bans: m[2].trim(), tightening: m[3].trim() };
    }
    // Fallback: no tightening section
    const m2 = raw.match(/<!-- VOICE -->([\s\S]*?)<!-- BANS -->([\s\S]*)/);
    if (!m2) return { voice: raw.trim(), bans: '', tightening: '' };
    return { voice: m2[1].trim(), bans: m2[2].trim(), tightening: '' };
}

// Get child anchors for a given parent and breadth (generation view).
async function getChildAnchorsForGeneration(parentId, breadth) {
    // Gather children under ANY of the parent's tree positions (a reused anchor sits at several), to
    // match /api/get-tree. The old `LIMIT 1` picked one arbitrary position, so a reused anchor could
    // resolve to a childless position and wrongly report "no children".
    return await query(
        `SELECT a.id, a.title, a.scope, tp.position
         FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id IN (
             SELECT position_id FROM tree_positions WHERE anchor_id = $1
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
        .replace(/\{\{childAnchors\}\}/g, data.childAnchors)
        .replace(/\{\{scienceMode\}\}/g, () => data.scienceMode || '')
        .replace(/\{\{factBase\}\}/g, () => data.factBase || '')
        .replace(/\{\{sharedVoice\}\}/g, () => data.sharedVoice)
        .replace(/\{\{sharedBans\}\}/g, () => data.sharedBans)
        .replace(/\{\{voiceTightening\}\}/g, () => data.voiceTightening || '');
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
             estimated_read_time = $6
         RETURNING *`,
        [anchorId, breadth, narrativeData.narrative,
         JSON.stringify(narrativeData.keyConcepts),
         JSON.stringify(narrativeData.questions),
         narrativeData.estimatedReadTime]
    );
    return result[0];
}

// ---------------------------------------------------------------------------
// action=get  (formerly api/get-narrative.js)
// ---------------------------------------------------------------------------

// Get child anchors for a specific breadth (display view).
async function getChildAnchorsForDisplay(parentId, breadth) {
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

async function handleGet(req, res) {
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
            getChildAnchorsForDisplay(id, breadth),
            getAncestorPath(id)
        ]);

        if (anchorResult.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Anchor not found'
            });
        }

        const anchor = anchorResult[0];

        // If no narrative exists. A flashcard-only anchor has a placeholder narratives row (the
        // flashcard generator seeds `narrative = ''` to hold the question pool), so a row can exist
        // with no narrative text. Treat that as "not generated" — otherwise the reader serves an empty
        // narrative as real and then fact-checks it into a headline stub.
        if (narrativeResult.length === 0 || !narrativeResult[0].narrative || !narrativeResult[0].narrative.trim()) {
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

        // Post-process: convert child anchor <strong> tags to tree-navigation links (and
        // rewrite any older /narrative links). pathPrefix is root -> this anchor.
        const childLinks = childAnchors.map(c => ({ id: c.id, title: c.title }));
        const pathPrefix = ancestors.map(a => a.id);
        const linkedNarrative = linkChildAnchors(narrativeData.narrative, childLinks, breadth, pathPrefix);
        const linkedFactChecked = narrativeData.fact_checked_narrative
            ? linkChildAnchors(narrativeData.fact_checked_narrative, childLinks, breadth, pathPrefix)
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

// ---------------------------------------------------------------------------
// action=generate  (formerly api/generate-narrative.js)
// ---------------------------------------------------------------------------

async function handleGenerate(req, res) {
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
        // Step 1: Check if narrative already exists. A flashcard-only anchor has a placeholder
        // narratives row (the flashcard generator seeds narrative = '' to hold the question pool), so a
        // row can exist with no narrative text. Require actual narrative text — otherwise generation
        // short-circuits and returns the empty placeholder as "cached, complete", so the narrative can
        // never be generated through the normal button. Mirrors the same guard in handleGet.
        if (!forceRegenerate) {
            const existingNarrative = await getNarrative(anchorId, breadth);
            if (existingNarrative && existingNarrative.narrative && existingNarrative.narrative.trim()) {
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
            getChildAnchorsForGeneration(anchorId, breadth),
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

        // Ground the narrative in the study fact base when it exists (the write-first flow generates it
        // before the narrative is ever read). Hybrid grounding; '' when absent (the "just read it"
        // escape hatch), so those narratives generate ungrounded exactly as before.
        const learnContent = await getLearnContent(anchorId, breadth);
        const factBase = buildNarrativeGrounding(learnContent);

        // Populate template
        const shared = loadSharedVoice();
        const isScienceNode = ancestors.some(a => SCIENCE_ROOTS.has(a.id));
        const prompt = populatePromptTemplate(promptTemplate, {
            anchorId: anchorId,
            anchorTitle: anchor.title,
            anchorScope: anchor.scope || 'No scope defined',
            ancestorPath: formatAncestorPath(ancestors),
            prerequisites: 'None', // Can be expanded later to track user progress
            childAnchors: formatChildAnchors(children, breadth),
            scienceMode: isScienceNode ? SCIENCE_MODE_BLOCK : '',
            factBase,
            sharedVoice: shared.voice,
            sharedBans: shared.bans,
            voiceTightening: shared.tightening
        });
        console.log(`Narrative grounding: ${factBase ? 'fact base (' + factBase.length + ' chars)' : 'none (ungrounded)'}`);

        // Step 5: Call LLM API
        console.log(`Calling Anthropic API for narrative generation (${NARRATIVE_MODEL}${isScienceNode ? ', science mode' : ''})...`);
        const completion = await getAnthropicClient().messages.create({
            model: NARRATIVE_MODEL,
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

        // Post-process: convert child anchor <strong> tags to tree-navigation links.
        // pathPrefix is root -> this anchor (ancestors includes self), so each child link
        // can carry the full path the tree needs to expand to it.
        const childLinks = children.map(c => ({ id: c.id, title: c.title }));
        const pathPrefix = ancestors.map(a => a.id);
        narrativeData.narrative = linkChildAnchors(narrativeData.narrative, childLinks, breadth, pathPrefix);

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

// ---------------------------------------------------------------------------
// action=fact-check  (formerly api/fact-check-narrative.js)
// ---------------------------------------------------------------------------

// Retroactive fact-check endpoint for existing narratives
async function handleFactCheck(req, res) {
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

        // Nothing to fact-check if the base narrative is empty (a flashcard-only placeholder row). Citing
        // an empty narrative made the model synthesise a stub from the source claims, which the reader then
        // showed as the narrative. Bail so the reader generates the real narrative first.
        if (!narrative.narrative || !narrative.narrative.trim()) {
            return res.status(409).json({ error: 'No narrative to fact-check yet; generate the narrative first.' });
        }

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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export { handleGet, handleGenerate, handleFactCheck };

export default async function handler(req, res) {
    const action = req.query.action || req.body?.action || 'get';

    switch (action) {
        case 'get':
            return handleGet(req, res);
        case 'generate':
            return handleGenerate(req, res);
        case 'fact-check':
            return handleFactCheck(req, res);
        default:
            return res.status(400).json({ error: `Unknown narrative action: ${action}` });
    }
}
