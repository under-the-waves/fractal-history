import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// learn_content: one row per (anchor, breadth). The persisted home of the "Learn" pipeline's study
// fact-cards (prelude + sub_anchors), the verified marking ground-truth (fact_base + rubric), and the
// research provenance (sources, model_meta). Generated on first visit and cached forever, like
// narratives. See: project knowledge/Learn_Build_Plan.md (Phase 1).
async function createLearnContentTable() {
    console.log('Creating learn_content table...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS learn_content (
                id SERIAL PRIMARY KEY,
                anchor_id VARCHAR(50) NOT NULL REFERENCES anchors(id) ON DELETE CASCADE,
                breadth CHAR(1) NOT NULL CHECK (breadth IN ('A', 'B', 'C')),
                title TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT '',
                prelude JSONB,                          -- { title, facts[] } or null
                sub_anchors JSONB NOT NULL DEFAULT '[]',-- [{ title, facts[] }]
                fact_base TEXT NOT NULL DEFAULT '',     -- verified grading ground-truth (markdown)
                rubric JSONB NOT NULL DEFAULT '[]',     -- [sub-anchor title, ...]
                sources JSONB NOT NULL DEFAULT '[]',    -- [url, ...] research provenance
                model_meta JSONB,                       -- { researchModel, cardsModel, generatedBy }
                generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(anchor_id, breadth)
            )
        `;
        console.log('✓ Created learn_content table');

        await sql`
            CREATE INDEX IF NOT EXISTS idx_learn_content_anchor_breadth
            ON learn_content(anchor_id, breadth)
        `;
        console.log('✓ Created index on learn_content(anchor_id, breadth)');
        console.log('\n✅ learn_content table created successfully!');
    } catch (error) {
        console.error('Error creating learn_content table:', error);
        process.exit(1);
    }
}

createLearnContentTable();
