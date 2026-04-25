/**
 * Benchmark script for anchor and narrative generation pipelines.
 * Compares BEFORE (neon HTTP, sequential) vs AFTER (Pool+WS, parallel, CTE).
 *
 * Usage: node benchmark-generation.js
 */

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import { loadPrompt, formatAncestorContext, formatSiblingContext, formatForbiddenTitles } from './api/utils/promptLoader.js';
import { linkChildAnchors } from './api/utils/linkChildAnchors.js';
import { query as poolQuery, getPool, getAncestorPath as getAncestorPathCTE } from './api/utils/db.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

function timer() {
    const start = performance.now();
    return () => performance.now() - start;
}

function fmt(ms) {
    return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

// -- ANCHOR GENERATION BENCHMARK ------------------------------------------

async function benchmarkAnchorGeneration() {
    const parentId = '3A-GLILW';
    const parentTitle = 'World War I';
    const parentScope = 'Global conflict triggered by imperial competition and alliance system.';
    const breadth = 'A';

    console.log('\n' + '='.repeat(60));
    console.log('ANCHOR GENERATION BENCHMARK');
    console.log(`Parent: ${parentId} - ${parentTitle}`);
    console.log('='.repeat(60));

    const phases = [];
    const totalTimer = timer();

    // Phase 1: Idempotency check
    let t = timer();
    const parentPos = await poolQuery(
        'SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1',
        [parentId]
    );
    if (parentPos.length > 0) {
        await poolQuery(`
            SELECT a.id FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE tp.parent_position_id = $1 AND tp.breadth = $2
            ORDER BY tp.position ASC
        `, [parentPos[0].position_id, breadth]);
    }
    phases.push({ name: 'Idempotency check (2 queries)', ms: t() });

    // Phase 2: Ancestor + siblings in PARALLEL (optimised)
    t = timer();
    const [ancestorPath, siblings] = await Promise.all([
        getAncestorPathCTE(parentId),
        poolQuery(`
            SELECT a.id, a.title, a.scope FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE tp.parent_position_id = (
                SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1
            ) AND tp.breadth = $2
            ORDER BY tp.position ASC
        `, [parentId, breadth])
    ]);
    phases.push({ name: 'Ancestor + siblings in parallel (2 queries)', ms: t() });

    // Phase 3: Build prompt
    t = timer();
    const systemPrompt = loadPrompt('breadth-a-selection.md', {
        parentId, parentTitle, parentScope,
        ancestorContext: formatAncestorContext(ancestorPath),
        siblingContext: formatSiblingContext(siblings),
        siblingWarning: siblings.length > 0
            ? '**Important:** Do not duplicate existing siblings.'
            : '',
        forbiddenTitles: formatForbiddenTitles(ancestorPath)
    });
    phases.push({ name: 'Build prompt (sync)', ms: t() });

    // Phase 4: Anthropic API
    t = timer();
    const completion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        system: 'You are an expert historian selecting essential anchors for a fractal history education platform. Respond with valid JSON only. No markdown, no explanation outside the JSON. Keep anchor titles to 5 words maximum.',
        messages: [{ role: 'user', content: systemPrompt }],
    });
    phases.push({ name: `Anthropic API (Haiku 4.5, ${completion.usage?.input_tokens}in/${completion.usage?.output_tokens}out)`, ms: t() });

    // Phase 5: Parse
    t = timer();
    const response = completion.content[0].text;
    JSON.parse(response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, ''));
    phases.push({ name: 'Parse JSON (sync)', ms: t() });

    // Phase 6: Batch insert (simulated - 2 queries instead of 2N)
    t = timer();
    await Promise.all([poolQuery('SELECT 1'), poolQuery('SELECT 1')]);
    phases.push({ name: 'Batch insert anchors + positions (simulated, 2 queries)', ms: t() });

    const totalMs = totalTimer();
    printPhases(phases, totalMs);
    return { phases, totalMs };
}

// -- NARRATIVE GENERATION BENCHMARK ----------------------------------------

