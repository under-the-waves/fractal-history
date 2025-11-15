import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const sql = neon(process.env.DATABASE_URL);

// Generate anchor ID in format like "2A-X7Y3Z"
function generateAnchorId(parentId, position) {
    // Handle different ID formats
    let parentLevel;
    if (parentId === '0-ROOT') {
        parentLevel = 0;
    } else if (parentId.match(/^\d+[A-Z]-/)) {
        // Format: "2A-X7Y3Z" - extract the number before the letter
        parentLevel = parseInt(parentId.match(/^(\d+)[A-Z]-/)[1]);
    } else {
        // Format: "C9D3E" - assume level 1 (top level anchors)
        parentLevel = 1;
    }

    const childLevel = parentLevel + 1;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let hash = '';
    for (let i = 0; i < 5; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${childLevel}A-${hash}`;
}

// NEW: Recursively fetch all ancestors of a given anchor
async function getAncestorPath(anchorId) {
    const ancestors = [];
    let currentId = anchorId;

    while (currentId && currentId !== '0-ROOT') {
        // Get current anchor details and its parent
        const result = await sql`
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
            } else {
                break;
            }
        } else {
            break;
        }
    }

    return ancestors;
}

// NEW: Get existing sibling anchors at the same level
async function getSiblingAnchors(parentId, breadth) {
    const siblings = await sql`
        SELECT a.id, a.title, a.scope
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

    return siblings;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, parentTitle, parentScope, breadth = 'A' } = req.body;

        if (!parentId || !parentTitle) {
            return res.status(400).json({
                error: 'Missing required fields: parentId and parentTitle are required'
            });
        }

        if (breadth !== 'A') {
            return res.status(400).json({
                error: 'Only Breadth A anchor generation is currently supported'
            });
        }

        console.log(`Generating anchors for parent: ${parentId} - ${parentTitle}`);

        // UPDATED: Fetch ancestor path and sibling context
        const ancestorPath = await getAncestorPath(parentId);
        const existingSiblings = await getSiblingAnchors(parentId, breadth);

        console.log(`Found ${ancestorPath.length} ancestors and ${existingSiblings.length} existing siblings`);

        // Build the enhanced prompt with full context
        const systemPrompt = buildBreadthAPrompt(
            parentId,
            parentTitle,
            parentScope || 'No scope provided',
            ancestorPath,
            existingSiblings
        );

        console.log('Calling OpenAI API...');

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
        console.log('\n=== FULL LLM RESPONSE ===');
        console.log(response);
        console.log('=== END RESPONSE ===\n');

        // Parse the LLM response to extract anchor data
        const anchors = parseAnchorResponse(response, parentId);

        // Insert anchors into database
        const insertedAnchors = [];
        for (const anchor of anchors) {
            const anchorId = generateAnchorId(parentId, anchor.position);

            const [insertedAnchor] = await sql`
                INSERT INTO anchors (id, title, scope, generation_status)
                VALUES (${anchorId}, ${anchor.title}, ${anchor.scope}, 'pending')
                RETURNING id, title, scope, generation_status
            `;

            const parentPositions = await sql`
                SELECT level FROM tree_positions 
                WHERE anchor_id = ${parentId}
                LIMIT 1
            `;

            const childLevel = parentPositions.length > 0 ? parentPositions[0].level + 1 : 1;

            const parentPosIds = await sql`
                SELECT position_id FROM tree_positions 
                WHERE anchor_id = ${parentId}
                LIMIT 1
            `;

            const parentPosId = parentPosIds.length > 0 ? parentPosIds[0].position_id : null;

            // Generate position_id in format like "2A-X7Y3Z"
            const positionId = `${childLevel}${breadth}-${anchorId.split('-')[1]}`;

            await sql`
                INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position)
                VALUES (
                    ${positionId},
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
            ancestorPathUsed: ancestorPath.map(a => a.title), // For debugging
            rawResponse: response,
        });

    } catch (error) {
        console.error('Error generating anchors:', error);
        return res.status(500).json({
            error: 'Failed to generate anchors',
            details: error.message
        });
    }
}

