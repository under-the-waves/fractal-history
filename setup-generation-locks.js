// One-off, idempotent setup for the generation mutex table used by api/generate-anchors.js.
// Run once against each environment's database: `node setup-generation-locks.js`.
//
// The table is a row-based mutex that serialises concurrent generation of the SAME (parent, breadth),
// so two requests can never both write a set of children under one parent. A session-level Postgres
// advisory lock cannot do this here: the app connects through Neon's transaction-mode pooler, which
// does not pin a session to one backend. A unique-key row with stale-steal is pooler-safe.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);

await sql`
    CREATE TABLE IF NOT EXISTS generation_locks (
        lock_key    text PRIMARY KEY,
        acquired_at timestamptz NOT NULL DEFAULT now()
    )
`;

const [{ count }] = await sql`SELECT count(*)::int AS count FROM generation_locks`;
console.log(`generation_locks ready (currently ${count} held lock row(s)).`);
