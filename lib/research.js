// Research stage of the Learn pipeline (backend helper, NOT a Vercel function — bundled into the
// importing endpoint). Ported from the validated prototype scripts/learn-chain-harness.mjs.
//
// For each sub-anchor (plus a "before this" prelude), generate ~3 targeted search queries (Haiku),
// run them through Serper, drop low-authority domains, fetch and read the top authoritative pages,
// and extract a list of categorised facts with sources. Cheap model (Haiku) is enough: this is
// search + extraction, not composition. One research pass feeds the cards, the marking fact base,
// and the citations. See: project knowledge/Learn_Pipeline_Design.md.

import Anthropic from '@anthropic-ai/sdk';

const HAIKU = 'claude-haiku-4-5-20251001';

// Low-authority domains to drop from research results (aligns with lib/factCheck.js rules).
const BAD_DOMAIN = /(reddit\.com|facebook\.com|youtube\.com|youtu\.be|quora\.com|pinterest\.|tiktok\.com|instagram\.com|medium\.com|wikipedia\.org|wikimedia\.org|fandom\.com|blogspot\.|wordpress\.com|bohrium\.com)/i;

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

async function llm(content, maxTokens) {
    const r = await getClient().messages.create({
        model: HAIKU,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content }],
    });
    return r.content[0].text;
}

async function webSearch(q, num = 8) {
    const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.organic || []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet }));
}

async function fetchPage(url) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(url, {
            signal: controller.signal, redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalHistory/1.0)' },
        });
        clearTimeout(timer);
        const ctype = resp.headers.get('content-type') || '';
        if (!resp.ok || !/text\/html|xhtml|text\/plain/i.test(ctype)) return '';
        const html = await resp.text();
        return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch { return ''; }
}

export function formatEvidence(facts) {
    if (!facts || !facts.length) return '   (no evidence found)';
    return facts.map(f => `   - [${f.category}] ${f.fact} (source: ${f.url || 'n/a'})`).join('\n');
}

// The line describing what ONE section's research must cover. A section is keyed by its child title
// (so cards can look the evidence up), but for a temporal/geographic axis the research is aimed at the
// coordinate — the whole time window or place — not the descriptive name. See lib/promptLoader.js.
function sectionAim(sec) {
    if (sec.isPrelude) return sec.key;
    if (sec.axis === 'when') return `${sec.key} — RESEARCH the whole world during ${sec.coord} (the descriptive name is only a signpost for the period; do not narrow to it)`;
    if (sec.axis === 'where') return `${sec.key} — RESEARCH everything significant about ${sec.coord} (the descriptive name is only a signpost for the place; do not narrow to it)`;
    return sec.key;
}

function extractionAim(sec) {
    if (sec.axis === 'when') return `everything significant that happened across the world during ${sec.coord}`;
    if (sec.axis === 'where') return `everything significant about ${sec.coord}`;
    return `the core of "${sec.key}"`;
}

/**
 * Research one anchor. Returns the evidence base keyed by section title, plus pre-formatted blocks the
 * cards/narrative generators consume, and the distinct authoritative source URLs.
 *
 * @param {{title:string, scope?:string}} anchor
 * @param {Array<{title:string}>} children  ordered sub-anchors
 * @param {Object} [frame]  axis framing from lib/learnContent.buildSectionFrame (axis/coverage/subjects/anchorTopic)
 * @returns {Promise<{evidenceBySection:Object, preludeEvidence:Array, subAnchorsEvidence:string, allEvidence:string, sources:string[]}>}
 */
