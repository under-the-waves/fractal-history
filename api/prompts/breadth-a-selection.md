# Breadth-A Anchor Selection Prompt

## Your Task

You are selecting **Breadth-A anchors** (analytical breadth - most essential aspects) for the parent anchor:

**Parent ID:** {{parentId}}
**Parent Title:** {{parentTitle}}
**Parent Scope:** {{parentScope}}

Your goal is to identify the 3-5 most causally important and impactful aspects of this topic that users must understand to grasp its essence.

**Critical perspective requirement:** Approach this as if you're an alien historian studying Earth with no cultural bias. Actively resist Western/European-centric defaults. Consider: Are non-Western developments receiving fair weight relative to their causal significance and human impact?

---

## CRITICAL CONTEXT: Learning Path That Led Here

**Full ancestor path (how we reached this anchor):**

{{ancestorContext}}

**ANTI-CIRCULARITY RULES:**
1. **DO NOT** suggest any anchor whose title matches or is essentially the same as any ancestor above
2. **DO NOT** create cycles like "Industrial Revolution → Trade Networks → Financial Institutions → Trade Networks"
3. Your child anchors should go **DEEPER** into "{{parentTitle}}", not circle back to broader concepts already covered
4. If a concept from the path above is relevant, you must make it **MORE SPECIFIC** to the current parent's scope

**Forbidden ancestor titles for this generation:**
{{forbiddenTitles}}

---

## Sibling Context: What Already Exists at This Level

{{siblingContext}}

{{siblingWarning}}

---

## What are A-Anchors?

A-anchors represent the **most essential knowledge** about a topic. They answer: "If someone learns nothing else about this topic, what must they understand?"

A-anchors can be:
- **Events:** Specific historical occurrences (Battle of Midway, Fall of Rome)
- **Processes:** Gradual transformations (Urbanization, Democratization)
- **Phenomena:** Observable patterns (Mass Extinctions, Economic Cycles)
- **Concepts:** Abstract ideas (Sovereignty, Scientific Method)
- **People:** Individuals whose impact was decisive (not just representative)
- **Institutions:** Structures that shaped outcomes (Parliament, Feudal System)
- **Technologies:** Inventions that transformed society (Printing Press, Steam Engine)

Choose the **type** that best captures what's most important about the parent topic.

---

## Selection Criteria: Dual Rating System

For each candidate anchor, you must provide two ratings:

### **1. Causal Significance (1-10)**
- How directly did this shape subsequent history?
- How many later developments depend on understanding this?
- Does this represent a fundamental transformation vs. incremental change?
- Could you explain later events without understanding this?

**Has this ALREADY reshaped systems through documented historical effects?**
- **High causal (8-10):** This event fundamentally changed how politics/economy/society operates. Examples: World Wars, end of Cold War, Industrial Revolution, Chinese Communist Revolution
- **Medium causal (5-7):** This event is driving policy discussions and some changes, but systems not yet fundamentally transformed. Examples: ongoing movements, emerging technologies, policy debates
- **Low causal (1-4):** This event had localized effects but didn't reshape broader systems

### **2. Human Impact (1-10)**

**CRITICAL: Measure impact through the HISTORICAL RECORD (through January 2025 knowledge cutoff), NOT future predictions.**

Questions to guide your rating:
- How many people were directly affected by this historical event/process?
- How severe was the measurable improvement in well-being or suffering?
- What was the documented duration of impact on human lives?
- Geographic scale of observed effects: local, regional, global, universal?

**For events still unfolding in the 2020s:**
- Rate ONLY on documented impact through January 2025
- Do NOT speculate on future trajectories or long-term outcomes
- Example: COVID-19 pandemic → rate based on 2020-2023 documented deaths, economic disruption, policy changes through early 2025. NOT on potential endemic scenarios or future waves.
- Example: Climate change → rate based on documented displacement, extreme weather events, ecosystem changes, and policy responses through 2025. NOT on climate model projections for 2050-2100.

