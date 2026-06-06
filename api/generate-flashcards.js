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

        const childTitles = children.map((c, i) => `${i + 1}. ${c.title}`).join('\n');

        // Candidate pool: 3 cards per sub-topic plus 5 from the connective/overview
        // material ("the rest of the text"). With no sub-topics, lean on 8 general cards.
        const numSubtopics = children.length;
        const perSubtopic = 3;
        const generalCount = numSubtopics > 0 ? 5 : 8;
        const totalTarget = numSubtopics * perSubtopic + generalCount;
        // Each card may carry a reverse, so budget generously and cap to keep latency sane.
        const maxTokens = Math.min(8000, totalTarget * 220 + 1000);

        const breadthLabel = { A: 'analytical', B: 'temporal', C: 'geographic' }[breadth] || 'analytical';

        const breadthGuidance = {
            A: "These are ANALYTICAL (concept) cards. Test understanding of the key ideas and WHY they mattered. Do NOT ask about specific dates, years, or chronological order -- that is the temporal breadth's job.",
            B: "These are TEMPORAL cards. Test what happened in each period and how things changed over time. Asking roughly when something happened is fine here, but prefer 'what changed' over pure date memorisation.",
            C: "These are GEOGRAPHIC cards. Test regional variation -- what happened in which region, and how different regions differed. Anchor each question to a place."
        }[breadth] || "These are ANALYTICAL (concept) cards. Test understanding of the key ideas and why they mattered; avoid date questions.";

        console.log(`Generating flashcards for ${anchorId} breadth ${breadth}`);

        const subtopicInstruction = numSubtopics > 0
            ? `Create a candidate pool the learner will choose from:
- For EACH of the ${numSubtopics} sub-topics above, write exactly ${perSubtopic} cards, each testing a different aspect of that sub-topic. Tag each with "group": "sub:<exact sub-topic title>".
- Then write ${generalCount} more cards drawn from the rest of the narrative -- the opening hook, framing, connections between sub-topics, and overall significance -- that are not tied to any single sub-topic. Tag each of these with "group": "general".
Aim for roughly ${totalTarget} cards total.`
            : `Create a candidate pool of about ${generalCount} cards drawn from across the whole narrative -- the opening hook, the key facts, and the overall significance. Tag each with "group": "general".`;

        const completion = await getAnthropicClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: maxTokens,
            system: 'You are creating flashcard questions for a history education app. Respond with valid JSON only.',
            messages: [{
                role: 'user',
                content: `Generate a pool of candidate flashcard questions for this historical narrative. The learner will pick the ones they want to study, so offer varied angles rather than a single question per topic.

**Topic:** ${anchor?.title || anchorId}
**Breadth:** ${breadthLabel}
**Sub-topics (${breadthLabel} anchors):**
${childTitles}

**Narrative text:**
${narrative}

${breadthGuidance}

${subtopicInstruction}

Follow these flashcard learning principles strictly:
- ATOMIC: each card tests exactly ONE fact. Never join two facts with "and", "where", or a comma.
- MINIMAL ANSWER: the answer is the single shortest unique thing the question asks for -- a name, term, place, or number. Usually 1-5 words; never a full descriptive sentence (hard cap ~10 words).
- CORRECT ORIENTATION: put the descriptive context in the QUESTION; put the hard-to-recall item in the ANSWER.
  BAD  -> Q: "What did Churchill do in 1946?"  A: "A speech in Fulton, Missouri, where he said an 'iron curtain' had descended across Europe."
  GOOD -> Q: "In which US town did Churchill give his 'iron curtain' speech?"  A: "Fulton, Missouri"
  GOOD -> Q: "What phrase did Churchill use for the divide across Europe?"  A: "The Iron Curtain"
- The answer must be findable in, or directly derivable from, the narrative text.
- Plain wording. Never use the construction "not X; it was Y" or "not just X, it's Y".
- VARIED: within a sub-topic's ${perSubtopic} cards, target genuinely different facts, not reworded versions of the same one.

REVERSIBLE CARDS: a card is reversible only when its answer is a specific, unique thing that could itself serve as a prompt (a named entity, place, date, or number) AND the question would still have a single clear answer when flipped. For such cards, add a "reverse" object with a naturally reworded question and answer -- never a mechanical swap.
  Example forward -> Q: "How long ago did the Big Bang occur?"  A: "13.8 billion years"
  Example reverse -> Q: "What happened about 13.8 billion years ago?"  A: "The Big Bang"
Omit "reverse" entirely for conceptual "why/how did it matter" cards and any card whose flip would be ambiguous or have many valid answers.

Return JSON. Include "reverse" only where it genuinely applies:
{
  "questions": [
    { "group": "sub:Exact Sub-topic Title", "question": "...", "answer": "...", "reverse": { "question": "...", "answer": "..." } },
    { "group": "general", "question": "...", "answer": "..." }
  ]
}`
            }],
        });

        const text = completion.content[0].text.trim()
            .replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const data = JSON.parse(text);

        if (!Array.isArray(data.questions)) {
            throw new Error('Response missing questions array');
        }

        // Normalise: ensure every card has a group, and drop malformed reverse objects.
        data.questions = data.questions
            .filter(q => q && q.question && q.answer)
            .map(q => {
                const card = {
                    group: typeof q.group === 'string' && q.group ? q.group : 'general',
                    question: q.question,
                    answer: q.answer
                };
                if (q.reverse && q.reverse.question && q.reverse.answer) {
                    card.reverse = { question: q.reverse.question, answer: q.reverse.answer };
                }
                return card;
            });

        // Store back into the narratives table
        await query(
            'UPDATE narratives SET questions = $1 WHERE anchor_id = $2 AND breadth = $3',
            [JSON.stringify(data.questions), anchorId, breadth]
        );

        console.log(`Generated ${data.questions.length} flashcards for ${anchorId} breadth ${breadth}`);

        return res.status(200).json({ success: true, questions: data.questions, cached: false });

    } catch (error) {
        console.error('Error generating flashcards:', error);
        return res.status(500).json({
            error: 'Failed to generate flashcards',
            details: error.message
        });
    }
}
