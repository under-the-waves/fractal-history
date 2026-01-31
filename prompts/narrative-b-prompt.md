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

## Opening Hook (First 150-200 words)

Begin with a **discrete anecdote, moment, or discovery** that illuminates your topic.

### Requirements:

- Use a specific, documented event—not a general statement about the topic
- Assume the reader knows nothing. Explain who people are (roles before names), where places are (modern geographic references), when things happened
- Minimize proper names. Use descriptions: "a Roman general" not "Gaius Marius"
- Create mystery or tension that makes the reader want to understand more
- End the hook by stating what it reveals (not with clickbait questions)
- Include ONE piece of primary source evidence maximum if it genuinely illuminates the point

**Then pivot** to the beginning of your chronological narrative—the first period.

### Example of a Strong Opening Hook

**Topic: Agricultural Revolution**

"In 1991, two hikers in the Alps spotted something brown protruding from melting ice. They thought it was trash or a recent mountaineering accident. When archaeologists examined the body, they made an extraordinary discovery: this man had died 5,300 years ago. His possessions told a strange story: a copper axe, arrows with stone points, but also a pouch containing wheat grains and wild berries. His last meal, preserved in his stomach, included both cultivated grain and wild game. Here was a man carrying both the tools of hunters and the crops of farmers, frozen at a moment when humanity was caught between two entirely different ways of living.

This transition had been building for thousands of years. Around 12,000 years ago, as the last Ice Age ended, Earth's climate stabilized in ways that made farming possible..."

**Why this works:**
- Discrete anecdote (the Iceman discovery)
- Minimal names (none needed: just "hikers" and "archaeologists")
- Explains context (Alps, 1991, 5,300 years ago)
- Creates mystery (why both hunter and farmer tools?)
- Points to fundamental transition (between two ways of living)
- Clear pivot to chronological beginning (12,000 years ago)

**Important:** This example demonstrates the technique. Do not copy its structure. Find an equally compelling but different anecdote appropriate to your specific topic.

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

## Closing (100-150 words)

End by reflecting on the full arc of change: what was different at the end compared to the beginning? Point forward to what comes next or offer a final insight about the significance of this transformation.

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

- **One question per period**: Each question corresponds to one of the 5 chronological periods you taught
- **Complexity Level 1 only**: Simple factual recall ("what happened" or "roughly when did X happen")
- **Single-focus**: Never ask two things in one question
- **Answerable from the narrative**: Every answer must be clearly stated in your text
- **Not circular**: Do not embed the answer in the question
- **Focus on turning points**: Test knowledge about key developments or transitions within each period

These questions will appear after the narrative as a brief quiz before users proceed.
