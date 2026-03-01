import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

console.log('Creating anchor_generation_metadata table...\n');

try {
    await sql`
        CREATE TABLE IF NOT EXISTS anchor_generation_metadata (
            id SERIAL PRIMARY KEY,
            parent_anchor_id VARCHAR(50) NOT NULL,
            breadth CHAR(1) NOT NULL,
            candidates JSONB NOT NULL,
            final_selection JSONB NOT NULL,
            selection_reasoning TEXT,
            raw_response TEXT,
            generated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(parent_anchor_id, breadth)
        )
    `;
    console.log('Table created successfully!');

    // Verify the table exists
    const result = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'anchor_generation_metadata'
        ORDER BY ordinal_position
    `;

    console.log('\nTable structure:');
    result.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type}`);
    });

} catch (error) {
    console.error('Error creating table:', error);
}
