# Breadth-A Anchor Selection Prompt

## Your Task

You are selecting **Level [X]A anchors** (analytical breadth - most essential aspects) for the parent anchor:

**Parent ID:** [ID]  
**Parent Title:** [Title]  
**Parent Scope:** [Scope description]  
**Time Period:** [If applicable]  
**Geographic Range:** [If applicable]

Your goal is to identify the 3-5 most causally important and impactful aspects of this topic that users must understand to grasp its essence.

**Critical perspective requirement:** Approach this as if you're an alien historian studying Earth with no cultural bias. Actively resist Western/European-centric defaults. Consider: Are non-Western developments receiving fair weight relative to their causal significance and human impact?

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

### **2. Human Impact (1-10)**
- How many people were directly affected?
- How severe was the improvement in well-being or suffering?
- Duration of impact (brief crisis vs. lasting transformation)?
- Scale: local, regional, global, universal?

### **Final Score Formula**
```
Final Score = (Causal Significance Ã— 0.6) + (Human Impact Ã— 0.4)
```

**Why this weighting?**
- Primary mission: explaining "how the world works" (causal chains matter most)
- Still honors human impact significantly (40%)
- Prevents overcrowding with localized tragedies that didn't reshape systems
- Allows foundational abstractions (heliocentrism, scientific method) to rank appropriately
- Major humanitarian catastrophes with broader impact still score highly

**Minimum threshold:** Strong A-anchor candidates should score â‰¥ 6.0

---

## Critical Rules

### **Rule 1: NO Double-Barreled Anchors**

Each anchor must be a **single, atomic concept**.

âŒ **BAD Examples:**
- "Great Oxidation Event and Complex Cells"
- "World War One and World War Two"
- "Causes and Consequences of the Industrial Revolution"
- "Political and Economic Changes"

âœ… **GOOD Examples:**
- "Great Oxidation Event"
- "World War One"
- "Causes of the Industrial Revolution" (or as separate anchor: "Consequences of the Industrial Revolution")
- "Political Restructuring"

**The Test:** Can you describe this anchor without using "and" or "both/also"? If not, split it.

**Why this matters:** Anchors must be reusable building blocks. "Labor Movements" should be ONE anchor reachable from multiple pathways (Industrial Revolution, Democratic Revolutions, Economic Systems), not bundled differently each time.

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
Final Score: [Calculated: (X Ã— 0.6) + (Y Ã— 0.4)]
```

**Why scope matters:**
- Defines clear boundaries between anchors
- Enables deduplication (system checks if this anchor already exists)
- Prevents scope creep when writing narratives
- Ensures no gaps in coverage

### **Rule 4: Ruthless Prioritization**

Ask yourself: **"If users learn ONLY these 3-5 anchors, will they understand the core of this topic?"**

- A-anchors = "if you learn nothing else" essentials
- Important but secondary content â†’ Level [X+1] deeper exploration, or B/C breadth anchors
- Don't try to be comprehensive at this level

**Remember:** The fractal goes deeper. You don't need to cover everything here.

### **Rule 5: Title Specificity and Reusability**

Anchor titles should match their natural scope - specific when genuinely specific, generic when applicable broadly.

**When to use SPECIFIC titles:**
At deeper levels (Level 4+) or for genuinely bounded topics:
- âœ… "Samoa's Experience of WWII (1940-1941)" - specific region and timeframe
- âœ… "The Siege of Leningrad" - specific event
- âœ… "Meiji Restoration" - specific period and place
- âœ… "Ottoman Entry into WWI" - specific nation's decision

**When to use GENERIC titles:**
For broad processes, concepts, or phenomena that appear in multiple contexts:
- âœ… "Labor Movements" - general phenomenon reachable from multiple pathways
- âœ… "Urbanization" - universal process
- âœ… "Mass Extinction Events" - recurring phenomenon
- âŒ "Industrial Era Labor Movements in Europe" - artificially narrowed

**Why reusability matters for generic topics:**

When a topic is genuinely the same across multiple pathways, use ONE anchor:
```
Path 1: Industrial Revolution â†’ Factory System â†’ Labor Movements
Path 2: Democratic Revolutions â†’ Workers' Rights â†’ Labor Movements
Path 3: Economic Systems â†’ Capitalism â†’ Labor Movements
```

This is intentional, not redundant. Same anchor, different entry points.

**The test:** Ask yourself:
1. Is this topic genuinely bounded (specific time/place/event)? â†’ Use specific title
2. Is this topic a general phenomenon that could be reached from multiple pathways? â†’ Use generic title
3. Am I artificially narrowing a general topic just because I'm approaching it from one context? â†’ Don't do this

---

## Your Output Format

### **STEP 1: CANDIDATE ANCHORS (6-8)**

Generate more candidates than you need. For each:

```
[Number]. Title: "[Name]"
   Type: [Event/Process/Phenomenon/Concept/Person/Institution/Technology]
   Scope: "[2-3 sentence description]"
   Causal Significance: X/10
   Justification: [Why this rating - be specific]
   Human Impact: Y/10
   Justification: [Why this rating - be specific]
   Final Score: [Calculated: (X Ã— 0.6) + (Y Ã— 0.4)]
