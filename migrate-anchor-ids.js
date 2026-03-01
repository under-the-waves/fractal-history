import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Migrating anchor IDs from short format to full format...\n');

// Mapping of old short IDs to new full IDs
const level1AMigrations = [
    { oldId: 'E8F2G', newId: '1A-E8F2G' },
    { oldId: 'Q7R2S', newId: '1A-Q7R2S' },
    { oldId: 'G7H2K', newId: '1A-G7H2K' },
    { oldId: 'C9D3E', newId: '1A-C9D3E' },
];

const level1BMigrations = [
    { oldId: 'T4U9V', newId: '1B-T4U9V' },
    { oldId: 'W1X6Y', newId: '1B-W1X6Y' },
    { oldId: 'Z5A3B', newId: '1B-Z5A3B' },
    { oldId: 'C8D2E', newId: '1B-C8D2E' },
    { oldId: 'F7G4H', newId: '1B-F7G4H' },
];

const allMigrations = [...level1AMigrations, ...level1BMigrations];

try {
    // First, check what exists in the database
    console.log('Checking current state of database...\n');

    const existingAnchors = await sql`
        SELECT id, title FROM anchors
        WHERE id IN (${sql(allMigrations.map(m => m.oldId))})
        OR id IN (${sql(allMigrations.map(m => m.newId))})
    `;
    console.log('Existing anchors:', existingAnchors.map(a => `${a.id}: ${a.title}`).join('\n'));

    // IMPORTANT: Must update tree_positions FIRST due to foreign key constraint
    // We need to temporarily drop the constraint, update both tables, then re-add it

    console.log('\n--- Dropping foreign key constraints temporarily ---');
    try {
        await sql`ALTER TABLE tree_positions DROP CONSTRAINT IF EXISTS tree_positions_anchor_id_fkey`;
        console.log('✅ Dropped tree_positions foreign key constraint');
    } catch (e) {
        console.log('⚠️  Could not drop tree_positions constraint:', e.message);
    }
    try {
        await sql`ALTER TABLE narratives DROP CONSTRAINT IF EXISTS narratives_anchor_id_fkey`;
        console.log('✅ Dropped narratives foreign key constraint');
    } catch (e) {
        console.log('⚠️  Could not drop narratives constraint:', e.message);
    }

    // Migrate anchors table
    console.log('\n--- Migrating anchors table ---');
    for (const { oldId, newId } of allMigrations) {
        const result = await sql`
            UPDATE anchors SET id = ${newId} WHERE id = ${oldId}
        `;
        if (result.count > 0) {
            console.log(`✅ anchors: ${oldId} → ${newId}`);
        } else {
            // Check if new ID already exists
            const exists = await sql`SELECT id FROM anchors WHERE id = ${newId}`;
            if (exists.length > 0) {
                console.log(`⏭️  anchors: ${newId} already exists`);
            } else {
                console.log(`⚠️  anchors: ${oldId} not found`);
            }
        }
    }

    // Migrate tree_positions.anchor_id
    console.log('\n--- Migrating tree_positions.anchor_id ---');
    for (const { oldId, newId } of allMigrations) {
        const result = await sql`
            UPDATE tree_positions SET anchor_id = ${newId} WHERE anchor_id = ${oldId}
        `;
        if (result.count > 0) {
            console.log(`✅ tree_positions.anchor_id: ${oldId} → ${newId}`);
        } else {
            // Check if new ID already exists
            const exists = await sql`SELECT anchor_id FROM tree_positions WHERE anchor_id = ${newId}`;
            if (exists.length > 0) {
                console.log(`⏭️  tree_positions.anchor_id: ${newId} already exists`);
            } else {
                console.log(`⚠️  tree_positions.anchor_id: ${oldId} not found`);
            }
        }
    }

    // Migrate narratives.anchor_id
    console.log('\n--- Migrating narratives.anchor_id ---');
    for (const { oldId, newId } of allMigrations) {
        try {
            const result = await sql`
                UPDATE narratives SET anchor_id = ${newId} WHERE anchor_id = ${oldId}
            `;
            if (result.count > 0) {
                console.log(`✅ narratives.anchor_id: ${oldId} → ${newId}`);
            }
        } catch (e) {
            // Table might not exist
        }
    }

    // Re-add foreign key constraints
    console.log('\n--- Re-adding foreign key constraints ---');
    try {
        await sql`ALTER TABLE tree_positions ADD CONSTRAINT tree_positions_anchor_id_fkey FOREIGN KEY (anchor_id) REFERENCES anchors(id)`;
        console.log('✅ Re-added tree_positions foreign key constraint');
    } catch (e) {
        console.log('⚠️  Could not re-add tree_positions constraint:', e.message);
    }
    try {
        await sql`ALTER TABLE narratives ADD CONSTRAINT narratives_anchor_id_fkey FOREIGN KEY (anchor_id) REFERENCES anchors(id)`;
        console.log('✅ Re-added narratives foreign key constraint');
    } catch (e) {
        console.log('⚠️  Could not re-add narratives constraint:', e.message);
    }

    // Also update anchor_generation_metadata.parent_anchor_id if it exists
    console.log('\n--- Migrating anchor_generation_metadata.parent_anchor_id ---');
    for (const { oldId, newId } of allMigrations) {
        try {
            const result = await sql`
                UPDATE anchor_generation_metadata SET parent_anchor_id = ${newId} WHERE parent_anchor_id = ${oldId}
            `;
            if (result.count > 0) {
                console.log(`✅ metadata.parent_anchor_id: ${oldId} → ${newId}`);
            }
        } catch (e) {
            // Table might not exist or column might not exist
        }
    }

    console.log('\n✅ Migration complete!');

    // Verify the results
    console.log('\n--- Verification ---');
    const verifyAnchors = await sql`
        SELECT id, title FROM anchors
        WHERE id LIKE '1A-%' OR id LIKE '1B-%' OR id = '0-ROOT'
        ORDER BY id
    `;
    console.log('Level 0/1 anchors in database:');
    verifyAnchors.forEach(a => console.log(`  ${a.id}: ${a.title}`));

} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
}
