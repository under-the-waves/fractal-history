import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

// Schema support for anchor reuse (one anchor shared across several tree positions).
// See: project knowledge/Anchor_Reuse_and_Navigation_Spec_v2.md
//
//   tree_positions.is_canonical  -- when an anchor sits at >1 position, exactly ONE is the
//                                   canonical/primary home. Used for the default breadcrumb on a
//                                   path-less arrival and for getAncestorPath's single chain.
//   anchors.is_datable_event     -- only bounded datable events are eligible for reuse (geography
//   anchors.event_start_year     -- and ongoing processes are excluded). The own-extent used by the
//   anchors.event_end_year          matching rule: same event identity + same own dates + geography.
async function migrate() {
    console.log('Adding anchor-reuse columns...');

    await sql`
        ALTER TABLE tree_positions
        ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN NOT NULL DEFAULT true
    `;

    await sql`ALTER TABLE anchors ADD COLUMN IF NOT EXISTS is_datable_event BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE anchors ADD COLUMN IF NOT EXISTS event_start_year INTEGER`;
    await sql`ALTER TABLE anchors ADD COLUMN IF NOT EXISTS event_end_year INTEGER`;

    // Fast lookup for the reuse check: candidate events sharing a name + overlapping extent.
    await sql`
        CREATE INDEX IF NOT EXISTS idx_anchors_event_match
            ON anchors(lower(trim(title)), event_start_year, event_end_year)
            WHERE is_datable_event
    `;

    console.log('Done. Every existing position is canonical by default; no anchor is yet a datable event.');
}

migrate().catch((e) => { console.error(e); process.exit(1); });
