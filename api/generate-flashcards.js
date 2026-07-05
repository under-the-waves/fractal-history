import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { query } from '../lib/db.js';
import { getLearnContent } from '../lib/learnContent.js';

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
    A: `  The FIRST card for each sub-topic MUST be its HEADLINE card: the single most essential, canonical fact a knowledgeable person names first about this sub-topic ("if you know this, you understand the sub-topic") -- never trivia. Prefer the CONCEPT, mechanism, named thing, or why it mattered. Do NOT use a date or a raw number as the answer -- chronology and figures belong to the temporal breadth. Its ANSWER must be a SHORT noun phrase (1-5 words) naming that specific thing; it must NOT restate the sub-topic's own title, and the QUESTION must not contain or give away its own answer.`,
    B: `  The FIRST card for each sub-topic MUST be its HEADLINE card, and for temporal cards it anchors the sub-topic on the timeline: ask roughly WHEN the sub-topic's single defining event or development happened, or what FIRST marked it. Prefer a TIME as the answer -- a rough date, century, era, or "X ago" magnitude (e.g. "14th century", "about 3 billion years ago"); an ordering ("X, then Y") is also fine. The answer must NOT be a static concept or definition, and must NOT merely restate the sub-topic's own dates or label from its title. Keep the answer short. Never make the headline trivia.`,
    C: `  The FIRST card for each sub-topic MUST be its HEADLINE card: the single most canonical fact about this region's role that a knowledgeable person would name first, as stated in the narrative. The answer must NOT merely restate the region's own name (e.g. for a region called "Eurasia", the answer may not be "Eurasia") -- name a place, people, or feature WITHIN it. A number or range may be the answer only when the magnitude itself is the defining point; do not default to the largest statistic when a defining event, place, or person is the more canonical fact. Never make the headline trivia.`
};

