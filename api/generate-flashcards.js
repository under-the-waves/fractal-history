import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { query } from './utils/db.js';

dotenv.config({ path: '.env.local' });

let anthropic = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropic;
}

// Per-breadth rule for the HEADLINE card (the first of each sub-topic's cards). Validated on
// A/B/C narratives (see project knowledge/Scoring_Engine_Design.md and the headline-validation
// memory): the headline is the single most canonical fact for that sub-anchor, and the 5 cores
// are selected from these headlines in code (selectCores), so no second LLM call is needed.
const HEADLINE_RULES = {
    A: `  The FIRST card for each sub-topic MUST be its HEADLINE card: the single most important specific fact within this sub-topic, as stated in the narrative -- a concrete invention, person, event, place, named change, or key term a knowledgeable person would cite first ("if you know this, you understand the sub-topic"). Its ANSWER must be a SHORT noun phrase (1-5 words) naming that specific thing; it must NOT merely restate the sub-topic's own title, and the QUESTION must not give away its own answer.`,
    B: `  The FIRST card for each sub-topic MUST be its HEADLINE card: the single most canonical fact about this period that a knowledgeable person would name first, as stated in the narrative. Prefer the defining event, turning point, person, or change as the answer; a date may be the answer only when the date itself is the milestone to know. Never make the headline trivia.`,
    C: `  The FIRST card for each sub-topic MUST be its HEADLINE card: the single most canonical fact about this region's role that a knowledgeable person would name first, as stated in the narrative. A number or range may be the answer ONLY when the magnitude itself is the defining point; do not default to the largest statistic when a defining event, place, or person is the more canonical fact. Never make the headline trivia.`
};

const breadthGuidanceFor = (breadth) => ({
    A: "These are ANALYTICAL (concept) cards. Test understanding of the key ideas and WHY they mattered. Do NOT ask about specific dates, years, or chronological order -- that is the temporal breadth's job.",
    B: "These are TEMPORAL cards. Test what happened in each period and how things changed over time. Asking roughly when something happened is fine here, but prefer 'what changed' over pure date memorisation.",
    C: "These are GEOGRAPHIC cards. Test regional variation -- what happened in which region, and how different regions differed. Anchor each question to a place."
}[breadth] || "These are ANALYTICAL (concept) cards. Test understanding of the key ideas and why they mattered; avoid date questions.");

/**
 * Build the Anthropic request for the candidate flashcard pool. Pure (no DB / no network), so it
 * can be unit-tested. `children` is an array of { title }.
 */
