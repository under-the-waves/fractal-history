// Prototype of the proposed on-demand pipeline for an anchor:
//   1. RESEARCH  — Haiku + Serper (filtered to authoritative domains, fetches & reads top pages) -> evidence base + sources
//   2. CARDS     — Opus 4.8, HYBRID grounding (research is the anchor; model may add well-established detail)
//   3. NARRATIVE — Opus 4.8, HYBRID grounding
//   4. VERIFY    — reuse lib/factCheck.js on the narrative (Haiku + Serper) to catch fabrications
// Offline. No DB writes. Reports per-stage wall-clock, tokens, search/fetch counts, estimated cost.
//
// Usage:
//   node scripts/learn-chain-harness.mjs --anchor=1A-E8F2G
//   node scripts/learn-chain-harness.mjs --anchor=1A-E8F2G --evidence   (dump the research base)
//   node scripts/learn-chain-harness.mjs --anchor=1A-E8F2G --no-verify  (skip the fact-check stage)

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { query, getAncestorPath } = await import('../lib/db.js');
const { factCheckNarrative } = await import('../lib/factCheck.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const anchorId = args.anchor;
const breadth = args.breadth || 'A';
if (!anchorId) { console.error('ERROR: --anchor=<id> required'); process.exit(1); }

const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';
const OPUS = 'claude-opus-4-8';
const PRICE = { [HAIKU]: { in: 1, out: 5 }, [SONNET]: { in: 3, out: 15 }, [OPUS]: { in: 15, out: 75 } }; // approx $/M tokens
const NAME = { [HAIKU]: 'Haiku', [SONNET]: 'Sonnet', [OPUS]: 'Opus' };
const SERPER_PER_SEARCH = 0.001;
// --cards-model=sonnet|haiku|opus (default sonnet — the chosen config). Narrative stays on Opus.
const CARDS_MODEL = args['cards-model'] === 'opus' ? OPUS : args['cards-model'] === 'haiku' ? HAIKU : SONNET;

// Low-authority domains to drop from research results (aligns with lib/factCheck.js rules).
const BAD_DOMAIN = /(reddit\.com|facebook\.com|youtube\.com|youtu\.be|quora\.com|pinterest\.|tiktok\.com|instagram\.com|medium\.com|wikipedia\.org|wikimedia\.org|fandom\.com|blogspot\.|wordpress\.com|bohrium\.com)/i;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const usage = [];
let searchCount = 0, fetchCount = 0;

async function llm(stage, model, content, max_tokens, system) {
  const msg = { model, max_tokens, messages: [{ role: 'user', content }] };
  if (system) msg.system = system;
  const r = await anthropic.messages.create(msg);
  usage.push({ stage, model, in: r.usage.input_tokens, out: r.usage.output_tokens });
  return r.content[0].text;
}
function parseJson(text) {
  const cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(m ? m[0] : cleaned);
}
async function webSearch(q, num = 8) {
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num }),
  });
  searchCount++;
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.organic || []).map(r => ({ title: r.title, url: r.link, snippet: r.snippet }));
}
async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FractalHistory/1.0)' } });
    clearTimeout(timer);
    fetchCount++;
    const ctype = resp.headers.get('content-type') || '';
    if (!resp.ok || !/text\/html|xhtml|text\/plain/i.test(ctype)) return '';
    const html = await resp.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  } catch { return ''; }
}