// UPDATED: Build prompt with full ancestor context and sibling awareness
function buildBreadthAPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings) {
    // Format ancestor path for display
    const ancestorContext = ancestorPath.length > 0
        ? ancestorPath.map((a, i) =>
            `Level ${a.level}: **${a.title}** (${a.breadth})\n   Scope: ${a.scope}`
        ).join('\n\n')
        : 'No ancestor path (this is a top-level anchor)';

    // Format existing siblings
    const siblingContext = existingSiblings.length > 0
        ? existingSiblings.map((s, i) =>
            `${i + 1}. ${s.title}\n   Scope: ${s.scope || 'No scope'}`
        ).join('\n\n')
        : 'None yet - you are generating the first children';

    // Extract ancestor titles for easy reference
    const ancestorTitles = ancestorPath.map(a => a.title);

    return `# Breadth-A Anchor Selection Task

## Your Task

You are selecting **Breadth-A anchors** (analytical - most essential aspects) for the parent anchor:

**Parent ID:** ${parentId}
**Parent Title:** ${parentTitle}
**Parent Scope:** ${parentScope}

Your goal is to identify the 3-5 most causally important and impactful aspects of this topic that users must understand to grasp its essence.

**Critical perspective requirement:** Approach this as if you're an alien historian studying Earth with no cultural bias. Actively resist Western/European-centric defaults.

---

## CRITICAL CONTEXT: Learning Path That Led Here

**Full ancestor path (how we reached this anchor):**

${ancestorContext}

**ANTI-CIRCULARITY RULES:**
1. **DO NOT** suggest any anchor whose title matches or is essentially the same as any ancestor above
2. **DO NOT** create cycles like "Industrial Revolution → Trade Networks → Financial Institutions → Trade Networks"
3. Your child anchors should go **DEEPER** into "${parentTitle}", not circle back to broader concepts already covered
4. If a concept from the path above is relevant, you must make it **MORE SPECIFIC** to the current parent's scope

**Forbidden ancestor titles for this generation:**
${ancestorTitles.map(title => `- "${title}"`).join('\n')}

---

## Sibling Context: What Already Exists at This Level

${existingSiblings.length > 0 ? '**Existing child anchors already generated:**\n\n' + siblingContext : siblingContext}

${existingSiblings.length > 0 ? '**Important:** Ensure your new anchors do not duplicate or significantly overlap with these existing siblings.\n' : ''}

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
- Would understanding this anchor unlock understanding of many other topics?

### 2. Human Impact (1-10)
- How many people were directly affected?
- How severely did it change human lives?
- How persistent were these effects across time?

### Final Score Calculation
**Final Score = (Causal Significance × 0.6) + (Human Impact × 0.4)**

This weighting reflects our primary mission of explaining "how the world works" while still honoring human experiences.

**Minimum threshold:** Strong A-anchor candidates should score ≥ 6.0

---

## Critical Rules

### **Rule 1: NO Double-Barreled Anchors**

Each anchor must be a **single, atomic concept**.

❌ **BAD Examples:**
- "Great Oxidation Event and Complex Cells"
- "World War One and World War Two"
- "Causes and Consequences of the Industrial Revolution"
- "Political and Economic Changes"

✅ **GOOD Examples:**
- "Great Oxidation Event"
- "World War One"
- "Causes of the Industrial Revolution" (or as separate anchor: "Consequences of the Industrial Revolution")
- "Political Restructuring"

**The Test:** Can you describe this anchor without using "and" or "both/also"? If not, split it.

### **Rule 2: Choose 3-5 Anchors (Variable Count)**

DO NOT default to always choosing 5 anchors.

**Process:**
1. Generate 6-8 candidates
2. Calculate Final Scores
3. Select 3-5 based on natural topic boundaries and score clustering
4. Explain your reasoning for the count

**When to use:**
- **3 anchors:** Topic has clear three-part structure; natural tripartite division
- **4 anchors:** Topic divides into four distinct domains or phases
- **5 anchors:** Complex topic with 5 genuinely essential aspects; no clear groupings

### **Rule 3: Each Anchor Needs Scope Description**

For each anchor, provide:
\`\`\`
Title: [Concise, unambiguous name]
Scope: [2-3 sentences describing:
        - What this anchor covers
        - Time period (if applicable)
        - Geographic bounds (if relevant)
        - What's included
        - What's explicitly excluded/saved for other anchors]
Causal Significance: [X/10 with brief justification]
Human Impact: [Y/10 with brief justification]
Final Score: [Calculated: (X × 0.6) + (Y × 0.4)]
\`\`\`

**Why scope matters:**
- Defines clear boundaries between anchors
- Enables deduplication (system checks if this anchor already exists)
- Prevents scope creep when writing narratives
- Ensures no gaps in coverage
- **Prevents accidentally recreating parent or ancestor topics**

### **Rule 4: Ruthless Prioritization**

Ask yourself: **"If users learn ONLY these 3-5 anchors about ${parentTitle}, will they understand the core of this topic?"**

- A-anchors = "if you learn nothing else" essentials
- Important but secondary content → Level deeper exploration, or B/C breadth anchors
- Don't try to be comprehensive at this level

**Remember:** The fractal goes deeper. You don't need to cover everything here.

### **Rule 5: Title Specificity and Context-Awareness**

Given the ancestor context, your anchor titles should reflect appropriate specificity:

**For concepts that could be generic but need to be specific here:**
Instead of "Global Trade Networks" (too generic, may already exist in path)
Use "Atlantic Triangle Trade Routes" or "Silk Road Exchange Systems" (specific to scope)

**For genuinely new concepts:**
"Factory System" - good, assuming not in ancestor path
"Steam Engine Technology" - good, assuming not in ancestor path

**The test:** Would this title make sense if someone saw ONLY this anchor, without knowing the path that led here?

---

## Your Output Format

### **STEP 1: CANDIDATE ANCHORS (6-8)**

Generate more candidates than you need. For each:

\`\`\`
[Number]. Title: "[Name]"
   Type: [Event/Process/Phenomenon/Concept/Person/Institution/Technology]
   Scope: "[2-3 sentence description]"
   Causal Significance: X/10
   Justification: [Why this rating - be specific]
   Human Impact: Y/10
   Justification: [Why this rating - be specific]
   Final Score: [Calculated: (X × 0.6) + (Y × 0.4)]
   Anti-Circularity Check: [Confirm this is NOT in ancestor path and is sufficiently specific]
\`\`\`

### **STEP 2: RANKING BY FINAL SCORE**

Sort candidates from highest to lowest Final Score:
\`\`\`
1. [Title] (Final Score: X.X)
2. [Title] (Final Score: X.X)
[...]
\`\`\`

### **STEP 3: FINAL SELECTION (3-5 anchors)**

**State your choice:** "I'm selecting [3/4/5] anchors because [explain reasoning for this number]."

**For each selected anchor:**
\`\`\`
[Number]. **[Title]**
   - **Scope:** [Detailed 2-3 sentence description]
   - **Position:** [1-5]
   - **Causal Significance:** X/10
   - **Human Impact:** Y/10
   - **Final Score:** Z.Z
   - **Why Essential:** [1-2 sentences explaining why this is one of the most important aspects of ${parentTitle}]
\`\`\`

---

## Response Format

Your response must be structured exactly as follows for parsing:

\`\`\`
STEP 1: CANDIDATE ANCHORS

[Your 6-8 candidates with all required fields]

STEP 2: RANKING

[Your ranked list]

STEP 3: FINAL SELECTION

Number of anchors selected: [3/4/5]
Reasoning: [Why this number]

1. **[Title]**
   - Scope: [Description]
   - Position: 1
   - Causal Significance: X/10
   - Human Impact: Y/10
   - Final Score: Z.Z
   - Why Essential: [Explanation]

[Repeat for each selected anchor]
\`\`\`

---

Remember: Your anchors must go DEEPER into "${parentTitle}" while respecting the learning path that got here. Avoid circularity by checking against ancestor titles and making topics sufficiently specific to the current scope.`;
}

