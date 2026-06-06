// Hierarchical place taxonomy built from `world-countries` and `iso-3166-2`.
//
// Levels (top to bottom):
//   WORLD -> region (6) -> subregion (24) -> country (cca2) -> subdivision (ISO 3166-2)
//
// All lookup structures are built once at module load for O(1) access.

import countries from 'world-countries';
import iso31662 from 'iso-3166-2';

export const WORLD = 'WORLD';

// Sentinel subregion for countries that have no `subregion` field (e.g. the
// Antarctic territories). Keeps them reachable in the hierarchy instead of
// dropping them. Code is derived from the region so it stays unique and stable.
const sentinelSubregion = (region) => `${region} (other)`;

// Internal lookup maps, populated once below.
const levelOf = new Map(); // code -> level string
const nameOf = new Map(); // code -> human-readable name
const childrenOf = new Map(); // code -> sorted array of immediate child codes

function buildTaxonomy() {
  // region -> Set<subregion code>
  const regionSubregions = new Map();
  // subregion code -> Set<cca2>
  const subregionCountries = new Map();

  levelOf.set(WORLD, 'world');
  nameOf.set(WORLD, 'World');

  for (const country of countries) {
    const cca2 = country.cca2;
    if (!cca2) continue;

    const region = country.region;
    // A handful of territories have an empty region in some data sets; guard.
    if (!region) continue;

    // Register region.
    if (!levelOf.has(region)) {
      levelOf.set(region, 'region');
      nameOf.set(region, region);
      regionSubregions.set(region, new Set());
    }

    // Resolve subregion, falling back to a per-region sentinel when missing.
    const subregion = country.subregion || sentinelSubregion(region);
    if (!levelOf.has(subregion)) {
      levelOf.set(subregion, 'subregion');
      nameOf.set(subregion, subregion);
      subregionCountries.set(subregion, new Set());
    }
    regionSubregions.get(region).add(subregion);
    subregionCountries.get(subregion).add(cca2);

    // Register country.
    levelOf.set(cca2, 'country');
    nameOf.set(cca2, country.name?.common || cca2);

    // Resolve ISO 3166-2 subdivisions for this country.
    let subdivisionCodes = [];
    const isoEntry = iso31662.country(cca2);
    if (isoEntry && isoEntry.sub) {
      subdivisionCodes = Object.keys(isoEntry.sub);
      for (const subCode of subdivisionCodes) {
        levelOf.set(subCode, 'subdivision');
        nameOf.set(subCode, isoEntry.sub[subCode]?.name || subCode);
        childrenOf.set(subCode, []);
      }
    }
    childrenOf.set(cca2, subdivisionCodes.sort());
  }

  // WORLD -> regions (sorted).
  childrenOf.set(WORLD, [...regionSubregions.keys()].sort());

  // region -> subregions (sorted).
  for (const [region, subs] of regionSubregions) {
    childrenOf.set(region, [...subs].sort());
  }

  // subregion -> countries (sorted).
  for (const [subregion, ccas] of subregionCountries) {
    childrenOf.set(subregion, [...ccas].sort());
  }
}

buildTaxonomy();

export function getLevel(code) {
  return levelOf.get(code) ?? null;
}

export function getName(code) {
  return nameOf.has(code) ? nameOf.get(code) : code;
}

export function getChildren(code) {
  return childrenOf.get(code) ?? [];
}

export function isValid(code) {
  return getLevel(code) !== null;
}

// Expand a set of codes downward into the candidate places to divide.
//
// World and continent codes are too coarse to be useful regions on their own, so
// the walk keeps descending while any 'world' or 'region' code remains, landing at
// the sub-region level (e.g. the world opens as the 24 sub-regions, not 6
// continents). It stops there rather than over-expanding small branches into
// states: a sub-region opens into its countries, and a single country opens into
// its states/provinces. Expansion never exceeds `max` candidates.
export function expandToCandidates(codes, max = 40) {
  let current = [...new Set(codes)];

  while (true) {
    const hasCoarse = current.some((c) => {
      const lvl = getLevel(c);
      return lvl === 'world' || lvl === 'region';
    });
    // Stop once we are at sub-region level or finer and have something to divide.
    if (!hasCoarse && current.length >= 2) break;

    const next = [];
    for (const code of current) {
      const kids = getChildren(code);
      if (kids.length === 0) next.push(code); // a leaf stays as itself
      else next.push(...kids);
    }
    const unique = [...new Set(next)];

    // Nothing expanded (everything is a leaf): stop.
    if (unique.length === current.length &&
        unique.every((c) => current.includes(c))) {
      break;
    }
    // Next level would exceed the cap: keep the current (coarser) set.
    if (unique.length > max) break;

    current = unique;
  }

  return current;
}