export async function researchAnchor(anchor, children, frame = null) {
    const anchorTopic = frame?.anchorTopic || anchor.title;
    const coverage = frame?.coverage || '';

    // Section identity is the child title (the evidence key); the coordinate/axis drives what we research.
    const PRELUDE_KEY = 'PRELUDE: what the world was like just before this topic';
    const querySpec = [
        { key: PRELUDE_KEY, isPrelude: true, axis: 'prelude', coord: '' },
        ...children.map((c, i) => ({
            key: c.title,
            isPrelude: false,
            axis: frame?.subjects?.[i]?.axis || 'theme',
            coord: frame?.subjects?.[i]?.coord || c.title,
        })),
    ];

    const queriesText = await llm(
        `Topic: ${anchorTopic}\n${coverage ? `\n${coverage}\n` : ''}\n` +
        `For each section below, write 3 web search queries that together cover what that section must ` +
        `research (stated after each title), surfacing: (a) the key events and what happened, (b) the ` +
        `primary sources or evidence used to establish it, and (c) debates or vivid anecdotes. Be specific.\n\n` +
        `Sections (return your answer array in THIS ORDER, one entry per section):\n` +
        `${querySpec.map((s, i) => `${i + 1}. ${sectionAim(s)}`).join('\n')}\n\n` +
        `Return ONLY JSON: {"sections":[{"queries":["q1","q2","q3"]}]}  (same order as above)`,
        1500);

    let parsed;
    try { parsed = parseJson(queriesText).sections || []; }
    catch { parsed = []; }
    // Map queries back to sections BY INDEX (robust to the model dropping/renaming titles); fall back
    // to the coordinate as a query so a missing entry still searches the right thing.
    querySpec.forEach((sec, i) => {
        const q = parsed[i]?.queries;
        sec.queries = Array.isArray(q) && q.length ? q : [sec.isPrelude ? sec.key : sec.coord];
    });

    const evidenceBySection = {};
    await Promise.all(querySpec.map(async (sec) => {
        const groups = await Promise.all((sec.queries || []).slice(0, 3).map(q => webSearch(q)));
        let results = groups.flat().filter(r => r.url && !BAD_DOMAIN.test(r.url));
        const seen = new Set();
        results = results.filter(r => (seen.has(r.url) ? false : (seen.add(r.url), true)));
        const pages = await Promise.all(results.slice(0, 3).map(async r => ({ url: r.url, body: await fetchPage(r.url) })));
        const snippets = results.map(r => `- ${r.title} (${r.url}): ${r.snippet}`).join('\n').slice(0, 3500);
        const pagesText = pages.filter(p => p.body).map(p => `SOURCE: ${p.url}\n${p.body}`).join('\n\n').slice(0, 9000);
        const evText = await llm(
            `Topic: ${anchorTopic}. This section: ${extractionAim(sec)}.\n\n` +
            `From the search snippets and source pages below, extract the key factual points CLEARLY supported by them, ` +
            `covering ${extractionAim(sec)}. Include SPECIFIC dates, numbers, names and places wherever the ` +
            `sources give them. For each fact give: the fact in one plain sentence, the single best source URL, and a ` +
            `category — "what" (what happened), "how" (the EVIDENCE/SOURCES it rests on: documents, records, diaries, ` +
            `physical evidence, methods — not more events), "debates" (a genuine open disagreement), or "vignette" (a ` +
            `vivid anecdote or primary-source snippet such as a quote or letter). Only include facts the sources support. ` +
            `8 to 10 facts.\n\n` +
            `SNIPPETS:\n${snippets}\n\nSOURCE PAGES:\n${pagesText}\n\n` +
            `Return ONLY JSON: {"facts":[{"fact":"...","category":"what|how|debates|story","url":"..."}]}`,
            2000);
        try { evidenceBySection[sec.key] = parseJson(evText).facts || []; }
        catch { evidenceBySection[sec.key] = []; }
    }));

    const preludeEvidence = evidenceBySection[PRELUDE_KEY] || [];

    let subAnchorsEvidence = '';
    if (preludeEvidence.length) {
        subAnchorsEvidence += `SETTING — evidence for the "before this" prelude card:\n${formatEvidence(preludeEvidence)}\n\n`;
    }
    children.forEach((c, i) => {
        subAnchorsEvidence += `${i + 1}. ${c.title}\n${formatEvidence(evidenceBySection[c.title])}\n\n`;
    });

    const allEvidence = Object.entries(evidenceBySection)
        .map(([sec, f]) => `${sec}\n${formatEvidence(f)}`).join('\n\n');

    const sources = [...new Set(Object.values(evidenceBySection).flat().map(f => f.url).filter(Boolean))];

    return { evidenceBySection, preludeEvidence, subAnchorsEvidence, allEvidence, sources };
}
