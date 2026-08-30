// One-off generator: builds src/data/cities.json, a compact city dataset used by
// RegionAtlasMap to place city dots/labels on the learning-page atlas maps.
//
// Source: Natural Earth's 10m populated places (simple variant), fetched once at build/dev
// time from the official Natural Earth repo — see CONSTRAINTS in the feature spec: no runtime
// network requests to third parties, only this checked-in generation step.
//
// Filter: national capitals (FEATURECLA contains 'Admin-0 capital'), OR POP_MAX >= the
// threshold below. Re-run this if the population threshold changes or Natural Earth updates.
//
// Usage: node scripts/generate-cities.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'data', 'cities.json');

const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';
const POP_THRESHOLD = 300000;

console.log(`Fetching ${SOURCE_URL} ...`);
const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
const geojson = await res.json();

const seen = new Set();
const cities = [];

for (const feature of geojson.features) {
    // The GeoJSON export lowercases all Natural Earth field names (ISO_A2 -> iso_a2, etc).
    const p = feature.properties || {};
    const iso2 = p.iso_a2;
    if (!iso2 || iso2 === '-99') continue; // no assigned ISO 3166-1 alpha-2 code

    const isCapital = typeof p.featurecla === 'string' && p.featurecla.includes('Admin-0 capital');
    const popMax = Number(p.pop_max) || 0;
    if (!isCapital && popMax < POP_THRESHOLD) continue;

    const coords = feature.geometry?.coordinates;
    const lon = Number.isFinite(coords?.[0]) ? coords[0] : Number(p.longitude);
    const lat = Number.isFinite(coords?.[1]) ? coords[1] : Number(p.latitude);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const name = p.name || p.nameascii;
    if (!name) continue;

    // Some cities appear more than once in the source (e.g. alternate name variants); keep the
    // first (highest-ranked, since the source is roughly population-sorted) per name+country.
    const key = `${name}|${iso2}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cities.push({
        n: name,
        c: iso2,
        lat: Math.round(lat * 10000) / 10000,
        lon: Math.round(lon * 10000) / 10000,
        p: popMax,
        cap: isCapital ? 1 : 0
    });
}

// Largest first, so consumers that only want the top N per country can slice without sorting.
cities.sort((a, b) => b.p - a.p);

const json = JSON.stringify(cities);
writeFileSync(outPath, json);

const bytes = Buffer.byteLength(json);
console.log(`Wrote ${cities.length} cities to ${outPath} (${(bytes / 1024).toFixed(1)} KB, threshold ${POP_THRESHOLD})`);
if (bytes > 250 * 1024) {
    console.warn('WARNING: over ~250KB — consider raising POP_THRESHOLD and rerunning.');
}
