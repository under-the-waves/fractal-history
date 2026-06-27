// Marking engine for the generative-learning prototype.
// Grades a learner's own written narrative against a verified fact base + the sub-anchor rubric.
// Lives in lib/ (backend helper, NOT counted toward the Vercel function cap). The prompt is
// prompts/_marking-pass.md.
//
// Per-anchor fact base: Emergence of Life uses its hand-authored markdown (richer, with explicit
// misconceptions); other anchors derive their fact base from the generated study cards in the learn
// registry (src/data/learnData.js). The rubric is always the anchor's sub-anchor titles.
//
// PROTOTYPE SCOPE: served locally via prototype/mark.js. Productionizing means a real endpoint
// (which needs consolidation under the 12-function cap — see CLAUDE.md).

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { getLearnData } from '../src/data/learnData.js';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_ANCHOR = '1A-E8F2G';
const DEFAULT_BREADTH = 'A';

// Anchor+breadth keys with a hand-authored fact base file (richer than the generated cards).
// Others derive their fact base from the generated study cards.
const FACT_BASE_FILES = {
  '1A-E8F2G:A': 'prototype/emergence-of-life-facts.md',
};

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

// Serialise one card group's layers into verified facts (headline/what/how) and disputed notes (debates).
function factsFromCards(facts) {
  const verified = [], disputed = [];
  for (const f of facts || []) {
    if (f.headline) verified.push(f.headline);
    (f.what || []).forEach(b => verified.push(b));
    (f.how || []).forEach(b => verified.push(b));
    (f.debates || []).forEach(b => disputed.push(b));
  }
  let out = 'Verified facts:\n' + verified.map(v => `- ${v}`).join('\n');
  if (disputed.length) {
    out += '\n\nDisputed / open (defensible, NOT errors):\n' + disputed.map(d => `- ${d}`).join('\n');
  }
  return out;
}

// Build a grading fact base from an anchor's study cards (for anchors without a hand-authored file).
function buildFactBaseFromCards(data) {
  const sections = [];
  if (data.prelude) {
    sections.push(`## Setting the scene — ${data.prelude.title}\n${factsFromCards(data.prelude.facts)}`);
  }
  data.subAnchors.forEach((sa, i) => {
    sections.push(`## Sub-anchor ${i + 1} — ${sa.title}\n${factsFromCards(sa.facts)}`);
  });
  return `# Verified fact base — ${data.title} (derived from the study fact cards)\n\n` +
    `Scope: ${data.scope}\n\n${sections.join('\n\n')}`;
}

export async function markNarrative(narrative, { anchorId = DEFAULT_ANCHOR, breadth = DEFAULT_BREADTH, model = DEFAULT_MODEL } = {}) {
  const data = getLearnData(anchorId, breadth);
  if (!data) throw new Error(`No study data for anchor ${anchorId} breadth ${breadth}`);

  const rubric = data.subAnchors.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  const fileRel = FACT_BASE_FILES[`${anchorId}:${breadth}`];
  const factBase = fileRel
    ? fs.readFileSync(path.join(process.cwd(), fileRel), 'utf-8')
    : buildFactBaseFromCards(data);

  const tpl = fs.readFileSync(path.join(process.cwd(), 'prompts', '_marking-pass.md'), 'utf-8');
  const prompt = tpl
    .replace(/\{\{factBase\}\}/g, () => factBase)
    .replace(/\{\{rubric\}\}/g, () => rubric)
    .replace(/\{\{narrative\}\}/g, () => narrative);

  const resp = await getClient().messages.create({
    model, max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJson(resp.content[0].text);
}
