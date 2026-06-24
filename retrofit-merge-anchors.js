import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Retrofit: merge a duplicate "away" anchor into a kept "keep" anchor so a repeated concept becomes
// one shared anchor (one score). The away anchor's tree position is repointed at the keep anchor and
// marked non-canonical; the now-unreferenced away anchor row is deleted. See:
//   project knowledge/Anchor_Reuse_and_Navigation_Spec_v2.md  +  memory fractal_anchor_reuse_progress
//
// Only merges where the away anchor is SAFE to delete are included here: 0 narratives, 0 flashcards,
// 0 scores, 0 children (so it parents no generation metadata and its position has no descendants).
// Industrial Revolution is deliberately EXCLUDED — both copies have children with semantic (not
// exact-title) overlap, which is a content-curation decision pending the user's call.
//
// DRY-RUN by default. Pass --execute to apply (writes a JSON backup of every affected row first).
const EXECUTE = process.argv.includes('--execute');

const MERGES = [
    { keep: '2A-XKOOC', away: '3A-FESJE', label: 'WW1: World War I <- World War One' },
    { keep: '2A-ZXA2P', away: '3A-IGMBP', label: 'WW2: World War II <- World War Two' },
];

async function safetyCheck(away) {
    const [pos, kids, cards, narr, scores] = await Promise.all([
        sql`SELECT position_id, level, breadth, is_canonical FROM tree_positions WHERE anchor_id = ${away}`,
        sql`SELECT count(*) n FROM tree_positions WHERE parent_position_id IN (SELECT position_id FROM tree_positions WHERE anchor_id = ${away})`,
        sql`SELECT count(*) n FROM flashcards WHERE anchor_id = ${away}`,
        sql`SELECT count(*) n FROM narratives WHERE anchor_id = ${away}`,
        sql`SELECT count(*) n FROM user_topic_scores WHERE anchor_id = ${away}`,
    ]);
    return {
        positions: pos,
        children: Number(kids[0].n),
        cards: Number(cards[0].n),
        narratives: Number(narr[0].n),
        scores: Number(scores[0].n),
    };
}

const backup = { ranAt: new Date().toISOString(), merges: [] };
let blocked = false;

for (const m of MERGES) {
    const chk = await safetyCheck(m.away);
    const safe = chk.children === 0 && chk.cards === 0 && chk.narratives === 0 && chk.scores === 0;
    console.log(`\n${m.label}`);
    console.log(`  away ${m.away}: positions=${chk.positions.length} children=${chk.children} cards=${chk.cards} narratives=${chk.narratives} scores=${chk.scores}  -> ${safe ? 'SAFE' : 'BLOCKED'}`);
    for (const p of chk.positions) {
        console.log(`    position ${p.position_id} (L${p.level}${p.breadth}) will repoint to ${m.keep}, is_canonical -> false`);
    }
    console.log(`    anchor ${m.away} will be DELETED; ${m.keep} keeps its canonical position`);
    if (!safe) { blocked = true; continue; }

    backup.merges.push({ ...m, awayAnchor: (await sql`SELECT * FROM anchors WHERE id = ${m.away}`)[0], awayPositions: chk.positions });

    if (EXECUTE) {
        await sql.transaction([
            sql`UPDATE tree_positions SET anchor_id = ${m.keep}, is_canonical = false WHERE anchor_id = ${m.away}`,
            sql`DELETE FROM anchors WHERE id = ${m.away}`,
        ]);
        console.log('    EXECUTED.');
    }
}

if (blocked) { console.log('\nOne or more merges were BLOCKED by the safety check; nothing risky was attempted.'); }

if (EXECUTE && !blocked) {
    const file = `backup-retrofit-${backup.ranAt.replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`\nBackup of deleted anchors + repointed positions written to ${file}`);

    console.log('\n=== verification ===');
    for (const m of MERGES) {
        const gone = (await sql`SELECT count(*) n FROM anchors WHERE id = ${m.away}`)[0].n;
        const positions = await sql`SELECT position_id, is_canonical FROM tree_positions WHERE anchor_id = ${m.keep} ORDER BY is_canonical DESC`;
        const canon = positions.filter(p => p.is_canonical).length;
        const kids = (await sql`SELECT count(*) n FROM tree_positions WHERE parent_position_id IN (SELECT position_id FROM tree_positions WHERE anchor_id = ${m.keep})`)[0].n;
        console.log(`  ${m.keep}: away-deleted=${gone === '0' ? 'yes' : 'NO'} positions=${positions.length} canonical=${canon} children=${kids}`);
    }
} else if (!EXECUTE) {
    console.log('\nDRY-RUN only. Re-run with --execute to apply.');
}
