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

Source authority: prefer encyclopaedias (Wikipedia, Britannica), academic and .edu, museums, government and .gov, official archives, and major reference works. NEVER base a correction on, or cite, low-authority sources: YouTube, Facebook, Reddit, Quora, Pinterest, personal blogs, forums, or AI-generated pages.

Be CONSERVATIVE. Only mark a claim "adjust" or "wrong" when authoritative sources CLEARLY and consistently support the change. If the evidence is weak, comes only from low-authority sources, or sources conflict, mark it "ok" and leave the claim unchanged - it is better to keep a defensible claim than to "correct" it to an uncertain value. Do NOT flag minor rounding or phrasing differences ("about two million" vs "more than two million"; "$13 billion" vs "$13.3 billion") - those are "ok". DO catch genuine errors: wrong dates, wrong names, wrong sequence, materially wrong numbers.

Each step, either finalise with a verdict or (if evidence is insufficient) request one more search. When finalising, choose the SINGLE most authoritative source URL present in the results. Never invent a URL.`;
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

    const fixes = verdicts.filter(v => (v.status === 'adjust' || v.status === 'wrong') && v.fix);
    const correctedNarrative = await incorporate(client, narrativeHtml, fixes);

    const seen = new Set();
    const sources = verdicts
        .filter(v => v.url && /^https?:\/\//.test(v.url))
        .filter(v => (seen.has(v.url) ? false : (seen.add(v.url), true)))
        .map(v => ({ claim: v.claim, url: v.url }));

    const corrections = fixes.map(f => ({ original: f.claim, corrected: f.fix, reason: f.note || f.status }));

    return { narrative: correctedNarrative, sources, corrections };
}
