// Derive map-worthy places from an anchor's fact base by matching city names in the text —
// pure code, no model call, so it costs nothing at read time and works retroactively on all
// cached content. Matching is case-sensitive with word boundaries (prose "nice" never matches
// "Nice") and restricted to cities inside the page's member countries, which kills most
// remaining ambiguity. Cities the facts actually mention get the map's label slots ahead of
// generic capital/population picks (see RegionAtlasMap.jsx).

// createRequire rather than a JSON import: plain Node (the local dev API server) rejects JSON
// imports without an import attribute, while require() of JSON works everywhere and stays
// statically traceable for Vercel's function bundler.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cities = require('../src/data/cities.json');

// Former or historical city names → the modern name as it appears in the city dataset. Extend as
// gaps surface in real fact bases; names must match the dataset's `n` field exactly.
export const HISTORICAL_CITY_ALIASES = {
    'Constantinople': 'Istanbul', 'Byzantium': 'Istanbul',
    'Peking': 'Beijing',
    'Bombay': 'Mumbai', 'Madras': 'Chennai', 'Calcutta': 'Kolkata',
    'Saigon': 'Ho Chi Minh City',
    'Edo': 'Tokyo',
    'Angora': 'Ankara', 'Smyrna': 'Izmir',
    'Petrograd': 'Saint Petersburg', 'Leningrad': 'Saint Petersburg',
    'Stalingrad': 'Volgograd',
    'Danzig': 'Gdansk', 'Königsberg': 'Kaliningrad',
    'Ctesiphon': 'Baghdad',
};

// Names this short are too collision-prone even with case-sensitive word-boundary matching.
const MIN_NAME_LENGTH = 4;

const MAX_PLACES = 12;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip a subdivision code ('FR-IDF') to its country ('FR').
function toCountryCode(code) {
    return code.includes('-') ? code.split('-')[0] : code;
}

// Match the fact-base text against city names (modern and historical) within the member
// countries. Returns city records ordered by first appearance in the text — the order the
// learner meets them — capped at MAX_PLACES.
export function matchFactPlaces(factText, memberCodes) {
    if (!factText || typeof factText !== 'string' || !Array.isArray(memberCodes) || memberCodes.length === 0) {
        return [];
    }
    const memberSet = new Set(memberCodes.map(toCountryCode));
    const candidates = cities.filter(c => memberSet.has(c.c));

    const byName = new Map(candidates.map(c => [c.n, c]));
    // Search terms: each candidate's modern name, plus any historical alias resolving to a
    // candidate. Alias hits map back to the modern city record.
    const terms = [];
    for (const c of candidates) {
        if (c.n.length >= MIN_NAME_LENGTH) terms.push({ term: c.n, city: c });
    }
    for (const [alias, modern] of Object.entries(HISTORICAL_CITY_ALIASES)) {
        const city = byName.get(modern);
        if (city && alias.length >= MIN_NAME_LENGTH) terms.push({ term: alias, city });
    }

    const found = new Map(); // city name -> { city, firstIndex }
    for (const { term, city } of terms) {
        if (found.has(city.n)) {
            // Already matched via another term; still record an earlier position if this one hits sooner.
            const idx = factText.search(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`, 'u'));
            if (idx !== -1 && idx < found.get(city.n).firstIndex) found.get(city.n).firstIndex = idx;
            continue;
        }
        if (!factText.includes(term)) continue; // cheap pre-check before the regex
        const idx = factText.search(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?![\\p{L}\\p{N}])`, 'u'));
        if (idx === -1) continue;
        found.set(city.n, { city, firstIndex: idx });
    }

    return [...found.values()]
        .sort((a, b) => a.firstIndex - b.firstIndex)
        .slice(0, MAX_PLACES)
        .map(e => e.city);
}
