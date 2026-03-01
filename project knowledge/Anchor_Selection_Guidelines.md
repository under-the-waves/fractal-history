# Anchor Selection Guidelines for LLMs

## Selection Criteria: Dual Rating System

For each candidate anchor, provide:

### **1. Causal Significance (1-10)**
- How directly did this shape subsequent history?
- How many later developments depend on understanding this?
- Does this represent fundamental transformation vs. incremental change?

### **2. Human Impact (1-10)**
- How many people were affected?
- How severe was the improvement in well-being or suffering?
- Duration of impact (brief crisis vs. lasting transformation)?

### **Final Score Formula**
```
Final Score = (Causal Significance Ã— 0.6) + (Human Impact Ã— 0.4)
```

**Rationale for 60/40 weighting:**
- Primary mission: helping users understand "how the world works" (causal chains)
- Still honors human impact significantly (40%)
- Prevents overcrowding with localized tragedies
- Handles foundational abstractions fairly (e.g., heliocentrism, scientific method)
- Major humanitarian catastrophes with broader impact still rank highly

---

## Core Rules for Anchor Selection

### **Rule 1: No Double-Barreled Anchors**

âŒ BAD: "Great Oxidation Event and Complex Cells"  
âœ… GOOD: "Great Oxidation Event" (separate from "Evolution of Complex Cells")

**Why:** Enables multiple pathways to reach the same anchor; keeps anchors as atomic, reusable building blocks.

**Test:** Can you describe this anchor without using "and"? If not, split it.

### **Rule 2: Variable Anchor Count (3-5)**

- Generate 6-8 candidates
- Calculate scores using formula above
- Select 3-5 based on natural topic boundaries
- Explain why you chose this number

**When to use 3:** Clear three-part structure  
**When to use 4:** Natural four-domain division  
**When to use 5:** Complex topic with 5 genuinely essential aspects

### **Rule 3: Each Anchor Needs Scope Description**

```
ID: [Assigned after deduplication check]
Title: [Concise, unambiguous name]
Scope: [2-3 sentences describing coverage, time period, what's included/excluded]
Causal Significance: [Score/10]
Human Impact: [Score/10]
Final Score: [Calculated using formula]
```

**Why scope descriptions matter:**
- LLM knows what content belongs in this anchor vs. others
- Prevents scope creep and gaps
- Enables deduplication checking
- Helps with prerequisite determination

### **Rule 4: Ruthless Prioritization**

Ask: "If users learn ONLY these anchors, will they grasp the core?"

- A-anchors = "if you learn nothing else" essentials
- Important but secondary content â†’ Level X+1 or B/C breadth anchors
- Strong candidates: Final Score â‰¥ 6.0

### **Rule 5: Enable Multiple Pathways (Reuse is Good)**

**Keep anchors atomic:**
- Use standard, recognizable titles (not context-specific)
- âœ… "Labor Movements" (good for reuse)
- âŒ "Industrial Era Labor Movements" (too specific)

**Positive example of overlap:**
```
Path 1: Industrial Revolution â†’ Factory System â†’ Labor Movements
Path 2: Democratic Revolutions â†’ Workers' Rights â†’ Labor Movements  
Path 3: Economic Systems â†’ Capitalism â†’ Labor Movements
```

Same anchor reached three ways = good design.

---

## System Process: Anchor Deduplication

### **Backend maintains global anchor registry:**

```javascript
{
  "2A-X7Y3Z": {
    "id": "2A-X7Y3Z",
    "title": "Labor Movements",
    "scope": "Organized labor from Industrial Revolution through early 20th century. Includes trade unions, strikes, labor victories, rights development. ~1760-1920.",
    "parents": ["2A-B9C4D", "2A-E3F8G"],
    "prerequisites": ["2A-C9D3E"],
    "narrative_generated": true
  }
}
```

### **Workflow When Creating Anchors**

**Step 1:** LLM generates anchor list with titles and scope descriptions

**Step 2:** System checks for existing anchors
- Exact title match search
- Semantic similarity search on scope descriptions (threshold: 0.85)
- If match found, present to LLM for confirmation

**Step 3:** LLM confirms match or creates new
- **"YES - Same anchor"** â†’ Reuse existing, add new parent relationship
- **"NO - Different anchor"** â†’ Create new with disambiguated title
- **"SIMILAR - Needs split"** â†’ Existing anchor too broad, split into specific anchors

**Step 4:** Update registry
- Add new parent relationships
- Track alternate pathways
- Link related anchors

---

## LLM Output Format

```
## STEP 1: CANDIDATE ANCHORS (6-8)

1. Title: "Great Oxidation Event"
   Scope: "Atmospheric transformation ~2.4 BYA when cyanobacteria's photosynthesis 
           filled atmosphere with oxygen, causing mass extinction of anaerobic life."
   Causal Significance: 10/10 - Enabled all complex life
   Human Impact: 10/10 - Without it, humans never exist
   Final Score: (10 Ã— 0.6) + (10 Ã— 0.4) = 10.0

[Continue for all candidates...]

## STEP 2: RANKING BY FINAL SCORE
1. Great Oxidation Event (10.0)
2. Evolution of Complex Cells (9.0)
[...]

## STEP 3: FINAL SELECTION (X anchors)

I'm choosing [3/4/5] anchors because [reasoning]...

[For each selected anchor:]
ID: [To be assigned after deduplication]
Title: [Name]
Scope: [Description]
Why essential: [Brief justification]
Causal: X/10 | Human Impact: Y/10 | Final Score: Z

## STEP 4: WHAT WAS CUT AND WHY

[Explanation of excluded candidates]
```

---

## Examples of Divergent Cases

**High Causal, Lower Human Impact:**
- Heliocentrism: Causal 9, Human 3 â†’ Final: 6.6
- Calculus: Causal 10, Human 5 â†’ Final: 8.0

**High Human Impact, Lower Causal:**
- Cambodian Genocide: Causal 3, Human 10 â†’ Final: 5.8
- Irish Potato Famine: Causal 4, Human 9 â†’ Final: 6.0

**Both High (typical for major events):**
- Industrial Revolution: Causal 10, Human 10 â†’ Final: 10.0
- World War Two: Causal 10, Human 10 â†’ Final: 10.0
- Atlantic Slavery: Causal 8, Human 10 â†’ Final: 8.8
