// Phase 2 of the Learn pipeline: ground the reading narrative in the SAME research-derived fact base
// the study cards and flashcards use, and cite it WITHOUT a fresh web search. Two exports:
//   buildNarrativeGrounding(content) -> a hybrid-grounding block injected into the narrative prompt.
//   citeFromFactBase(narrativeHtml, content) -> the narrative with inline citation links drawn from the
//     fact base's existing source URLs, plus the sources list, matching the shape the reader UI expects.
// See: project knowledge/Learn_Flow_Reorder_Spec.md (Phase 2). Backend helper, NOT a Vercel function.

import Anthropic from '@anthropic-ai/sdk';

const SONNET = 'claude-sonnet-4-6';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

function parseJson(text) {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const m = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : cleaned);
}

// One section's facts as grounding lines: the headline (+ date), what happened, why, debates, and any
// vignette (the anecdotes feed the narrative voice). Skips how-we-know, the sensory `like` layer, and
// raw source URLs (those are for the citation pass, not the grounding).
function factLines(facts) {
    return (facts || []).map(f => {
        const lines = [`- ${f.headline}${f.when ? ` (${f.when})` : ''}`];
        (f.what || []).forEach(b => lines.push(`    · ${b}`));
        (f.why || []).forEach(b => lines.push(`    · why: ${b}`));
        (f.debates || []).forEach(b => lines.push(`    · debated: ${b}`));
        (f.vignettes || []).forEach(b => lines.push(`    · anecdote: ${b}`));
        return lines.join('\n');
    }).join('\n');
}

/**
 * Build the hybrid-grounding block for the narrative prompt from stored learn content. Returns '' when
 * there is no fact base yet (the "just read it" escape hatch), so the narrative generates ungrounded as
 * before. Hybrid, NOT strict: strict grounding was shown to WORSEN narratives (2026-06-27), so the
 * facts are the anchor for specifics while the model may still add well-established colour.
 */
export function buildNarrativeGrounding(content) {
    if (!content) return '';
    const secs = [];
    if (content.prelude) secs.push(`## Background — ${content.prelude.title}\n${factLines(content.prelude.facts)}`);
    (content.subAnchors || []).forEach(sa => secs.push(`## ${sa.title}\n${factLines(sa.facts)}`));
    if (!secs.length) return '';

    return `## Verified facts to build on (researched for this exact topic)\n\n` +
        `GROUNDING (hybrid): The researched facts below are your factual ANCHOR — especially for dates, ` +
        `names, numbers and specific claims. Follow them for those specifics. You MAY still add ` +
        `well-established, mainstream detail from your own knowledge to make the narrative richer and to ` +
        `supply a good anecdote, but where your own knowledge conflicts with a fact below, TRUST THE FACT ` +
        `BELOW. Do not state any specific date, number or name you are not confident of.\n\n` +
        secs.join('\n\n') + '\n';
}

// Deduped source list from the fact cards: [{ url, claim }], claim = the fact the source backs. Used to
// tell the citation pass which URLs exist and what each supports.
function sourcesFromContent(content) {
    const out = [];
    const seen = new Set();
    const collect = (facts) => (facts || []).forEach(f => {
        const claim = f.headline || (f.what || [])[0] || '';
        (f.sources || []).forEach(url => {
            if (url && /^https?:\/\//.test(url) && !seen.has(url)) { seen.add(url); out.push({ url, claim }); }
        });
    });
    if (content?.prelude) collect(content.prelude.facts);
    (content?.subAnchors || []).forEach(sa => collect(sa.facts));
    return out;
}

/**
 * Add inline citation links to an already-generated narrative using ONLY the fact base's source URLs —
 * no web search. Returns { narrative, sources, corrections } in the same shape as lib/factCheck.js so
 * the endpoint and reader UI are unchanged. On any failure, returns the narrative untouched with the
 * anchor-level source list, so the Sources section still renders (degraded, not broken).
 */
export async function citeFromFactBase(narrativeHtml, content) {
    // Never run on an empty narrative: with no text to cite but a list of source-claims, the model
    // synthesises a narrative out of the claims instead of adding citations. Return untouched.
    if (!narrativeHtml || !narrativeHtml.trim()) return { narrative: narrativeHtml, sources: [], corrections: [] };
    const available = sourcesFromContent(content);
    if (!available.length) return { narrative: narrativeHtml, sources: [], corrections: [] };

    const sourceList = available.map((s, i) => `${i + 1}. ${s.url} — supports: ${s.claim}`).join('\n');
    const system = 'You add citation links to an existing HTML history narrative using ONLY the sources provided. You never invent a URL, never change wording, and never remove or alter existing tags. Output ONLY JSON.';
    const user = `Add inline citation links to the narrative below, using ONLY the sources listed after it.

Rules:
- Where the narrative states a specific fact (a date, name, event, number) that one of the sources supports, wrap the smallest relevant phrase in <a href="THE EXACT URL" target="_blank" rel="noopener">that phrase</a>.
- Use only the URLs listed below, copied exactly. NEVER invent or alter a URL. Cite each source at most twice; do not over-cite.
- PRESERVE every existing tag and attribute unchanged, especially <strong data-title='...'> links. Change no wording. Add only <a> citation tags.
- Do not cite vague or interpretive sentences; cite concrete facts only.

NARRATIVE:
${narrativeHtml}

SOURCES:
${sourceList}

Return ONLY JSON: {"narrative":"<the narrative HTML with citation <a> tags added>","sources":[{"claim":"<the specific fact cited>","url":"<the exact URL>"}]}`;

    try {
        const resp = await getClient().messages.create({
            model: SONNET, max_tokens: 4000, system,
            messages: [{ role: 'user', content: user }],
        });
        const data = parseJson(resp.content[0].text);
        const validUrls = new Set(available.map(s => s.url));
        // Keep only sources that map to a real fact-base URL (drop anything the model altered/invented).
        const sources = (Array.isArray(data.sources) ? data.sources : [])
            .filter(s => s && s.url && validUrls.has(s.url))
            .map(s => ({ claim: s.claim || '', url: s.url, quote: '' }));
        const narrative = (typeof data.narrative === 'string' && data.narrative.includes('<')) ? data.narrative : narrativeHtml;
        return { narrative, sources, corrections: [] };
    } catch (e) {
        console.error('citeFromFactBase failed, returning anchor-level sources:', e.message);
        return {
            narrative: narrativeHtml,
            sources: available.map(s => ({ claim: s.claim, url: s.url, quote: '' })),
            corrections: [],
        };
    }
}