// ---------- anchor data ----------
const [anchorRows, children, ancestors] = await Promise.all([
  query('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]),
  query(`SELECT a.id, a.title, a.scope, tp.position FROM anchors a
         JOIN tree_positions tp ON a.id = tp.anchor_id
         WHERE tp.parent_position_id = (SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1)
         AND tp.breadth = $2 ORDER BY tp.position ASC`, [anchorId, breadth]),
  getAncestorPath(anchorId),
]);
const anchor = anchorRows[0];
if (!anchor) { console.error('Anchor not found:', anchorId); process.exit(1); }
console.error(`\n>>> ${anchor.title} | breadth ${breadth}`);
console.error(`>>> sub-anchors: ${children.map(c => c.title).join(' | ')}\n`);

// ===================== STAGE 1: RESEARCH =====================
const t0 = Date.now();
console.error('[1/4] Research (Haiku + Serper, authoritative pages)…');
const sections = ['PRELUDE: what the world was like just before this topic', ...children.map(c => c.title)];

const queriesText = await llm('research', HAIKU,
  `Topic: ${anchor.title}\nScope: ${anchor.scope || ''}\n\n` +
  `For each section below, write 3 web search queries that together cover the CORE MEANING of the ` +
  `section's TITLE (its essential content, not a narrow detail), surfacing: (a) the key events and what ` +
  `happened, (b) the primary sources or evidence used to establish it, and (c) debates or vivid anecdotes. ` +
  `Be specific.\n\n` +
  `Sections:\n${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
  `Return ONLY JSON: {"sections":[{"title":"<verbatim>","queries":["q1","q2","q3"]}]}`,
  1500);
const querySpec = parseJson(queriesText).sections;

const evidenceBySection = {};
await Promise.all(querySpec.map(async (sec) => {
  const groups = await Promise.all((sec.queries || []).slice(0, 3).map(q => webSearch(q)));
  let results = groups.flat().filter(r => r.url && !BAD_DOMAIN.test(r.url));
  const seen = new Set();
  results = results.filter(r => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  // fetch & read the top 3 authoritative pages for real depth + dates
  const pages = await Promise.all(results.slice(0, 3).map(async r => ({ url: r.url, body: await fetchPage(r.url) })));
  const snippets = results.map(r => `- ${r.title} (${r.url}): ${r.snippet}`).join('\n').slice(0, 3500);
  const pagesText = pages.filter(p => p.body).map(p => `SOURCE: ${p.url}\n${p.body}`).join('\n\n').slice(0, 9000);
  const evText = await llm('research', HAIKU,
    `Topic: ${anchor.title}. Sub-topic: "${sec.title}".\n\n` +
    `From the search snippets and source pages below, extract the key factual points CLEARLY supported by them, ` +
    `covering the CORE of this sub-topic's title. Include SPECIFIC dates, numbers, names and places wherever the ` +
    `sources give them. For each fact give: the fact in one plain sentence, the single best source URL, and a ` +
    `category — "what" (what happened), "how" (the EVIDENCE/SOURCES it rests on: documents, records, diaries, ` +
    `physical evidence, methods — not more events), "debates" (a genuine open disagreement), or "vignette" (a ` +
    `vivid anecdote or primary-source snippet such as a quote or letter). Only include facts the sources support. ` +
    `8 to 14 facts.\n\n` +
    `SNIPPETS:\n${snippets}\n\nSOURCE PAGES:\n${pagesText}\n\n` +
    `Return ONLY JSON: {"facts":[{"fact":"...","category":"what|how|debates|story","url":"..."}]}`,
    2500);
  try { evidenceBySection[sec.title] = parseJson(evText).facts || []; }
  catch { evidenceBySection[sec.title] = []; }
}));

const researchSecs = Math.round((Date.now() - t0) / 100) / 10;
const preludeKey = querySpec.find(s => /PRELUDE/i.test(s.title))?.title;
const preludeEv = preludeKey ? (evidenceBySection[preludeKey] || []) : [];
const totalFacts = Object.values(evidenceBySection).reduce((n, f) => n + f.length, 0);
console.error(`      ${totalFacts} facts | ${searchCount} searches | ${fetchCount} pages read | ${researchSecs}s`);

function fmtEvidence(facts) {
  if (!facts || !facts.length) return '   (no evidence found)';
  return facts.map(f => `   - [${f.category}] ${f.fact} (source: ${f.url || 'n/a'})`).join('\n');
}
if (args.evidence) {
  console.log('\n========== RESEARCH EVIDENCE BASE ==========');
  for (const sec of sections) { console.log(`\n### ${sec}`); console.log(fmtEvidence(evidenceBySection[sec])); }
}

let subAnchorsEvidence = '';
if (preludeEv.length) subAnchorsEvidence += `SETTING — evidence for the "before this" prelude card:\n${fmtEvidence(preludeEv)}\n\n`;
children.forEach((c, i) => { subAnchorsEvidence += `${i + 1}. ${c.title}\n${fmtEvidence(evidenceBySection[c.title])}\n\n`; });

const HYBRID_CARDS =
  'GROUNDING (hybrid): Use the researched evidence below as your factual ANCHOR — especially for dates, names ' +
  'and specifics — and as your sources. You MAY also add well-established, mainstream detail from your own ' +
  'knowledge to make the cards richer, clearer and better-explained, and to supply a good anecdote where the ' +
  'research is thin. Where your knowledge and the research conflict, TRUST THE RESEARCH. Do not state any ' +
  'specific date, number or name as fact unless you are confident it is correct; if unsure, keep it general. ' +
  'Keep every writing rule below.\n\n';

