// One-off generator: builds src/data/cca2ToCcn3.json, a cca2 -> ccn3 lookup used by
// RegionMiniMap to match our country codes (cca2) against the world-atlas TopoJSON,
// which identifies countries by numeric ISO 3166-1 code (ccn3). Re-run this if
// world-countries is upgraded and country codes change.
//
// Usage: node scripts/generate-cca2-ccn3.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import countries from 'world-countries';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'data', 'cca2ToCcn3.json');

const map = {};
for (const country of countries) {
    // Skip entries without a cca2 or ccn3 (e.g. Kosovo, XK, has no assigned ccn3).
    if (!country.cca2 || !country.ccn3) continue;
    map[country.cca2] = country.ccn3;
}

const sorted = Object.fromEntries(Object.keys(map).sort().map(k => [k, map[k]]));

writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Wrote ${Object.keys(sorted).length} cca2 -> ccn3 mappings to ${outPath}`);