**Calibration Check - Compare Directly:**
Before finalizing your Human Impact score, directly compare candidates:
- Does this event's DOCUMENTED impact (deaths, people affected, economic disruption) exceed that of other candidates you've generated?
- Examples for calibration: Great Depression affected hundreds of millions globally. World War II killed 70-85 million. Soviet collapse freed hundreds of millions. Decolonization affected billions.

### **Final Score Formula**
```
Final Score = (Causal Significance × 0.6) + (Human Impact × 0.4)
```

**Why this weighting?**
- Primary mission: explaining "how the world works" (causal chains matter most)
- Still honors human impact significantly (40%)
- Prevents overcrowding with localized tragedies that didn't reshape systems
- Allows foundational abstractions (heliocentrism, scientific method) to rank appropriately
- Major humanitarian catastrophes with broader impact still score highly

**Minimum threshold:** Strong A-anchor candidates should score ≥ 6.0

---

## Critical Rules

### **Rule 0: Include Major Wars, Genocides, and Controversial Events**

**Historical education requires covering difficult topics honestly.**

You MUST actively consider and include anchors for:
- Major wars (World War I, World War II, Vietnam War, etc.)
- Genocides and mass atrocities (Holocaust, Armenian Genocide, Rwandan Genocide, etc.)
- Slavery and forced labor systems
- Colonial violence and exploitation
- Political purges and repressions
- Any event with major causal significance or severe human impact

**These are not "sensitive topics to avoid" - they are essential historical knowledge.**

Do NOT self-censor or exclude these events out of concern for controversy. If an event has high causal significance and/or severe human impact, it MUST be considered as a candidate anchor regardless of how disturbing or controversial the subject matter is.

The scoring system (60% causal, 40% human impact) naturally elevates events like World War II, the Holocaust, and Atlantic Slavery because they both:
1. Reshaped global political/economic systems (high causal)
2. Caused immense human suffering (high impact)

**Test:** If you're generating candidates for "Contemporary: 1900-present" or "World War II" and haven't included major wars or atrocities as candidates, you are making an error.

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

**Why this matters:** Anchors must be reusable building blocks. "Labor Movements" should be ONE anchor reachable from multiple pathways (Industrial Revolution, Democratic Revolutions, Economic Systems), not bundled differently each time.

### **Rule 2: Choose 3-5 Anchors (Variable Count)**

DO NOT default to always choosing 5 anchors.

**Process:**
1. Generate 15-20 candidates (comprehensive brainstorming)
2. Calculate Final Scores for ALL candidates
3. Select 3-5 based on natural topic boundaries and score clustering
4. Explain your reasoning for the count

**When to use:**
- **3 anchors:** Topic has clear three-part structure; natural tripartite division
- **4 anchors:** Topic divides into four distinct domains or phases
- **5 anchors:** Complex topic with 5 genuinely essential aspects; no clear groupings

**The Test:** Would adding/removing one anchor feel forced or natural?

### **Rule 3: Each Anchor Needs Scope Description**

For each anchor, provide:
```
Title: [Concise, unambiguous name]
Scope: [2-3 sentences describing:
        - What this anchor covers
        - Time period (if applicable)
        - What's included
        - What's explicitly excluded/saved for other anchors]
Causal Significance: [X/10 with brief justification]
Human Impact: [Y/10 with brief justification]
Final Score: [Calculated: (X × 0.6) + (Y × 0.4)]
```

**Why scope matters:**
- Defines clear boundaries between anchors
- Enables deduplication (system checks if this anchor already exists)
- Prevents scope creep when writing narratives
- Ensures no gaps in coverage

### **Rule 4: Ruthless Prioritization**

Ask yourself: **"If users learn ONLY these 3-5 anchors, will they understand the core of this topic?"**

- A-anchors = "if you learn nothing else" essentials
- Important but secondary content → Level [X+1] deeper exploration, or B/C breadth anchors
- Don't try to be comprehensive at this level

**Remember:** The fractal goes deeper. You don't need to cover everything here.

### **Rule 5: Title Specificity and Reusability**

Anchor titles should match their natural scope - specific when genuinely specific, generic when applicable broadly.

