// Read-only marking-engine prototype harness.
// Tests whether an LLM can reliably mark a learner's own written narrative against a verified
// fact base + sub-anchor rubric, WITHOUT false positives on defensible interpretation.
// Makes no DB writes. Mirrors the pattern of scripts/narrative-harness.mjs.
//
// Usage:
//   node scripts/marking-harness.mjs
//   node scripts/marking-harness.mjs --model=claude-opus-4-8
//   node scripts/marking-harness.mjs --only=02-planted-error --raw
//
// Flags:
//   --model=<id>        marking model (default claude-opus-4-8)
//   --facts=<file>      fact base (default prototype/emergence-of-life-facts.md)
//   --prompt=<file>     marking prompt (default prompts/_marking-pass.md)
//   --dir=<dir>         test-narrative dir (default prototype/test-narratives)
//   --only=<name>       run a single narrative by filename stem (e.g. 01-strong)
//   --raw               print the model's raw text instead of the parsed summary

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// Load .env.local for ANTHROPIC_API_KEY
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// The deterministic scorer lives in lib/marking.js so the harness and production agree.
const { scoreFromModel } = await import('../lib/marking.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const model = args.model || 'claude-opus-4-8';
const factsFile = args.facts || 'prototype/emergence-of-life-facts.md';
const promptFile = args.prompt || 'prompts/_marking-pass.md';
const dir = args.dir || 'prototype/test-narratives';

// The sub-anchor rubric for this anchor (matches the fact base headings).
const RUBRIC_LIST = [
  'Origin of Self-Replicating Molecules',
  'Evolution of Photosynthesis',
  'Great Oxidation Event',
  'Endosymbiosis and Eukaryotic Cells',
  'First Multicellular Organisms',
];
const RUBRIC = RUBRIC_LIST.map((s, i) => `${i + 1}. ${s}`).join('\n');

const factBase = fs.readFileSync(factsFile, 'utf-8');
const promptTpl = fs.readFileSync(promptFile, 'utf-8');

let files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
if (args.only) files = files.filter(f => f.startsWith(args.only) || f === `${args.only}.md`);
if (files.length === 0) { console.error('No test narratives found in', dir); process.exit(1); }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseJson(text) {
  const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function populate(t, d) {
  return t.replace(/\{\{factBase\}\}/g, () => d.factBase)
    .replace(/\{\{rubric\}\}/g, () => d.rubric)
    .replace(/\{\{narrative\}\}/g, () => d.narrative);
}

function list(label, arr, fmt) {
  if (!arr || arr.length === 0) { console.log(`  ${label}: none`); return; }
  console.log(`  ${label}: ${arr.length}`);
  arr.forEach(x => console.log(`    - ${fmt(x)}`));
}

console.error(`\n>>> marking model: ${model} | facts: ${factsFile} | ${files.length} narrative(s)\n`);

for (const file of files) {
  const narrative = fs.readFileSync(path.join(dir, file), 'utf-8').trim();
  const prompt = populate(promptTpl, { factBase, rubric: RUBRIC, narrative });

  const resp = await anthropic.messages.create({
    model, max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content[0].text;

  console.log('\n' + '='.repeat(70));
  console.log(file);
  console.log('='.repeat(70));
  if (args.raw) { console.log(text); continue; }

  let raw;
  try { raw = parseJson(text); } catch { console.log('COULD NOT PARSE:\n', text); continue; }
  const r = scoreFromModel(RUBRIC_LIST, raw);

  console.log(`  MARK: ${r.mark?.score}/100  |  coverage ${r.coverage?.covered}/${r.coverage?.total}  |  coherent: ${r.coherent}`);
  console.log(`  rationale: ${r.mark?.rationale}`);
  list('parts', r.subAnchorScores, p => `[${p.credit}] ${p.subAnchor} — ${p.note}`);
  list('factual errors', r.factualErrors, e => `"${e.quote}" — ${e.problem}`);
  list('misconceptions', r.misconceptions, m => `"${m.quote}" — ${m.problem}`);
  list('interpretation notes (should NOT be errors)', r.interpretationNotes, n => `"${n.quote}" — ${n.note}`);
}

console.log('\n' + '-'.repeat(70));
console.log('Expected: 01 clean, high | 02 catches 3 errors (Harvard, 1.2Gya GOE, mito from photosynthetic)');
console.log('          03 Great Oxidation Event -> none/partial | 04 NO factual errors, all in interp notes');
process.exit(0);
