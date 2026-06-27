// Nightly forgetting-curve decay, run by GitHub Actions (see .github/workflows/decay-scores.yml),
// NOT by a Vercel function. It was moved off Vercel so the project stays under the 12-serverless-
// function cap (the learn pipeline needs the freed slot for api/learn.js). It does exactly what the
// old api/cron-decay-scores.js did: rebuild every active user's score cache from CURRENT (now-decayed)
// retention, so mastery scores fall over time when cards are not reviewed.
//
// Why this is needed: applyReviewDelta only ever RAISES a score (on a review/mark). The decay half of
// the model lives entirely in recomputeUserScores, which has to be driven on a schedule.
// See lib/scoring.js + project knowledge/Scoring_Engine_Design.md.
//
// Run locally:  node scripts/decay-scores.mjs   (reads DATABASE_URL from .env.local)
// In CI:        DATABASE_URL is provided as a secret env var (no .env.local present).

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { recomputeUserScores } from '../lib/scoring.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Provide it via .env.local (local) or a CI secret.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const startedAt = Date.now();

  // Active users = anyone with scored cards (cores or personal slots) OR a stored write-mark; this is
  // exactly the set recomputeUserScores reads from, so users with nothing to score are skipped.
  const users = await sql`
    SELECT user_id FROM flashcards WHERE is_core OR is_personal_slot
    UNION
    SELECT user_id FROM learn_marks
  `;

  let recomputed = 0;
  const failures = [];
  for (const { user_id } of users) {
    try {
      await recomputeUserScores(user_id);
      recomputed++;
    } catch (e) {
      failures.push(user_id);
      console.error(`Score decay failed for user ${user_id}:`, e.message);
    }
  }

  const ms = Date.now() - startedAt;
  console.log(`Score decay: recomputed ${recomputed}/${users.length} users, ${failures.length} failed, ${ms}ms`);
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error('Score decay run failed:', e);
  process.exit(1);
});
