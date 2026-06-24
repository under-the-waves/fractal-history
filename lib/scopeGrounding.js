// Scope grounding check for geographic (breadth-C) anchors.
//
// A geographic anchor's scope must not name a place as part of the region when that place is not in
// the anchor's actual membership (region_codes). Example caught: "Middle East and Central Asia"
// (members = Western Asia + Central Asia) whose scope says "Persia (Iran)" — but Iran sits in
// Southern Asia under the world-countries taxonomy, so it is not in the region.
//
// This is a HARD check (pure data lookups, no LLM): resolve each place named in the scope to a
// country and verify it falls inside the membership. See also: api/generate-anchors.js (breadth C).
//
// Caveat the caller must weigh: a geographic scope may LEGITIMATELY name an outside place to say
// where its members acted (e.g. under "World War I", the "Australia" region mentioning Gallipoli in
// Turkey). So a flagged mention is a CANDIDATE lie, not a certain one — report with context and let
// a human judge membership-claim vs acted-elsewhere.

import countries from 'world-countries';
import { getLevel, getChildren, getName } from './geography.js';

// Historical / alternate place names → modern country code(s). Extend as gaps surface; the goal is to
// catch the names history scopes actually use that a modern-name match alone would miss.
export const HISTORICAL_ALIASES = {
    'Persia': ['IR'], 'Persian Empire': ['IR'],
    'Anatolia': ['TR'], 'Asia Minor': ['TR'], 'Constantinople': ['TR'], 'Byzantium': ['TR'],
    'Mesopotamia': ['IQ'], 'Babylonia': ['IQ'], 'Assyria': ['IQ'], 'Sumer': ['IQ'],
    'Levant': ['SY', 'LB', 'IL', 'JO', 'PS'], 'Phoenicia': ['LB'], 'Judea': ['IL', 'PS'], 'Canaan': ['IL', 'PS'],
    'Arabia': ['SA', 'YE', 'OM', 'AE', 'KW', 'QA', 'BH'], 'Arabian Peninsula': ['SA', 'YE', 'OM', 'AE', 'KW', 'QA', 'BH'],
    'Siam': ['TH'], 'Ceylon': ['LK'], 'Burma': ['MM'], 'Formosa': ['TW'],
    'Indochina': ['VN', 'LA', 'KH'], 'Cochinchina': ['VN'], 'Annam': ['VN'],
    'East Indies': ['ID'], 'Dutch East Indies': ['ID'],
    'Cathay': ['CN'], 'Manchuria': ['CN'], 'Tibet': ['CN'],
    'Abyssinia': ['ET'], 'Nubia': ['SD'], 'Numidia': ['DZ'], 'Carthage': ['TN'],
    'Gaul': ['FR'], 'Hispania': ['ES', 'PT'], 'Iberia': ['ES', 'PT'],
    'Bohemia': ['CZ'], 'Moravia': ['CZ'], 'Prussia': ['DE'], 'Bavaria': ['DE'], 'Saxony': ['DE'],
    'Rhodesia': ['ZW'], 'Zaire': ['CD'], 'Dahomey': ['BJ'], 'Gold Coast': ['GH'], 'Tanganyika': ['TZ'],
    'Hindustan': ['IN'], 'Kurdistan': ['IQ', 'IR', 'TR', 'SY'],
};

// A few clean modern alternates worth catching; deliberately excludes ambiguous words like
// "America"/"England" that produce noise via substring-ish matches.
const MODERN_ALIASES = {
    'United States': ['US'], 'USA': ['US'], 'Britain': ['GB'], 'Great Britain': ['GB'],
    'Soviet Union': ['RU'], 'USSR': ['RU'], 'Holland': ['NL'],
};

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Build the matcher table once: each place name → a word-boundary regex + the country code(s) it means.
const PLACE_MATCHERS = [];
function addMatcher(label, cca2s, kind) {
    PLACE_MATCHERS.push({ regex: new RegExp(`\\b${escapeRegex(label)}\\b`, 'i'), label, cca2s, kind });
}
const NAME_BY_CCA2 = new Map();
for (const c of countries) if (c.cca2 && c.name?.common) { addMatcher(c.name.common, [c.cca2], 'modern'); NAME_BY_CCA2.set(c.cca2, c.name.common); }
for (const [label, codes] of Object.entries(MODERN_ALIASES)) addMatcher(label, codes, 'modern');
for (const [label, codes] of Object.entries(HISTORICAL_ALIASES)) addMatcher(label, codes, 'historical');

// Resolve region_codes (a mix of subregion names like "Western Asia" and country codes like "IR")
// down to the SET of member country codes (cca2).
export function expandToCountries(regionCodes) {
    const acc = new Set();
    if (!Array.isArray(regionCodes)) return acc;
    const walk = (code) => {
        const lvl = getLevel(code);
        if (lvl === 'country') { acc.add(code); return; }
        if (lvl === 'subregion' || lvl === 'region' || lvl === 'world') {
            for (const child of getChildren(code)) walk(child);
        }
        // subdivision / cosmic / unknown: not a terrestrial country membership — ignore.
    };
    for (const code of regionCodes) walk(code);
    return acc;
}

/**
 * Candidate scope violations: places NAMED in the scope whose country is NOT in the anchor's
 * membership. Returns [] for non-geographic anchors (empty/cosmic membership — nothing to check).
 * Each item: { place, cca2s, kind, context }. A place is in-membership if ANY of its country codes
 * is a member, so multi-country names (e.g. "Levant") only flag when wholly outside the region.
 */
export function findScopeViolations(scope, regionCodes) {
    if (!scope || typeof scope !== 'string') return [];
    const members = expandToCountries(regionCodes);
    if (members.size === 0) return []; // global / cosmic / unbounded — can't judge membership

    // Spans where a MEMBER country's own name appears, so we can skip matches that are really part of
    // a longer member place-name (e.g. "United States" inside "United States Minor Outlying Islands",
    // "Guinea" inside "Papua New Guinea") rather than a standalone out-of-region mention.
    const memberSpans = [];
    for (const cca2 of members) {
        const name = NAME_BY_CCA2.get(cca2);
        if (!name) continue;
        const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'ig');
        let mm;
        while ((mm = re.exec(scope))) memberSpans.push([mm.index, mm.index + mm[0].length]);
    }
    const insideMember = (a, b) => memberSpans.some(([s, e]) => a >= s && b <= e);

    const seen = new Set();
    const violations = [];
    for (const m of PLACE_MATCHERS) {
        if (m.cca2s.some(c => members.has(c))) continue; // the place is inside the region — fine
        const re = new RegExp(m.regex.source, 'ig');
        let hit, chosen = null;
        while ((hit = re.exec(scope))) {
            if (!insideMember(hit.index, hit.index + hit[0].length)) { chosen = hit; break; }
        }
        if (!chosen) continue; // every occurrence was part of a member's longer name
        const key = m.cca2s.join(',');
        if (seen.has(key)) continue; // don't double-report the same country via two names
        seen.add(key);
        const i = chosen.index;
        violations.push({
            place: m.label,
            cca2s: m.cca2s,
            kind: m.kind,
            context: scope.slice(Math.max(0, i - 45), i + chosen[0].length + 45).replace(/\s+/g, ' ').trim(),
        });
    }
    return violations;
}

/** Human-readable membership for reports: region_codes rendered as their names. */
export function describeMembership(regionCodes) {
    if (!Array.isArray(regionCodes)) return '(none)';
    return regionCodes.map(getName).join(', ');
}
