// Card-generation stage of the Learn pipeline (backend helper, NOT a Vercel function). Sonnet, HYBRID
// grounding: the research is the factual anchor (especially dates, names, sources); the model may add
// well-established detail for richness; conflicts defer to the research.
//
// Cards are generated ONE SECTION PER LLM CALL, in PARALLEL (prelude + one per sub-anchor), then
// assembled. A single whole-anchor call measured ~84s — over Vercel's 60s Hobby cap; fanning out makes
// the wall-clock the slowest single section (~20s), keeping on-demand generation synchronous and under
// the cap. See: project knowledge/Learn_Pipeline_Design.md and Learn_Build_Plan.md.

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { formatEvidence } from './research.js';

export const CARDS_MODEL = 'claude-sonnet-4-6';

const HYBRID_CARDS =
    'GROUNDING (hybrid): Use the researched evidence below as your factual ANCHOR — especially for dates, names ' +
    'and specifics — and as your sources. You MAY also add well-established, mainstream detail from your own ' +
    'knowledge to make the cards richer, clearer and better-explained, and to supply a good anecdote where the ' +
    'research is thin. Where your knowledge and the research conflict, TRUST THE RESEARCH. Do not state any ' +
    'specific date, number or name as fact unless you are confident it is correct; if unsure, keep it general. ' +
    'Keep every writing rule below.\n\n';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

function parseJson(text) {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(m ? m[0] : cleaned);
}

function loadSectionTemplate() {
    return fs.readFileSync(path.join(process.cwd(), 'prompts', '_explore-facts-section.md'), 'utf-8');
}

// Generate the fact card(s) for ONE section. Returns { title, facts } or null on repeated failure.
async function genSection(anchor, { heading, guidance, titleRule, evidence }, model) {
    const prompt = HYBRID_CARDS + loadSectionTemplate()
        .replace(/\{\{anchorTitle\}\}/g, () => anchor.title)
        .replace(/\{\{anchorScope\}\}/g, () => anchor.scope || 'No scope defined')
        .replace(/\{\{sectionHeading\}\}/g, () => heading)
        .replace(/\{\{sectionGuidance\}\}/g, () => guidance)
        .replace(/\{\{titleRule\}\}/g, () => titleRule)
        .replace(/\{\{sectionEvidence\}\}/g, () => formatEvidence(evidence));

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const resp = await getClient().messages.create({
                model, max_tokens: 3000,
                messages: [{ role: 'user', content: prompt }],
            });
            console.log(`cards section "${heading.slice(0, 40)}": ${resp.usage.input_tokens} in + ${resp.usage.output_tokens} out`);
            const obj = parseJson(resp.content[0].text);
            return { title: obj.title, facts: Array.isArray(obj.facts) ? obj.facts : [] };
        } catch (e) {
            if (attempt === 1) { console.error(`genSection failed for "${heading}":`, e.message); return null; }
        }
    }
    return null;
}

/**
 * Generate study fact-cards for one anchor, fanning out one parallel LLM call per section.
 *
 * @param {{title:string, scope?:string}} anchor
 * @param {Array<{title:string}>} children  ordered sub-anchors
 * @param {{evidenceBySection:Object, preludeEvidence:Array}} research  from researchAnchor
 * @param {string} [model]
 * @returns {Promise<{prelude:object|null, subAnchors:Array}>}
 */
export async function generateCards(anchor, children, research, model = CARDS_MODEL) {
    const preludeTask = genSection(anchor, {
        heading: `The scene-setting prelude — what the world was like just before "${anchor.title}"`,
        guidance: 'This is the SCENE-SETTING PRELUDE. Orient the learner in what the world was like JUST BEFORE ' +
            'this topic, so they are not dropped in cold. For an event or era (a war, a revolution), you MUST ' +
            'include how it began — the trigger or outbreak — not only the background conditions. Do not cover ' +
            "the topic's sub-sections themselves; only set the scene.",
        titleRule: '"<a short scene-setting title beginning with \'Before this:\'>"',
        evidence: research.preludeEvidence || [],
    }, model);

    const subTasks = children.map(c => genSection(anchor, {
        heading: c.title,
        guidance: 'This is one sub-section of the topic. Produce its fact card(s).',
        titleRule: JSON.stringify(c.title),
        evidence: research.evidenceBySection?.[c.title] || [],
    }, model));

    const [preludeRes, ...subResults] = await Promise.all([preludeTask, ...subTasks]);

    // Assemble: keep sub-anchor order, force each sub-anchor title to its canonical value (the marking
    // rubric and flashcard groups key off these), drop any section that failed entirely.
    const subAnchors = children
        .map((c, i) => {
            const r = subResults[i];
            return r ? { title: c.title, facts: r.facts } : null;
        })
        .filter(Boolean);

    const prelude = preludeRes && preludeRes.facts.length
        ? { title: preludeRes.title || `Before this: the world before ${anchor.title}`, facts: preludeRes.facts }
        : null;

    return { prelude, subAnchors };
}