**When to use SPECIFIC titles:**
At deeper levels (Level 4+) or for genuinely bounded topics:
- ✅ "Samoa's Experience of WWII (1940-1941)" - specific region and timeframe
- ✅ "The Siege of Leningrad" - specific event
- ✅ "Meiji Restoration" - specific period and place
- ✅ "Ottoman Entry into WWI" - specific nation's decision

**When to use GENERIC titles:**
For broad processes, concepts, or phenomena that appear in multiple contexts:
- ✅ "Labor Movements" - general phenomenon reachable from multiple pathways
- ✅ "Urbanization" - universal process
- ✅ "Mass Extinction Events" - recurring phenomenon
- ❌ "Industrial Era Labor Movements in Europe" - artificially narrowed

**Why reusability matters for generic topics:**

When a topic is genuinely the same across multiple pathways, use ONE anchor:
```
Path 1: Industrial Revolution → Factory System → Labor Movements
Path 2: Democratic Revolutions → Workers' Rights → Labor Movements
Path 3: Economic Systems → Capitalism → Labor Movements
```

This is intentional, not redundant. Same anchor, different entry points.

**The test:** Ask yourself:
1. Is this topic genuinely bounded (specific time/place/event)? → Use specific title
2. Is this topic a general phenomenon that could be reached from multiple pathways? → Use generic title
3. Am I artificially narrowing a general topic just because I'm approaching it from one context? → Don't do this

---

## Your Output Format

### **STEP 1: BRAINSTORM CANDIDATES (15-20)**

**IMPORTANT: In this step, do NOT evaluate or filter yet. Just brainstorm comprehensively.**

Generate 15-20 possible analytical anchors for {{parentTitle}}. Cast a wide net - include obvious major events AND less obvious but potentially significant developments.

For each candidate, provide ONLY:
```
[Number]. Title: [Name]
   Type: [Event/Process/Phenomenon/Concept/Person/Institution/Technology]
   Time Period: [Approximate dates or era when this primarily occurred]
   Scope: [1-2 sentence brief description]
```

**Do NOT assign scores yet. Do NOT think about what will make the final cut. Just generate a comprehensive list of 15-20 possibilities.**

Why 15-20? This ensures you don't accidentally filter out important candidates during brainstorming. You'll evaluate them systematically in Step 2.

---

### **STEP 2: SYSTEMATIC EVALUATION**

**Now evaluate EACH of the 15-20 candidates you generated in Step 1.**

For each candidate, add:
```
[Number]. Title: [Name from Step 1]
   Causal Significance: X/10
   Justification: [Why this rating - be specific about DOCUMENTED system changes]
   Human Impact: Y/10  
   Justification: [Why this rating - ONLY documented effects through Jan 2025, NOT future predictions]
   Final Score: [Calculated: (X × 0.6) + (Y × 0.4)]
   Anti-Circularity Check: [Confirm this is NOT in ancestor path and is sufficiently specific]
```

**CRITICAL - Direct Comparison Required:**

As you evaluate Human Impact, explicitly compare candidates:
- "Does Climate Change's documented impact through 2025 exceed Great Depression's documented impact?"
- "Has Digital Revolution affected more people than Decolonization affected?"
- "Are documented climate deaths/displacement comparable to World War casualties?"

This forces calibration against other major historical events rather than evaluating in isolation.

---

### **STEP 3: RANKING BY FINAL SCORE**

Sort ALL candidates from highest to lowest Final Score:
```
1. [Title] (Final Score: X.X)
2. [Title] (Final Score: X.X)
...
15. [Title] (Final Score: X.X)
```

**Note:** This ranking by score is used for the "why these anchors" explanation to users. However, the tree visualization will display anchors in CHRONOLOGICAL order (see Step 4).

---

### **STEP 4: FINAL SELECTION (3-5 anchors)**

**State your choice:** "I'm selecting [3/4/5] anchors because [explain reasoning for this number]."

**For each selected anchor, LIST IN CHRONOLOGICAL ORDER (by when the event/process primarily occurred):**

