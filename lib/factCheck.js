import Anthropic from '@anthropic-ai/sdk';

// Parallel fact-check pipeline:
//   1. Extract the load-bearing factual claims (Haiku)
//   2. Verify each claim in parallel via a bounded Serper loop (Haiku) - always returns a verdict
//   3. Apply only the needed corrections to the narrative (Sonnet), preserving voice + HTML links
// Sources are the real Serper URLs from the verdicts, never model-invented.

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';
const MAX_SEARCHES_PER_CLAIM = 4;
const RESULTS_PER_SEARCH = 10;

let anthropic = null;
function getClient() {
    if (!anthropic) {
        anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropic;
}

async function webSearch(query, num = RESULTS_PER_SEARCH) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error('SERPER_API_KEY not configured');
    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num }),
    });
    if (!response.ok) throw new Error(`Serper search failed: ${response.status}`);
    const data = await response.json();
    return (data.organic || []).map(r => ({ title: r.title, url: r.link, description: r.snippet }));
}

function parseJson(text) {
    const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return JSON.parse(match ? match[0] : cleaned);
}

// Stage 1: extract discrete, checkable claims from the narrative
async function extractClaims(client, narrativeHtml, title, scope) {
    const plain = narrativeHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const system = `You extract the discrete, checkable factual claims from a historical narrative so each can be verified independently. Prioritise claims that could be WRONG: specific dates, numbers, names, sequences, attributions, and concrete causal assertions. Skip vague or purely interpretive statements. Return the 8-16 most load-bearing claims.`;
    const user = `Topic: ${title}\nScope: ${scope || 'N/A'}\n\nNarrative:\n${plain}\n\nReturn ONLY JSON: {"claims":[{"id":1,"claim":"the exact factual assertion, self-contained","query":"a good web search query to verify it"}]}`;
    const resp = await client.messages.create({
        model: HAIKU, max_tokens: 2000, system, messages: [{ role: 'user', content: user }],
    });
    const data = parseJson(resp.content[0].text);
    return Array.isArray(data.claims) ? data.claims : [];
}

// Stage 2: verify a single claim with a bounded Serper loop. ALWAYS returns a verdict.
async function verifyClaim(client, claimObj) {
    const system = `You verify ONE historical factual claim against web search results. Output ONLY JSON.

Source authority: your CITED source must be an original, authoritative one - ideally the kind of source Wikipedia itself cites: official archives and government (.gov), academic and university (.edu), museums, primary documents, established reference works, and news of record. Wikipedia and other wikis are fine to READ for orientation but must NEVER be your cited URL. If your best result is a Wikipedia page, run ANOTHER search (for the specific fact, document, institution, or date) to find the underlying primary/authoritative source and cite THAT. Also never cite or rely on low-authority sources: YouTube, Facebook, Reddit, Quora, Pinterest, personal blogs, forums, or AI-generated pages. If no acceptable non-wiki source can be found, finalise with an empty url rather than citing a wiki.

Be CONSERVATIVE. Only mark a claim "adjust" or "wrong" when authoritative sources CLEARLY and consistently support the change. If the evidence is weak, comes only from low-authority sources, or sources conflict, mark it "ok" and leave the claim unchanged - it is better to keep a defensible claim than to "correct" it to an uncertain value. Do NOT flag minor rounding or phrasing differences ("about two million" vs "more than two million"; "$13 billion" vs "$13.3 billion") - those are "ok". DO catch genuine errors: wrong dates, wrong names, wrong sequence, materially wrong numbers.

Each step, either finalise with a verdict or (if evidence is insufficient, or your only source so far is a wiki) request one more search. When finalising, choose the SINGLE most authoritative NON-WIKI source URL present in the results. Never invent a URL.`;
    const gathered = [];
    let query = claimObj.query || claimObj.claim;

    for (let round = 0; round < MAX_SEARCHES_PER_CLAIM; round++) {
        let results = [];
        try { results = await webSearch(query); } catch { results = []; }
        gathered.push({ query, results });
        const isFinal = round === MAX_SEARCHES_PER_CLAIM - 1;

        const user = `Claim to verify: "${claimObj.claim}"

Search results so far:
${gathered.map(g => `Query: ${g.query}\n${g.results.map(r => `- ${r.title} (${r.url}): ${r.description}`).join('\n') || '(no results)'}`).join('\n\n')}

${isFinal
    ? 'You MUST finalise now ("done": true) using the best available evidence.'
    : 'Either finalise, or set "done": false and provide "nextQuery" to search once more.'}

Return ONLY JSON:
{"done": true, "status": "ok" | "adjust" | "wrong", "fix": "if adjust/wrong, the corrected wording; else empty", "url": "single most authoritative source URL from the results above, or empty", "note": "<=12 word reason", "nextQuery": "only when done is false"}`;

        let decision;
        try {
            const resp = await client.messages.create({
                model: HAIKU, max_tokens: 700, system, messages: [{ role: 'user', content: user }],
            });
            decision = parseJson(resp.content[0].text);
        } catch {
            decision = { done: true, status: 'ok', fix: '', url: gathered[0]?.results?.[0]?.url || '', note: 'verify error' };
        }

        if (decision.done || isFinal || !decision.nextQuery) {
            return {
                claim: claimObj.claim,
                status: ['ok', 'adjust', 'wrong'].includes(decision.status) ? decision.status : 'ok',
                fix: decision.fix || '',
                url: decision.url || '',
                note: decision.note || '',
            };
        }
        query = decision.nextQuery;
    }
    return { claim: claimObj.claim, status: 'ok', fix: '', url: '', note: 'no verdict' };
}