const breadthGuidanceFor = (breadth) => ({
    A: "These are ANALYTICAL (concept) cards. Test understanding of the key ideas and WHY they mattered. Do NOT ask about specific dates, years, or chronological order -- that is the temporal breadth's job.",
    B: "These are TEMPORAL cards -- they build the learner's mental timeline, so EVERY card must test WHEN something happened or IN WHAT ORDER, never what it was or why it mattered (that is the analytical breadth's job). Ask: roughly when did X happen (a rough date, century, era, or 'X ago' magnitude); how long did X last; which came first, X or Y; or what did X lead to / what came next. The answer is usually a time, but for ordering and succession cards an event is a fine answer -- the card still exercises the timeline. Aim for rough placement and sequence, NOT exact-date drilling. Do not write cards whose point is a static concept, mechanism, or definition.",
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
    // What the non-sub-topic ("general") cards should draw on. For temporal cards these must stay on
    // the timeline too, otherwise they drift back to framing/concept answers.
    const generalFocus = breadth === 'B'
        ? "the big-picture chronology -- the overall sequence across the whole topic, its earliest, latest, and longest-spanning developments, and how the periods order relative to one another (these are still TEMPORAL cards: test when or in what order, not framing or thematic significance)"
        : "the opening hook, framing, connections between sub-topics, and overall significance";

    const subtopicInstruction = numSubtopics > 0
        ? `Create a candidate pool the learner will choose from:
- For EACH of the ${numSubtopics} sub-topics above, write exactly ${perSubtopic} cards, each testing a different aspect of that sub-topic. Tag each with "group": "sub:<exact sub-topic title>".
${headlineRule}
  Tag ONLY the headline card with "headline": true; the other ${perSubtopic - 1} cards must NOT carry that tag and should test genuinely different aspects.
- Then write ${generalCount} more cards drawn from the rest of the narrative -- ${generalFocus} -- that are not tied to any single sub-topic. Do NOT repeat a fact already tested by a sub-topic card. Tag each of these with "group": "general", and list them with the single most essential, canonical one FIRST (it may be chosen as a core card).
Aim for roughly ${totalTarget} cards total.`
        : `Create a candidate pool of about ${generalCount} cards drawn from across the whole narrative -- ${generalFocus}. Tag each with "group": "general", and list them with the most essential, canonical ones FIRST (the first cards may be chosen as core cards).`;

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
- ATOMIC: each card tests exactly ONE fact. Never join two facts with "and", "where", or a comma. NEVER answer with a list: if the natural answer is several items (e.g. "crafts, trade, writing, social hierarchies"), the question is too broad -- ask about ONE of them, or ask for the single category or count instead.
- MINIMAL ANSWER: the answer is the single shortest unique thing the question asks for -- a name, term, place, or number. Usually 1-5 words; never a full descriptive sentence (hard cap ~10 words). This applies to headline cards too.
- NO SELF-ANSWERING: the answer's key word(s) must NOT appear in the question in any form, including word stems. If the question says "self-replicating molecules", the answer may NOT be "self-replication" or "the ability to copy themselves" -- the reader would read it straight off the question. Either test a different fact about that thing (when it arose, what it led to) or reword the question so it never names the answer.
- NO TRICK OR MULTIPLE-CHOICE CARDS: never write "which of the following ..." or list the options inside the question, and never use answers like "all of them", "both", "none", or "all of the above". Every card is one open question with one specific thing to recall.
- QUESTION TYPE MATCHES ANSWER: the question word must fit the answer's type -- ask "when" or "what year" ONLY when the answer is a date or time; "who" only for a person; "where" only for a place; use "what/which ... is called/named" when the answer is a term or name. Never ask "when did X happen?" and then answer with a term.
- CORRECT ORIENTATION: put the descriptive context in the QUESTION; put the hard-to-recall item in the ANSWER.
  BAD  -> Q: "What did Churchill do in 1946?"  A: "A speech in Fulton, Missouri, where he said an 'iron curtain' had descended across Europe."
  GOOD -> Q: "In which US town did Churchill give his 'iron curtain' speech?"  A: "Fulton, Missouri"
  GOOD -> Q: "What phrase did Churchill use for the divide across Europe?"  A: "The Iron Curtain"
- GROUNDED IN THE TEXT: both the question and the answer must be supported only by the narrative text above. Use no outside knowledge. If a fact is not stated in the narrative, do not write a card about it -- the reader has read exactly this text and nothing more, and must never be asked about something it does not contain.
- Plain wording. Never use the construction "not X; it was Y" or "not just X, it's Y".
- VARIED & GLOBALLY DISTINCT: every card in this whole set -- across ALL sub-topics AND the general cards -- must test a DIFFERENT fact. No two cards may share the same or a near-identical answer, or be rewordings of one another. You are writing them all in one pass, so before you finish, re-read your full list and replace any card that duplicates another.

REVERSIBLE CARDS: a card is reversible only when it links TWO short, specific things that each uniquely identify the other, so either can be the prompt and the other the short answer (date <-> event, person <-> the one specific deed or place tied to them, term <-> its short gloss). To reverse it you SWAP the two: the forward ANSWER becomes the thing the reverse question asks about, and the reverse answer is the OTHER thing (the key fact from the forward question). The reverse answer MUST be a different string from the forward answer.
  GOOD forward -> Q: "How long ago did the Big Bang occur?"  A: "13.8 billion years"
  GOOD reverse -> Q: "What happened about 13.8 billion years ago?"  A: "The Big Bang"   (answer changed: "13.8 billion years" -> "The Big Bang")

FORBIDDEN -- the same card asked twice, with the answer unchanged. This is NOT a reverse:
  Q: "Against which power did Rome fight the Punic Wars?"  A: "Carthage"
  Q: "What empire based in Tunisia fought Rome in the Punic Wars?"  A: "Carthage"   (WRONG: answer is still "Carthage")
If the only way to flip a card keeps the same answer, the card is NOT reversible -- omit "reverse".

Self-check before adding a reverse: (1) is reverse.answer a genuinely different string from the forward answer? (2) is the forward answer now the subject the reverse question asks about? (3) does the reverse question word match the reverse answer's type -- e.g. forward "What does the Cambrian Explosion refer to? -> the first animals" reverses to "What is the first appearance of animals in the fossil record called? -> the Cambrian Explosion", NOT "When did animals appear? -> the Cambrian Explosion"? If any fails, omit "reverse".

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

    // Content-word tokens (>=4 chars, de-stopworded, lightly stemmed) for the similarity checks below.
    const STOP = new Set('the a an and or of to in on was were is are be been being that this with for its it as by at from no not there here made which what who whom when where why how did do does than then into their they them these those during after before about over under out up down own same so such only very can will would could'.split(' '));
    const stem = w => w.replace(/(ments?|tions?|ing|edly|ed|es|s)$/, '');
    const tokenize = s => new Set(
        String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
            .filter(w => w.length >= 4 && !STOP.has(w)).map(stem)
    );
    const jaccard = (a, b) => {
        if (!a.size || !b.size) return 0;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        return inter / (a.size + b.size - inter);
    };

    // Reject bad cards outright: trick / multiple-choice answers ("all of them"), and self-answering
    // cards where every content word of the answer already appears in the question (so the reader
    // could read it straight off). These are belt-and-braces behind the prompt rules.
    const TRICK = /^(all|both|none|either|neither)\b|\b(all|both|none) of (them|these|the above)\b/i;
    const selfAnswering = (q, a) => {
        const at = tokenize(a);
        if (!at.size) return false;
        const qt = tokenize(q);
        for (const w of at) if (!qt.has(w)) return false;
        return true;
    };

    const cards = rawQuestions
        .filter(q => q && q.question && q.answer)
        .filter(q => !TRICK.test(String(q.answer).trim()) && !selfAnswering(q.question, q.answer))
        .map(q => {
            const card = {
                group: typeof q.group === 'string' && q.group ? q.group : 'general',
                headline: !!q.headline,
                question: q.question,
                answer: q.answer
            };
            if (q.reverse && q.reverse.question && q.reverse.answer
                && !isSameAnswer(q.reverse.answer, q.answer)
                && !TRICK.test(String(q.reverse.answer).trim())
                && !selfAnswering(q.reverse.question, q.reverse.answer)) {
                card.reverse = { question: q.reverse.question, answer: q.reverse.answer };
            }
            return card;
        });

    // Drop near-duplicate cards (paraphrases that exact-string matching misses): compare content-word
    // overlap on answers and questions; when a pair collides, keep the headline card.
    const kept = [];
    for (const c of cards) {
        const tA = tokenize(c.answer), tQ = tokenize(c.question);
        const dup = kept.find(k => jaccard(tA, k._tA) >= 0.55 || jaccard(tQ, k._tQ) >= 0.7);
        if (!dup) {
            kept.push(Object.assign({}, c, { _tA: tA, _tQ: tQ }));
        } else if (c.headline && !dup.headline) {
            Object.assign(dup, c, { _tA: tA, _tQ: tQ }); // prefer the headline of a duplicate pair
        }
    }
    return kept.map(({ _tA, _tQ, ...c }) => c);
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

    // 1b. TITLE-ECHO GUARD. When the pool is sourced from the fact cards' headline + what-happened
    // bullets only, a sub-topic named after a process/event (e.g. "Great Oxidation Event") tends to
    // get a headline whose answer just restates that name — a circular core. Replace any sub-anchor
    // core whose normalised answer echoes its own sub-anchor title with a non-echoing card from the
    // same group. Runs BEFORE the trim/fill steps so the alternatives are still unused. (Validated in
    // the flashcards-from-cards prototype.)
    const normEcho = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const echoes = (title, answer) => {
        const nt = normEcho(title), na = normEcho(answer);
        if (!nt || !na) return false;
        return nt.includes(na) || na.includes(nt);
    };
    for (let k = 0; k < coreIdx.length; k++) {
        const q = questions[coreIdx[k]];
        if (!q.group || !q.group.startsWith('sub:')) continue;
        const title = q.group.replace(/^sub:/, '');
        if (!echoes(title, q.answer)) continue;
        const repl = questions.findIndex((c, i) =>
            !used.has(i) && c.group === q.group && !echoes(title, c.answer));
        if (repl !== -1) { used.delete(coreIdx[k]); used.add(repl); coreIdx[k] = repl; }
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

// Build a flashcard SOURCE digest from the fact cards: each sub-anchor's headline, what-happened and
// why-it-happened bullets (so cards can test causes as well as events). The how-we-know, debates and
// vignette layers are excluded. The prelude is included as background so "general" cards have
// material; cores are still drawn per sub-anchor.
function buildCardsDigest(content) {
    const block = (facts) => (facts || []).map(f => {
        const lines = [];
        if (f.headline) lines.push(f.headline);
        (f.what || []).forEach(w => lines.push(w));
        (f.why || []).forEach(w => lines.push(w));
        return lines.map(l => `- ${l}`).join('\n');
    }).filter(Boolean).join('\n');

    const parts = [];
    if (content.prelude) parts.push(`## Background: ${content.prelude.title}\n${block(content.prelude.facts)}`);
    (content.subAnchors || []).forEach(sa => { parts.push(`## ${sa.title}\n${block(sa.facts)}`); });
    return `${content.title}\n\n${parts.join('\n\n')}`;
}

/**
 * Generate the candidate flashcard pool, mark its 5 cores, store it on the narratives row, and return
 * the questions. SOURCE is the Learn fact cards (headline + what-happened) when they exist — so cards
 * exist for write-your-own users who never read the narrative and test the verified facts — falling
 * back to the narrative text otherwise. Throws 'NARRATIVE_NOT_FOUND' when neither source exists.
 * Reused by the handler and by per-user core instantiation (instantiate-cores.js).
 */
export async function generateAndStoreFlashcards(anchorId, breadth) {
    const content = await getLearnContent(anchorId, breadth);

    let anchorTitle, children, sourceText;
    const fromCards = !!(content && content.subAnchors && content.subAnchors.length);
    if (fromCards) {
        anchorTitle = content.title;
        children = content.subAnchors.map(sa => ({ title: sa.title }));
        sourceText = buildCardsDigest(content);
    } else {
        const rows = await query(
            'SELECT narrative FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
            [anchorId, breadth]
        );
        if (!rows.length || !rows[0].narrative) {
            throw new Error('NARRATIVE_NOT_FOUND');
        }
        sourceText = rows[0].narrative;
        const [anchorResult, dbChildren] = await Promise.all([
            query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]),
            query(
                `SELECT a.title FROM anchors a
                 JOIN tree_positions tp ON a.id = tp.anchor_id
                 WHERE tp.parent_position_id IN (
                     SELECT position_id FROM tree_positions WHERE anchor_id = $1
                 )
                 AND tp.breadth = $2
                 ORDER BY tp.position ASC`,
                [anchorId, breadth]
            )
        ]);
        anchorTitle = anchorResult[0]?.title || anchorId;
        children = dbChildren;
    }

    console.log(`Generating flashcards for ${anchorId} breadth ${breadth} (source: ${fromCards ? 'fact cards' : 'narrative'})`);

    const prompt = buildFlashcardPrompt({ anchorTitle, breadth, children, narrative: sourceText });

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

    // Store the pool on the narratives row (cores/slots/scoring read it there). Create a placeholder
    // row if none exists yet (a write-only anchor with no narrative), preserving any real narrative
    // text on conflict — only the questions column is updated.
    await query(
        `INSERT INTO narratives (anchor_id, breadth, narrative, questions)
         VALUES ($2, $3, '', $1)
         ON CONFLICT (anchor_id, breadth) DO UPDATE SET questions = EXCLUDED.questions`,
        [JSON.stringify(data.questions), anchorId, breadth]
    );

    const coreCount = data.questions.filter(q => q.core).length;
    console.log(`Generated ${data.questions.length} flashcards (${coreCount} cores) for ${anchorId} breadth ${breadth}`);
    return data.questions;
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
        // Return the cached pool unless the caller explicitly asks to regenerate it.
        if (!refresh) {
            const existing = await query(
                'SELECT questions FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
                [anchorId, breadth]
            );
            if (existing.length > 0 && existing[0].questions) {
                const questions = typeof existing[0].questions === 'string'
                    ? JSON.parse(existing[0].questions)
                    : existing[0].questions;
                if (Array.isArray(questions) && questions.length > 0) {
                    return res.status(200).json({ success: true, questions, cached: true });
                }
            }
        }

        const questions = await generateAndStoreFlashcards(anchorId, breadth);
        return res.status(200).json({ success: true, questions, cached: false });

    } catch (error) {
        if (error.message === 'NARRATIVE_NOT_FOUND') {
            return res.status(404).json({ error: 'No source content yet. Generate the topic (study cards) or the narrative first.' });
        }
        console.error('Error generating flashcards:', error);
        return res.status(500).json({
            error: 'Failed to generate flashcards',
            details: error.message
        });
    }
}
