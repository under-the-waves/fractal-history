import { neon } from '@neondatabase/serverless';
import { expandToCountries, getName, getLevel, getArea } from '../lib/geography.js';

const sql = neon(process.env.DATABASE_URL);

// Attach a `members` list (country/subdivision code + display name) to every C-breadth
// (geographic) anchor, so the frontend can show which countries a region contains without
// a second round trip. Legacy anchors stored a region/subregion name in region_codes
// (pre country-grouping) and need expanding down to countries; current anchors already
// store cca2 / ISO 3166-2 codes directly. Anything else (A/B anchors, cosmic anchors, or
// anchors with no region_codes) is left untouched.
function withMembers(rows) {
    return rows.map(row => {
        const codes = row.region_codes;
        if (row.breadth !== 'C' || !Array.isArray(codes) || codes.length === 0 ||
            codes.some(c => c === 'COSMIC' || getLevel(c) === 'cosmic')) {
            return row;
        }
        const isLegacy = codes.some(c => {
            const lvl = getLevel(c);
            return lvl === 'region' || lvl === 'subregion';
        });
        // Legacy expansion comes back in taxonomy order (subregion by subregion), which is
        // meaningless to a reader; sort it largest-country-first so the card's preview leads with
        // the region's significant members. Modern anchors keep their stored order — the
        // generation model already names significant countries first.
        const memberCodes = isLegacy
            ? [...expandToCountries(codes)].sort((a, b) => getArea(b) - getArea(a))
            : codes;
        return {
            ...row,
            members: memberCodes.map(c => ({ code: c, name: getName(c) }))
        };
    });
}

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, breadth } = req.query;

        // If no parentId provided, return root
        if (!parentId) {
            const root = await sql`
        SELECT a.id, a.title, a.scope, a.region_codes, tp.level, tp.breadth, tp.position
        FROM anchors a
        LEFT JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE a.id = '0-ROOT'
        LIMIT 1
      `;

            return res.status(200).json({
                success: true,
                anchors: withMembers(root)
            });
        }

        // Get children of specified parent and breadth. A parent anchor may sit at more than one
        // tree position once anchors are reused, so gather children under ANY of its positions
        // (lazy shared-by-anchor rendering) rather than one arbitrary position. On a plain tree the
        // parent has a single position, so this returns exactly the same rows as before.
        const children = await sql`
      SELECT a.id, a.title, a.scope, a.region_codes, tp.level, tp.breadth, tp.position, tp.parent_position_id
      FROM anchors a
      JOIN tree_positions tp ON a.id = tp.anchor_id
      WHERE tp.parent_position_id IN (
        SELECT position_id FROM tree_positions WHERE anchor_id = ${parentId}
      )
      AND tp.breadth = ${breadth || 'A'}
      ORDER BY tp.position ASC
    `;

        return res.status(200).json({
            success: true,
            count: children.length,
            parentId,
            breadth: breadth || 'A',
            anchors: withMembers(children)
        });

    } catch (error) {
        console.error('Error fetching tree data:', error);
        return res.status(500).json({
            error: 'Failed to fetch tree data',
            details: error.message
        });
    }
}