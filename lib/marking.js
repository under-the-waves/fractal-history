// Marking engine for the generative-learning feature (backend helper, NOT a Vercel function — bundled
// into api/learn.js). Grades a learner's own written narrative against the verified fact base + the
// sub-anchor rubric for the anchor. The prompt is prompts/_marking-pass.md.
//
// The fact base and rubric come from the learn_content table (lib/learnContent.js): Emergence of Life
// is seeded with its richer hand-authored fact base; other anchors carry a fact base derived from
// their generated study cards. Both are persisted, so marking is a single DB read plus one LLM call.

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getLearnContent } from './learnContent.js';

const DEFAULT_MODEL = 'claude-opus-4-8';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

function parseJson(text) {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned);
}

export async function markNarrative(narrative, { anchorId, breadth = 'A', model = DEFAULT_MODEL } = {}) {
    const content = await getLearnContent(anchorId, breadth);
    if (!content) throw new Error(`No study content for anchor ${anchorId} breadth ${breadth}`);

    const rubricList = (content.rubric && content.rubric.length)
        ? content.rubric
        : (content.subAnchors || []).map(s => s.title);
    const rubric = rubricList.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const factBase = content.factBase;

    const tpl = fs.readFileSync(path.join(process.cwd(), 'prompts', '_marking-pass.md'), 'utf-8');
    const prompt = tpl
        .replace(/\{\{factBase\}\}/g, () => factBase)
        .replace(/\{\{rubric\}\}/g, () => rubric)
        .replace(/\{\{narrative\}\}/g, () => narrative);

    const resp = await getClient().messages.create({
        model, max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
    });

    return parseJson(resp.content[0].text);
}
