# B-Breadth Narrative Generation Task

You are writing a ~1000-word historical narrative for the Fractal History learning system.

## What You Are Writing

**Anchor ID:** {{anchorId}}
**Title:** {{anchorTitle}}
**Scope:** {{anchorScope}}
**Breadth:** B (Temporal/Chronological)

You are writing the **B-breadth narrative** for this anchor. This means organizing your narrative around how this topic unfolded over time, guiding readers through distinct chronological periods.

## Context: Where This Anchor Sits in the Learning Path

**Ancestor path (how users reached this anchor):**
{{ancestorPath}}

**Prerequisites the user has completed:** {{prerequisites}}

## The 5 B-Anchors (Temporal Periods) You Must Teach

These are the chronological periods that divide this topic. Your narrative MUST:
- Move through each period in order
- **Bold each period title** when you transition into it
- Help readers understand what changed between periods and why

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

## Opening: Precursor History (150-200 words)

Begin by setting the stage: what was the world like **before** the first temporal period begins? This section provides the historical context that makes the chronological narrative comprehensible.

### Requirements:

- Describe the conditions, forces, or events that preceded the first period
- Explain what the reader needs to know to understand why the first period began when and how it did
- Use specific, concrete details: dates, places (with modern geographic references), documented facts
- Assume the reader knows nothing about this topic
- Do NOT use an anecdote or hook — go straight into the historical context
- End by transitioning naturally into the first period

### Example

**Topic: World War II**

"By the late 1930s, the international order established after the First World War was collapsing. Germany, humiliated by the Treaty of Versailles and ravaged by economic depression, had turned to Adolf Hitler's National Socialist Party. Japan had already invaded Manchuria in 1931 and was pushing deeper into China. Italy under Mussolini had seized Ethiopia. The League of Nations, designed to prevent exactly this kind of aggression, proved toothless. Britain and France pursued appeasement, hoping territorial concessions would satisfy expansionist ambitions. They were wrong."

**Why this works:**
- Sets the geopolitical stage before the war begins
- Concrete details (Treaty of Versailles, Manchuria 1931, Ethiopia)
- Explains the forces that made the first period inevitable
- Natural transition into the chronological narrative

---

## Main Narrative (600-700 words)

### Structure for Temporal Narratives

Your narrative should move **sequentially through the periods**, helping readers feel the passage of time:

- **Establish the starting point**: What did things look like at the beginning of the first period?
- **Show transitions**: What caused each shift from one period to the next?
- **Mark period boundaries clearly**: Bold each period title as you enter it
- **Convey a sense of change**: Readers should finish understanding how things transformed over time

### Context and Perspective

- **Geographic context**: Always locate places using modern references
- **Global perspective**: Avoid Western-centric framing. Acknowledge regional variations
- **Appropriate precision**: Use "roughly," "around," "approximately" for uncertain dates

### Evidence and Drama

- **Evidence-based drama**: Find drama in real stakes, documented events, actual consequences
- **Never fabricate**: Do not invent emotions, reactions, or perspectives unless you have documentary evidence
- **Cause and effect**: Emphasize why each transition happened

---

## Closing: Aftermath (100-150 words)

End with the **aftermath** — what happened after the final period concludes? Describe the immediate consequences, the new world that emerged, and the lasting effects. This is not a summary of what you already covered; it is new information about what came next.

- What changed permanently as a result of these events?
- What immediate consequences followed the end of the final period?
- What new problems, institutions, or realities were created?

Do NOT end with generic reflections, lessons learned, or summaries of what you just said. End with concrete historical facts about what happened next.

---

## Forbidden Patterns

NEVER use these:
- "This isn't just X, it's Y" or "These weren't X—they were Y" (dramatic reframing)
- "Imagine yourself..." or "Picture yourself..." (cliché openings)
- Em-dashes (—) anywhere in the text
- Fabricated reactions, emotions, or perspectives from historical figures
- "What happened next will shock you" or similar clickbait
- Rhetorical questions when a direct statement works better
- Listing the periods as bullet points—they must flow as continuous narrative

---

## Output Format

Return your response as JSON:

{
  "narrative": "<p>Your ~1000-word narrative here, with HTML paragraph tags. Bold the period titles using <strong> tags.</p>",
  "keyConcepts": [
    "Key takeaway about period 1",
    "Key takeaway about period 2",
    "Key takeaway about period 3",
    "Key takeaway about period 4",
    "Key takeaway about period 5"
  ],
  "questions": [
    {
      "question": "Question about the precursor history or aftermath",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about period 1",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about period 2",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about period 3",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about period 4",
      "answer": "Clear, specific answer"
    },
    {
      "question": "Simple 'what' or 'roughly when' question about period 5",
      "answer": "Clear, specific answer"
    }
  ],
  "estimatedReadTime": 5
}

---

## Knowledge Check Questions

The 5 questions test whether readers absorbed the key information from each period. Their purpose is reinforcement—helping users commit essential facts to memory.

### Guidelines:

- **One question per period, plus one about the precursor history or aftermath**: 6 questions total
- **Questions must test the reader's knowledge of the chronological periods and their key events/dates.** Do NOT ask about analytical concepts or thematic ideas from the A-breadth perspective.
- **Complexity Level 1 only**: Simple factual recall ("what happened" or "roughly when did X happen")
- **Single-focus**: Never ask two things in one question
- **Answerable from the narrative**: Every answer must be clearly stated in your text
- **Not circular**: Do not embed the answer in the question
- **Focus on turning points**: Test knowledge about key developments or transitions within each period

These questions will appear after the narrative as a brief quiz before users proceed.