export function buildFlashcardPrompt({ anchorTitle, breadth, children, narrative }) {
    const childTitles = children.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
    const numSubtopics = children.length;
    const perSubtopic = 3;
    const generalCount = numSubtopics > 0 ? 5 : 8;
    const totalTarget = numSubtopics * perSubtopic + generalCount;
    // Each card may carry a reverse, so budget generously and cap to keep latency sane.
    const maxTokens = Math.min(8000, totalTarget * 220 + 1000);
    const breadthLabel = { A: 'analytical', B: 'temporal', C: 'geographic' }[breadth] || 'analytical';
    const breadthGuidance = breadthGuidanceFor(breadth);
    const headlineRule = HEADLINE_RULES[breadth] || HEADLINE_RULES.A;

    const subtopicInstruction = numSubtopics > 0
        ? `Create a candidate pool the learner will choose from:
- For EACH of the ${numSubtopics} sub-topics above, write exactly ${perSubtopic} cards, each testing a different aspect of that sub-topic. Tag each with "group": "sub:<exact sub-topic title>".
${headlineRule}
  Tag ONLY the headline card with "headline": true; the other ${perSubtopic - 1} cards must NOT carry that tag and should test genuinely different aspects.
- Then write ${generalCount} more cards drawn from the rest of the narrative -- the opening hook, framing, connections between sub-topics, and overall significance -- that are not tied to any single sub-topic. Tag each of these with "group": "general", and list them with the single most essential, canonical one FIRST (it may be chosen as a core card).
Aim for roughly ${totalTarget} cards total.`
        : `Create a candidate pool of about ${generalCount} cards drawn from across the whole narrative -- the opening hook, the key facts, and the overall significance. Tag each with "group": "general", and list them with the most essential, canonical ones FIRST (the first cards may be chosen as core cards).`;

    const content = `Generate a pool of candidate flashcard questions for this historical narrative. The learner will pick the ones they want to study, so offer varied angles rather than a single question per topic.

**Topic:** ${anchorTitle}
**Breadth:** ${breadthLabel}
**Sub-topics (${breadthLabel} anchors):**
${childTitles}

**Narrative text:**
${narrative}

${breadthGuidance}

${subtopicInstruction}

Follow these flashcard learning principles strictly:
- ATOMIC: each card tests exactly ONE fact. Never join two facts with "and", "where", or a comma.
- MINIMAL ANSWER: the answer is the single shortest unique thing the question asks for -- a name, term, place, or number. Usually 1-5 words; never a full descriptive sentence (hard cap ~10 words). This applies to headline cards too.
- CORRECT ORIENTATION: put the descriptive context in the QUESTION; put the hard-to-recall item in the ANSWER.
  BAD  -> Q: "What did Churchill do in 1946?"  A: "A speech in Fulton, Missouri, where he said an 'iron curtain' had descended across Europe."
  GOOD -> Q: "In which US town did Churchill give his 'iron curtain' speech?"  A: "Fulton, Missouri"
  GOOD -> Q: "What phrase did Churchill use for the divide across Europe?"  A: "The Iron Curtain"
- GROUNDED IN THE TEXT: both the question and the answer must be supported only by the narrative text above. Use no outside knowledge. If a fact is not stated in the narrative, do not write a card about it -- the reader has read exactly this text and nothing more, and must never be asked about something it does not contain.
- Plain wording. Never use the construction "not X; it was Y" or "not just X, it's Y".
- VARIED: within a sub-topic's ${perSubtopic} cards, target genuinely different facts, not reworded versions of the same one.

REVERSIBLE CARDS: a card is reversible only when it links TWO short, specific things that each uniquely identify the other, so either can be the prompt and the other the short answer (date <-> event, person <-> the one specific deed or place tied to them, term <-> its short gloss). To reverse it you SWAP the two: the forward ANSWER becomes the thing the reverse question asks about, and the reverse answer is the OTHER thing (the key fact from the forward question). The reverse answer MUST be a different string from the forward answer.
  GOOD forward -> Q: "How long ago did the Big Bang occur?"  A: "13.8 billion years"
  GOOD reverse -> Q: "What happened about 13.8 billion years ago?"  A: "The Big Bang"   (answer changed: "13.8 billion years" -> "The Big Bang")

FORBIDDEN -- the same card asked twice, with the answer unchanged. This is NOT a reverse:
  Q: "Against which power did Rome fight the Punic Wars?"  A: "Carthage"
  Q: "What empire based in Tunisia fought Rome in the Punic Wars?"  A: "Carthage"   (WRONG: answer is still "Carthage")
If the only way to flip a card keeps the same answer, the card is NOT reversible -- omit "reverse".

Self-check before adding a reverse: (1) is reverse.answer a genuinely different string from the forward answer? (2) is the forward answer now the subject the reverse question asks about? If either fails, omit "reverse".

Omit "reverse" entirely for conceptual "why/how did it matter" cards, for cards whose other half is a long descriptive phrase rather than a short answer, and for any flip that would be ambiguous or have many valid answers.

Return JSON. Mark each sub-topic's headline with "headline": true; include "reverse" only where it genuinely applies:
{
  "questions": [
    { "group": "sub:Exact Sub-topic Title", "headline": true, "question": "...", "answer": "...", "reverse": { "question": "...", "answer": "..." } },
    { "group": "sub:Exact Sub-topic Title", "question": "...", "answer": "..." },
    { "group": "general", "question": "...", "answer": "..." }
  ]
}`;

    return {
        model: 'claude-haiku-4-5-20251001',
        maxTokens,
        system: 'You are creating flashcard questions for a history education app. Respond with valid JSON only.',
        content
    };
}

/**
 * Clean the raw LLM questions: drop malformed cards, ensure a group, preserve the headline flag,
 * and drop fake reverses (a "reverse" whose answer matches the forward answer). Pure.
 */
export function normaliseQuestions(rawQuestions) {
    const normAnswer = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const isSameAnswer = (a, b) => {
        const x = normAnswer(a), y = normAnswer(b);
        if (!x || !y) return false;
        if (x === y) return true;
        const [short, long] = x.length <= y.length ? [x, y] : [y, x];
        return short.length >= 3 && long.includes(short);
    };

    return rawQuestions
        .filter(q => q && q.question && q.answer)
        .map(q => {
            const card = {
                group: typeof q.group === 'string' && q.group ? q.group : 'general',
                headline: !!q.headline,
                question: q.question,
                answer: q.answer
            };
            if (q.reverse && q.reverse.question && q.reverse.answer
                && !isSameAnswer(q.reverse.answer, q.answer)) {
                card.reverse = { question: q.reverse.question, answer: q.reverse.answer };
            }
            return card;
        });
}

