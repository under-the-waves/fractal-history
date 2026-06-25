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

// ---------------------------------------------------------------------------
// Cosmic geography (hand-curated)
//
// A separate, hand-authored taxonomy for the "Cosmic & Planetary" branch, where
// modern continents are anachronistic. It is NOT connected to the terrestrial
// WORLD tree: cosmic "Earth" covers the young planet and its deep-time geography
// (supercontinents), while the modern continents stay on the normal Level-1 path.
//
// The UNIVERSE node corresponds to the seeded "Cosmic & Planetary" anchor itself;
// dividing it geographically walks this tree. Time periods feed the bracketed
// title convention (e.g. "Gondwana (~550–180 MYA)").
// ---------------------------------------------------------------------------
const timePeriodOf = new Map();

export const COSMIC = {
  UNIVERSE: { name: 'The Universe', timePeriod: '13.8 BYA – present', scope: 'The whole observable cosmos from the Big Bang to today.', children: ['MILKY_WAY', 'BEYOND_MILKY_WAY'] },

  MILKY_WAY: { name: 'The Milky Way', timePeriod: '~13.6 BYA – present', scope: 'Our home galaxy: its assembly from early matter, its hundreds of billions of stars and spiral structure, and the galactic environment that produced the Sun.', children: ['SOLAR_SYSTEM', 'WIDER_MILKY_WAY'] },
  BEYOND_MILKY_WAY: { name: 'Beyond the Milky Way', timePeriod: '~13.8 BYA – present', scope: 'Everything beyond our galaxy: the Local Group, other galaxies, galaxy clusters, and the large-scale structure of the universe, to the extent it is known.', children: [] },

  SOLAR_SYSTEM: { name: 'The Solar System', timePeriod: '~4.6 BYA – present', scope: 'The Sun and everything bound to it — the planets, moons, and small bodies that formed from the solar nebula about 4.6 billion years ago.', children: ['SUN', 'TERRESTRIAL_PLANETS', 'GIANT_PLANETS', 'SMALL_BODIES'] },
  WIDER_MILKY_WAY: { name: 'The Wider Milky Way', timePeriod: '~13.6 BYA – present', scope: 'The galaxy beyond the Solar System: the galactic core, other star systems, nebulae, and the interstellar medium.', children: [] },

  SUN: { name: 'The Sun', timePeriod: '~4.6 BYA – present', scope: 'The star at the centre of the Solar System: its formation, structure, energy output, and life cycle.', children: [] },
  TERRESTRIAL_PLANETS: { name: 'The Terrestrial Planets', timePeriod: '~4.5 BYA – present', scope: 'The four rocky inner planets — Mercury, Venus, Earth, and Mars — that formed close to the Sun.', children: ['MERCURY', 'VENUS', 'EARTH_BODY', 'MARS'] },
  GIANT_PLANETS: { name: 'The Giant Planets', timePeriod: '~4.5 BYA – present', scope: 'The four large outer planets: the gas giants Jupiter and Saturn and the ice giants Uranus and Neptune.', children: ['GAS_GIANTS', 'ICE_GIANTS'] },
  SMALL_BODIES: { name: 'Small Bodies', timePeriod: '~4.6 BYA – present', scope: 'Asteroids, the Kuiper belt, comets, and the distant Oort cloud — leftover debris of the Solar System’s formation.', children: [] },

  MERCURY: { name: 'Mercury', timePeriod: '~4.5 BYA – present', scope: 'The smallest, innermost planet: a cratered, airless world of temperature extremes.', children: [] },
  VENUS: { name: 'Venus', timePeriod: '~4.5 BYA – present', scope: 'Earth’s twin in size, with a runaway greenhouse atmosphere and crushing surface pressure.', children: [] },
  MARS: { name: 'Mars', timePeriod: '~4.5 BYA – present', scope: 'The cold, dry red planet, with evidence of ancient water and the largest volcanoes in the Solar System.', children: [] },
  EARTH_BODY: { name: 'Earth', timePeriod: '~4.5 BYA – present', scope: 'Our home planet: its formation, structure, oceans and atmosphere, and the deep-time geography that preceded the modern continents.', children: ['THE_MOON', 'EARTH_DEEP_TIME'] },

  THE_MOON: { name: 'The Moon', timePeriod: '~4.5 BYA – present', scope: 'Earth’s only natural satellite, formed about 4.5 billion years ago from the debris of a giant impact on the early Earth.', children: [] },
  EARTH_DEEP_TIME: { name: 'Earth’s Deep-Time Geography', timePeriod: '~4.5 BYA – 200 MYA', scope: 'Earth’s changing surface before the modern continents: the earliest crust and the supercontinents that assembled and broke apart over billions of years. The modern continents take over on the normal Level-1 path.', children: ['EARLY_EARTH', 'RODINIA', 'GONDWANA', 'PANGAEA'] },

  EARLY_EARTH: { name: 'Early Earth', timePeriod: 'Hadean & Archean, ~4.5–2.5 BYA', scope: 'Earth’s molten beginnings, the first crust and oceans, and the earliest life, before stable supercontinents.', children: [] },
  RODINIA: { name: 'Rodinia', timePeriod: '~1.1 BYA – 750 MYA', scope: 'A supercontinent that assembled around 1.1 billion years ago and broke apart by roughly 750 million years ago.', children: [] },
  GONDWANA: { name: 'Gondwana', timePeriod: '~550–180 MYA', scope: 'The southern supercontinent — South America, Africa, Arabia, India, Australia, and Antarctica — that later broke into much of the modern southern hemisphere.', children: [] },
  PANGAEA: { name: 'Pangaea', timePeriod: '~335–200 MYA', scope: 'The single global supercontinent whose breakup, beginning ~200 million years ago, started the drift toward the modern continents.', children: [] },

  GAS_GIANTS: { name: 'The Gas Giants', timePeriod: '~4.5 BYA – present', scope: 'Jupiter and Saturn: the two largest planets, made mostly of hydrogen and helium, each with extensive moon systems.', children: ['JUPITER', 'SATURN'] },
  ICE_GIANTS: { name: 'The Ice Giants', timePeriod: '~4.5 BYA – present', scope: 'Uranus and Neptune: the outermost major planets, rich in water, ammonia, and methane ices.', children: ['URANUS', 'NEPTUNE'] },

  JUPITER: { name: 'Jupiter', timePeriod: '~4.5 BYA – present', scope: 'The largest planet, with its Great Red Spot and many moons including the four Galilean satellites.', children: ['IO', 'EUROPA', 'GANYMEDE', 'CALLISTO'] },
  SATURN: { name: 'Saturn', timePeriod: '~4.5 BYA – present', scope: 'The ringed gas giant, with its spectacular ring system and its large moon Titan.', children: ['TITAN', 'ENCELADUS', 'RHEA', 'IAPETUS'] },
  URANUS: { name: 'Uranus', timePeriod: '~4.5 BYA – present', scope: 'The ice giant that orbits tipped on its side, with a faint ring system.', children: ['TITANIA', 'OBERON', 'UMBRIEL', 'ARIEL'] },
  NEPTUNE: { name: 'Neptune', timePeriod: '~4.5 BYA – present', scope: 'The outermost ice giant, with the strongest winds in the Solar System and the moon Triton.', children: ['TRITON'] },

  IO: { name: 'Io', timePeriod: '~4.5 BYA – present', scope: 'The most volcanically active body in the Solar System.', children: [] },
  EUROPA: { name: 'Europa', timePeriod: '~4.5 BYA – present', scope: 'An icy moon of Jupiter with a probable subsurface ocean.', children: [] },
  GANYMEDE: { name: 'Ganymede', timePeriod: '~4.5 BYA – present', scope: 'The largest moon in the Solar System, bigger than Mercury.', children: [] },
  CALLISTO: { name: 'Callisto', timePeriod: '~4.5 BYA – present', scope: 'A heavily cratered, ancient icy moon of Jupiter.', children: [] },
  TITAN: { name: 'Titan', timePeriod: '~4.5 BYA – present', scope: 'Saturn’s largest moon, with a thick atmosphere and lakes of liquid methane.', children: [] },
  ENCELADUS: { name: 'Enceladus', timePeriod: '~4.5 BYA – present', scope: 'A small icy moon of Saturn venting water from a subsurface ocean.', children: [] },
  RHEA: { name: 'Rhea', timePeriod: '~4.5 BYA – present', scope: 'Saturn’s second-largest moon, an icy, cratered world.', children: [] },
  IAPETUS: { name: 'Iapetus', timePeriod: '~4.5 BYA – present', scope: 'A two-toned moon of Saturn, dark on one hemisphere and bright on the other.', children: [] },
  TITANIA: { name: 'Titania', timePeriod: '~4.5 BYA – present', scope: 'The largest moon of Uranus.', children: [] },
  OBERON: { name: 'Oberon', timePeriod: '~4.5 BYA – present', scope: 'A heavily cratered outer moon of Uranus.', children: [] },
  UMBRIEL: { name: 'Umbriel', timePeriod: '~4.5 BYA – present', scope: 'A dark, ancient moon of Uranus.', children: [] },
  ARIEL: { name: 'Ariel', timePeriod: '~4.5 BYA – present', scope: 'The brightest and geologically youngest large moon of Uranus.', children: [] },
  TRITON: { name: 'Triton', timePeriod: '~4.5 BYA – present', scope: 'Neptune’s largest moon, orbiting backwards and likely a captured Kuiper-belt object.', children: [] },
};

