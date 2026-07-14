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
import { tightenLike, hasBannedLikePhrase } from './tightenLike.js';

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

// House style is a spaced en dash ( – ), never an em dash or double hyphen. Models emit em dashes
// regardless of the prompt, so normalise deterministically. Recurses through a fact's string fields
// and string arrays, leaving URLs (sources) untouched.
function normaliseDashes(fact) {
    const fix = s => typeof s === 'string'
        ? s.replace(/\s*—\s*/g, ' – ').replace(/\s--\s/g, ' – ')
        : s;
    const out = {};
    for (const [k, v] of Object.entries(fact)) {
        if (k === 'sources') out[k] = v;
        else if (Array.isArray(v)) out[k] = v.map(fix);
        else out[k] = fix(v);
    }
    return out;
}

function loadSectionTemplate() {
    return fs.readFileSync(path.join(process.cwd(), 'prompts', '_explore-facts-section.md'), 'utf-8');
}

// The `before` / `whyItMattered` bookend layers are per-sub-anchor, and only for A/C views of a subject
// that sits in a temporal frame (a change or a period). generateCards decides; this renders the matching
// instruction. `null` => both layers stay empty (a B-view card, or a pure place).
function renderBookendInstruction(bookends) {
    if (!bookends) return 'This card has NO bookend layers: leave `before` and `whyItMattered` as empty arrays [].';
    const lines = ['BOOKEND LAYERS for this card (its subject is a development with a before and an after):'];
    lines.push(bookends.before
        ? '- `before`: the situation IMMEDIATELY BEFORE this development began — the state of the world it arose from. Scene-setting, DISTINCT from `why` (which is the cause/trigger). 1–2 short bullets; leave [] only if there is genuinely no prior state.'
        : '- `before`: leave as an empty array [].');
    lines.push(bookends.whyItMattered
        ? '- `whyItMattered`: its LASTING SIGNIFICANCE — what it changed and what it led to afterwards. NEW information, not a restatement of `what`. 1–2 short bullets. If it is still actively unfolding today with no settled consequences, leave [].'
        : '- `whyItMattered`: leave as an empty array [].');
    return lines.join('\n');
}

