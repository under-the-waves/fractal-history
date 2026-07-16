// Central module for the Learn pipeline's per-anchor study content (backend helper, NOT a Vercel
// function). Owns: reading/writing the learn_content table, deriving the marking fact base from the
// fact cards, and the on-demand generation orchestration (research -> cards -> store). The api/learn.js
// endpoint and lib/marking.js both go through here. See: project knowledge/Learn_Build_Plan.md.

import { query, getAncestorPath } from './db.js';
import { researchAnchor } from './research.js';
import { generateCards, CARDS_MODEL } from './generateCards.js';
import {
    renderAnalyticalFrame, learnSectionSubject, learnCoverageInstruction,
    temporalCoordinate, geographicCoordinate,
} from './promptLoader.js';
import { nearestAncestorOfBreadth } from '../shared/ancestry.js';

const RESEARCH_MODEL = 'claude-haiku-4-5-20251001';

// --- fact-base derivation (moved here from lib/marking.js so seed, generation, and marking share it) ---

// Serialise one card group's layers into: verified facts (headline/what/how), the mainstream causal
// account (why — the standard explanation, NOT hard ground-truth), and disputed notes (debates).
function factsFromCards(facts) {
    const verified = [], causal = [], disputed = [];
    for (const f of facts || []) {
        if (f.headline) verified.push(f.headline);
        (f.before || []).forEach(b => verified.push(b));
        (f.what || []).forEach(b => verified.push(b));
        (f.how || []).forEach(b => verified.push(b));
        (f.whyItMattered || []).forEach(b => verified.push(b));
        (f.why || []).forEach(b => causal.push(b));
        (f.debates || []).forEach(b => disputed.push(b));
    }
    let out = 'Verified facts:\n' + verified.map(v => `- ${v}`).join('\n');
    if (causal.length) {
        out += '\n\nMainstream causal account (the standard explanation of why — a defensible DIFFERENT cause is NOT an error):\n'
            + causal.map(c => `- ${c}`).join('\n');
    }
    if (disputed.length) {
        out += '\n\nDisputed / open (defensible, NOT errors):\n' + disputed.map(d => `- ${d}`).join('\n');
    }
    return out;
}

// Build a grading fact base from an anchor's study cards (for anchors without a hand-authored file).
export function buildFactBaseFromCards(data) {
    const sections = [];
    if (data.prelude) {
        sections.push(`## Setting the scene — ${data.prelude.title}\n${factsFromCards(data.prelude.facts)}`);
    }
    (data.subAnchors || []).forEach((sa, i) => {
        sections.push(`## Sub-anchor ${i + 1} — ${sa.title}\n${factsFromCards(sa.facts)}`);
    });
    if (data.postlude) {
        sections.push(`## Why it mattered — ${data.postlude.title}\n${factsFromCards(data.postlude.facts)}`);
    }
    return `# Verified fact base — ${data.title} (derived from the study fact cards)\n\n` +
        `Scope: ${data.scope || ''}\n\n${sections.join('\n\n')}`;
}

// --- DB access ---

function mapRow(r) {
    if (!r) return null;
    const parse = (v, fallback) => v == null ? fallback : (typeof v === 'string' ? JSON.parse(v) : v);
    return {
        anchorId: r.anchor_id,
        breadth: r.breadth,
        title: r.title,
        scope: r.scope || '',
        prelude: parse(r.prelude, null),
        postlude: parse(r.postlude, null),
        subAnchors: parse(r.sub_anchors, []),
        factBase: r.fact_base || '',
        rubric: parse(r.rubric, []),
        sources: parse(r.sources, []),
    };
}

/** Read stored learn content for an anchor/breadth, or null if not generated yet. */
export async function getLearnContent(anchorId, breadth = 'A') {
    const rows = await query(
        'SELECT * FROM learn_content WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
        [anchorId, breadth]
    );
    return mapRow(rows[0]);
}

/** Upsert one learn_content row. */
export async function storeLearnContent(content) {
    const { anchorId, breadth, title, scope, prelude, postlude, subAnchors, factBase, rubric, sources, modelMeta } = content;
    const rows = await query(
        `INSERT INTO learn_content
            (anchor_id, breadth, title, scope, prelude, sub_anchors, fact_base, rubric, sources, model_meta, postlude, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (anchor_id, breadth) DO UPDATE SET
            title = $3, scope = $4, prelude = $5, sub_anchors = $6, fact_base = $7,
            rubric = $8, sources = $9, model_meta = $10, postlude = $11, generated_at = NOW()
         RETURNING *`,
        [
            anchorId, breadth, title, scope || '',
            prelude ? JSON.stringify(prelude) : null,
            JSON.stringify(subAnchors || []),
            factBase || '',
            JSON.stringify(rubric || []),
            JSON.stringify(sources || []),
            modelMeta ? JSON.stringify(modelMeta) : null,
            postlude ? JSON.stringify(postlude) : null,
        ]
    );
    return mapRow(rows[0]);
}

async function getAnchorDetails(anchorId) {
    const rows = await query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]);
    return rows[0] || null;
}

async function getChildAnchors(parentId, breadth) {
    // Gather children under ANY of the parent's tree positions (a reused anchor sits at several), to
    // match /api/get-tree. The old `LIMIT 1` picked one arbitrary position, so for a reused anchor it
    // could look under a childless position and wrongly report "no children".
    return await query(
        `SELECT a.id, a.title, a.scope, a.region_codes, tp.position
         FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id IN (
             SELECT position_id FROM tree_positions WHERE anchor_id = $1
         )
         AND tp.breadth = $2
         ORDER BY tp.position ASC`,
        [parentId, breadth]
    );
}

