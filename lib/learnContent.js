// Central module for the Learn pipeline's per-anchor study content (backend helper, NOT a Vercel
// function). Owns: reading/writing the learn_content table, deriving the marking fact base from the
// fact cards, and the on-demand generation orchestration (research -> cards -> store). The api/learn.js
// endpoint and lib/marking.js both go through here. See: project knowledge/Learn_Build_Plan.md.

import { query } from './db.js';
import { researchAnchor } from './research.js';
import { generateCards, CARDS_MODEL } from './generateCards.js';

const RESEARCH_MODEL = 'claude-haiku-4-5-20251001';

// --- fact-base derivation (moved here from lib/marking.js so seed, generation, and marking share it) ---

// Serialise one card group's layers into: verified facts (headline/what/how), the mainstream causal
// account (why — the standard explanation, NOT hard ground-truth), and disputed notes (debates).
function factsFromCards(facts) {
    const verified = [], causal = [], disputed = [];
    for (const f of facts || []) {
        if (f.headline) verified.push(f.headline);
        (f.what || []).forEach(b => verified.push(b));
        (f.how || []).forEach(b => verified.push(b));
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
    const { anchorId, breadth, title, scope, prelude, subAnchors, factBase, rubric, sources, modelMeta } = content;
    const rows = await query(
        `INSERT INTO learn_content
            (anchor_id, breadth, title, scope, prelude, sub_anchors, fact_base, rubric, sources, model_meta, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (anchor_id, breadth) DO UPDATE SET
            title = $3, scope = $4, prelude = $5, sub_anchors = $6, fact_base = $7,
            rubric = $8, sources = $9, model_meta = $10, generated_at = NOW()
         RETURNING *`,
        [
            anchorId, breadth, title, scope || '',
            prelude ? JSON.stringify(prelude) : null,
            JSON.stringify(subAnchors || []),
            factBase || '',
            JSON.stringify(rubric || []),
            JSON.stringify(sources || []),
            modelMeta ? JSON.stringify(modelMeta) : null,
        ]
    );
    return mapRow(rows[0]);
}

async function getAnchorDetails(anchorId) {
    const rows = await query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]);
    return rows[0] || null;
}

async function getChildAnchors(parentId, breadth) {
    return await query(
        `SELECT a.id, a.title, a.scope, tp.position
         FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id = (
             SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1
         )
         AND tp.breadth = $2
         ORDER BY tp.position ASC`,
        [parentId, breadth]
    );
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

    const research = await researchAnchor(anchor, children);
    const cards = await generateCards(anchor, children, research);

    const data = {
        anchorId,
        breadth,
        title: anchor.title,
        scope: anchor.scope || '',
        prelude: cards.prelude,
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
