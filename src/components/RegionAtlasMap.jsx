import { useState, useEffect } from 'react';
import cca2ToCcn3 from '../data/cca2ToCcn3.json';
import { formatTitleNumbers } from '../utils/formatTitleNumbers';

// Breadth-C accent colour (matches getBreadthColor('C') in treeStructure.js and RegionMiniMap's
// MEMBER_FILL) for the member-country fill.
const MEMBER_FILL = '#e67e22';
const MEMBER_STROKE = '#a85d16';
const CONTEXT_FILL = '#e4e6e8';
const CONTEXT_STROKE = '#c7cbcf';

// Fraction of the frame kept as breathing room around the member countries, so neighbouring,
// non-member countries remain visible as context — this is an atlas plate, not a silhouette
// cut-out. Applied by insetting the fit extent, which keeps the region centred; scaling the
// projection after fitting does NOT (the scale pivots on the projection's origin, which sits at
// the equator and shifted Europe clean off its frame).
const CONTEXT_MARGIN = 0.07;

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 420;
const PADDING = 10;

const MAX_CITIES = 10;

// Approximate glyph widths (px per character) for the two label styles — SVG text can't be
// measured before render, so collision boxes use these estimates. Slightly generous on purpose:
// a few px of dead space beats two labels touching.
const COUNTRY_LABEL_CHAR_W = 6.8;
const COUNTRY_LABEL_FONT = 11;
const CITY_LABEL_CHAR_W = 5.8;
const CITY_LABEL_FONT = 10;
const LABEL_PAD = 2;

// Vertical offsets a country label may try, in order, when its centroid position collides with an
// already-placed label. A country's name can sit anywhere inside its territory; a city's cannot.
const COUNTRY_LABEL_NUDGES = [0, 16, -16, 30];

// Below this projected area (px², from d3's geoPath.area) a member country's outline is too small
// to carry a name label legibly, so the label is skipped rather than overlapping its neighbours.
const LABEL_AREA_THRESHOLD = 70;

// TopoJSON country ids and cca2ToCcn3's ccn3 values are both meant to be 3-digit ISO 3166-1
// numeric codes, but treat them defensively as strings that may or may not be zero-padded (as
// RegionMiniMap does) so a bare "4" vs "004" still resolves to the same key.
function normaliseId(id) {
    const s = String(id);
    const stripped = s.replace(/^0+(?=\d)/, '');
    return stripped === '' ? '0' : stripped;
}

