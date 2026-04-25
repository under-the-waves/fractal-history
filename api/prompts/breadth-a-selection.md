# Breadth-A Anchor Candidate Generation

## Task

Generate **exactly 10** candidate analytical anchors for this topic:

**Parent ID:** {{parentId}}
**Parent Title:** {{parentTitle}}
**Parent Scope:** {{parentScope}}

These are A-anchor candidates: the most causally important and impactful aspects. The fractal goes deeper, so don't try to be comprehensive — focus on what matters most.

Resist Western/European-centric defaults. Consider non-Western developments fairly.

---

## Context

**Ancestor path (how we reached this anchor):**

{{ancestorContext}}

**Anti-circularity:** Do NOT suggest anchors matching or essentially duplicating any ancestor above. Go DEEPER into "{{parentTitle}}", not back up to broader concepts.

**Forbidden titles:** {{forbiddenTitles}}

**Existing siblings at this level:**

{{siblingContext}}

{{siblingWarning}}

---

## Rules

1. **No double-barrelled anchors.** Each anchor = one atomic concept. "World War One and Two" is wrong; "World War One" is right.
2. **Titles must be short** — 5 words maximum. Use the simplest standard name for the concept.
3. **Include difficult topics.** Wars, genocides, slavery, colonial violence — if causally significant, include them.
4. **Score honestly.** Causal Significance (1-10): how directly this reshaped subsequent history. Human Impact (1-10): how many people were affected and how severely. Final Score = (Causal x 0.6) + (Impact x 0.4).
5. **Generic titles for broad processes** (e.g. "Urbanization"), **specific titles for bounded events** (e.g. "Siege of Leningrad").

---

## Output

Respond with ONLY valid JSON, no other text:

```json
{
  "candidates": [
    {
      "title": "Short Name",
      "timePeriod": "approximate dates",
      "scope": "2-3 sentences: what it covers, what's included, what's excluded",
      "causalSignificance": 8,
      "causalJustification": "One sentence",
      "humanImpact": 7,
      "humanJustification": "One sentence",
      "finalScore": 7.6
    }
  ]
}
```

**CRITICAL:**
- `candidates` must contain EXACTLY 10 entries
- Output ONLY the JSON object, no markdown, no explanation