```
[Number]. **[Title]**
   - **Time Period:** [Approximate dates - this determines chronological order]
   - **Scope:** [Detailed 2-3 sentence description]
   - **Why Essential:** [1-2 sentences explaining why this is one of the most important aspects of {{parentTitle}}]
   - **Causal Significance:** X/10
   - **Human Impact:** Y/10
   - **Final Score:** Z.Z
   - **Position:** [1-5, assigned based on chronological order, NOT score order]
   
   [If this might be a duplicate of an existing anchor, note it:
   "NOTE: This may overlap with existing anchor [Title] - system should check."]
```

**CRITICAL:** The Position field (1-5) must be assigned in CHRONOLOGICAL order, even if this differs from the score ranking. The system displays anchors in the tree in position order, and users expect to see history unfold chronologically.

**Example:**
If your top 3 anchors by score are:
1. Cold War (Final Score: 9.2) [1947-1991]
2. World War II (Final Score: 9.8) [1939-1945]
3. Digital Revolution (Final Score: 8.5) [1970s-present]

Then in Step 4, list them chronologically:
1. World War II - Position: 1 (earliest)
2. Cold War - Position: 2 (middle)
3. Digital Revolution - Position: 3 (latest)

---

### **STEP 5: WHAT WAS CUT AND WHY**

For the highest-scoring candidates that didn't make the final cut, explain:
```
- [Title] (Score: X.X): [Why excluded - be specific about what moved it down or why others were more essential]
```

This helps validate your selection logic and shows you considered important alternatives.

---

## Response Format

Your response must be structured exactly as follows for parsing:

```
STEP 1: BRAINSTORM CANDIDATES

[Your 15-20 candidates with Title, Type, Time Period, and brief Scope only - NO SCORES YET]

STEP 2: SYSTEMATIC EVALUATION

[All 15-20 candidates with Causal, Human Impact, Final Score, and Anti-Circularity Check added]

STEP 3: RANKING

[All candidates sorted by Final Score]

STEP 4: FINAL SELECTION

Number of anchors selected: [3/4/5]
Reasoning: [Why this number]

1. **[Title]**
   - Time Period: [Dates]
   - Scope: [Description]
   - Why Essential: [Explanation]
   - Causal Significance: X/10
   - Human Impact: Y/10
   - Final Score: Z.Z
   - Position: 1

[Repeat for each selected anchor in chronological order]

STEP 5: CUTS

[Explain why high-scoring candidates were excluded]
```

**CRITICAL FORMATTING RULES:**

1. **NO quotation marks around titles** - Ever. Not in candidate list, not in final selection, nowhere.
2. **NO markdown code blocks** - Output plain text in the specified format
3. **Follow the exact structure** - Makes parsing reliable
4. **List anchors in CHRONOLOGICAL order** in Step 4 with Position assigned accordingly
5. **Generate 15-20 candidates in Step 1** - Not 6-8, not 10. Full brainstorm first.

**Example of correct formatting in Step 1:**

    1. Title: Great Oxidation Event
       Type: Phenomenon
       Time Period: ~2.4 billion years ago
       Scope: Atmospheric transformation when cyanobacteria's photosynthesis filled atmosphere with oxygen.

**NOT:**

    1. Title: "Great Oxidation Event"  ← WRONG - no quotes!

---

## Important Reminders

**On People as Anchors:**
Only include individual people when their personal impact was decisive, not merely representative. "Napoleon Bonaparte" (reshaped Europe) is valid; "A Typical Factory Worker" (representative figure) is not. Most topics should focus on processes, events, or concepts rather than individuals.

**On Temporal Scope:**
Anchors don't need to cover the full time range of their parent. If the parent covers 500 years but one critical 10-year period deserves an anchor, that's valid. Explain the temporal focus in the scope description.

**On Deduplication:**
The system will check if your proposed anchors already exist elsewhere in the fractal. Write clear, standard titles and precise scope descriptions to enable this matching. If you suspect an anchor might already exist, note it in Step 4.

**On Comprehensive Brainstorming:**
The 15-20 candidate requirement in Step 1 is deliberate. It forces you to consider a wider range of possibilities before evaluating. Don't skip less obvious candidates - they might score higher than you expect when evaluated systematically.

---

Remember: Your anchors must go DEEPER into "{{parentTitle}}" while respecting the learning path that got here. Avoid circularity by checking against ancestor titles and making topics sufficiently specific to the current scope.