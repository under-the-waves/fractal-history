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

const CREDITS = ['full', 'partial', 'none'];
const normLabel = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Turn the model's per-part judgement into a deterministic 0-100 score, transparent and legible:
 *   score = (fullParts + 0.5 * partialParts) / totalParts * 100
 * Full marks means every part is covered with something substantive and true, connected coherently.
 * A part is graded against the AUTHORITATIVE rubric (not the model's count): any rubric part the model
 * did not return a credit for counts as 'none', so the model can never inflate the total. Coherence
 * only caps the top — a disconnected list can't reach 100, but it never drags the score BELOW what the
 * coverage alone earns. With five parts this yields 20/40/60/80/100; the step floats with the count.
 */
export function scoreFromModel(rubricList, model) {
    const total = Math.max(rubricList.length, 1);
    const byTitle = new Map(
        (model.subAnchorScores || []).map(s => [normLabel(s.subAnchor), s])
    );
    const subAnchorScores = rubricList.map(t => {
        const m = byTitle.get(normLabel(t));
        const credit = CREDITS.includes((m?.credit || '').toLowerCase()) ? m.credit.toLowerCase() : 'none';
        return { subAnchor: t, credit, note: m?.note || '' };
    });

    const full = subAnchorScores.filter(a => a.credit === 'full').length;
    const partial = subAnchorScores.filter(a => a.credit === 'partial').length;
    const coverageScore = Math.round(((full + 0.5 * partial) / total) * 100);
    const coherent = model.coherent !== false; // default true when the model omits it
    const cap = coherent ? 100 : Math.max(0, 100 - Math.round(100 / total));
    const score = Math.min(coverageScore, cap);

    return {
        subAnchorScores,
        coherent,
        coverage: { covered: full + partial, total },
        mark: { score, rationale: model.rationale || '' },
        factualErrors: model.factualErrors || [],
        misconceptions: model.misconceptions || [],
        interpretationNotes: model.interpretationNotes || [],
    };
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

    return scoreFromModel(rubricList, parseJson(resp.content[0].text));
}