const HYBRID_NARR =
  '\n\n---\nGROUNDING (hybrid): Use the evidence below as your factual ANCHOR and for dates and sources. You may ' +
  'also add well-established, mainstream detail from your own knowledge for richness and clarity. Where your ' +
  'knowledge and the research conflict, trust the research. Do not assert specific dates, numbers or names you ' +
  'are not confident about.\n\nEVIDENCE:\n';

// ===================== STAGES 2 & 3 (parallel): CARDS + NARRATIVE =====================
console.error(`[2/4] Fact cards (${NAME[CARDS_MODEL]}, hybrid) + [3/4] Narrative (Opus, hybrid)…`);

async function genCards() {
  const t = Date.now();
  const tpl = fs.readFileSync('prompts/_explore-facts-prompt.md', 'utf-8')
    .replace(/\{\{anchorTitle\}\}/g, anchor.title)
    .replace(/\{\{anchorScope\}\}/g, anchor.scope || 'No scope defined')
    .replace(/\{\{subAnchors\}\}/g, subAnchorsEvidence);
  const text = await llm('cards', CARDS_MODEL, HYBRID_CARDS + tpl, 8000);
  let cards; try { cards = parseJson(text); } catch { cards = { raw: text }; }
  return { cards, secs: Math.round((Date.now() - t) / 100) / 10 };
}

async function genNarrative() {
  const t = Date.now();
  const loadSharedVoice = () => {
    const raw = fs.readFileSync(path.join(process.cwd(), 'prompts', '_shared-voice.md'), 'utf-8');
    const m = raw.match(/<!-- VOICE -->([\s\S]*?)<!-- BANS -->([\s\S]*)/);
    return m ? { voice: m[1].trim(), bans: m[2].trim() } : { voice: raw.trim(), bans: '' };
  };
  const fmtAnc = (a) => a.length <= 1 ? 'This is a top-level anchor.'
    : a.map((x, i) => `${i + 1}. **${x.title}** (Level ${x.level}${x.breadth ? `, Breadth ${x.breadth}` : ''})\n   Scope: ${x.scope}`).join('\n\n');
  const fmtChild = (c) => c.map((x, i) => `${i + 1}. **${x.title}**\n   Scope: ${x.scope || 'No scope defined'}`).join('\n\n');
  const shared = loadSharedVoice();
  const tpl = fs.readFileSync('prompts/narrative-a-prompt.md', 'utf-8')
    .replace(/\{\{anchorId\}\}/g, anchorId).replace(/\{\{anchorTitle\}\}/g, anchor.title)
    .replace(/\{\{anchorScope\}\}/g, anchor.scope || 'No scope defined')
    .replace(/\{\{ancestorPath\}\}/g, fmtAnc(ancestors)).replace(/\{\{prerequisites\}\}/g, 'None')
    .replace(/\{\{childAnchors\}\}/g, fmtChild(children))
    .replace(/\{\{sharedVoice\}\}/g, () => shared.voice).replace(/\{\{sharedBans\}\}/g, () => shared.bans);
  const allEvidence = Object.entries(evidenceBySection).map(([sec, f]) => `${sec}\n${fmtEvidence(f)}`).join('\n\n');
  const text = await llm('narrative', OPUS, tpl + HYBRID_NARR + allEvidence, 2500,
    "You are an expert historian and educational writer. You write engaging, accurate historical narratives in the style of Dan Carlin's Hardcore History podcast. Always respond with valid JSON as specified in the prompt.");
  let html; try { html = parseJson(text).narrative; } catch { const m = text.match(/<p>[\s\S]*<\/p>/); html = m ? m[0] : text; }
  return { html: html || '', secs: Math.round((Date.now() - t) / 100) / 10 };
}

const [cardsR, narrR] = await Promise.all([
  args['no-cards'] ? Promise.resolve(null) : genCards(),
  args['no-narrative'] ? Promise.resolve(null) : genNarrative(),
]);
console.error(`      cards ${cardsR?.secs ?? '-'}s | narrative ${narrR?.secs ?? '-'}s (parallel)`);
const narrativePlain = narrR ? (narrR.html || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<[^>]+>/g, '').trim() : null;

// --save-id: write the generated fact cards as a study-data module for the learn registry.
if (args['save-id'] && cardsR?.cards?.subAnchors) {
  const mod = {
    id: anchorId,
    breadth,
    title: anchor.title,
    scope: anchor.scope || '',
    prelude: cardsR.cards.prelude || null,
    subAnchors: cardsR.cards.subAnchors,
  };
  fs.mkdirSync('src/data/learn', { recursive: true });
  const file = `src/data/learn/${anchorId}-${breadth}.js`;
  fs.writeFileSync(file,
    `// Auto-generated study data via the learn pipeline (Haiku research + Sonnet hybrid cards). Anchor ${anchorId} breadth ${breadth}.\n` +
    `export default ${JSON.stringify(mod, null, 2)}\n`);
  console.error(`      saved study data -> ${file}`);
}

