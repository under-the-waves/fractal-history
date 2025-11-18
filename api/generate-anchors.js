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

        if (breadth !== 'A' && breadth !== 'B') {
            return res.status(400).json({
                error: 'Only Breadth A and B anchor generation is currently supported'
            });
        }

        console.log(`Generating anchors for parent: ${parentId} - ${parentTitle}`);

        // UPDATED: Fetch ancestor path and sibling context
        const ancestorPath = await getAncestorPath(parentId);
        const existingSiblings = await getSiblingAnchors(parentId, breadth);

        console.log(`Found ${ancestorPath.length} ancestors and ${existingSiblings.length} existing siblings`);

        // Build the appropriate prompt based on breadth type
        const systemPrompt = breadth === 'A'
            ? buildBreadthAPrompt(
                parentId,
                parentTitle,
                parentScope || 'No scope provided',
                ancestorPath,
                existingSiblings
            )
            : buildBreadthBPrompt(
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

        // Parse the LLM response based on breadth type
        const anchors = breadth === 'A'
            ? parseAnchorResponse(response, parentId)
            : parseTemporalAnchorResponse(response, parentId);

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

### **A-Anchors Can Include Geographic Instances**

While C-anchors provide **complete geographic coverage** (all major civilizations/regions), A-anchors should include **specific places or civilizations when they were the most causally significant aspect** of the parent topic.

**When to include a geographic instance as an A-anchor:**
- ✅ If **Mesopotamia** was THE primary driver of early civilization formation → It's an A-anchor
- ✅ If **Athens** was THE most causally significant city-state for understanding democracy → It's an A-anchor
- ✅ If **Britain** was THE key actor in industrialization → It's an A-anchor

**The key question:** Was this specific place/civilization one of the MOST important aspects for understanding the parent topic?

**Important distinction:**
- **A-anchors (Analytical/Essential)**: The most important things - which CAN include a specific civilization if it was causally dominant
- **C-anchors (Geographic breadth)**: Complete spatial coverage - ALL major civilizations/regions

**Example:**

    Parent: Formation of Early Civilizations(5,000 - 3,000 BCE)

    A - Anchors(most essential aspects):
├─ Mesopotamian City - States(causally dominant civilization)
├─ Development of Writing Systems
└─ Agricultural Surplus and Social Stratification

    C - Anchors(complete geographic coverage):
├─ Mesopotamia
├─ Egypt
├─ Indus Valley
└─ Early Chinese Cultures
        

Notice **Mesopotamia** could appear in BOTH:
- As an A-anchor (if it was the MOST causally important)
- As a C-anchor (as one region in complete coverage)

This is acceptable and creates multiple pathways to the same content.

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
**Final Score = (Causal Significance * 0.6) + (Human Impact * 0.4)**

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

**CRITICAL:** Never wrap anchor titles in quotation marks.

âŒ **WRONG:**
- "Industrial Revolution"
- "Ideological Conflict: Capitalism vs. Communism"
- "Great Oxidation Event"

âœ… **CORRECT:**
- Industrial Revolution
- Ideological Conflict: Capitalism vs. Communism
- Great Oxidation Event

**Why this matters:** The system uses exact title matching to detect duplicate anchors across the fractal tree. Quotation marks break this matching and cause the same anchor to be created multiple times in different locations.

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
Final Score: [Calculated: (X * 0.6) + (Y * 0.4)]
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
   Final Score: [Calculated: (X * 0.6) + (Y * 0.4)]
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

**CRITICAL FORMATTING RULES:**

1. **NO quotation marks around titles** - Ever. Not in candidate list, not in final selection, nowhere.
2. **NO markdown code blocks** - Output plain text in the specified format
3. **Follow the exact structure** - Makes parsing reliable

**Example of correct formatting:**


    1. Title: Great Oxidation Event
    Type: Phenomenon
    Scope: Atmospheric transformation ~2.4 BYA when cyanobacteria's photosynthesis filled atmosphere with oxygen.
   Causal Significance: 10 / 10
   ...
    

**NOT:**

    1. Title: "Great Oxidation Event"  ← WRONG - no quotes!

    ---

        Remember: Your anchors must go DEEPER into "${parentTitle}" while respecting the learning path that got here.Avoid circularity by checking against ancestor titles and making topics sufficiently specific to the current scope.`;
}

// Build prompt for Breadth-B (Temporal) anchor generation
function buildBreadthBPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings) {
    // Format ancestor path with emphasis on temporal and scope constraints
    const ancestorContext = ancestorPath.length > 0
        ? ancestorPath.map((a, i) => {
            let constraintType = '';
            if (a.breadth === 'A') constraintType = '(Analytical/Thematic constraint)';
            else if (a.breadth === 'B') constraintType = '(Temporal constraint)';
            else if (a.breadth === 'C') constraintType = '(Geographic constraint)';

            return `Level ${a.level}: ** ${a.title}** ${constraintType} \n   Scope: ${a.scope} `;
        }).join('\n\n')
        : 'No ancestor path (this is a top-level anchor)';

    // Format existing siblings
    const siblingContext = existingSiblings.length > 0
        ? existingSiblings.map((s, i) =>
            `${i + 1}. ${s.title} \n   Scope: ${s.scope || 'No scope'} `
        ).join('\n\n')
        : 'None yet - you are generating the first temporal divisions';

    // Identify inherited constraints from ancestors
    const constraints = {
        topic: [],
        geographic: [],
        temporal: [],
        analytical: []
    };

    ancestorPath.forEach(a => {
        if (a.breadth === 'A') constraints.analytical.push(a.title);
        else if (a.breadth === 'B') constraints.temporal.push(a.title);
        else if (a.breadth === 'C') constraints.geographic.push(a.title);
        else constraints.topic.push(a.title);
    });

    const constraintSummary = `
        ** Inherited Scope Constraints:**
            ${constraints.topic.length > 0 ? `- Topic: ${constraints.topic.join(' → ')}` : ''}
${constraints.geographic.length > 0 ? `- Geography: Limited to ${constraints.geographic[constraints.geographic.length - 1]}` : '- Geography: No geographic limitations'}
${constraints.temporal.length > 0 ? `- Time: Subdividing ${constraints.temporal[constraints.temporal.length - 1]}` : '- Time: Full historical timespan available'}
${constraints.analytical.length > 0 ? `- Thematic focus: ${constraints.analytical.join(', ')}` : ''}

Your temporal anchors must respect ALL these constraints.
    `.trim();

    return `# Breadth - B Temporal Anchor Selection Task

## Your Task

You are selecting ** Breadth - B anchors ** (temporal - chronological divisions) for the parent anchor:

** Parent ID:** ${parentId}
** Parent Title:** ${parentTitle}
** Parent Scope:** ${parentScope}

Your goal is to divide the parent topic into 3 - 5 meaningful temporal periods that provide ** complete chronological coverage ** of the topic.

---

## CRITICAL CONTEXT: Learning Path That Led Here

        ** Full ancestor path(how we reached this anchor):**

            ${ancestorContext}

${constraintSummary}

** SCOPE INHERITANCE RULES:**
        The temporal periods you create must respect ALL constraints from the ancestor path:
- ** Topic constraints **: What subject matter we're covering
        - ** Geographic constraints **: If any ancestor limited scope to a region, your periods must stay within that region
            - ** Temporal constraints **: If parent is already temporal, subdivide that period further
                - ** Analytical constraints **: If any ancestor focused on a specific theme / aspect, your periods must stay within that theme

    ---

## Sibling Context: What Already Exists at This Level

${existingSiblings.length > 0 ? '**Existing B-anchors already generated:**\n\n' + siblingContext : siblingContext}

${existingSiblings.length > 0 ? '**Important:** Ensure your new temporal periods do not duplicate these existing siblings.\n' : ''}

    ---

## What are B - Anchors(Temporal) ?

        B - anchors represent ** chronological divisions ** of a topic.They answer: "How does this topic unfold over time?"

            ** Key principles:**

                1. ** Complete Coverage **: Your periods must cover the entire timespan of the parent topic(or slightly beyond for context)
        2. ** No Gaps **: Every moment in the parent's timespan should fall within at least one period
    3. ** Natural Breakpoints **: Periods should reflect meaningful historical transitions
    4. ** Comprehensive Scope **: Each period contains EVERYTHING happening during that time(within inherited constraints)
    5. ** Flexible Boundaries **: Slight overlap is acceptable.Extending ≤20 % beyond parent's boundaries is OK for context

    ---

## How to Determine Temporal Boundaries

        ** Step 1: Extract or infer the parent's timespan**

Look at:
    - Parent title(often contains dates)
        - Parent scope(describes timespan)
            - Ancestor context(provides temporal framework)

If dates aren't explicit, use historical knowledge to infer boundaries.

        ** Step 2: Identify natural breakpoints **
            - Major turning points
                - Phase changes
                    - Shifts in dominant patterns

                        ** Step 3: Create meaningful labels **

                            Format: ** "[Descriptive Name]: [START] - [END]" **

                                Examples:
    - "Japanese Expansion: 1931-1942"
        - "Neolithic Revolution: 10,000-6,000 BCE"

    ---

## Critical Rules

    1. ** Complete Coverage **: All periods together must cover parent's full timespan
    2. ** Respect Boundaries **: Stay within parent's temporal scope (±20% max for context)
    3. ** Choose 3 - 5 Periods **: Variable based on topic complexity and timespan
    4. ** Clear Boundaries **: Each period needs explicit start / end dates
    5. ** Compound Scope **: Respect ALL inherited constraints(topic, geography, theme, time)

    ---

## Output Format

Provide your response as valid JSON:

    \`\`\`json
{
  "temporalBoundariesInferred": {
    "start": "YEAR/DATE",
    "end": "YEAR/DATE",
    "rationale": "How you determined these boundaries"
  },
  "anchors": [
    {
      "position": 1,
      "title": "Period Name: START - END",
      "timeBoundaries": {
        "start": "YEAR/DATE",
        "end": "YEAR/DATE"
      },
      "scope": "2-3 sentences describing this period",
      "historicalMeaningfulness": 8,
      "coverageNecessity": 9,
      "rationale": "Why this is a meaningful division"
    }
  ],
  "coverageJustification": "Why these periods provide complete coverage"
}
\`\`\`

**CRITICAL:** 
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanatory text
- Just the raw JSON object
- Ensure all property names are in quotes
- Ensure all string values are in quotes

**CRITICAL:** Use human-readable date formats, NOT raw numbers.

**For billions of years ago:**
- âœ… Correct: "4 BYA", "3.5 BYA", "2.4 BYA"
- âŒ Wrong: "4,000,000,000", "4000000000"

**For millions of years ago:**
- âœ… Correct: "3 MYA", "200,000 years ago", "1.8 MYA"
- âŒ Wrong: "3,000,000", "200000"

**For thousands of years BCE:**
- âœ… Correct: "10,000 BCE", "3,000 BCE", "8,000 BCE"
- âŒ Wrong: "10000", "-10000"

**For recent history:**
- âœ… Correct: "1939", "1945", "1941 CE"
- âœ… Also okay: "1900s", "1940s" (for decade-level precision)

**Choose the most natural, readable format** for the time scale you're working with.

---

## Examples

### Example 1: Broad Topic
**Parent: Agricultural Revolution (~10,000 BCE - 3,000 BCE)**

\`\`\`json
{
  "temporalBoundariesInferred": {
    "start": "10,000 BCE",
    "end": "3,000 BCE",
    "rationale": "Standard periodization for Neolithic transition based on parent scope"
  },
  "anchors": [
    {
      "position": 1,
      "title": "Early Domestication: 10,000-8,000 BCE",
      "timeBoundaries": {"start": "10,000 BCE", "end": "8,000 BCE"},
      "scope": "Initial plant cultivation experiments in Fertile Crescent. Gradual shift from foraging. First cereals domesticated.",
      "historicalMeaningfulness": 9,
      "coverageNecessity": 10,
      "rationale": "Marks crucial transition to food production"
    },
    {
      "position": 2,
      "title": "Neolithic Expansion: 8,000-5,000 BCE",
      "timeBoundaries": {"start": "8,000 BCE", "end": "5,000 BCE"},
      "scope": "Spread of agriculture across Eurasia. Multiple independent centers develop. Animal domestication. Village formation.",
      "historicalMeaningfulness": 9,
      "coverageNecessity": 9,
      "rationale": "Agricultural diffusion phase"
    },
    {
      "position": 3,
      "title": "Early Civilizations: 5,000-3,000 BCE",
      "timeBoundaries": {"start": "5,000 BCE", "end": "3,000 BCE"},
      "scope": "Agricultural surplus enables cities and states. Irrigation systems. Social hierarchies. Proto-writing emerges.",
      "historicalMeaningfulness": 10,
      "coverageNecessity": 10,
      "rationale": "Agricultural maturity enabling civilization"
    }
  ],
  "coverageJustification": "Three periods provide complete coverage from initial domestication through early state formation, with natural breakpoints at major transitions."
}
\`\`\`

### Example 2: Geographic Parent
**Parent: Pacific Theatre (WW2, inherits geographic constraint)**

\`\`\`json
{
  "temporalBoundariesInferred": {
    "start": "1931",
    "end": "1945",
    "rationale": "Pacific conflict begins with Manchurian invasion, extends slightly before Pearl Harbor for context"
  },
  "anchors": [
    {
      "position": 1,
      "title": "Pre-War Expansion: 1931-1941",
      "timeBoundaries": {"start": "1931", "end": "1941"},
      "scope": "Japanese expansion in China and Manchuria. Rising tensions with Western powers. Embargo and diplomatic breakdown leading to Pacific War.",
      "historicalMeaningfulness": 8,
      "coverageNecessity": 9,
      "rationale": "Essential context for understanding Pacific War origins"
    },
    {
      "position": 2,
      "title": "Japanese Ascendancy: 1941-1942",
      "timeBoundaries": {"start": "1941", "end": "1942"},
      "scope": "Pearl Harbor to Midway. Rapid Japanese conquest. Allied retreat. Battle of Coral Sea and Midway turning point.",
      "historicalMeaningfulness": 10,
      "coverageNecessity": 10,
      "rationale": "Distinct phase of Japanese offensive success"
    },
    {
      "position": 3,
      "title": "Allied Counteroffensive: 1942-1945",
      "timeBoundaries": {"start": "1942", "end": "1945"},
      "scope": "Island-hopping campaigns. Submarine warfare. Philippines liberation. Iwo Jima, Okinawa. Atomic bombs. Japanese surrender.",
      "historicalMeaningfulness": 10,
      "coverageNecessity": 10,
      "rationale": "Final phase of Allied victory in Pacific"
    }
  ],
  "coverageJustification": "Three periods cover the full Pacific War arc from prelude through victory, respecting geographic constraint to Pacific theatre only."
}
\`\`\`

---

## Remember

1. Extract temporal boundaries from parent info or infer reasonably
2. Respect ALL inherited constraints from ancestor path
3. Achieve complete coverage with no gaps
4. Use natural historical breakpoints
5. Output ONLY valid JSON
6. Choose 3-5 periods based on topic needs
`;
}

