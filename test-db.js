import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local with absolute path
config({ path: join(__dirname, '.env.local') });

console.log('DATABASE_URL exists?', process.env.DATABASE_URL ? 'YES' : 'NO');

async function testConnection() {
    try {
        console.log('Testing database connection...');

        const sql = neon(process.env.DATABASE_URL);

        const result = await sql`SELECT * FROM anchors WHERE id = 'ROOT'`;

        console.log('✅ Connection successful!');
        console.log('ROOT anchor:', result[0]);

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    }
}

testConnection();