// ===================== STAGE 4: VERIFY (reuse lib/factCheck.js) =====================
let verify = null;
if (!args['no-verify'] && narrR && narrR.html) {
  const t = Date.now();
  console.error('[4/4] Verify narrative against the web (factCheckNarrative)…');
  try {
    const result = await factCheckNarrative(narrR.html, anchor.title, anchor.scope || '', breadth);
    verify = { corrections: result.corrections || [], sources: result.sources || [], secs: Math.round((Date.now() - t) / 100) / 10 };
    console.error(`      ${verify.corrections.length} corrections | ${verify.sources.length} confirmed sources | ${verify.secs}s`);
  } catch (e) { console.error('      verify failed:', e.message); }
}

// ===================== OUTPUT =====================
const LAYERS = [['what', 'What happened'], ['how', 'How we know'], ['debates', 'Debates'], ['story', 'Story']];
function printCard(c, indent = '  ') {
  console.log(`${indent}• ${c.headline}  [${c.when || 'NO DATE'}]`);
  for (const [k, label] of LAYERS) { const b = c[k] || []; if (!b.length) continue; console.log(`${indent}  ${label}:`); b.forEach(x => console.log(`${indent}    - ${x}`)); }
  console.log('');
}
if (cardsR?.cards?.subAnchors) {
  console.log(`\n========== FACT CARDS (${NAME[CARDS_MODEL]}, hybrid: research-anchored) ==========\n`);
  console.log(`PRELUDE: ${cardsR.cards.prelude?.title}\n`);
  (cardsR.cards.prelude?.facts || []).forEach(c => printCard(c));
  cardsR.cards.subAnchors.forEach((sa, i) => { console.log(`${i + 1}. ${sa.title}\n`); (sa.facts || []).forEach(c => printCard(c)); });
} else if (cardsR?.cards?.raw) { console.log('\n[cards JSON did not parse]\n', cardsR.cards.raw.slice(0, 1200)); }

if (narrativePlain) {
  console.log('\n========== NARRATIVE (hybrid: research-anchored) ==========\n');
  console.log(narrativePlain);
  console.log(`\n[words: ${narrativePlain.split(/\s+/).filter(Boolean).length}]`);
}

if (verify) {
  console.log('\n========== VERIFICATION (factCheckNarrative) ==========');
  if (!verify.corrections.length) console.log('No corrections — verifier found nothing to change.');
  verify.corrections.forEach(c => console.log(`- "${c.original}" → "${c.corrected}" (${c.reason})`));
  console.log(`Confirmed sources attached: ${verify.sources.length}`);
}

// ===================== REPORT =====================
const sources = [...new Set(Object.values(evidenceBySection).flat().map(f => f.url).filter(Boolean))];
console.log('\n========== REPORT ==========');
const byStage = {};
for (const u of usage) {
  const k = `${u.stage} (${NAME[u.model] || u.model})`;
  byStage[k] = byStage[k] || { in: 0, out: 0, calls: 0, model: u.model };
  byStage[k].in += u.in; byStage[k].out += u.out; byStage[k].calls++;
}
let cost = searchCount * SERPER_PER_SEARCH;
for (const [k, v] of Object.entries(byStage)) {
  const c = (v.in / 1e6) * PRICE[v.model].in + (v.out / 1e6) * PRICE[v.model].out;
  cost += c;
  console.log(`${k}: ${v.calls} calls, ${v.in} in + ${v.out} out, ~$${c.toFixed(3)}`);
}
console.log(`Serper: ${searchCount} searches + ${fetchCount} page fetches, ~$${(searchCount * SERPER_PER_SEARCH).toFixed(3)}`);
console.log(`Research wall-clock: ${researchSecs}s | generation (parallel): ~${Math.max(cardsR?.secs || 0, narrR?.secs || 0)}s` + (verify ? ` | verify: ${verify.secs}s` : ''));
console.log(`Distinct authoritative sources: ${sources.length}`);
console.log(`NOTE: cost excludes the verify stage's internal Haiku/Serper usage (not tracked here; modest, Haiku-based).`);
console.log(`ESTIMATED COST (research + generation): ~$${cost.toFixed(3)}  (prices approximate)`);
process.exit(0);