/**
 * Build the framing an anchor's sections must be generated within, for the axis the learner is
 * following (the `breadth` of the children). A temporal (B) or geographic (C) child is a coordinate,
 * not a theme: its content covers the whole window/place under the nearest analytical (A) ancestor,
 * or — when there is no A ancestor, as for a bare era like "Agricultural Civilizations" — everything
 * significant in it. The studied anchor's OWN thematic name/scope is likewise reduced to a coordinate
 * when it is B/C, so it exerts no thematic pull. For a B (temporal) study, `geoScope` additionally
 * bounds the whole window to the nearest geographic (C) ancestor's region (e.g. Oceania), so a B study
 * under a place stays about that place instead of defaulting to whole-world coverage; null when there
 * is no C anchor anywhere in the path. See lib/promptLoader.js for the shared helpers.
 */
async function buildSectionFrame(anchorId, breadth, children) {
    const ancestorPath = await getAncestorPath(anchorId); // root-first, INCLUDING the anchor itself
    const self = ancestorPath[ancestorPath.length - 1] || null;
    const selfBreadth = self ? self.breadth : null;

    // What the parent topic is, shown as context to the section generators. A B/C anchor becomes its
    // coordinate so its descriptive name ("Agricultural Civilizations") does not narrow the sections.
    let anchorTopic, anchorContext;
    if (selfBreadth === 'B') {
        anchorTopic = `the period ${temporalCoordinate(self)}`;
        anchorContext = 'A span of time. Cover what happened in the world across it; it is not a theme.';
    } else if (selfBreadth === 'C') {
        anchorTopic = `the region ${geographicCoordinate(self)}`;
        anchorContext = 'A place. Cover what happened there; it is not a theme.';
    } else {
        anchorTopic = self ? self.title : '';
        anchorContext = (self && self.scope) || '';
    }

    const axis = breadth === 'B' ? 'when' : breadth === 'C' ? 'where' : 'theme';
    const frameText = renderAnalyticalFrame(ancestorPath); // lens for the children (A-ancestors incl. self if A)

    // For a B (temporal) study, the nearest geographic (C) ancestor — INCLUDING the studied anchor
    // itself when it is C — bounds the whole study to that place, e.g. studying Oceania's time
    // windows must stay about Oceania, not broaden to the whole world. nearestAncestorOfBreadth scans
    // from the end of ancestorPath, so it already includes `self`. null when there is no C anchor in
    // the path at all (a pure temporal study, e.g. ROOT:B or a B-anchor studied by B) — unchanged
    // whole-world behaviour. Irrelevant for axis 'where'/'theme' (learnCoverageInstruction ignores it there).
    const geoAncestor = nearestAncestorOfBreadth(ancestorPath, 'C');
    const geoScope = geoAncestor ? geographicCoordinate(geoAncestor) : null;

    // A "before/why-it-mattered" bookend needs a TEMPORAL FRAME: the studied anchor is, or descends
    // from, an A (a change) or B (a period) anchor. A pure place — a C anchor with only geographic/root
    // ancestry — has none, so its cards get no bookends. The nearest frame's end date decides whether an
    // "after" exists (dropped when the window runs to the present). generateCards uses these to place the
    // bookends: topic-level for a B view, per-sub-anchor for an A/C view. See project knowledge/.
    const temporalFrames = ancestorPath.filter(a => a && (a.breadth === 'A' || a.breadth === 'B'));
    const nearestFrame = temporalFrames[temporalFrames.length - 1] || null;
    const hasFrame = temporalFrames.length > 0;
    const frameEndsAtPresent = nearestFrame
        ? /\b(present|today|now|ongoing)\b/i.test(temporalCoordinate(nearestFrame))
        : false;

    return {
        axis,
        anchorTopic,
        anchorContext,
        hasFrame,
        frameEndsAtPresent,
        geoScope,
        coverage: learnCoverageInstruction(axis, frameText, geoScope),
        // per-child coordinate, aligned to `children` order
        subjects: children.map(c => learnSectionSubject(breadth, c)),
    };
}

/**
 * On-demand generation for one anchor/breadth: research (Haiku + Serper) -> cards (Sonnet, hybrid) ->
 * derive the marking fact base from the cards -> store and return. Synchronous (no background worker);
 * the caller shows a loading screen. Cached forever once generated (returns the cached row on re-call).
 * Throws 'ANCHOR_NOT_FOUND' / 'NO_CHILDREN' for the caller to map to HTTP codes.
 */
export async function generateLearnContent(anchorId, breadth = 'A', { force = false } = {}) {
    if (!force) {
        const existing = await getLearnContent(anchorId, breadth);
        if (existing) return existing;
    }

    const [anchor, children] = await Promise.all([
        getAnchorDetails(anchorId),
        getChildAnchors(anchorId, breadth),
    ]);
    if (!anchor) throw new Error('ANCHOR_NOT_FOUND');
    if (!children.length) throw new Error('NO_CHILDREN');

    const frame = await buildSectionFrame(anchorId, breadth, children);
    const research = await researchAnchor(anchor, children, frame);
    const cards = await generateCards(anchor, children, research, frame);

    const data = {
        anchorId,
        breadth,
        title: anchor.title,
        scope: anchor.scope || '',
        prelude: cards.prelude,
        postlude: cards.postlude,
        subAnchors: cards.subAnchors,
    };
    const factBase = buildFactBaseFromCards(data);
    const rubric = cards.subAnchors.map(sa => sa.title);

    return await storeLearnContent({
        ...data,
        factBase,
        rubric,
        sources: research.sources,
        modelMeta: { researchModel: RESEARCH_MODEL, cardsModel: CARDS_MODEL, generatedBy: 'api/learn.js' },
    });
}
