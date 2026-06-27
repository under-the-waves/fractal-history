// Read-only harness: generate the learner-facing explore/study facts for an anchor FROM THE PROMPT
// (prompts/_explore-facts-prompt.md), so the hand-authored emergenceFacts.js content can be
// reproduced reliably for any anchor. Prints to stdout; never writes the DB. Mirrors
// scripts/narrative-harness.mjs.
//
// Usage:
//   node scripts/explore-facts-harness.mjs --anchor=1A-E8F2G
//   node scripts/explore-facts-harness.mjs --anchor=1A-E8F2G --raw      (print raw JSON)
//   node scripts/explore-facts-harness.mjs --anchor=1A-E8F2G --json     (print pretty JSON only)
//
// Flags: --anchor (required), --breadth=A, --model=claude-opus-4-8,
//        --prompt=prompts/_explore-facts-prompt.md

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

// Load .env.local before importing db
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { query } = await import('../lib/db.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const anchorId = args.anchor;
const breadth = args.breadth || 'A';
const model = args.model || 'claude-opus-4-8';
const promptFile = args.prompt || 'prompts/_explore-facts-prompt.md';
if (!anchorId) { console.error('ERROR: --anchor=<id> required'); process.exit(1); }

const [anchorRows, children] = await Promise.all([
  query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]),
  query(`SELECT a.id, a.title, a.scope FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id = (SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1)
         AND tp.breadth = $2 ORDER BY tp.position ASC`, [anchorId, breadth]),
]);
const anchor = anchorRows[0];
if (!anchor) { console.error('Anchor not found:', anchorId); process.exit(1); }

const subAnchorsText = children
  .map((c, i) => `${i + 1}. ${c.title}${c.scope ? ` — ${c.scope}` : ''}`)
  .join('\n');

const prompt = fs.readFileSync(promptFile, 'utf-8')
  .replace(/\{\{anchorTitle\}\}/g, anchor.title)
  .replace(/\{\{anchorScope\}\}/g, anchor.scope || 'No scope defined')
  .replace(/\{\{subAnchors\}\}/g, subAnchorsText);

console.error(`\n>>> ${anchor.title} | breadth ${breadth} | model ${model}`);
console.error(`>>> sub-anchors: ${children.map(c => c.title).join(' | ')}\n`);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const completion = await anthropic.messages.create({
  model, max_tokens: 8000,
  messages: [{ role: 'user', content: prompt }],
});

let text = completion.content[0].text;
if (args.raw) { console.log(text); process.exit(0); }

let data;
try {
  data = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
} catch (e) {
  console.log('COULD NOT PARSE JSON:\n', text);
  process.exit(1);
}

if (args.json) { console.log(JSON.stringify(data, null, 2)); process.exit(0); }

// Readable dump for quality review
const LAYERS = [['what', 'What happened'], ['how', 'How we know'], ['debates', 'Debates'], ['story', 'Story']];
function printCard(card, indent = '  ') {
  console.log(`${indent}• ${card.headline}`);
  console.log(`${indent}  [${card.when || 'NO DATE'}]`);
  for (const [key, label] of LAYERS) {
    const bullets = card[key] || [];
    if (!bullets.length) continue;
    console.log(`${indent}  ${label}:`);
    bullets.forEach(b => console.log(`${indent}    - ${b}`));
  }
  console.log('');
}

console.log(`===== PRELUDE: ${data.prelude?.title} =====\n`);
(data.prelude?.facts || []).forEach(c => printCard(c));
(data.subAnchors || []).forEach((sa, i) => {
  console.log(`===== ${i + 1}. ${sa.title} =====\n`);
  (sa.facts || []).forEach(c => printCard(c));
});

process.exit(0);
