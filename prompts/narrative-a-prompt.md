# A-Breadth Narrative Generation Task

You are writing a ~1000-word historical narrative for the Fractal History learning system.

## What You Are Writing

**Anchor ID:** {{anchorId}}
**Title:** {{anchorTitle}}
**Scope:** {{anchorScope}}
**Breadth:** A (Analytical/Essential)

You are writing the **A-breadth narrative** for this anchor. This means organizing your narrative around the 5 most essential analytical aspects of this topic—the things someone must understand if they learn nothing else.

## Context: Where This Anchor Sits in the Learning Path

**Ancestor path (how users reached this anchor):**
{{ancestorPath}}

**Prerequisites the user has completed:** {{prerequisites}}

## The 5 A-Anchors You Must Teach

These are the 5 most causally important aspects of this topic. Your narrative MUST:
- Introduce and explain each of these concepts
- **Bold each A-anchor title** when it first appears meaningfully in the narrative
- Ensure a reader understands why each matters

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

Begin with a **discrete anecdote, moment, or discovery** that illuminates your topic.

### Requirements:

- Use a specific, documented event—not a general statement about the topic
- Assume the reader knows nothing. Explain who people are (roles before names), where places are (modern geographic references), when things happened
- Minimize proper names. Use descriptions: "a Spanish conquistador" not "Hernán Cortés"
- Create mystery or tension that makes the reader want to understand more
- End the hook by stating what it reveals (not with clickbait questions like "what happened next will shock you")
- Include ONE piece of primary source evidence maximum (a quote, letter, or account) if it genuinely illuminates the point

**Then pivot** to the chronological beginning of your narrative. Vary your pivot technique.

### Example of a Strong Opening Hook

**Topic: World War One**

"On Christmas Eve 1914, British soldiers in their trenches along the Western Front in Belgium heard something unexpected: German soldiers across the battlefield singing Christmas carols. Some Germans placed small Christmas trees with candles along their trench lines. Cautiously, British soldiers began singing back. On Christmas morning, soldiers from both sides climbed out of their trenches, met in the muddy ground between the lines, exchanged cigarettes and chocolate, showed each other family photographs, and played informal football matches. They helped each other bury their dead. One British officer wrote: 'Here was I, the man who had been trying to kill, and there he was, who had been trying to kill me.' By the following Christmas, military commanders on both sides had issued strict orders ensuring such fraternization could never happen again.

This spontaneous truce captures something that would be lost as the war dragged on: the sense that soldiers on different sides were still fundamentally human beings caught in the same nightmare. How did Europe's great powers end up in this nightmare? The trigger came in summer 1914, when the assassination of an Austrian archduke set off a chain reaction..."

**Why this works:**
- Discrete anecdote (Christmas Truce)
- Minimal names (just nationalities: British, German)
- Explains context (Christmas Eve 1914, Western Front in Belgium, trenches)
- Creates poignancy (humanity briefly breaking through)
- Uses ONE primary source effectively (officer's quote)
- Ends with significance (commanders prevented it happening again)
- Clear pivot to chronological beginning (summer 1914)

**Important:** This example demonstrates the technique. Do not copy its structure. Find an equally compelling but different anecdote appropriate to your specific topic.

---

## Main Narrative (600-700 words)

### Structure and Flow

- **Chronological organization**: Present events in time order, not by category or importance
- **First principles**: Explain why things happened, not just what happened. When you describe a striking pattern or coincidence, explain the underlying causes
- **Build progressively**: Start with context readers need, then move to specific developments
- **Weave in the A-anchors naturally**: The 5 A-anchors should emerge within your chronological story, not as a checklist. Bold each title when you introduce it substantively

### Context and Perspective

- **Geographic context**: Always locate places using modern references ("Jericho, in modern-day Palestine")
- **Global perspective**: Avoid Western-centric framing. Acknowledge what you are not covering
- **Appropriate precision**: Use "roughly," "around," "approximately" for ancient dates and uncertain estimates

### Evidence and Drama

- **Evidence-based drama**: Find drama in real stakes, documented events, actual consequences
- **Never fabricate**: Do not invent emotions, reactions, or perspectives unless you have documentary evidence
- **Real human stakes**: What did people actually risk, gain, or lose?

---

## Closing (100-150 words)

End by connecting this topic to what comes next or its lasting significance. Do not summarize what you already wrote. Instead, point forward or offer a final insight that rewards the reader.

---

## Forbidden Patterns

NEVER use these:
- "This isn't just X, it's Y" or "These weren't X—they were Y" (dramatic reframing)
- "Imagine yourself..." or "Picture yourself..." (cliché openings)
- Em-dashes (—) anywhere in the text
- Fabricated reactions, emotions, or perspectives from historical figures
- "What happened next will shock you" or similar clickbait
- Rhetorical questions when a direct statement works better
- Listing the 5 A-anchors as bullet points—they must be woven into prose

---

## Output Format

Return your response as JSON:

{
  "narrative": "<p>Your ~1000-word narrative here, with HTML paragraph tags. Bold the A-anchor titles using <strong> tags.</p>",
  "keyConcepts": [
    "First key takeaway (corresponding to A-anchor 1)",
    "Second key takeaway (corresponding to A-anchor 2)",
    "Third key takeaway (corresponding to A-anchor 3)",
    "Fourth key takeaway (corresponding to A-anchor 4)",
    "Fifth key takeaway (corresponding to A-anchor 5)"
  ],
  "questions": [
    {
      "question": "Simple 'what' or 'roughly when' question about A-anchor 1",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about A-anchor 2",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about A-anchor 3",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about A-anchor 4",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about A-anchor 5",
      "answer": "Clear, specific answer"
    }
  ],
  "estimatedReadTime": 5
}

---

## Knowledge Check Questions

The 5 questions test whether readers absorbed the key information from each A-anchor. Their purpose is reinforcement—helping users commit essential facts to memory.

### Guidelines:

- **One question per A-anchor**: Each question corresponds to one of the 5 concepts you taught
- **Complexity Level 1 only**: Simple factual recall ("what happened" or "roughly when did X happen")
- **Single-focus**: Never ask two things in one question
- **Answerable from the narrative**: Every answer must be clearly stated in your text
- **Not circular**: Do not embed the answer in the question (e.g., "What Mars-sized impact created the Moon?" is bad because "Mars-sized impact" is the answer)
- **Meaningful**: Test knowledge that helps readers understand how the world works, not trivia

These questions will appear after the narrative as a brief quiz before users proceed.
