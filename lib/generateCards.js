// Card-generation stage of the Learn pipeline (backend helper, NOT a Vercel function). Ported from
// the validated prototype scripts/learn-chain-harness.mjs. Sonnet, HYBRID grounding: the research is
// the factual anchor (especially dates, names, sources); the model may add well-established detail for
// richness; conflicts defer to the research. Decision: cards on Sonnet (~$0.07, near-Opus quality).
// See: project knowledge/Learn_Pipeline_Design.md.

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

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

/**
 * Generate study fact-cards for one anchor from the researched evidence.
 *
 * @param {{title:string, scope?:string}} anchor
 * @param {string} subAnchorsEvidence  pre-formatted per-section evidence (from researchAnchor)
 * @param {string} [model]
 * @returns {Promise<{prelude:object|null, subAnchors:Array}>}
 */
export async function generateCards(anchor, subAnchorsEvidence, model = CARDS_MODEL) {
    const tpl = fs.readFileSync(path.join(process.cwd(), 'prompts', '_explore-facts-prompt.md'), 'utf-8')
        .replace(/\{\{anchorTitle\}\}/g, () => anchor.title)
        .replace(/\{\{anchorScope\}\}/g, () => anchor.scope || 'No scope defined')
        .replace(/\{\{subAnchors\}\}/g, () => subAnchorsEvidence);

    const resp = await getClient().messages.create({
        model,
        max_tokens: 8000,
        messages: [{ role: 'user', content: HYBRID_CARDS + tpl }],
    });

    const cards = parseJson(resp.content[0].text);
    return { prelude: cards.prelude || null, subAnchors: cards.subAnchors || [] };
}