// Parse the LLM response to extract anchor data
function parseAnchorResponse(response, parentId) {
    const anchors = [];

    try {
        // Look for STEP 3: FINAL SELECTION section
        const step3Match = response.match(/STEP 3:.*?FINAL SELECTION([\s\S]*)/i);
        if (!step3Match) {
            throw new Error('Could not find STEP 3 section in response');
        }

        const step3Content = step3Match[1];

        // Split by numbered anchors (1. **Title**, 2. **Title**, etc.)
        const anchorSections = step3Content.split(/\n\s*\d+\.\s*\*\*/);

        // Skip first element (it's the text before the first anchor)
        for (let i = 1; i < anchorSections.length; i++) {
            const section = '**' + anchorSections[i]; // Add back the ** we split on

            // Extract title (between ** and **)
            const titleMatch = section.match(/\*\*([^*]+)\*\*/);
            if (!titleMatch) continue;
            const title = titleMatch[1].trim();

            // Extract scope (after "- Scope:" until next "- " field)
            // Try with quotes first, then without
            let scopeMatch = section.match(/- Scope:\s*"([^"]+)"/);
            if (!scopeMatch) {
                // Try without quotes - match until the next "- " field
                scopeMatch = section.match(/- Scope:\s*([^\n]+(?:\n(?!\s*-)[^\n]+)*)/);
            }
            if (!scopeMatch) continue;
            const scope = scopeMatch[1].trim();

            // Extract position
            const positionMatch = section.match(/- Position:\s*(\d+)/);
            if (!positionMatch) continue;
            const position = parseInt(positionMatch[1]);

            // Extract causal significance
            const causalMatch = section.match(/- Causal Significance:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
            if (!causalMatch) continue;
            const causalSig = parseFloat(causalMatch[1]);

            // Extract human impact
            const humanMatch = section.match(/- Human Impact:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
            if (!humanMatch) continue;
            const humanImpact = parseFloat(humanMatch[1]);

            // Extract final score
            const scoreMatch = section.match(/- Final Score:\s*(\d+(?:\.\d+)?)/);
            if (!scoreMatch) continue;
            const finalScore = parseFloat(scoreMatch[1]);

            anchors.push({
                title: title,
                scope: scope,
                position: position,
                causalSignificance: causalSig,
                humanImpact: humanImpact,
                finalScore: finalScore
            });
        }

        if (anchors.length === 0) {
            throw new Error('No anchors could be parsed from response');
        }

        console.log(`Successfully parsed ${anchors.length} anchors`);
        return anchors;

    } catch (error) {
        console.error('Error parsing response:', error);
        console.error('Response was:', response);
        throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
}