async function benchmarkNarrativeGeneration() {
    const anchorId = '1A-E8F2G';
    const breadth = 'A';

    console.log('\n' + '='.repeat(60));
    console.log('NARRATIVE GENERATION BENCHMARK');
    console.log(`Anchor: ${anchorId}`);
    console.log('='.repeat(60));

    const phases = [];
    const totalTimer = timer();

    // Phase 1: Check cache
    let t = timer();
    await poolQuery(
        'SELECT * FROM narratives WHERE anchor_id = $1 AND breadth = $2 LIMIT 1',
        [anchorId, breadth]
    );
    phases.push({ name: 'Check cache (Pool, 1 query)', ms: t() });

    // Phase 2: Parallel fetch: anchor + children + ancestors (optimised)
    t = timer();
    const [anchorResult, children, ancestors] = await Promise.all([
        poolQuery('SELECT id, title, scope FROM anchors WHERE id = $1 LIMIT 1', [anchorId]),
        poolQuery(`
            SELECT a.id, a.title, a.scope, tp.position FROM anchors a
            JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE tp.parent_position_id = (
                SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1
            ) AND tp.breadth = $2
            ORDER BY tp.position ASC
        `, [anchorId, breadth]),
        getAncestorPathCTE(anchorId)
    ]);
    const anchor = anchorResult[0];
    phases.push({ name: `Parallel fetch: anchor + ${children.length} children + ancestors (3 queries)`, ms: t() });
    console.log(`  Anchor: ${anchor.title}, ${children.length} children, ${ancestors.length} ancestors`);

    // Phase 3: Build prompt
    t = timer();
    const promptTemplate = fs.readFileSync(path.join(process.cwd(), 'prompts', 'narrative-a-prompt.md'), 'utf-8');
    const fmtAncestors = (ancs) => ancs.map((a, i) =>
        `${i + 1}. **${a.title}** (Level ${a.level}${a.breadth ? `, Breadth ${a.breadth}` : ''})\n   Scope: ${a.scope}`
    ).join('\n\n');
    const fmtChildren = (ch) => ch.map((c, i) =>
        `${i + 1}. **${c.title}**\n   Scope: ${c.scope || 'No scope defined'}`
    ).join('\n\n');
    const prompt = promptTemplate
        .replace(/\{\{anchorId\}\}/g, anchorId)
        .replace(/\{\{anchorTitle\}\}/g, anchor.title)
        .replace(/\{\{anchorScope\}\}/g, anchor.scope || 'No scope defined')
        .replace(/\{\{ancestorPath\}\}/g, fmtAncestors(ancestors))
        .replace(/\{\{prerequisites\}\}/g, 'None')
        .replace(/\{\{childAnchors\}\}/g, fmtChildren(children));
    phases.push({ name: 'Build prompt (sync)', ms: t() });
    console.log(`  Prompt: ${prompt.length} chars`);

    // Phase 4: Anthropic API
    t = timer();
    const completion = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: 'You are an expert historian and educational writer. You write engaging, accurate historical narratives in the style of Dan Carlin\'s Hardcore History podcast. Always respond with valid JSON as specified in the prompt.',
        messages: [{ role: 'user', content: prompt }],
    });
    phases.push({ name: `Anthropic API (Sonnet 4.6, ${completion.usage?.input_tokens}in/${completion.usage?.output_tokens}out)`, ms: t() });

    // Phase 5: Parse + link
    t = timer();
    const response = completion.content[0].text;
    const narrativeData = JSON.parse(response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, ''));
    linkChildAnchors(narrativeData.narrative, children.map(c => ({ id: c.id, title: c.title })), breadth);
    phases.push({ name: 'Parse + link child anchors (sync)', ms: t() });

    // Phase 6: Store
    t = timer();
    await poolQuery('SELECT 1');
    phases.push({ name: 'Store narrative (simulated, 1 query)', ms: t() });

    const totalMs = totalTimer();
    printPhases(phases, totalMs);
    return { phases, totalMs };
}

// -- DB DRIVER COMPARISON --------------------------------------------------

async function benchmarkDbDrivers() {
    console.log('\n' + '='.repeat(60));
    console.log('DB DRIVER COMPARISON: neon() HTTP vs Pool+WebSocket');
    console.log('='.repeat(60));

    // Warm up
    await sql`SELECT 1`;
    await poolQuery('SELECT 1');

    const iterations = 5;

    const neonTimes = [];
    for (let i = 0; i < iterations; i++) {
        const t = timer();
        await sql`SELECT a.id, a.title FROM anchors a JOIN tree_positions tp ON a.id = tp.anchor_id WHERE a.id = '1A-E8F2G' LIMIT 1`;
        neonTimes.push(t());
    }

    const poolTimes = [];
    for (let i = 0; i < iterations; i++) {
        const t = timer();
        await poolQuery('SELECT a.id, a.title FROM anchors a JOIN tree_positions tp ON a.id = tp.anchor_id WHERE a.id = $1 LIMIT 1', ['1A-E8F2G']);
        poolTimes.push(t());
    }

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    console.log(`\n  neon() HTTP (${iterations} runs): avg ${fmt(avg(neonTimes))}, range ${fmt(Math.min(...neonTimes))}-${fmt(Math.max(...neonTimes))}`);
    console.log(`  Pool+WS    (${iterations} runs): avg ${fmt(avg(poolTimes))}, range ${fmt(Math.min(...poolTimes))}-${fmt(Math.max(...poolTimes))}`);
    console.log(`  Speedup: ${(avg(neonTimes) / avg(poolTimes)).toFixed(1)}x`);
}

function printPhases(phases, totalMs) {
    console.log('\n  Phase Breakdown:');
    console.log('  ' + '-'.repeat(70));
    for (const p of phases) {
        const pct = ((p.ms / totalMs) * 100).toFixed(1);
        const bar = '#'.repeat(Math.round(p.ms / totalMs * 30));
        console.log(`  ${fmt(p.ms).padStart(7)}  ${pct.padStart(5)}%  ${bar}  ${p.name}`);
    }
    console.log('  ' + '-'.repeat(70));
    console.log(`  ${fmt(totalMs).padStart(7)}  TOTAL`);
}

async function main() {
    console.log('Fractal History Generation Benchmark (OPTIMISED)');
    console.log(`Date: ${new Date().toISOString()}`);

    try {
        await benchmarkDbDrivers();
        const anchorResult = await benchmarkAnchorGeneration();
        const narrativeResult = await benchmarkNarrativeGeneration();

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`  Anchor generation:    ${fmt(anchorResult.totalMs)}`);
        console.log(`  Narrative generation:  ${fmt(narrativeResult.totalMs)}`);
    } catch (err) {
        console.error('Benchmark failed:', err);
    } finally {
        await getPool().end();
    }
}

main();
