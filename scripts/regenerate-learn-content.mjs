// Regenerate every stored learn_content entry (and its flashcard pool) with the CURRENT prompts and
// pipeline. Run after changing the card prompts or card shape (e.g. adding the "why it happened"
// layer). Upserts on success, so a failure leaves the old row intact. Sequential per anchor (each
// anchor already fans out parallel section calls internally).
//
//   node scripts/regenerate-learn-content.mjs

import { config } from 'dotenv'; config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const { generateLearnContent } = await import('../lib/learnContent.js');
const { generateAndStoreFlashcards } = await import('../api/generate-flashcards.js');

const rows = await sql`SELECT anchor_id, breadth, title FROM learn_content ORDER BY anchor_id, breadth`;
console.log(`Regenerating ${rows.length} learn_content entries...\n`);

let ok = 0;
const failed = [];
for (const { anchor_id, breadth } of rows) {
    const t = Date.now();
    try {
        const c = await generateLearnContent(anchor_id, breadth, { force: true });
        const cards = (c.subAnchors || []).flatMap(sa => sa.facts || []);
        const withWhy = cards.filter(f => (f.why || []).length).length;
        await generateAndStoreFlashcards(anchor_id, breadth);
        console.log(`✓ ${anchor_id}:${breadth} "${c.title}" — ${c.subAnchors.length} sub-anchors, ${cards.length} cards (${withWhy} with a why), ${((Date.now() - t) / 1000).toFixed(0)}s`);
        ok++;
    } catch (e) {
        console.error(`✗ ${anchor_id}:${breadth} FAILED: ${e.message}`);
        failed.push(`${anchor_id}:${breadth}`);
    }
}

console.log(`\nDone: ${ok}/${rows.length} regenerated.${failed.length ? ' Failed: ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
