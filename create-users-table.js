import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function createUsersTable() {
    console.log('Creating users table...');

    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id)
    `;

    console.log('Users table created successfully.');
}

createUsersTable().catch(console.error);