// Parse the LLM response to extract anchor data
function parseAnchorResponse(response, parentId) {
    const anchors = [];

    try {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```\n?/g, '');  // Remove triple backticks

        // Look for STEP 3: FINAL SELECTION section
        const step3Match = cleaned.match(/STEP 3:.*?FINAL SELECTION([\s\S]*)/i);
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

// Parse LLM response for Breadth-B (Temporal) anchors
function parseTemporalAnchorResponse(response, parentId) {
    try {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Parse JSON
        const data = JSON.parse(cleaned);

        // Validate structure
        if (!data.anchors || !Array.isArray(data.anchors)) {
            throw new Error('Response missing anchors array');
        }

        // Transform to expected format
        return data.anchors.map(anchor => ({
            position: anchor.position,
            title: anchor.title,
            scope: anchor.scope,
            timeBoundaries: anchor.timeBoundaries,
            historicalMeaningfulness: anchor.historicalMeaningfulness,
            coverageNecessity: anchor.coverageNecessity,
            rationale: anchor.rationale || '',
            // For consistency with Breadth-A scoring
            causalSignificance: anchor.historicalMeaningfulness,
            humanImpact: anchor.coverageNecessity,
            finalScore: (anchor.historicalMeaningfulness * 0.6) + (anchor.coverageNecessity * 0.4)
        }));

    } catch (error) {
        console.error('Error parsing temporal anchor response:', error);
        console.error('Raw response:', response);
        throw new Error(`Failed to parse temporal anchor response: ${error.message}`);
    }
}