(function registerCosmic() {
  for (const [code, node] of Object.entries(COSMIC)) {
    levelOf.set(code, 'cosmic');
    nameOf.set(code, node.name);
    childrenOf.set(code, node.children || []);
    if (node.timePeriod) timePeriodOf.set(code, node.timePeriod);
  }
  // Sentinel for free-text cosmic anchors generated below the seeded scaffold.
  // Marks them as "intentionally cosmic, no fixed place list" — distinct from NULL
  // region_codes (which means an old, ledger-less anchor that may be cleaned up).
  levelOf.set('COSMIC', 'cosmic');
  nameOf.set('COSMIC', 'Cosmic');
  childrenOf.set('COSMIC', []);
})();

// Time period string for a code (e.g. "~550–180 MYA"), or null.
export function getTimePeriod(code) {
  return timePeriodOf.get(code) ?? null;
}

// Title with the bracketed time period when one applies, e.g. "Gondwana (~550–180 MYA)".
export function displayTitle(code) {
  const name = getName(code);
  const tp = timePeriodOf.get(code);
  return tp ? `${name} (${tp})` : name;
}

// ---------------------------------------------------------------------------
// Country-level helpers — for geographic division by COUNTRY GROUPING (the model
// groups countries directly rather than bundling whole UN subregions). See
// project knowledge/Geographic_Country_Grouping_Design.md.
// ---------------------------------------------------------------------------