// Generate the fact card(s) for ONE section. Returns { title, facts } or null on repeated failure.
async function genSection(anchor, { topic, context, heading, subject, guidance, coverageRule, titleRule, cardCountRule, evidence, bookends }, model) {
    const prompt = HYBRID_CARDS + loadSectionTemplate()
        .replace(/\{\{anchorTitle\}\}/g, () => topic)
        .replace(/\{\{anchorScope\}\}/g, () => context || 'No scope defined')
        .replace(/\{\{sectionHeading\}\}/g, () => heading)
        .replace(/\{\{sectionSubject\}\}/g, () => subject)
        .replace(/\{\{sectionGuidance\}\}/g, () => guidance)
        .replace(/\{\{coverageRule\}\}/g, () => coverageRule)
        .replace(/\{\{titleRule\}\}/g, () => titleRule)
        .replace(/\{\{cardCountRule\}\}/g, () => cardCountRule || 'Produce EXACTLY ONE fact card for this section.')
        .replace(/\{\{bookendLayers\}\}/g, () => renderBookendInstruction(bookends))
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
 * @param {Object} [frame]  axis framing from lib/learnContent.buildSectionFrame
 * @param {string} [model]
 * @returns {Promise<{prelude:object|null, subAnchors:Array}>}
 */
export async function generateCards(anchor, children, research, frame = null, model = CARDS_MODEL) {
    // For a temporal/geographic anchor, the topic shown to the model is a coordinate, not its
    // thematic name, so its wording exerts no pull. Falls back to the raw anchor when no frame.
    const topic = frame?.anchorTopic || anchor.title;
    const context = frame?.anchorContext ?? (anchor.scope || 'No scope defined');
    const coverageRule = frame?.coverage
        || 'Cover the CORE MEANING of this section\'s title — the most foundational facts a learner must know.';

    // What each section is: for B/C the coordinate (a time window / a place), for A its own title.
    const subjectFor = (i) => {
        const s = frame?.subjects?.[i];
        if (s?.axis === 'when') return `A TIME WINDOW. Cover the whole world during ${s.coord}. The section's name is only a signpost for the period — do not narrow the cards to it.`;
        if (s?.axis === 'where') return `A PLACE. Cover everything significant about ${s.coord}. The section's name is only a signpost for the place — do not narrow the cards to it.`;
        return children[i]?.title || '';
    };

    // Bookend placement (see project knowledge/). A card gets a before/why-it-mattered only inside a
    // temporal frame (frame.hasFrame). A B view brackets the whole topic (topic-level prelude/postlude);
    // an A or C view puts the bookends on each sub-anchor. A children are always changes, so they carry
    // bookends regardless of the parent's frame; C children only within a frame. The "why it mattered"
    // is dropped when the frame runs to the present.
    const axis = frame?.axis || 'theme';
    const hasFrame = frame ? frame.hasFrame : true;
    const endsAtPresent = frame ? frame.frameEndsAtPresent : false;
    const topicPrelude = axis === 'when' && hasFrame;
    const topicPostlude = topicPrelude && !endsAtPresent;
    const childBookends =
        axis === 'theme' ? { before: true, whyItMattered: true }
        : (axis === 'where' && hasFrame) ? { before: true, whyItMattered: !endsAtPresent }
        : null;

    const preludeTask = !topicPrelude ? Promise.resolve(null) : genSection(anchor, {
        topic, context,
        heading: `The scene-setting prelude — what the world was like just before "${topic}"`,
        subject: `Scene-setting for ${topic}.`,
        coverageRule: 'Set the scene: give the few foundational facts a learner needs before this topic.',
        guidance: 'This is the SCENE-SETTING PRELUDE. Orient the learner in what the world was like JUST BEFORE ' +
            'this topic, so they are not dropped in cold. For an event or era (a war, a revolution), you MUST ' +
            'include how it began — the trigger or outbreak — not only the background conditions. Do not cover ' +
            "the topic's sub-sections themselves; only set the scene.",
        titleRule: '"<a short scene-setting title beginning with \'Before this:\'>"',
        // The prelude is the one section allowed two cards: an event/era often needs the background
        // conditions AND the trigger, which do not fit one card.
        cardCountRule: 'Produce ONE or TWO fact cards for this section (not more).',
        evidence: research.preludeEvidence || [],
    }, model);

    // The closing "Why it mattered" card, symmetric with the prelude: one card on the whole topic's
    // significance and consequences. Reuses the topic-level (prelude) evidence; the hybrid grounding lets
    // the model supply well-established significance the research is thin on.
    const postludeTask = !topicPostlude ? Promise.resolve(null) : genSection(anchor, {
        topic, context,
        heading: `Why it mattered — the lasting significance and consequences of "${topic}"`,
        subject: `The aftermath and significance of ${topic}.`,
        coverageRule: 'Give the few things a learner must grasp about why this topic mattered: what it changed, what it led to, and its lasting significance.',
        guidance: 'This is the CLOSING "WHY IT MATTERED" card for the topic as a whole. Explain why the ' +
            'topic was significant: what it changed, what it led to, and its lasting consequences. This is ' +
            'NEW information about aftermath and significance, not a summary of the sub-sections. Do not ' +
            'restate what happened; say what it meant and what followed. Put the single most important ' +
            'reason it mattered in the headline.',
        titleRule: '"<a short significance title beginning with \'Why it mattered:\'>"',
        cardCountRule: 'Produce EXACTLY ONE fact card for this section.',
        evidence: research.preludeEvidence || [],
    }, model);

    const subTasks = children.map((c, i) => genSection(anchor, {
        topic, context,
        heading: c.title,
        subject: subjectFor(i),
        coverageRule,
        guidance: 'This is one sub-section of the topic. Produce its fact card.',
        titleRule: JSON.stringify(c.title),
        // One card per numbered sub-anchor: keeps each chunk small (the fractal principle), and matches
        // the scoring rule of one core flashcard per child. Deeper facts live in the child anchors.
        cardCountRule: 'Produce EXACTLY ONE fact card for this section.',
        evidence: research.evidenceBySection?.[c.title] || [],
        bookends: childBookends,
    }, model));

    const [preludeRes, postludeRes, ...subResults] = await Promise.all([preludeTask, postludeTask, ...subTasks]);

    // Assemble: keep sub-anchor order, force each sub-anchor title to its canonical value (the marking
    // rubric and flashcard groups key off these), drop any section that failed entirely.
    const subAnchors = children
        .map((c, i) => {
            const r = subResults[i];
            return r ? { title: c.title, facts: (r.facts || []).map(normaliseDashes) } : null;
        })
        .filter(Boolean);

    const prelude = preludeRes && preludeRes.facts.length
        ? { title: preludeRes.title || `Before this: the world before ${topic}`, facts: preludeRes.facts.map(normaliseDashes) }
        : null;

    const postlude = postludeRes && postludeRes.facts.length
        ? { title: postludeRes.title || `Why it mattered: the significance of ${topic}`, facts: postludeRes.facts.map(normaliseDashes) }
        : null;

    // Delint the `like` layer: the flat-register rule still lets an occasional antithesis or
    // scene-setting opener through, so rewrite only the flagged strings (clean cards make no LLM call).
    const allFacts = [...(prelude?.facts || []), ...subAnchors.flatMap(sa => sa.facts), ...(postlude?.facts || [])];
    await Promise.all(allFacts.map(async (f) => {
        if (hasBannedLikePhrase(f.like)) f.like = await tightenLike(f.like);
    }));

    return { prelude, subAnchors, postlude };
}