// Subdivision-coded members (e.g. 'FR-IDF') have no boundary geometry of their own at country-atlas
// resolution, so they stand in for their parent country on the map.
function toCountryCode(code) {
    return code.includes('-') ? code.split('-')[0] : code;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Collision boxes: labels are rectangles (estimated from text length), not points — "Beijing"
// reaches ~40px right of its dot, so a centre-distance test lets long labels overlap.
function cityLabelBox(x, y, name, side = 'right') {
    const textW = name.length * CITY_LABEL_CHAR_W;
    switch (side) {
        case 'left': return { x0: x - 5 - textW, x1: x + 3, y0: y - CITY_LABEL_FONT * 0.7, y1: y + CITY_LABEL_FONT * 0.6 };
        case 'below': return { x0: x - textW / 2, x1: x + textW / 2, y0: y + 4, y1: y + 4 + CITY_LABEL_FONT * 1.2 };
        case 'above': return { x0: x - textW / 2, x1: x + textW / 2, y0: y - 5 - CITY_LABEL_FONT * 1.2, y1: y - 5 };
        default: return { x0: x - 3, x1: x + 5 + textW, y0: y - CITY_LABEL_FONT * 0.7, y1: y + CITY_LABEL_FONT * 0.6 };
    }
}

// Text attributes for each city-label side, relative to the dot.
const CITY_LABEL_SIDES = {
    right: { dx: 5, dy: 3, anchor: 'start' },
    left: { dx: -5, dy: 3, anchor: 'end' },
    below: { dx: 0, dy: 13, anchor: 'middle' },
    above: { dx: 0, dy: -8, anchor: 'middle' },
};

function countryLabelBox(x, y, name) {
    const half = (name.length * COUNTRY_LABEL_CHAR_W) / 2;
    return { x0: x - half, x1: x + half, y0: y - COUNTRY_LABEL_FONT * 0.8, y1: y + COUNTRY_LABEL_FONT * 0.4 };
}

function boxesOverlap(a, b) {
    return a.x0 - LABEL_PAD < b.x1 && a.x1 + LABEL_PAD > b.x0 && a.y0 - LABEL_PAD < b.y1 && a.y1 + LABEL_PAD > b.y0;
}

// The largest ring of a (possibly multi-part) country, as its own single-Polygon feature. Used
// both for label placement (an archipelago's label sits on its principal landmass, not an
// empty-ocean average) and for framing (France's fit must be metropolitan France, not a bounding
// box stretched to French Guiana and the Caribbean). Areas are measured on the sphere (geoArea),
// so this works before the projection is fitted; a ring wound the wrong way would report the
// complement of the sphere, hence the min() guard.
function largestPolygon(feature, geoArea) {
    const geom = feature.geometry;
    if (!geom) return null;
    if (geom.type === 'Polygon') return feature;
    if (geom.type === 'MultiPolygon') {
        let best = null;
        let bestArea = -1;
        for (const coordinates of geom.coordinates) {
            const part = { type: 'Feature', geometry: { type: 'Polygon', coordinates } };
            const raw = geoArea(part);
            const area = Math.min(raw, 4 * Math.PI - raw);
            if (area > bestArea) { bestArea = area; best = part; }
        }
        return best;
    }
    return null;
}

// A page-top atlas plate for a learning page's geographic scope: modern country borders, member
// countries highlighted, neighbouring countries for context, and labelled capitals/major cities.
// Heavier resolution and a different technique mix than RegionMiniMap (the tree's hover-card map),
// so it's a separate component — see RegionMiniMap.jsx for the shared antimeridian-rotation trick
// this reuses. Dynamically imported (world-atlas 50m + cities.json are both non-trivial), so this
// should only ever be reached via React.lazy or an equivalent dynamic import.
function RegionAtlasMap({ memberCodes, title, places, width = 640 }) {
    const [world, setWorld] = useState(null); // { features, geoNaturalEarth1, geoPath, geoCentroid }
    const [cities, setCities] = useState(null);
    const [failed, setFailed] = useState(false);

    const hasMembers = Array.isArray(memberCodes) && memberCodes.length > 0;

    useEffect(() => {
        if (!hasMembers) return;
        let cancelled = false;
        (async () => {
            try {
                const [topojson, atlas, d3geo, citiesModule] = await Promise.all([
                    import('topojson-client'),
                    import('world-atlas/countries-50m.json'),
                    import('d3-geo'),
                    import('../data/cities.json')
                ]);
                if (cancelled) return;
                const topology = atlas.default || atlas;
                const collection = topojson.feature(topology, topology.objects.countries);
                setWorld({
                    features: collection.features,
                    geoNaturalEarth1: d3geo.geoNaturalEarth1,
                    geoPath: d3geo.geoPath,
                    geoCentroid: d3geo.geoCentroid,
                    geoArea: d3geo.geoArea
                });
                setCities(citiesModule.default || citiesModule);
            } catch (err) {
                console.error('Failed to load atlas map data:', err);
                if (!cancelled) setFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, [hasMembers]);

    if (!hasMembers || failed) return null;
    if (!world || !cities) {
        const loadingHeight = clamp(width * 0.5, MIN_HEIGHT, MAX_HEIGHT);
        return (
            <div className="region-atlas-map">
                <div className="region-atlas-map-loading" style={{ width, maxWidth: '100%', height: loadingHeight }}>
                    Loading map…
                </div>
            </div>
        );
    }

    const memberCountryCodes = new Set(memberCodes.map(toCountryCode));
    const memberIds = new Set(
        [...memberCountryCodes].map(c => cca2ToCcn3[c]).filter(Boolean).map(normaliseId)
    );

    const memberFeatures = world.features.filter(f => memberIds.has(normaliseId(f.id)));
    if (memberFeatures.length === 0) return null; // none of the members have geometry at this resolution

    // Frame on each member's principal landmass only — every part is still DRAWN, but far-flung
    // overseas territories must not stretch the fit (France otherwise pulls the frame across the
    // Atlantic to French Guiana, shrinking Europe to a corner).
    const mainlands = memberFeatures
        .map(f => ({ f, part: largestPolygon(f, world.geoArea) }))
        .filter(e => e.part);
    const fitCollection = { type: 'FeatureCollection', features: mainlands.map(e => e.part) };

    const projection = world.geoNaturalEarth1();
    // Rotate so the region sits at the projection's centre BEFORE fitting — otherwise a region that
    // crosses the antimeridian (e.g. one spanning far-eastern Russia) has a bounding box spanning the
    // whole globe and gets fit down to world width (see RegionMiniMap.jsx for the same fix).
    const [centroidLon] = world.geoCentroid(fitCollection);
    if (Number.isFinite(centroidLon)) projection.rotate([-centroidLon, 0]);

    // Fit tightly to the members first, sizing the frame's height off their real aspect ratio...
    projection.fitWidth(width - 2 * PADDING, fitCollection);
    const path = world.geoPath(projection);
    const bounds = path.bounds(fitCollection);
    const fittedHeight = clamp(bounds[1][1] - bounds[0][1] + 2 * PADDING, MIN_HEIGHT, MAX_HEIGHT);
    // ...then fit into an extent inset by the context margin, so neighbouring countries show as
    // a band of context around the members and the region stays centred.
    const mx = width * CONTEXT_MARGIN;
    const my = fittedHeight * CONTEXT_MARGIN;
    projection.fitExtent(
        [[PADDING + mx, PADDING + my], [width - PADDING - mx, fittedHeight - PADDING - my]],
        fitCollection
    );

    // Label placement, rectangle-collision-checked throughout. Cities go first — a city label is
    // pinned to its dot and cannot move, while a country name can sit anywhere in its territory,
    // so country labels yield and nudge rather than crowding out Tokyo or Seoul.
    const placedBoxes = [];
    const placeIfFree = (box) => {
        if (placedBoxes.some(b => boxesOverlap(b, box))) return false;
        placedBoxes.push(box);
        return true;
    };

    // Label slots go first to places the fact base actually mentions (content-derived, passed in
    // by the page), then to generic picks whose quota scales with the map's scope: a
    // single-country plate carries its major cities, a small group shows capitals only, and a
    // continental plate shows none — generic city labels at that zoom are decoration that
    // competes with the map's real job of showing which countries are in scope.
    const factPlaces = (places || []).filter(p => memberCountryCodes.has(p.c));
    const factPlaceKeys = new Set(factPlaces.map(p => `${p.n}|${p.c}`));
    const genericQuota = memberCountryCodes.size === 1 ? MAX_CITIES
        : memberCountryCodes.size <= 6 ? 6
        : 0;
    const generic = cities
        .filter(c => memberCountryCodes.has(c.c)
            && !factPlaceKeys.has(`${c.n}|${c.c}`)
            && (memberCountryCodes.size === 1 || c.cap))
        // Population-ranked with a boost for capitals: major capitals lead, but a tiny capital
        // (Dili) does not outrank a giant non-capital (Shanghai).
        .sort((a, b) => (b.p * (b.cap ? 4 : 1)) - (a.p * (a.cap ? 4 : 1)))
        .slice(0, genericQuota);
    const candidates = [...factPlaces, ...generic];

    const placedCities = [];
    for (const c of candidates) {
        if (placedCities.length >= MAX_CITIES) break;
        const projected = projection([c.lon, c.lat]);
        if (!projected || !projected.every(Number.isFinite)) continue;
        const [x, y] = projected;
        if (x < 0 || x > width || y < 0 || y > fittedHeight) continue; // outside the viewport
        // Try the label right of the dot, then left, below, above — Seoul's dot otherwise sits
        // level with Beijing's and loses both horizontal positions.
        const side = ['right', 'left', 'below', 'above'].find(s => placeIfFree(cityLabelBox(x, y, c.n, s)));
        if (!side) continue;
        placedCities.push({ ...c, x, y, side });
    }

    // Country labels: largest countries first, at the principal landmass's centroid, trying a few
    // vertical nudges before giving up.
    const countryLabels = [];
    const labelled = mainlands
        .map(e => ({ ...e, area: Math.abs(path.area(e.f)) }))
        .filter(e => e.area >= LABEL_AREA_THRESHOLD)
        .sort((a, b) => b.area - a.area);
    for (const { f, part } of labelled) {
        const centroid = path.centroid(part);
        if (!centroid.every(Number.isFinite)) continue;
        const name = f.properties?.name || '';
        for (const dy of COUNTRY_LABEL_NUDGES) {
            const [x, y] = [centroid[0], centroid[1] + dy];
            if (y < COUNTRY_LABEL_FONT || y > fittedHeight - 4) continue;
            if (placeIfFree(countryLabelBox(x, y, name))) {
                countryLabels.push({ id: f.id, name, x, y });
                break;
            }
        }
    }

    return (
        <div className="region-atlas-map">
            <svg
                width={width}
                height={fittedHeight}
                viewBox={`0 0 ${width} ${fittedHeight}`}
                style={{ maxWidth: '100%', height: 'auto' }}
                className="region-atlas-map-svg"
            >
                {world.features.map((f, i) => {
                    const isMember = memberIds.has(normaliseId(f.id));
                    return (
                        <path
                            key={`${f.id}-${i}`}
                            d={path(f)}
                            fill={isMember ? MEMBER_FILL : CONTEXT_FILL}
                            stroke={isMember ? MEMBER_STROKE : CONTEXT_STROKE}
                            strokeWidth={isMember ? 0.75 : 0.5}
                        />
                    );
                })}

                {countryLabels.map((l, i) => (
                    <text
                        key={`country-${l.id}-${i}`}
                        x={l.x}
                        y={l.y}
                        textAnchor="middle"
                        className="region-atlas-map-country-label"
                    >
                        {l.name}
                    </text>
                ))}

                {placedCities.map((c, i) => (
                    <g key={`city-${c.n}-${c.c}-${i}`}>
                        <circle cx={c.x} cy={c.y} r={c.cap ? 3 : 2.5} className="region-atlas-map-city-dot" />
                        <text
                            x={c.x + CITY_LABEL_SIDES[c.side].dx}
                            y={c.y + CITY_LABEL_SIDES[c.side].dy}
                            textAnchor={CITY_LABEL_SIDES[c.side].anchor}
                            className="region-atlas-map-city-label"
                        >
                            {c.n}
                        </text>
                    </g>
                ))}
            </svg>
            <p className="region-atlas-map-caption">Where: {formatTitleNumbers(title)}</p>
        </div>
    );
}

export default RegionAtlasMap;
