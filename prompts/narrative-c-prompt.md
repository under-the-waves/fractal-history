# C-Breadth Narrative Generation Task

You are writing a ~1000-word historical narrative for the Fractal History learning system.

## What You Are Writing

**Anchor ID:** {{anchorId}}
**Title:** {{anchorTitle}}
**Scope:** {{anchorScope}}
**Breadth:** C (Geographic/Regional)

You are writing the **C-breadth narrative** for this anchor. This means organizing your narrative around how this topic manifested across different regions or civilizations, showing both common patterns and regional variations.

## Context: Where This Anchor Sits in the Learning Path

**Ancestor path (how users reached this anchor):**
{{ancestorPath}}

**Prerequisites the user has completed:** {{prerequisites}}

## The 5 C-Anchors (Geographic Regions) You Must Teach

These are the regions or civilizations that provide complete geographic coverage of this topic. Your narrative MUST:
- Address each region substantively
- **Bold each region title** when you introduce it
- Help readers understand both what was similar and what was different across regions

{{childAnchors}}

---

## Narrative Voice

Your writing should emulate the storytelling style of Dan Carlin's Hardcore History podcast. This means:

**Vivid, specific details**: Make history feel immediate and consequential. Instead of "the battle was brutal," describe what actually happened—the terrain, the tactics, the documented numbers.

**Real human stakes**: What did people actually risk, gain, or lose? Ground abstract historical forces in concrete human experience.

**Concrete scenes**: Draw from documented historical accounts to create scenes readers can visualize. Never fabricate—use what sources actually tell us.

**Building tension**: Even when readers know the outcome, create a sense of uncertainty by showing what participants did not know at the time.

**Connecting to larger patterns**: Help readers see how specific events reflect broader historical forces, without overstating significance.

**Conversational authority**: Write as someone who has deeply studied this topic and is sharing it with genuine enthusiasm—not as a textbook or encyclopedia.

---

## Historical Accuracy

This is an educational project. Factual accuracy is non-negotiable.

**Verify before stating**: Only include facts you are confident are historically accurate. If you are uncertain about a date, number, or sequence of events, use appropriate hedging ("around," "approximately," "historians estimate").

**Dates and sequences matter**: Getting the order of events wrong, or misattributing causation, undermines the entire learning purpose.

**Names and places**: Spell names correctly. Locate places accurately. Use modern geographic references to help readers orient themselves.

**Causation**: Be careful about causal claims. Distinguish between what directly caused something and what merely preceded it.

**Contested history**: Where historians genuinely disagree, acknowledge this rather than presenting one interpretation as settled fact.

If you are not certain about a specific fact, either verify it against your training knowledge or omit it. Never invent historical details.

---

## Handling Sensitive Topics

History includes violence, war, slavery, genocide, colonialism, religious persecution, famine, and other traumatic events. This project does not shy away from these realities.

**Be honest**: Describe what happened. Do not sanitize atrocities or minimize suffering to make the narrative more comfortable.

**Be objective**: Present events based on historical evidence, not modern political framing. Let readers draw their own conclusions about moral judgments.

**Be respectful**: When describing mass suffering, remember these were real people. Avoid sensationalism or treating trauma as entertainment.

**Provide context**: Help readers understand why events happened, what conditions enabled them, and what their consequences were.

**Use appropriate language**: Describe events accurately without gratuitous detail. The goal is understanding, not shock value.

Example: When covering Atlantic slavery, describe the scale, the conditions, the mortality rates, and the economic systems that drove it. Do not avoid the horror, but also do not dwell on graphic details beyond what serves comprehension.

---

## Opening Hook (First 150-200 words)

Begin with a **discrete anecdote, moment, or discovery** that illuminates your topic—ideally one that hints at geographic variation or connection.

### Requirements:

- Use a specific, documented event—not a general statement about the topic
- Assume the reader knows nothing. Explain who people are (roles before names), where places are (modern geographic references), when things happened
- Minimize proper names. Use descriptions where possible
- Create mystery or tension that makes the reader want to understand more
- End the hook by stating what it reveals (not with clickbait questions)
- Include ONE piece of primary source evidence maximum if it genuinely illuminates the point

**Then pivot** to introduce the geographic scope of your narrative.

### Example of a Strong Opening Hook

**Topic: Columbian Exchange**

