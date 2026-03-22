/**
 * Regenerate all narratives in the database with correct child anchors,
 * updated prompts, and fact-checking. Run locally to avoid Vercel timeouts.
 *
 * Usage: node scripts/regenerate-all.js [--dry-run]
 */

import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { factCheckNarrative } from '../api/utils/factCheck.js';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const dryRun = process.argv.includes('--dry-run');

function loadPromptTemplate(breadth) {
    const files = { 'A': 'narrative-a-prompt.md', 'B': 'narrative-b-prompt.md' };
    return fs.readFileSync(path.join(process.cwd(), 'prompts', files[breadth]), 'utf-8');
}

async function getAncestorPath(anchorId) {
    const ancestors = [];
    let currentId = anchorId;
    while (currentId && currentId !== '0-ROOT') {
        const result = await sql`
            SELECT a.id, a.title, a.scope, tp.level, tp.breadth, tp.parent_position_id
            FROM anchors a JOIN tree_positions tp ON a.id = tp.anchor_id
            WHERE a.id = ${currentId} LIMIT 1
        `;
        if (result.length === 0) break;
        const anchor = result[0];
        ancestors.unshift({ id: anchor.id, title: anchor.title, scope: anchor.scope || 'No scope defined', level: anchor.level, breadth: anchor.breadth });
        if (anchor.parent_position_id) {
            const parent = await sql`SELECT anchor_id FROM tree_positions WHERE position_id = ${anchor.parent_position_id} LIMIT 1`;
            if (parent.length > 0) currentId = parent[0].anchor_id;
            else break;
        } else break;
    }
    ancestors.unshift({ id: '0-ROOT', title: 'The Story of Everything', scope: 'All of history', level: 0, breadth: null });
    return ancestors;
}

function formatAncestorPath(ancestors) {
    if (ancestors.length <= 1) return 'This is a top-level anchor.';
    return ancestors.map((a, i) =>
        `${i + 1}. **${a.title}** (Level ${a.level}${a.breadth ? `, Breadth ${a.breadth}` : ''})\n   Scope: ${a.scope}`
    ).join('\n\n');
}

function formatChildAnchors(children) {
    return children.map((c, i) =>
        `${i + 1}. **${c.title}**\n   Scope: ${c.scope || 'No scope defined'}`
    ).join('\n\n');
}

function populateTemplate(template, data) {
    return template
        .replace(/\{\{anchorId\}\}/g, data.anchorId)
        .replace(/\{\{anchorTitle\}\}/g, data.anchorTitle)
        .replace(/\{\{anchorScope\}\}/g, data.anchorScope)
        .replace(/\{\{ancestorPath\}\}/g, data.ancestorPath)
        .replace(/\{\{prerequisites\}\}/g, data.prerequisites)
        .replace(/\{\{childAnchors\}\}/g, data.childAnchors);
}

function parseResponse(text) {
    let cleaned = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const data = JSON.parse(cleaned);
    if (!data.narrative || !Array.isArray(data.keyConcepts) || !Array.isArray(data.questions)) {
        throw new Error('Response missing required fields');
    }
    return data;
}

async function regenerateNarrative(anchorId, breadth) {
    const anchor = (await sql`SELECT id, title, scope FROM anchors WHERE id = ${anchorId}`)[0];
    if (!anchor) { console.error(`  Anchor ${anchorId} not found`); return; }

    const children = await sql`
        SELECT a.id, a.title, a.scope FROM anchors a
        JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE tp.parent_position_id = (SELECT position_id FROM tree_positions WHERE anchor_id = ${anchorId} LIMIT 1)
        AND tp.breadth = ${breadth}
        ORDER BY tp.position ASC
    `;

    if (children.length === 0) {
        console.error(`  No ${breadth}-children for ${anchorId} — skipping`);
        return;
    }

    console.log(`  Children: ${children.map(c => c.title).join(', ')}`);

    const template = loadPromptTemplate(breadth);
    const ancestors = await getAncestorPath(anchorId);
    const prompt = populateTemplate(template, {
        anchorId, anchorTitle: anchor.title, anchorScope: anchor.scope || 'No scope defined',
        ancestorPath: formatAncestorPath(ancestors), prerequisites: 'None',
        childAnchors: formatChildAnchors(children)
    });

    if (dryRun) { console.log('  [dry-run] Would call Anthropic API'); return; }

    console.log('  Generating narrative...');
    const completion = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: 'You are an expert historian and educational writer. You write engaging, accurate historical narratives in the style of Dan Carlin\'s Hardcore History podcast. Always respond with valid JSON as specified in the prompt.',
        messages: [{ role: 'user', content: prompt }],
    });

    const narrativeData = parseResponse(completion.content[0].text);
    console.log(`  Narrative parsed (${narrativeData.questions.length} questions)`);

    // Store
    await sql`
        INSERT INTO narratives (anchor_id, breadth, narrative, key_concepts, questions, estimated_read_time)
        VALUES (${anchorId}, ${breadth}, ${narrativeData.narrative}, ${JSON.stringify(narrativeData.keyConcepts)},
                ${JSON.stringify(narrativeData.questions)}, ${narrativeData.estimatedReadTime || 5})
        ON CONFLICT (anchor_id, breadth) DO UPDATE SET
            narrative = ${narrativeData.narrative},
            key_concepts = ${JSON.stringify(narrativeData.keyConcepts)},
            questions = ${JSON.stringify(narrativeData.questions)},
            estimated_read_time = ${narrativeData.estimatedReadTime || 5}
    `;
    console.log('  Stored in DB');

    // Fact-check
    console.log('  Fact-checking...');
    try {
        const fcResult = await factCheckNarrative(narrativeData.narrative, anchor.title, anchor.scope, breadth);
        if (fcResult) {
            await sql`
                UPDATE narratives
                SET fact_checked_narrative = ${fcResult.narrative},
                    sources = ${JSON.stringify(fcResult.sources)},
                    fact_checked_at = NOW()
                WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
            `;
            console.log(`  Fact-check: ${fcResult.sources.length} sources, ${fcResult.corrections.length} corrections`);
        } else {
            console.log('  Fact-check returned no results');
        }
    } catch (err) {
        console.error(`  Fact-check failed: ${err.message}`);
    }
}

async function main() {
    console.log(dryRun ? '=== DRY RUN ===' : '=== REGENERATING ALL NARRATIVES ===');

    // Get all existing narratives
    const narratives = await sql`
        SELECT n.anchor_id, a.title, n.breadth
        FROM narratives n JOIN anchors a ON n.anchor_id = a.id
        ORDER BY n.anchor_id, n.breadth
    `;

    console.log(`\nFound ${narratives.length} existing narratives to regenerate:\n`);

    for (const n of narratives) {
        console.log(`\n--- ${n.title} (${n.anchor_id}) breadth ${n.breadth} ---`);
        await regenerateNarrative(n.anchor_id, n.breadth);
    }

    console.log('\n=== DONE ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