// Stage 3: apply only the necessary corrections, preserving everything else
async function incorporate(client, narrativeHtml, fixes) {
    if (fixes.length === 0) return narrativeHtml;
    const system = `You apply a small set of factual corrections to an existing HTML history narrative.
- Change ONLY what the corrections require. Preserve wording, voice, paragraphing, and ALL HTML tags/attributes (especially <strong data-title='...'> links) everywhere else.
- Do not add citations, sources, or commentary. Do not reformat or change length/style.`;
    const user = `Corrections to apply:
${fixes.map((f, i) => `${i + 1}. The claim "${f.claim}" is ${f.status}. Correct it to: ${f.fix}`).join('\n')}

Narrative HTML:
${narrativeHtml}

Return ONLY the corrected narrative HTML, nothing else.`;
    const resp = await client.messages.create({
        model: SONNET, max_tokens: 4000, system, messages: [{ role: 'user', content: user }],
    });
    return resp.content[0].text.trim().replace(/```html\n?/g, '').replace(/```\n?/g, '');
}

// Fetch the chosen source page and confirm it actually supports the claim.
// Returns { confirm: 'supported' | 'unsupported' | 'unreadable', quote }.
async function confirmSource(client, claimText, url) {
    let html;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalHistoryFactCheck/1.0)' },
        });
        clearTimeout(timer);
        const ctype = resp.headers.get('content-type') || '';
        if (!resp.ok || !/text\/html|xhtml|text\/plain/i.test(ctype)) {
            return { confirm: 'unreadable', quote: '' };
        }
        html = await resp.text();
    } catch {
        return { confirm: 'unreadable', quote: '' };
    }

    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000);
    if (text.length < 200) return { confirm: 'unreadable', quote: '' };

    try {
        const resp = await client.messages.create({
            model: HAIKU,
            max_tokens: 300,
            system: 'You check whether a source page actually supports a specific historical claim. Output ONLY JSON.',
            messages: [{
                role: 'user',
                content: `Claim: "${claimText}"

Source page text (may be truncated):
${text}

Does this page's own text support the claim? Answer "yes" only if the page clearly states or directly evidences it. Return ONLY JSON:
{"supported": "yes" | "no" | "unclear", "quote": "a verbatim quote (<=25 words) from the page that supports the claim, or empty"}`,
            }],
        });
        const d = parseJson(resp.content[0].text);
        const map = { yes: 'supported', no: 'unsupported', unclear: 'unreadable' };
        return { confirm: map[d.supported] || 'unreadable', quote: (d.quote || '').slice(0, 300) };
    } catch {
        return { confirm: 'unreadable', quote: '' };
    }
}

/**
 * Fact-check a narrative. Returns { narrative, sources, corrections }.
 * Always returns an object (never null); sources are real URLs from search results.
 */
export async function factCheckNarrative(narrativeHtml, anchorTitle, anchorScope, breadth) {
    const client = getClient();

    const claims = await extractClaims(client, narrativeHtml, anchorTitle, anchorScope);
    if (claims.length === 0) {
        return { narrative: narrativeHtml, sources: [], corrections: [] };
    }

    const verdicts = await Promise.all(claims.map(c => verifyClaim(client, c)));

    // Read each cited page and confirm it actually supports the claim (with a quote)
    const confirmed = await Promise.all(verdicts.map(async (v) => {
        if (!v.url || !/^https?:\/\//.test(v.url) || /wikipedia\.org|wikimedia\.org/i.test(v.url)) {
            return { ...v, confirm: 'unreadable', quote: '' };
        }
        const claimText = ((v.status === 'adjust' || v.status === 'wrong') && v.fix) ? v.fix : v.claim;
        const c = await confirmSource(client, claimText, v.url);
        return { ...v, confirm: c.confirm, quote: c.quote };
    }));

    // Apply only corrections the source page did NOT contradict
    const fixes = confirmed.filter(v => (v.status === 'adjust' || v.status === 'wrong') && v.fix && v.confirm !== 'unsupported');
    const correctedNarrative = await incorporate(client, narrativeHtml, fixes);

    // Sources: only pages we fetched and confirmed support the claim, with a verbatim quote
    const seen = new Set();
    const sources = confirmed
        .filter(v => v.confirm === 'supported' && v.url && /^https?:\/\//.test(v.url))
        .filter(v => (seen.has(v.url) ? false : (seen.add(v.url), true)))
        .map(v => ({
            claim: ((v.status === 'adjust' || v.status === 'wrong') && v.fix) ? v.fix : v.claim,
            url: v.url,
            quote: v.quote || '',
        }));

    const corrections = fixes.map(f => ({ original: f.claim, corrected: f.fix, reason: f.note || f.status }));

    return { narrative: correctedNarrative, sources, corrections };
}
