import { useState, useEffect } from 'react';
import cca2ToCcn3 from '../data/cca2ToCcn3.json';

// Breadth-C accent colour (matches getBreadthColor('C') in treeStructure.js and RegionMiniMap's
// MEMBER_FILL) for the member-country fill.
const MEMBER_FILL = '#e67e22';
const MEMBER_STROKE = '#a85d16';
const CONTEXT_FILL = '#e4e6e8';
const CONTEXT_STROKE = '#c7cbcf';

// After fitting the projection tightly to the member countries, scale down by this factor (around
// the same centre) so neighbouring, non-member countries remain visible as context — this is an
// atlas plate, not a silhouette cut-out.
const ZOOM_OUT = 0.8;

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 420;
const PADDING = 10;

const MAX_CITIES = 10;
// Minimum on-screen separation (px, straight-line) between two placed city labels — a simple
// stand-in for real label collision detection, cheap enough to run per-candidate.
const CITY_LABEL_MIN_DISTANCE = 26;

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

// The largest ring of a (possibly multi-part) country, as its own single-Polygon feature, so a
// scattered country (e.g. an archipelago) gets its label centred on its principal landmass rather
// than on an empty-ocean average of every part.
function largestPolygon(feature, path) {
    const geom = feature.geometry;
    if (!geom) return null;
    if (geom.type === 'Polygon') return feature;
    if (geom.type === 'MultiPolygon') {
        let best = null;
        let bestArea = -1;
        for (const coordinates of geom.coordinates) {
            const part = { type: 'Feature', geometry: { type: 'Polygon', coordinates } };
            const area = Math.abs(path.area(part));
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
function RegionAtlasMap({ memberCodes, title, width = 640 }) {
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
                    geoCentroid: d3geo.geoCentroid
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

    const fitCollection = { type: 'FeatureCollection', features: memberFeatures };

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
    projection.fitExtent([[PADDING, PADDING], [width - PADDING, fittedHeight - PADDING]], fitCollection);
    // ...then zoom back out slightly around that same centre so neighbouring countries show up as
    // context instead of the frame being cropped exactly to the member countries' edges.
    projection.scale(projection.scale() * ZOOM_OUT);

    // Country labels: largest countries first, each skipped if it would sit on top of an
    // already-placed label (small neighbours like the two Koreas otherwise collide).
    const countryLabels = [];
    const labelled = [...memberFeatures]
        .map(f => ({ f, area: Math.abs(path.area(f)) }))
        .filter(e => e.area >= LABEL_AREA_THRESHOLD)
        .sort((a, b) => b.area - a.area);
    for (const { f } of labelled) {
        const part = largestPolygon(f, path);
        if (!part) continue;
        const centroid = path.centroid(part);
        if (!centroid.every(Number.isFinite)) continue;
        const [x, y] = centroid;
        if (countryLabels.some(l => Math.hypot(l.x - x, l.y - y) < CITY_LABEL_MIN_DISTANCE)) continue;
        countryLabels.push({ id: f.id, name: f.properties?.name || '', x, y });
    }

    // Cities: candidates are any populated place whose country is a member, ranked capitals-first
    // then by population, thinned to MAX_CITIES with a simple on-screen collision/viewport check.
    const candidates = cities
        .filter(c => memberCountryCodes.has(c.c))
        .sort((a, b) => (b.cap - a.cap) || (b.p - a.p));

    const placedCities = [];
    for (const c of candidates) {
        if (placedCities.length >= MAX_CITIES) break;
        const projected = projection([c.lon, c.lat]);
        if (!projected || !projected.every(Number.isFinite)) continue;
        const [x, y] = projected;
        if (x < 0 || x > width || y < 0 || y > fittedHeight) continue; // outside the viewport
        const tooClose = placedCities.some(p => Math.hypot(p.x - x, p.y - y) < CITY_LABEL_MIN_DISTANCE)
            || countryLabels.some(l => Math.hypot(l.x - x, l.y - y) < CITY_LABEL_MIN_DISTANCE);
        if (tooClose) continue;
        placedCities.push({ ...c, x, y });
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
                            x={c.x + 5}
                            y={c.y + 3}
                            className="region-atlas-map-city-label"
                        >
                            {c.n}
                        </text>
                    </g>
                ))}
            </svg>
            <p className="region-atlas-map-caption">Where: {title}</p>
        </div>
    );
}

export default RegionAtlasMap;
