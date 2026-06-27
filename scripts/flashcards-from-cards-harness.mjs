// Prototype: generate flashcards from the FACT CARDS (not the narrative).
// Source = each child sub-anchor's headline + "what happened" bullets ONLY (no how-we-know / debates
// / story; prelude is study-only and excluded). Tests the child anchors: 5 cores (one headline per
// child) + a pool the 3 optional personal slots are picked from. Reuses the REAL dedup + core
// selection from api/generate-flashcards.js so this reflects the production logic.
//
// Offline. No DB writes. Usage: node scripts/flashcards-from-cards-harness.mjs

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { EMERGENCE_FACTS } = await import('../src/data/emergenceFacts.js');
const { normaliseQuestions, selectCores } = await import('../api/generate-flashcards.js');

const HAIKU = 'claude-haiku-4-5-20251001';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const children = EMERGENCE_FACTS.subAnchors;
const childTitles = children.map(c => c.title);

// Build the per-sub-anchor source from headline + what-happened bullets only.
function childSource(sa) {
  const lines = [];
  sa.facts.forEach(f => {
    lines.push(`- ${f.headline}${f.when ? ` (${f.when})` : ''}`);
    (f.what || []).forEach(b => lines.push(`  · ${b}`));
  });
  return lines.join('\n');
}
const factsBlock = children.map(sa => `### ${sa.title}\n${childSource(sa)}`).join('\n\n');

const content = `Generate flashcards that test a learner on the SUB-TOPICS (child anchors) of a history topic. Use ONLY the facts given for each sub-topic below — nothing else.

**Topic:** ${EMERGENCE_FACTS.title}
**Sub-topics:**
${childTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For EACH sub-topic, write exactly 3 cards drawn from its facts, each testing a DIFFERENT fact. Tag each with "group": "sub:<exact sub-topic title>".
- The FIRST card of each sub-topic is its HEADLINE card (tag "headline": true): the single most essential, canonical fact a knowledgeable person names first about this sub-topic. Do NOT use a date or raw number as the answer. The answer must be a SHORT noun phrase (1-5 words). CRITICAL: the answer must name a SUBSTANTIVE detail WITHIN the sub-topic — a mechanism, cause, consequence, or specific named thing — and must NEVER be the sub-topic's own name or the event/process it is named after (e.g. for "Great Oxidation Event" the answer may NOT be "Great Oxidation Event" or "oxidation"; instead pick a real detail such as what the first oxygen reacted with, or what it did to existing life; for "Evolution of Photosynthesis" the answer may NOT be "photosynthesis"). Picking the topic's own name as the answer is a failure. The question must not give away its own answer.
- The other 2 cards must NOT carry "headline" and must test genuinely different facts.
Do NOT write any cards outside these sub-topics. These are analytical (concept) cards: test the key ideas and why they mattered; avoid pure date-memorisation questions.

Flashcard rules (follow strictly):
- ATOMIC: each card tests exactly ONE fact. Never join two facts with "and" or a comma; never answer with a list.
- MINIMAL ANSWER: the answer is the single shortest unique thing asked for — a name, term, place (1-5 words; never a sentence).
- NO SELF-ANSWERING: the answer's key word(s) must not appear in the question in any form.
- QUESTION TYPE MATCHES ANSWER: "who" only for a person, "where" only for a place, "when" only for a date; use "what/which ... is called" for a term.
- CORRECT ORIENTATION: descriptive context in the QUESTION, the hard-to-recall item in the ANSWER.
- GROUNDED: both question and answer must be supported only by the facts above. Use no outside knowledge.
- Plain wording. Never use "not X; it was Y" or "rather than X".

REVERSIBLE CARDS: add "reverse" only when the card links TWO short specific things that each uniquely identify the other (e.g. event <-> its short name), and the reverse answer is a DIFFERENT string from the forward answer. Otherwise omit "reverse".

Return JSON only:
{"questions":[
  {"group":"sub:Exact Sub-topic Title","headline":true,"question":"...","answer":"...","reverse":{"question":"...","answer":"..."}},
  {"group":"sub:Exact Sub-topic Title","question":"...","answer":"..."}
]}

Facts per sub-topic:
${factsBlock}`;

console.error(`\n>>> Flashcards from FACT CARDS | ${EMERGENCE_FACTS.title} | ${children.length} sub-topics (Haiku)\n`);

const t = Date.now();
const completion = await anthropic.messages.create({
  model: HAIKU, max_tokens: 6000,
  system: 'You are creating flashcard questions for a history education app. Respond with valid JSON only.',
  messages: [{ role: 'user', content }],
});
const raw = completion.content[0].text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
const data = JSON.parse(raw);

let questions = normaliseQuestions(data.questions);
selectCores(questions, childTitles);

// Deterministic guard: a core's answer must not echo its sub-topic's own name (circular card).
// If it does, swap in a non-core card from the same group whose answer doesn't echo the title.
// (Belongs in selectCores in the real generate-flashcards.js.)
const normTok = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
function answerEchoesTitle(ans, group) {
  const title = normTok(group.replace(/^sub:/, ''));
  const a = normTok(ans);
  return a.length >= 3 && title.includes(a);
}
let swaps = 0;
for (const title of childTitles) {
  const g = `sub:${title}`;
  const coreIdx = questions.findIndex(q => q.core && q.group === g);
  if (coreIdx === -1 || !answerEchoesTitle(questions[coreIdx].answer, g)) continue;
  const altIdx = questions.findIndex(q => !q.core && q.group === g && !answerEchoesTitle(q.answer, g));
  if (altIdx !== -1) { questions[coreIdx].core = false; questions[altIdx].core = true; swaps++; }
}
const secs = Math.round((Date.now() - t) / 100) / 10;

// ---- output ----
function printCard(q, n) {
  const rev = q.reverse ? `\n      ↔ reverse: ${q.reverse.question}  →  ${q.reverse.answer}` : '';
  console.log(`  ${n}. [${q.group.replace(/^sub:/, '')}]\n      Q: ${q.question}\n      A: ${q.answer}${rev}`);
}

console.log('===== CORE CARDS (5, one per child sub-anchor — these are scored) =====\n');
questions.filter(q => q.core).forEach((q, i) => printCard(q, i + 1));

console.log('\n===== OPTIONAL POOL (non-core; the 3 personal slots are chosen from these) =====\n');
questions.filter(q => !q.core).forEach((q, i) => printCard(q, i + 1));

const cores = questions.filter(q => q.core);
const coverage = childTitles.filter(t => cores.some(q => q.group === `sub:${t}`));
const u = completion.usage;
const cost = (u.input_tokens / 1e6) * 1 + (u.output_tokens / 1e6) * 5;
console.log('\n===== REPORT =====');
console.log(`Cores: ${cores.length} | one per child: ${coverage.length}/${childTitles.length} children covered | title-echo swaps: ${swaps}`);
console.log(`Pool (optional): ${questions.filter(q => !q.core).length} cards`);
console.log(`Haiku: ${u.input_tokens} in + ${u.output_tokens} out, ~$${cost.toFixed(4)} | ${secs}s`);
process.exit(0);
