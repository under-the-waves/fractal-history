// Concept-dedup retrofit. Finds existing duplicate A-concept groups, uses the Sonnet 5 scope
// adjudicator (same as generation) to keep only the true same-scope duplicates, then folds each
// duplicate into a canonical anchor by re-pointing its tree position(s). SAFETY-GATED: only merges
// EMPTY STUBS (no flashcards / learn marks / scores / children) — anything carrying user data or a
// subtree is skipped and reported, never auto-merged. Default is a dry-run; pass --apply to write,
// which runs inside a single transaction (all-or-nothing).
import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { getGlobalConceptAnchors, normaliseConceptTitle, getAncestorPath, getPool } from './lib/db.js';

const APPLY = process.argv.includes('--apply');
const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function sameScope(title, pathA, pathB) {
    const prompt = `Two anchors in a history knowledge tree share a title. Decide whether they are the SAME topic (one shared anchor) or DIFFERENT.

Concept: "${title}"

Placement A: ${pathA}
Placement B: ${pathB}

Judge ONLY whether the ancestry of either placement RESTRICTS the concept to a proper sub-part of itself:
- A geographic ancestor (a specific place) restricts it only if the concept normally happened in more places than that ancestor covers.
- A temporal ancestor (a specific date range) restricts it only if the concept normally spanned more time than that ancestor's window.
- Analytical/thematic ancestors — anything that is not a specific date range or a specific place — NEVER restrict the concept; ignore them.
- A broad date range or place that fully contains the concept does NOT restrict it. A placement directly under the root spans the concept's full extent. Neither counts as narrowing.
It makes no difference that one placement is framed geographically and the other temporally, nor that one is deeper in the tree.

Answer SAME if both placements encompass the concept's full normal extent in time and place. Answer DIFFERENT only if one placement clearly narrows it in time or geography. When unsure, answer DIFFERENT. Reason in one or two sentences, then end with a line exactly: VERDICT: SAME  or  VERDICT: DIFFERENT`;
    const c = await anthropic.messages.create({
        model: 'claude-sonnet-5', max_tokens: 300, thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt }],
    });
    const t = (c.content[0]?.text || '').toUpperCase();
    const m = t.match(/VERDICT:\s*(SAME|DIFFERENT)/);
    return m ? m[1] === 'SAME' : false;
}

const fmt = (chain) => chain.map(a => a.title).join(' > ');
const num = async (q) => Number((await q)[0].c);

async function anchorStats(id) {
    const sub = await sql`
        WITH RECURSIVE down AS (
            SELECT position_id FROM tree_positions WHERE anchor_id = ${id}
            UNION ALL SELECT c.position_id FROM down JOIN tree_positions c ON c.parent_position_id = down.position_id
        ) SELECT COUNT(DISTINCT position_id)::int AS c FROM down`;
    return {
        subtree: Number(sub[0].c),
        flashcards: await num(sql`SELECT COUNT(*)::int c FROM flashcards WHERE anchor_id=${id}`),
        marks: await num(sql`SELECT COUNT(*)::int c FROM learn_marks WHERE anchor_id=${id}`),
        scores: await num(sql`SELECT COUNT(*)::int c FROM user_topic_scores WHERE anchor_id=${id}`),
    };
}
const isStub = (s) => s.subtree <= 1 && s.flashcards === 0 && s.marks === 0 && s.scores === 0;

// Build the merge plan: [{ canonical, stubs: [ids] }]
const anchors = await getGlobalConceptAnchors();
const groups = new Map();
for (const a of anchors) {
    const key = normaliseConceptTitle(a.title);
    if (key) (groups.get(key) || groups.set(key, []).get(key)).push(a);
}
const plan = [];
let keptVariants = 0, skippedData = 0;
for (const group of [...groups.values()].filter(g => g.length > 1)) {
    const info = [];
    for (const a of group) info.push({ ...a, path: fmt(await getAncestorPath(a.id)), s: await anchorStats(a.id) });
    info.sort((x, y) => (y.s.subtree + y.s.flashcards * 100 + y.s.scores * 100) - (x.s.subtree + x.s.flashcards * 100 + x.s.scores * 100));
    const canonical = info[0];
    const stubs = [];
    for (const m of info.slice(1)) {
        if (!(await sameScope(canonical.title, canonical.path, m.path))) { keptVariants++; continue; }
        if (!isStub(m.s)) { console.log(`  SKIP (has data/children): ${m.id} "${m.title}"  subtree=${m.s.subtree} cards=${m.s.flashcards} marks=${m.s.marks} scores=${m.s.scores}`); skippedData++; continue; }
        stubs.push(m.id);
    }
    if (stubs.length) { plan.push({ canonical: canonical.id, title: canonical.title, stubs }); console.log(`MERGE "${canonical.title}"  canonical ${canonical.id}  <-  ${stubs.join(', ')}`); }
}
console.log(`\nPlan: ${plan.length} groups, ${plan.reduce((n, g) => n + g.stubs.length, 0)} stubs to fold; ${keptVariants} scope-variants kept; ${skippedData} skipped (had data).`);

if (!APPLY) { console.log('\nDRY RUN — no changes written. Re-run with --apply to execute.'); process.exit(0); }

// APPLY: re-point each stub's position(s) onto the canonical, inside one transaction.
const client = await getPool().connect();
let repointed = 0, deletedRedundant = 0;
try {
    await client.query('BEGIN');
    for (const g of plan) {
        const parentsRes = await client.query('SELECT DISTINCT parent_position_id FROM tree_positions WHERE anchor_id=$1', [g.canonical]);
        const canonParents = new Set(parentsRes.rows.map(r => r.parent_position_id));
        for (const stub of g.stubs) {
            const posRes = await client.query('SELECT position_id, parent_position_id FROM tree_positions WHERE anchor_id=$1', [stub]);
            for (const p of posRes.rows) {
                const cyc = p.parent_position_id ? await client.query(
                    `WITH RECURSIVE up AS (
                        SELECT position_id, anchor_id, parent_position_id FROM tree_positions WHERE position_id=$1
                        UNION ALL SELECT t.position_id, t.anchor_id, t.parent_position_id FROM up JOIN tree_positions t ON t.position_id=up.parent_position_id
                     ) SELECT 1 FROM up WHERE anchor_id=$2 LIMIT 1`, [p.parent_position_id, g.canonical]) : { rows: [] };
                if (canonParents.has(p.parent_position_id) || cyc.rows.length) {
                    await client.query('DELETE FROM tree_positions WHERE position_id=$1', [p.position_id]);
                    deletedRedundant++;
                } else {
                    await client.query('UPDATE tree_positions SET anchor_id=$1, is_canonical=false WHERE position_id=$2', [g.canonical, p.position_id]);
                    canonParents.add(p.parent_position_id);
                    repointed++;
                }
            }
        }
    }
    await client.query('COMMIT');
    console.log(`\n✅ APPLIED: ${repointed} positions re-pointed to canonical, ${deletedRedundant} redundant positions removed. ${plan.reduce((n, g) => n + g.stubs.length, 0)} stub anchors are now orphaned (no positions, invisible in the app).`);
} catch (e) {
    await client.query('ROLLBACK');
    console.error('\n❌ ROLLED BACK — no changes written:', e.message);
    process.exit(1);
} finally {
    client.release();
}
