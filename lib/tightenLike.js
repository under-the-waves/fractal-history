// A targeted delint for the `like` ("what it was like") fact-card layer. The generation prompt bans
// antithesis and scene-setting openers, but the model still lets ~1 in 15 through, and those
// constructions need rewriting, not a regex replace. Detection is deterministic; the fix is a light
// Haiku pass that only fires on a flagged string (so clean cards pay nothing). Never throws.

import Anthropic from '@anthropic-ai/sdk';

const HAIKU = 'claude-haiku-4-5-20251001';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

// Banned constructions the generation rule still lets slip. Kept in sync with the `like` bans in
// prompts/_explore-facts-section.md.
const BANNED = [
    /\brather than\b/i,
    /\bnot just\b/i,
    /\b(?:was|were|is|are|had|have)\s+not\b[^.]*\bbut\b/i,
    /\bnot\b[^.,]*,\s*but\b/i,
    /^\s*(Picture|Imagine|Think of)\b/i,
    // Personifying inanimate things — high-precision tells (idioms, or an inanimate noun paired with a
    // volition verb) so human vantages ("the farmer wanted…") do not trip it.
    /\beven if it (?:tried|wanted|could)\b/i,
    /\bas if it (?:knew|wanted|chose|were|could|tried)\b/i,
    /\b(?:cells?|molecules?|bacteri(?:um|a)|microbes?|atmospheres?|oceans?|seas?|planets?|engines?|machines?|rocks?|gas(?:es)?|minerals?|organisms?|compounds?|strands?|mitochondri(?:on|a))\b[^.]{0,40}\b(?:wanted|tried|sought|chose|decided|refused|struggled|hoped|knew|desired|preferred)\b/i,
];

export function hasBannedLikePhrase(s) {
    return typeof s === 'string' && BANNED.some(re => re.test(s));
}

// Surgically rewrite a `like` paragraph to remove banned constructions, preserving every fact and the
// flat register. Returns the original text unchanged if it is clean or on any error.
export async function tightenLike(text) {
    if (!hasBannedLikePhrase(text)) return text;
    try {
        const resp = await getClient().messages.create({
            model: HAIKU,
            max_tokens: 600,
            system: 'You lightly copy-edit one short factual paragraph. Change as little as possible; never add facts or adjectives.',
            messages: [{
                role: 'user', content:
                    'Rewrite the paragraph below to REMOVE these constructions, changing as little else as possible and preserving every fact:\n' +
                    '- "not X but Y", "X, not Y", "not just X" — state the point positively.\n' +
                    '- "rather than" — restate positively ("the machine set the pace", not "set by the machine rather than the worker").\n' +
                    '- opening with "Picture", "Imagine", "Think of" — open on the fact or the vantage point instead.\n' +
                    '- personifying an inanimate thing: a cell, molecule, planet, machine or gas that "tries", "wants", "chooses", "refuses", "knows" or acts "as if"/"even if it tried" — describe what physically happened instead ("the cell kept it after that", not "could not shed it even if it tried"). Leave genuine human wanting/trying alone.\n' +
                    'Keep the plain, flat register. Add nothing, remove no fact, use no evaluative adjectives. Return ONLY the rewritten paragraph.\n\n' +
                    text,
            }],
        });
        const out = resp.content[0].text.trim().replace(/\s*—\s*/g, ' – ').replace(/\s--\s/g, ' – ');
        return out || text;
    } catch {
        return text;
    }
}