```

### **STEP 2: RANKING BY FINAL SCORE**

Sort candidates from highest to lowest Final Score:
```
1. [Title] (Final Score: X.X)
2. [Title] (Final Score: X.X)
[...]
```

### **STEP 3: FINAL SELECTION (3-5 anchors)**

**State your choice:** "I'm selecting [3/4/5] anchors because [explain reasoning for this number]."

**For each selected anchor:**
```
[Number]. Title: "[Name]"
   Scope: "[2-3 sentences]"
   Why essential: [1-2 sentences explaining why this made the cut]
   Causal: X/10 | Human Impact: Y/10 | Final Score: Z.Z
   
   [If this might be a duplicate of an existing anchor, note it:
   "NOTE: This may overlap with existing anchor [Title] - system should check."]
```

### **STEP 4: WHAT WAS CUT AND WHY**

For the 2-3 candidates that didn't make the final cut:
```
- [Title] (Score: X.X): [Why excluded - be specific about what moved it down]
```

This helps validate your selection logic.

---

## Important Reminders

**On People as Anchors:**
Only include individual people when their personal impact was decisive, not merely representative. "Napoleon Bonaparte" (reshaped Europe) is valid; "A Typical Factory Worker" (representative figure) is not. Most topics should focus on processes, events, or concepts rather than individuals.

**On Temporal Scope:**
Anchors don't need to cover the full time range of their parent. If the parent covers 500 years but one critical 10-year period deserves an anchor, that's valid. Explain the temporal focus in the scope description.

**On Deduplication:**
The system will check if your proposed anchors already exist elsewhere in the fractal. Write clear, standard titles and precise scope descriptions to enable this matching. If you suspect an anchor might already exist, note it in Step 3.

---

## Example (Abbreviated)

**Parent:** Industrial Revolution (1750-1900)

### STEP 1: CANDIDATES (showing first 3 of 6-8)

1. Title: "Steam Power"
   Type: Technology
   Scope: "Development and application of steam engines from Newcomen to Watt to locomotive and factory applications. Enabled mechanized production and transport revolution. ~1710-1850."
   Causal Significance: 9/10 - Enabled factory system and railways; energy regime shift
   Human Impact: 8/10 - Transformed labor, enabled urbanization, but gradual
   Final Score: (9 Ã— 0.6) + (8 Ã— 0.4) = 8.6

2. Title: "Factory System"
   Type: Process
   Scope: "Centralized mass production in purpose-built facilities using powered machinery and division of labor. Includes working conditions, discipline, child labor. ~1760-1900."
   Causal Significance: 8/10 - New mode of production; basis of industrial capitalism
   Human Impact: 9/10 - Harsh conditions, but employment for millions
   Final Score: (8 Ã— 0.6) + (9 Ã— 0.4) = 8.4

3. Title: "Working Conditions in Factories"
   Type: Phenomenon
   Scope: "Long hours, dangerous machinery, child labor, lack of regulations. Led to reform movements and labor organization. ~1760-1850."
   Causal Significance: 5/10 - Led to reforms but didn't reshape broader systems
   Human Impact: 9/10 - Immense suffering for workers
   Final Score: (5 Ã— 0.6) + (9 Ã— 0.4) = 6.6

[Continue for 3-5 more candidates...]

### STEP 2: RANKING
1. Steam Power (8.6)
2. Factory System (8.4)
3. Working Conditions (6.6)
[...]

### STEP 3: SELECTION (4 anchors)

I'm selecting 4 anchors because the Industrial Revolution has four distinct essential dimensions: energy source, production system, transportation transformation, and economic restructuring. Three would omit critical aspects; five would include secondary details better explored at Level 3.

1. Title: "Steam Power"
   Scope: [as above]
   Why essential: The energy revolution that made everything else possible
   Causal: 9/10 | Human Impact: 8/10 | Final Score: 8.6

[Continue for remaining 3...]

### STEP 4: CUTS
- Working Conditions (6.6): Important for understanding human cost, but better explored under "Factory System" or "Labor Movements" anchors. Not a distinct causal force itself.
[...]

---

## You Are Ready

Begin with STEP 1: Generate 6-8 candidate anchors for:

**Parent ID:** [ID]  
**Parent Title:** [Title]  
**Parent Scope:** [Scope]
