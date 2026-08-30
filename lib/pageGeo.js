// Resolves the "where" for a learning page (narrative reading or write-your-own) so the frontend
// can render a small atlas map above the page content. Given a root-first ancestor chain (as
// returned by getAncestorPath, which already includes the current anchor as its last element —
// see lib/db.js), find the nearest C-breadth (geographic) ancestor and resolve its member
// countries the same way the tree hover cards do (lib/geography.js:resolveMemberCodes).

import { getLevel, resolveMemberCodes } from './geography.js';

export function resolvePageGeo(ancestors) {
    if (!Array.isArray(ancestors)) return null;

    let geoAnchor = null;
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        if (a && a.breadth === 'C') { geoAnchor = a; break; }
    }
    if (!geoAnchor) return null;

    const codes = geoAnchor.region_codes;
    if (!Array.isArray(codes) || codes.length === 0) return null;

    // Cosmic geography (e.g. "Gondwana", the Moon) has no modern political map to draw.
    if (codes.some((c) => c === 'COSMIC' || getLevel(c) === 'cosmic')) return null;

    const memberCodes = resolveMemberCodes(codes);
    if (memberCodes.length === 0) return null;

    return { title: geoAnchor.title, memberCodes };
}
