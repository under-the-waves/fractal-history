import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const sql = neon(process.env.DATABASE_URL);

// Generate anchor ID in format like "2A-X7Y3Z"
function generateAnchorId(parentId, position) {
    // Extract level from parent ID
    const parentLevel = parentId === '0-ROOT' ? 0 : parseInt(parentId.split(/[A-Z]-/)[0]);
    const childLevel = parentLevel + 1;

    // Generate random hash (5 characters)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let hash = '';
    for (let i = 0; i < 5; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${childLevel}A-${hash}`;
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, parentTitle, parentScope, breadth = 'A' } = req.body;

        // Validate required fields
        if (!parentId || !parentTitle) {
            return res.status(400).json({
                error: 'Missing required fields: parentId and parentTitle are required'
            });
        }

        // Only support Breadth A for now
        if (breadth !== 'A') {
            return res.status(400).json({
                error: 'Only Breadth A anchor generation is currently supported'
            });
        }

        // Build the full prompt using Breadth-A methodology
        const systemPrompt = buildBreadthAPrompt(parentId, parentTitle, parentScope || 'No scope provided');

        console.log('Calling OpenAI API...');

        // Call OpenAI with GPT-4o-mini
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert historian using the Fractal History methodology to select the most essential anchors for historical topics.'
                },
                {
                    role: 'user',
                    content: systemPrompt
                }
            ],
            temperature: 0.7,
            max_tokens: 3000,
        });

        const response = completion.choices[0].message.content;
        console.log('OpenAI response received');

        // Parse the LLM response to extract anchor data
        const anchors = parseAnchorResponse(response, parentId);

        // Insert anchors into database
        const insertedAnchors = [];
        for (const anchor of anchors) {
            // Generate unique anchor ID
            const anchorId = generateAnchorId(parentId, anchor.position);

            // Insert into anchors table
            const [insertedAnchor] = await sql`
        INSERT INTO anchors (id, title, scope, generation_status)
        VALUES (${anchorId}, ${anchor.title}, ${anchor.scope}, 'pending')
        RETURNING id, title, scope, generation_status
      `;

            // Get parent's tree position to determine child level
            const parentPositions = await sql`
        SELECT level FROM tree_positions 
        WHERE anchor_id = ${parentId}
        LIMIT 1
      `;

            const childLevel = parentPositions.length > 0 ? parentPositions[0].level + 1 : 1;

            // Get parent's position_id
            const parentPosIds = await sql`
        SELECT position_id FROM tree_positions 
        WHERE anchor_id = ${parentId}
        LIMIT 1
      `;

            const parentPosId = parentPosIds.length > 0 ? parentPosIds[0].position_id : null;

            // Insert into tree_positions table
            await sql`
        INSERT INTO tree_positions (anchor_id, parent_position_id, level, breadth, position)
        VALUES (
          ${anchorId},
          ${parentPosId},
          ${childLevel},
          ${breadth},
          ${anchor.position}
        )
      `;

            insertedAnchors.push({
                ...insertedAnchor,
                level: childLevel,
                breadth,
                position: anchor.position,
                causalSignificance: anchor.causalSignificance,
                humanImpact: anchor.humanImpact,
                finalScore: anchor.finalScore,
            });
        }

        return res.status(200).json({
            success: true,
            parentId,
            parentTitle,
            breadth,
            anchorsGenerated: insertedAnchors.length,
            anchors: insertedAnchors,
            rawResponse: response, // Include for debugging
        });

    } catch (error) {
        console.error('Error generating anchors:', error);
        return res.status(500).json({
            error: 'Failed to generate anchors',
            details: error.message
        });
    }
}

// Build the full Breadth-A selection prompt
function buildBreadthAPrompt(parentId, parentTitle, parentScope) {
    return `# Breadth-A Anchor Selection Task

## Your Task

You are selecting **Breadth-A anchors** (analytical - most essential aspects) for the parent anchor:

**Parent ID:** ${parentId}
**Parent Title:** ${parentTitle}
**Parent Scope:** ${parentScope}

Your goal is to identify the 3-5 most causally important and impactful aspects of this topic that users must understand to grasp its essence.

**Critical perspective requirement:** Approach this as if you're an alien historian studying Earth with no cultural bias. Actively resist Western/European-centric defaults.

---

## What are A-Anchors?

A-anchors represent the **most essential knowledge** about a topic. They answer: "If someone learns nothing else about this topic, what must they understand?"

A-anchors can be:
- **Events:** Specific historical occurrences
- **Processes:** Gradual transformations
- **Phenomena:** Observable patterns
- **Concepts:** Abstract ideas
- **People:** Individuals whose impact was decisive
- **Institutions:** Structures that shaped outcomes
- **Technologies:** Inventions that transformed society

---

## Selection Criteria: Dual Rating System

For each candidate anchor:

### 1. Causal Significance (1-10)
- How directly did this shape subsequent history?
- How many later developments depend on understanding this?
- Does this represent fundamental transformation vs. incremental change?

### 2. Human Impact (1-10)
- How many people were directly affected?
- How severe was the improvement in well-being or suffering?
- Duration of impact (brief crisis vs. lasting transformation)?

### Final Score Formula
Final Score = (Causal Significance × 0.6) + (Human Impact × 0.4)

**Minimum threshold:** Strong A-anchor candidates should score ≥ 6.0

---

## Critical Rules

### Rule 1: NO Double-Barreled Anchors
Each anchor must be a single, atomic concept.
❌ BAD: "World War One and World War Two"
✅ GOOD: "World War One" (separate from "World War Two")

### Rule 2: Choose 3-5 Anchors (Variable Count)
DO NOT default to always choosing 5.
- **3 anchors:** Clear three-part structure
- **4 anchors:** Four distinct domains
- **5 anchors:** Complex topic with 5 genuinely essential aspects

### Rule 3: Each Anchor Needs Scope Description
For each anchor, provide 2-3 sentences describing what it covers, time period, what's included/excluded.

### Rule 4: Ruthless Prioritization
Ask: "If users learn ONLY these 3-5 anchors, will they understand the core?"

---

## Your Output Format

You MUST structure your response EXACTLY as follows:

### STEP 1: CANDIDATE ANCHORS (6-8)

Generate 6-8 candidates. For each:

[Number]. Title: "[Name]"
   Type: [Event/Process/Phenomenon/Concept/Person/Institution/Technology]
   Scope: "[2-3 sentence description]"
   Causal Significance: X/10
   Justification: [Why this rating]
   Human Impact: Y/10
   Justification: [Why this rating]
   Final Score: [Calculated score]

### STEP 2: RANKING BY FINAL SCORE

1. [Title] (Final Score: X.X)
2. [Title] (Final Score: X.X)
[...]

### STEP 3: FINAL SELECTION (3-5 anchors)

State your choice: "I'm selecting [3/4/5] anchors because [reasoning]."

For each selected anchor:

[Number]. Title: "[Name]"
   Scope: "[2-3 sentences]"
   Why essential: [1-2 sentences]
   Causal: X/10 | Human Impact: Y/10 | Final Score: Z.Z

### STEP 4: WHAT WAS CUT AND WHY

For excluded candidates:
- [Title] (Score: X.X): [Why excluded]

---

Begin with STEP 1: Generate 6-8 candidate anchors for this parent topic.`;
}

// Parse the LLM response to extract anchor data
function parseAnchorResponse(response, parentId) {
    const anchors = [];

    // Look for STEP 3: FINAL SELECTION section
    const step3Match = response.match(/### STEP 3: FINAL SELECTION[\s\S]*?(?=### STEP 4|$)/i);

    if (!step3Match) {
        console.warn('Could not find STEP 3 in response, attempting alternative parsing...');
        return parseAlternativeFormat(response, parentId);
    }

    const step3Content = step3Match[0];

    // Extract each numbered anchor from STEP 3
    // Pattern: [Number]. Title: "[Name]" ... Causal: X/10 | Human Impact: Y/10 | Final Score: Z.Z
    const anchorMatches = step3Content.matchAll(/(\d+)\.\s*Title:\s*"([^"]+)"[\s\S]*?Scope:\s*"([^"]+)"[\s\S]*?Causal:\s*(\d+)\/10.*?Human Impact:\s*(\d+)\/10.*?Final Score:\s*([\d.]+)/gi);

    let position = 1;
    for (const match of anchorMatches) {
        const [, , title, scope, causal, human, finalScore] = match;

        anchors.push({
            title: title.trim(),
            scope: scope.trim(),
            position: position++,
            causalSignificance: parseInt(causal),
            humanImpact: parseInt(human),
            finalScore: parseFloat(finalScore),
        });
    }

    return anchors;
}

// Alternative parsing if structured format not found
function parseAlternativeFormat(response, parentId) {
    console.log('Using alternative parsing format');
    const anchors = [];

    // Try to find any anchor-like structures with titles
    const titleMatches = response.matchAll(/(?:^|\n)(?:\d+\.|[-*])\s*(?:Title:\s*)?["']?([^"'\n]+?)["']?\s*(?:\n|$)/gm);

    let position = 1;
    for (const match of titleMatches) {
        if (position > 5) break; // Max 5 anchors

        const title = match[1].trim();
        // Skip if it looks like a section header
        if (title.toUpperCase() === title || title.startsWith('STEP')) continue;

        anchors.push({
            title,
            scope: 'Scope to be refined - generated from alternative parsing',
            position: position++,
            causalSignificance: 7, // Default values
            humanImpact: 7,
            finalScore: 7.0,
        });
    }

    return anchors;
}