/**
 * Pick the 5 frozen CORE cards and tag each question with `core: true|false` (mutates and returns
 * `questions`). Rule: one headline per sub-anchor (prefer the LLM-tagged headline, else the first
 * card in that group); if there are more than 5 sub-anchors, drop catch-all/leftover regions first;
 * if there are fewer than 5, fill from the general pool, then from anything left. Code-only, so the
 * separate core-selection LLM call is unnecessary. `childTitles` is an array of exact sub-anchor titles.
 */
export function selectCores(questions, childTitles) {
    const coreIdx = [];
    const used = new Set();
    const pick = (predicate) => {
        const i = questions.findIndex((q, idx) => !used.has(idx) && predicate(q));
        if (i !== -1) { used.add(i); coreIdx.push(i); }
        return i;
    };

    // 1. one headline per sub-anchor
    for (const title of childTitles) {
        const g = `sub:${title}`;
        if (pick(q => q.group === g && q.headline) === -1) {
            pick(q => q.group === g);
        }
    }

    // 2. too many sub-anchors -> drop catch-all / "rest of the world" ones first, keep 5
    if (coreIdx.length > 5) {
        const isCatchAll = t => /rest of (the )?world|elsewhere|other regions|the rest|remaining|catch-all/i.test(t);
        coreIdx.sort((a, b) => {
            const ta = questions[a].group.replace(/^sub:/, '');
            const tb = questions[b].group.replace(/^sub:/, '');
            return (isCatchAll(ta) ? 1 : 0) - (isCatchAll(tb) ? 1 : 0);
        });
        for (const i of coreIdx.slice(5)) used.delete(i);
        coreIdx.length = 5;
    }

    // 3. fill to 5 from general, then from anything remaining
    while (coreIdx.length < 5 && pick(q => q.group === 'general') !== -1) { /* noop */ }
    while (coreIdx.length < 5 && pick(() => true) !== -1) { /* noop */ }

    const coreSet = new Set(coreIdx);
    questions.forEach((q, i) => { q.core = coreSet.has(i); });
    return questions;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const anchorId = req.query.id;
    const breadth = req.query.breadth || 'A';
    const refresh = req.query.refresh === '1';

    if (!anchorId) {
        return res.status(400).json({ error: 'Anchor ID is required' });
    }

    try {
        // Check if narrative already has questions stored
        const existing = await query(
            'SELECT questions, narrative FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
            [anchorId, breadth]
        );

        // Skip the cache when the caller explicitly asks to regenerate the pool.
        if (!refresh && existing.length > 0 && existing[0].questions) {
            const questions = typeof existing[0].questions === 'string'
                ? JSON.parse(existing[0].questions)
                : existing[0].questions;
            if (Array.isArray(questions) && questions.length > 0) {
                return res.status(200).json({ success: true, questions, cached: true });
            }
        }

        const narrativeRow = existing.length > 0 ? existing[0] : null;
        if (!narrativeRow || !narrativeRow.narrative) {
            return res.status(404).json({ error: 'Narrative not found. Generate the narrative first.' });
        }

        const narrative = narrativeRow.narrative;

        // Get anchor and child info in parallel
        const [anchorResult, children] = await Promise.all([
            query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]),
            query(
                `SELECT a.title FROM anchors a
                 JOIN tree_positions tp ON a.id = tp.anchor_id
                 WHERE tp.parent_position_id = (
                     SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1
                 )
                 AND tp.breadth = $2
                 ORDER BY tp.position ASC`,
                [anchorId, breadth]
            )
        ]);
        const anchor = anchorResult[0];

        console.log(`Generating flashcards for ${anchorId} breadth ${breadth}`);

        const prompt = buildFlashcardPrompt({
            anchorTitle: anchor?.title || anchorId,
            breadth,
            children,
            narrative
        });

        const completion = await getAnthropicClient().messages.create({
            model: prompt.model,
            max_tokens: prompt.maxTokens,
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.content }]
        });

        const text = completion.content[0].text.trim()
            .replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const data = JSON.parse(text);

        if (!Array.isArray(data.questions)) {
            throw new Error('Response missing questions array');
        }

        data.questions = normaliseQuestions(data.questions);
        selectCores(data.questions, children.map(c => c.title));

        // Store back into the narratives table
        await query(
            'UPDATE narratives SET questions = $1 WHERE anchor_id = $2 AND breadth = $3',
            [JSON.stringify(data.questions), anchorId, breadth]
        );

        const coreCount = data.questions.filter(q => q.core).length;
        console.log(`Generated ${data.questions.length} flashcards (${coreCount} cores) for ${anchorId} breadth ${breadth}`);

        return res.status(200).json({ success: true, questions: data.questions, cached: false });

    } catch (error) {
        console.error('Error generating flashcards:', error);
        return res.status(500).json({
            error: 'Failed to generate flashcards',
            details: error.message
        });
    }
}
