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

    if (!anchorId) {
        return res.status(400).json({ error: 'Anchor ID is required' });
    }

    try {
        // Check if narrative already has questions stored
        const existing = await query(
            'SELECT questions, narrative FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
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

        const breadthLabel = { A: 'analytical', B: 'temporal', C: 'geographic' }[breadth] || 'analytical';

        console.log(`Generating flashcards for ${anchorId} breadth ${breadth}`);

        const completion = await getAnthropicClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            system: 'You are creating flashcard questions for a history education app. Respond with valid JSON only.',
            messages: [{
                role: 'user',
                content: `Generate flashcard questions for this historical narrative.

**Topic:** ${anchor?.title || anchorId}
**Breadth:** ${breadthLabel}
**Sub-topics (${breadthLabel} anchors):**
${childTitles}

**Narrative text:**
${narrative}

Create exactly ${children.length + 1} questions: one about the opening hook/anecdote, plus one per sub-topic.

Rules:
- Simple factual recall only ("What...", "How...", "Why...")
- Each question tests exactly one atomic fact
- Answers must be a single sentence or short phrase (under 20 words)
- Answers must be findable in the narrative text
- No lists in answers; if an answer needs "and", split into two questions

Return JSON:
{
  "questions": [
    { "question": "...", "answer": "..." }
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
