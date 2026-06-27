// One-off seed for learn_content from the prototype's static study-data modules. Run AFTER
// create-learn-content-table.js. Idempotent (storeLearnContent upserts on (anchor_id, breadth)).
//
//   node seed-learn-content.js
//
// Seeds three entries:
//   - Emergence of Life  1A-E8F2G:A  — hand-authored fact base (prototype/emergence-of-life-facts.md)
//   - World War I        2A-XKOOC:A  — fact base derived from the generated cards
//   - World War I        2A-XKOOC:B  — fact base derived from the generated cards
// See: project knowledge/Learn_Build_Plan.md (Phase 1).

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { EMERGENCE_FACTS } = await import('./src/data/emergenceFacts.js');
const ww1A = (await import('./src/data/learn/2A-XKOOC-A.js')).default;
const ww1B = (await import('./src/data/learn/2A-XKOOC-B.js')).default;
const { storeLearnContent, buildFactBaseFromCards } = await import('./lib/learnContent.js');

const entries = [
    {
        anchorId: '1A-E8F2G',
        breadth: 'A',
        data: EMERGENCE_FACTS,
        factBaseFile: 'prototype/emergence-of-life-facts.md',
    },
    { anchorId: '2A-XKOOC', breadth: 'A', data: ww1A },
    { anchorId: '2A-XKOOC', breadth: 'B', data: ww1B },
];

for (const e of entries) {
    const d = e.data;
    const factBase = e.factBaseFile
        ? fs.readFileSync(path.join(process.cwd(), e.factBaseFile), 'utf-8')
        : buildFactBaseFromCards({ title: d.title, scope: d.scope, prelude: d.prelude, subAnchors: d.subAnchors });

    await storeLearnContent({
        anchorId: e.anchorId,
        breadth: e.breadth,
        title: d.title,
        scope: d.scope || '',
        prelude: d.prelude || null,
        subAnchors: d.subAnchors || [],
        factBase,
        rubric: (d.subAnchors || []).map(sa => sa.title),
        sources: [],
        modelMeta: { seededFrom: e.factBaseFile || 'static cards module' },
    });
    console.log(`✓ Seeded ${e.anchorId}:${e.breadth} — ${d.title} (${(d.subAnchors || []).length} sub-anchors)`);
}

console.log('\n✅ learn_content seeded.');
process.exit(0);
