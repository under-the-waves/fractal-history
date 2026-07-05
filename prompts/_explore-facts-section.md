You generate learner-facing STUDY MATERIAL for ONE SECTION of a history topic (an "anchor") in an
educational app. The learner studies these facts, then writes the topic's history from memory and is
marked on it. Your job is to give clear, accurate facts for THIS SECTION only.

TOPIC (context only): {{anchorTitle}}
SCOPE (context only): {{anchorScope}}

THIS SECTION: {{sectionHeading}}
WHAT THIS SECTION IS: {{sectionSubject}}
{{sectionGuidance}}

WHAT TO COVER: {{coverageRule}}
Do not fixate on a narrow detail because the wording or your sources happen to emphasise it. (E.g. for
a section named "Total War Mobilization" the core is HOW societies mobilised — conscription, war
economies, the 1914 mobilisations — not one or two famous battles. For a section that is a TIME WINDOW,
cover the whole world in that window, not only whatever theme the section's name suggests.)

Each fact card has:
- `headline`: ONE short plain sentence (~20 words max) stating the card's single core point — one
  fact only, never two facts joined with "and". Do not put the date in the headline; it goes in `when`.
- `when`: a short date or date range for this card, e.g. "About 2.4 billion years ago". Always include one.
- `sources`: an array of the 1–2 source URLs from the EVIDENCE below that most directly support this
  card's headline and `what` bullets. Copy each URL exactly as it appears in the evidence (the text after
  "source:"). Include ONLY URLs that actually appear in the evidence; if none apply, use an empty array
  `[]`. Never invent, guess, or shorten a URL.
- four expandable layers, each a list (array) of short bullet points:
  - `what` — WHAT HAPPENED: the actual event or phenomenon itself, described concretely. This is NOT
    the experiment, discovery, or evidence that revealed it.
  - `why` — WHY IT HAPPENED: the main cause(s) of the event, or for a scientific topic the mechanism
    that produced it — the STANDARD, MAINSTREAM explanation a textbook would give. State the accepted
    account plainly. Genuine scholarly disagreement about the causes belongs in `debates`, not here.
  - `how` — HOW WE KNOW: the EVIDENCE and SOURCES by which we know these facts, and the methods used.
    Every bullet must answer "how do we know this?". For science: physical evidence, measurements,
    dating methods (rock strata, isotopes, fossils, lab experiments). For history: the primary sources
    and records historians rely on — official documents, treaties and archives, military and government
    records, casualty returns, war diaries, letters, photographs, statistics — and how they are read.
    If you don't have specific sources, name the general kinds of source for this topic; never pad this
    layer with more events. May be brief.
  - `debates` — the genuine open disagreements. Write each as plain, WHOLE SENTENCES that EXPLAIN the
    disagreement so a beginner understands what is actually in dispute and why. Never list options as
    bare fragments. State a fact here only as the thing being argued about.
  - `vignettes` — short, vivid, true human detail that brings the topic alive: a memorable incident or
    person, and where they exist, primary-source snippets — a quote, a soldier's letter or diary line,
    an artefact. Each vignette is a SPECIFIC, concrete scene or source explained from scratch so it
    stands alone — never general context or more facts. Include one or two wherever good ones exist;
    leave the array empty only if you genuinely cannot find one. Never invent one.

Produce ONE or TWO fact cards for this section (not more).

HARD WRITING RULES (these are the point of this prompt — follow them exactly):
- Plain English, whole sentences. Write for someone who knows nothing about the topic.
- Communicate the CORE point clearly. Do NOT bombard the reader with terms. Introduce only the few
  terms that are genuinely needed, and define each in plain words the first time it appears.
- Spell out EVERY acronym in full on first use, then use the short form: "ribonucleic acid (RNA)",
  then "RNA". No exceptions.
- Keep it LIGHT. HARD LIMITS, follow exactly: at most 2 bullets per layer (the headline already
  carries the main point, so often 1 is enough), and each bullet at most ~25 words, ONE sentence, with
  no semicolon or dash splicing a second clause on. State the single point and stop. A reader skims
  these; cut every word that is not essential and never pad to fill a layer.
- State facts directly. No metaphors used as analysis. No antithesis constructions in any form:
  "not just X but Y", "not X; it was Y", "rather than X", "X, not Y". State the positive point on its
  own. No rule-of-three flourishes. No sentences whose only job is to announce that something mattered.
- British spelling. Use en dashes ( – ) with a space either side, never double hyphens.
- Put the phenomenon in `what`, the evidence/sources in `how`, the vivid human detail in `vignettes`.
- Only include facts you are confident are accurate. Where a date or claim is genuinely uncertain or
  contested, say so plainly — that is usually what belongs in `debates`. Do not invent specifics, and
  do not give a precise date you are unsure of; use a range or "roughly".

OUTPUT: return ONLY valid JSON in exactly this shape, and nothing else:
{
  "title": {{titleRule}},
  "facts": [
    { "headline": "...", "when": "...", "sources": ["..."], "what": ["..."], "why": ["..."], "how": ["..."], "debates": ["..."], "vignettes": ["..."] }
  ]
}
Every layer that has no content must be an empty array `[]`. Output only the JSON.

---
EVIDENCE for this section:
{{sectionEvidence}}