// Resolve a set of region_codes (WORLD, region/subregion names, or country codes) to the set of
// member country codes (cca2) beneath them. This is the "universe" a node divides over.
export function expandToCountries(codes) {
  const acc = new Set();
  if (!Array.isArray(codes)) return acc;
  const walk = (code) => {
    const lvl = getLevel(code);
    if (lvl === 'country') { acc.add(code); return; }
    if (lvl === 'world' || lvl === 'region' || lvl === 'subregion') {
      for (const child of getChildren(code)) walk(child);
    }
    // subdivision / cosmic / unknown: not a terrestrial country membership — ignore.
  };
  for (const code of codes) walk(code);
  return acc;
}

// Lookup for mapping a model-provided country reference (an ISO code, or a name / alternative
// spelling) back to a cca2. Built once at load.
const _countryLookup = new Map();
for (const c of countries) {
  if (!c.cca2) continue;
  const add = (k) => { const s = k && String(k).trim().toLowerCase(); if (s && !_countryLookup.has(s)) _countryLookup.set(s, c.cca2); };
  add(c.cca2); add(c.cca3);
  add(c.name?.common); add(c.name?.official);
  for (const alt of (c.altSpellings || [])) add(alt);
}
// A few historical / informal names the model is likely to use that world-countries does not list.
for (const [name, cca2] of Object.entries({
  'persia': 'IR', 'burma': 'MM', 'siam': 'TH', 'ceylon': 'LK', 'abyssinia': 'ET',
  'czech republic': 'CZ', 'türkiye': 'TR', 'turkey': 'TR', 'usa': 'US', 'uk': 'GB',
  'britain': 'GB', 'great britain': 'GB', 'south korea': 'KR', 'north korea': 'KP',
  'russia': 'RU', 'ivory coast': 'CI', 'cape verde': 'CV', 'swaziland': 'SZ',
})) if (!_countryLookup.has(name)) _countryLookup.set(name, cca2);

/** Map a model-provided country reference (code / name / alt spelling) to a cca2, or null. */
export function resolveCountry(ref) {
  if (ref === null || ref === undefined) return null;
  return _countryLookup.get(String(ref).trim().toLowerCase()) || null;
}

// Historical states that map to SEVERAL present-day countries. History scopes name these constantly,
// and they have no single cca2. A safety net behind the prompt's "use present-day countries"
// instruction — the model usually decomposes them, but this catches the ones it leaves whole.
const HISTORICAL_STATES = {
  'austria-hungary': ['AT', 'HU', 'CZ', 'SK', 'SI', 'HR', 'BA'],
  'austro-hungarian empire': ['AT', 'HU', 'CZ', 'SK', 'SI', 'HR', 'BA'],
  'ottoman empire': ['TR'],
  'soviet union': ['RU', 'UA', 'BY', 'KZ', 'UZ', 'TM', 'TJ', 'KG', 'GE', 'AM', 'AZ', 'MD', 'LT', 'LV', 'EE'],
  'ussr': ['RU', 'UA', 'BY', 'KZ', 'UZ', 'TM', 'TJ', 'KG', 'GE', 'AM', 'AZ', 'MD', 'LT', 'LV', 'EE'],
  'yugoslavia': ['RS', 'HR', 'SI', 'BA', 'ME', 'MK'],
  'czechoslovakia': ['CZ', 'SK'],
  'gran colombia': ['CO', 'VE', 'EC', 'PA'],
  'british raj': ['IN', 'PK', 'BD', 'MM'],
};

/**
 * Resolve a model-provided reference to one or more present-day country codes. Single modern
 * countries return one; historical multi-country states return several; unrecognised returns [].
 */
export function resolveCountries(ref) {
  if (ref === null || ref === undefined) return [];
  const key = String(ref).trim().toLowerCase();
  if (HISTORICAL_STATES[key]) return [...HISTORICAL_STATES[key]];
  const one = _countryLookup.get(key);
  return one ? [one] : [];
}