"In November 1519, a Spanish conquistador stood in the main plaza of the Aztec capital: a city of perhaps 200,000 people built on an island in a vast lake, larger than any city in Spain. He had about 400 Spanish soldiers and a few thousand indigenous allies from rival groups. He was a guest of the Aztec emperor, who commanded an empire of millions. Two years later, the city was rubble. The empire was gone. Both Spanish and Aztec accounts agree on what turned the tide: an epidemic. A single infected person arrived with Spanish reinforcements in 1520, bringing smallpox to a population that had never encountered it. A Spanish friar later recorded Aztec testimonies: 'Sores spread on people's faces, on their breasts, on their bellies... Many died of them, and many just died of hunger because they could not get up to search for food.'

This catastrophe was one consequence of a collision between two worlds that had been separated for at least 15,000 years..."

**Why this works:**
- Discrete anecdote (the fall of Tenochtitlan)
- Minimal names (just roles: "Spanish conquistador," "Aztec emperor," "Spanish friar")
- Explains context (November 1519, Aztec capital, population sizes)
- Points to geographic collision (two worlds separated for millennia)
- Uses ONE primary source effectively (Aztec testimony)

**Important:** This example demonstrates the technique. Do not copy its structure. Find an equally compelling but different anecdote appropriate to your specific topic.

---

## Main Narrative (600-700 words)

### Structure for Geographic Narratives

Your narrative should help readers understand this topic across space:

- **Establish the global context**: What was the overall pattern or phenomenon?
- **Move through regions**: Address each region substantively, bolding titles as you introduce them
- **Compare and contrast**: What was similar across regions? What was different and why?
- **Avoid mere listing**: Do not just describe each region in isolation—show connections, parallels, and divergences

### Organizational Options

You may organize geographically (region by region) OR thematically (examining how different regions handled similar challenges). Choose whichever serves clarity better. Either way, every region must receive meaningful attention.

### Context and Perspective

- **Geographic context**: Always locate places using modern references
- **Resist hierarchy**: Do not frame one region as the "main" story and others as footnotes. Each region's experience matters
- **Appropriate precision**: Use "roughly," "around," "approximately" for uncertain dates and estimates

### Evidence and Drama

- **Evidence-based drama**: Find drama in real stakes, documented events, actual consequences
- **Never fabricate**: Do not invent emotions, reactions, or perspectives unless you have documentary evidence
- **Regional specificity**: Use concrete details from each region, not generic descriptions

---

## Closing (100-150 words)

End by synthesizing the geographic picture: what does examining this topic across regions reveal that focusing on one place would miss? Point forward or offer a final insight about global patterns.

---

## Forbidden Patterns

NEVER use these:
- "This isn't just X, it's Y" or "These weren't X—they were Y" (dramatic reframing)
- "Imagine yourself..." or "Picture yourself..." (cliché openings)
- Em-dashes (—) anywhere in the text
- Fabricated reactions, emotions, or perspectives from historical figures
- "What happened next will shock you" or similar clickbait
- Rhetorical questions when a direct statement works better
- Treating one region as central and others as peripheral
- Listing regions as bullet points—they must be woven into flowing prose

---

## Output Format

Return your response as JSON:

{
  "narrative": "<p>Your ~1000-word narrative here, with HTML paragraph tags. Bold the region titles using <strong> tags.</p>",
  "keyConcepts": [
    "Key takeaway about region 1",
    "Key takeaway about region 2",
    "Key takeaway about region 3",
    "Key takeaway about region 4",
    "Key takeaway about region 5"
  ],
  "questions": [
    {
      "question": "Simple 'what' or 'roughly when' question about region 1",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about region 2",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about region 3",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about region 4",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about region 5",
      "answer": "Clear, specific answer"
    }
  ],
  "estimatedReadTime": 5
}

---

## Knowledge Check Questions

The 5 questions test whether readers absorbed the key information from each region. Their purpose is reinforcement—helping users commit essential facts to memory.

### Guidelines:

- **One question per region**: Each question corresponds to one of the 5 geographic areas you taught
- **Complexity Level 1 only**: Simple factual recall ("what happened" or "roughly when did X happen")
- **Single-focus**: Never ask two things in one question
- **Answerable from the narrative**: Every answer must be clearly stated in your text
- **Not circular**: Do not embed the answer in the question
- **Focus on regional distinctiveness**: Test knowledge about what made each region's experience unique or significant

These questions will appear after the narrative as a brief quiz before users proceed.
