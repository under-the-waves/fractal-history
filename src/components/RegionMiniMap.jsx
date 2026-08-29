import { useState, useEffect } from 'react';
import cca2ToCcn3 from '../data/cca2ToCcn3.json';

// Breadth-C accent colour (matches getBreadthColor('C') in treeStructure.js) for member fill.
const MEMBER_FILL = '#e67e22';
const MEMBER_STROKE = '#a85d16';
const CONTEXT_FILL = '#e4e6e8';
const CONTEXT_STROKE = '#c7cbcf';

// TopoJSON country ids and world-countries' ccn3 are both meant to be 3-digit ISO 3166-1
// numeric codes, but treat them defensively as strings that may or may not be zero-padded
// so a mismatch on either side (a bare "4" vs "004") still resolves to the same key.
function normaliseId(id) {
    const s = String(id);
    const stripped = s.replace(/^0+(?=\d)/, '');
    return stripped === '' ? '0' : stripped;
}

// A small inline world/region map highlighting a C-breadth anchor's member countries. The
// TopoJSON country outlines and d3-geo projection are heavy and rarely needed (most anchors
// aren't geographic), so they're dynamically imported here rather than bundled up front — this
// component should only ever be reached via React.lazy or an equivalent dynamic import.
function RegionMiniMap({ memberCodes, contextCodes, width = 260 }) {
    const [world, setWorld] = useState(null); // { features, geoNaturalEarth1, geoPath }
    const [failed, setFailed] = useState(false);

    // Subdivision codes (e.g. 'FR-IDF') have no country-level geometry at this resolution.
    const hasSubdivision = (memberCodes || []).some(c => c.includes('-'));

    useEffect(() => {
        if (hasSubdivision) return;
        let cancelled = false;
        (async () => {
            try {
                const [topojson, atlas, d3geo] = await Promise.all([
                    import('topojson-client'),
                    import('world-atlas/countries-110m.json'),
                    import('d3-geo')
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
            } catch (err) {
                console.error('Failed to load region map data:', err);
                if (!cancelled) setFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, [hasSubdivision]);

    if (hasSubdivision || failed) return null;
    if (!world) {
        return <div className="region-mini-map-loading" style={{ width, height: 150 }}>Loading map…</div>;
    }

    const toIds = (codes) => new Set(
        (codes || []).map(c => cca2ToCcn3[c]).filter(Boolean).map(normaliseId)
    );
    const memberIds = toIds(memberCodes);
    // The "context" is the parent's whole universe of children (e.g. all of Eurasia's
    // countries), so the map frames the region the user is browsing rather than the world.
    // Fall back to the member set, then to every country, if no context is available.
    const contextIds = (contextCodes && contextCodes.length) ? toIds(contextCodes) : memberIds;

    const contextFeatures = world.features.filter(f => contextIds.has(normaliseId(f.id)));
    const fitFeatures = contextFeatures.length > 0
        ? contextFeatures
        : world.features.filter(f => memberIds.has(normaliseId(f.id)));
    const fitCollection = {
        type: 'FeatureCollection',
        features: fitFeatures.length > 0 ? fitFeatures : world.features
    };

    const padding = 8;
    const projection = world.geoNaturalEarth1();
    // Rotate the projection so the region sits at its centre BEFORE fitting. Without this, a
    // region crossing the antimeridian (Eurasia via Russia) has a bounding box spanning the whole
    // globe, and the fit shrinks it to world width. Rotation moves the projection seam to the
    // opposite side of the planet, making the region contiguous in projected space.
    const [centroidLon] = world.geoCentroid(fitCollection);
    if (Number.isFinite(centroidLon)) projection.rotate([-centroidLon, 0]);
    // Fit to the card's width, then let the map's height follow the region's real aspect ratio
    // (clamped) instead of letterboxing a wide region inside a fixed-height frame.
    projection.fitWidth(width - 2 * padding, fitCollection);
    const bounds = world.geoPath(projection).bounds(fitCollection);
    const fittedHeight = Math.min(Math.max(bounds[1][1] - bounds[0][1] + 2 * padding, 100), 220);
    projection.fitExtent([[padding, padding], [width - padding, fittedHeight - padding]], fitCollection);
    const path = world.geoPath(projection);

    return (
        <svg width={width} height={fittedHeight} viewBox={`0 0 ${width} ${fittedHeight}`} className="region-mini-map">
            {world.features.map(f => {
                const id = normaliseId(f.id);
                const isMember = memberIds.has(id);
                const isContext = contextIds.has(id);
                // Countries outside both the member set and the parent's context are omitted
                // entirely rather than drawn, so the map reads as "this region within its parent".
                if (!isMember && !isContext) return null;
                return (
                    <path
                        key={f.id}
                        d={path(f)}
                        fill={isMember ? MEMBER_FILL : CONTEXT_FILL}
                        stroke={isMember ? MEMBER_STROKE : CONTEXT_STROKE}
                        strokeWidth={isMember ? 0.75 : 0.5}
                    />
                );
            })}
        </svg>
    );
}

export default RegionMiniMap;
