import Anthropic from '@anthropic-ai/sdk';
import { loadPrompt, formatAncestorContext, formatSiblingContext, formatForbiddenTitles, renderAnalyticalFrame, renderParentSignpost } from './utils/promptLoader.js';
import { query, getAncestorPath } from './utils/db.js';
import { WORLD, getName, getLevel, getChildren, expandToCandidates } from './utils/geography.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

let anthropic = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return anthropic;
}

// Generate anchor ID in format like "2A-X7Y3Z"
function generateAnchorId(parentId, position) {
    // Handle different ID formats
    let parentLevel;
    if (parentId === '0-ROOT') {
        parentLevel = 0;
    } else if (parentId.match(/^\d+[A-Z]-/)) {
        // Format: "2A-X7Y3Z" - extract the number before the letter
        parentLevel = parseInt(parentId.match(/^(\d+)[A-Z]-/)[1]);
    } else {
        // Format: "C9D3E" - assume level 1 (top level anchors)
        parentLevel = 1;
    }

    const childLevel = parentLevel + 1;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let hash = '';
    for (let i = 0; i < 5; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${childLevel}A-${hash}`;
}

// Get existing sibling anchors at the same level
async function getSiblingAnchors(parentId, breadth) {
    return await query(`
        SELECT a.id, a.title, a.scope
        FROM anchors a
        JOIN tree_positions tp ON a.id = tp.anchor_id
        WHERE tp.parent_position_id = (
            SELECT position_id
            FROM tree_positions
            WHERE anchor_id = $1
            LIMIT 1
        )
        AND tp.breadth = $2
        ORDER BY tp.position ASC
    `, [parentId, breadth]);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { parentId, parentTitle, parentScope, breadth = 'A', regenerate = false } = req.body;

        if (!parentId || !parentTitle) {
            return res.status(400).json({
                error: 'Missing required fields: parentId and parentTitle are required'
            });
        }

        if (breadth !== 'A' && breadth !== 'B' && breadth !== 'C') {
            return res.status(400).json({
                error: 'Only Breadth A, B, and C anchor generation is supported'
            });
        }

        console.log(`Generating anchors for parent: ${parentId} - ${parentTitle}`);

        // Idempotency: if children already exist for this parent+breadth, return them
        const parentPos = await query(
            'SELECT position_id FROM tree_positions WHERE anchor_id = $1 LIMIT 1',
            [parentId]
        );
        if (parentPos.length > 0 && regenerate) {
            // Clear existing children for this parent+breadth so we can regenerate cleanly
            const kids = await query(
                'SELECT anchor_id FROM tree_positions WHERE parent_position_id = $1 AND breadth = $2',
                [parentPos[0].position_id, breadth]
            );
            await query(
                'DELETE FROM tree_positions WHERE parent_position_id = $1 AND breadth = $2',
                [parentPos[0].position_id, breadth]
            );
            for (const k of kids) {
                // Delete the anchor only if no other tree_position still references it
                const del = await query(
                    `DELETE FROM anchors WHERE id = $1
                     AND NOT EXISTS (SELECT 1 FROM tree_positions WHERE anchor_id = $1)
                     RETURNING id`,
                    [k.anchor_id]
                );
                if (del.length > 0) {
                    await query('DELETE FROM narratives WHERE anchor_id = $1', [k.anchor_id]);
                }
            }
            console.log(`Regenerate: cleared ${kids.length} existing ${breadth}-children of ${parentId}`);
        } else if (parentPos.length > 0) {
            const existingChildren = await query(`
                SELECT a.id, a.title, a.scope, a.generation_status,
                       tp.level, tp.breadth, tp.position
                FROM anchors a
                JOIN tree_positions tp ON a.id = tp.anchor_id
                WHERE tp.parent_position_id = $1
                  AND tp.breadth = $2
                ORDER BY tp.position ASC
            `, [parentPos[0].position_id, breadth]);
            if (existingChildren.length > 0) {
                console.log(`Children already exist for ${parentId} breadth ${breadth} (${existingChildren.length} found), skipping generation`);
                return res.status(200).json({
                    success: true,
                    parentId,
                    parentTitle,
                    breadth,
                    anchorsGenerated: existingChildren.length,
                    anchors: existingChildren,
                    skipped: true
                });
            }
        }

        // Fetch ancestor path and sibling context in parallel
        const [ancestorPath, existingSiblings] = await Promise.all([
            getAncestorPath(parentId),
            getSiblingAnchors(parentId, breadth)
        ]);

        console.log(`Found ${ancestorPath.length} ancestors and ${existingSiblings.length} existing siblings`);
        // Build the appropriate prompt based on breadth type.
        let systemPrompt;
        let cCandidates = null; // [{ code, name, level }] of the places C may divide
        let cCosmic = false;    // cosmic branch uses free-text generation, not the ledger
        if (breadth === 'C') {
            // The universe of places to divide: the parent's own coverage if it is
            // itself a geographic anchor, otherwise the whole world.
            const parentRow = await query(
                'SELECT region_codes FROM anchors WHERE id = $1 LIMIT 1',
                [parentId]
            );
            let universe = [WORLD];
            const rc = parentRow.length > 0 ? parentRow[0].region_codes : null;
            if (Array.isArray(rc) && rc.length > 0) universe = rc;

            // Cosmic branch: no place dataset and no completeness contract, so the
            // model generates geographic regions freely rather than via the ledger.
            cCosmic = universe.some(c => getLevel(c) === 'cosmic' || c === 'COSMIC');
            if (cCosmic) {
                console.log(`Breadth C (cosmic): free-text geographic generation for ${parentId}`);
                systemPrompt = buildCosmicCPrompt(
                    parentId, parentTitle, parentScope || 'No scope provided',
                    ancestorPath, existingSiblings
                );
            } else {
                const candidateCodes = expandToCandidates(universe);
                cCandidates = candidateCodes.map(code => ({
                    code, name: getName(code), level: getLevel(code)
                }));
                console.log(`Breadth C: dividing ${universe.length} universe code(s) into ${cCandidates.length} candidate place(s)`);
                // Nothing to subdivide (a leaf place, e.g. a single country): don't
                // fall back to the whole world or call the model.
                if (cCandidates.length <= 1) {
                    console.log(`Breadth C: no further geographic subdivision for ${parentId}; skipping generation`);
                    return res.status(200).json({
                        success: true, parentId, parentTitle, breadth,
                        anchorsGenerated: 0, anchors: [],
                        note: 'No further geographic subdivision for this place.'
                    });
                }
                systemPrompt = buildBreadthCPrompt(
                    parentId, parentTitle, parentScope || 'No scope provided',
                    ancestorPath, existingSiblings, cCandidates
                );
            }
        } else {
            const promptBuilder = breadth === 'A' ? buildBreadthAPrompt : buildBreadthBPrompt;
            systemPrompt = promptBuilder(
                parentId, parentTitle, parentScope || 'No scope provided',
                ancestorPath, existingSiblings
            );
        }

        const apiStart = Date.now();
        console.log('Calling Anthropic API...');

        const completion = await getAnthropicClient().messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 8000,
            system: 'You are an expert historian selecting essential anchors for a fractal history education platform. Respond with valid JSON only. No markdown, no explanation outside the JSON. Keep anchor titles to 5 words maximum.',
            messages: [
                {
                    role: 'user',
                    content: systemPrompt
                }
            ],
        });

        const response = completion.content[0].text;
        const apiMs = Date.now() - apiStart;
        console.log(`Anthropic response received in ${apiMs}ms (${(apiMs/1000).toFixed(1)}s)`);
        console.log(`Usage: ${completion.usage?.input_tokens} input, ${completion.usage?.output_tokens} output tokens`);
        console.log('\n=== FULL LLM RESPONSE ===');
        console.log(response);
        console.log('=== END RESPONSE ===\n');

        // Parse the LLM response based on breadth type
        let anchors, candidates, selectionReasoning;

        if (breadth === 'A') {
            // Parse JSON candidates from LLM
            let cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
            const data = JSON.parse(cleaned);

            if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
                throw new Error('Response missing candidates array');
            }

            // Deterministic selection: sort by finalScore descending, pick top 3-5
            const sorted = [...data.candidates]
                .filter(c => c.finalScore >= 6.0)
                .sort((a, b) => b.finalScore - a.finalScore);

            // Use score gap heuristic: cut where there's a >1.0 drop (min 3, max 5)
            let count = Math.min(sorted.length, 5);
            for (let i = 3; i < Math.min(sorted.length, 5); i++) {
                if (sorted[i - 1].finalScore - sorted[i].finalScore > 1.0) {
                    count = i;
                    break;
                }
            }
            count = Math.max(3, Math.min(count, sorted.length));

            const selected = sorted.slice(0, count);
            console.log(`Deterministic selection: ${count} anchors (gap heuristic)`);
            selected.forEach((a, i) => console.log(`  ${i + 1}. ${a.title} (score: ${a.finalScore})`));

            // Map to expected format, sort chronologically
            anchors = selected.map(a => ({
                title: a.title,
                scope: a.scope,
                timePeriod: a.timePeriod,
                sortValue: parseTimePeriodToSortValue(a.timePeriod),
                position: 0,
                causalSignificance: a.causalSignificance,
                humanImpact: a.humanImpact,
                finalScore: a.finalScore
            }));
            anchors.sort((a, b) => b.sortValue - a.sortValue);
            anchors.forEach((a, i) => { a.position = i + 1; });

            console.log('Final order (chronological):');
            anchors.forEach(a => console.log(`  Position ${a.position}: ${a.title} (${a.timePeriod})`));

            // Map all candidates for "Why these anchors?" display
            const selectedTitles = new Set(selected.map(a => a.title.toLowerCase()));
            candidates = data.candidates.map(c => ({
                title: c.title,
                type: c.type || 'Unknown',
                scope: c.scope || '',
                causalSignificance: c.causalSignificance || 0,
                causalJustification: c.causalJustification || '',
                humanImpact: c.humanImpact || 0,
                humanJustification: c.humanJustification || '',
                finalScore: c.finalScore || 0,
                selected: selectedTitles.has(c.title.toLowerCase())
            }));

            selectionReasoning = `Top ${count} candidates selected by score (gap heuristic: cut at >1.0 point drop).`;
        } else if (breadth === 'C' && cCosmic) {
            // Cosmic free-text division: take the regions as given and mark them with
            // the COSMIC sentinel, so further drilling stays free-text and a future
            // cleanup-by-missing-codes leaves them alone.
            let cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
            const data = JSON.parse(cleaned);
            const regions = Array.isArray(data.regions) ? data.regions : [];
            anchors = regions.filter(r => r && r.title).map((r, i) => ({
                title: r.title, scope: r.scope || '', position: i + 1, region_codes: ['COSMIC']
            }));
            if (data.catchAll && data.catchAll.title) {
                anchors.push({
                    title: data.catchAll.title, scope: data.catchAll.scope || '',
                    position: anchors.length + 1, region_codes: ['COSMIC']
                });
            }
            candidates = anchors.map(a => ({ title: a.title, scope: a.scope, selected: true }));
            selectionReasoning = data.reasoning || 'Geographic regions of this place, generated freely (the cosmic branch has no fixed place list).';
            console.log(`Breadth C (cosmic): ${anchors.length} region(s) generated`);
        } else if (breadth === 'C') {
            // Geographic (place-based) division. The model nominates a few named
            // regions by selecting place codes; the program computes the leftover
            // as the complement, so no place can be silently lost.
            let cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
            const data = JSON.parse(cleaned);

            const candidateByCode = new Map(cCandidates.map(c => [c.code, c]));
            const claimed = new Set();
            const named = [];
            for (const r of (data.namedRegions || [])) {
                const members = (r.members || [])
                    .map(m => normalizeMemberToCode(m, cCandidates))
                    .filter(code => code && candidateByCode.has(code) && !claimed.has(code));
                if (members.length === 0) continue; // empty or fully-duplicated region
                members.forEach(code => claimed.add(code));
                named.push({
                    title: r.title,
                    scope: r.scope,
                    members,
                    connectionStrength: Number(r.connectionStrength) || 0
                });
            }

            // Leftover = every candidate place the model did not claim.
            const leftoverCodes = cCandidates.map(c => c.code).filter(code => !claimed.has(code));

            anchors = named.map((r, i) => ({
                title: r.title,
                scope: r.scope,
                position: i + 1,
                region_codes: r.members,
                connectionStrength: r.connectionStrength
            }));

            if (leftoverCodes.length > 0) {
                anchors.push({
                    title: (data.leftover && data.leftover.title) || 'Rest of the World',
                    scope: (data.leftover && data.leftover.scope) ||
                        'Places with a lesser connection to this topic, kept reachable for deeper exploration.',
                    position: anchors.length + 1,
                    region_codes: leftoverCodes,
                    connectionStrength: 0
                });
            }

            console.log(`Breadth C: ${named.length} named region(s), leftover holds ${leftoverCodes.length} place(s)`);

            // Candidate list for the "Why these regions?" panel.
            candidates = anchors.map(a => ({
                title: a.title,
                scope: a.scope,
                members: (a.region_codes || []).map(code => getName(code)),
                connectionStrength: a.connectionStrength,
                selected: true
            }));

            selectionReasoning = data.coverageJustification ||
                'Regions capture the topic\'s strongest geographic connections; remaining places are gathered into a leftover region that stays reachable.';
        } else {
            // Breadth B: existing parsing
            anchors = parseTemporalAnchorResponse(response, parentId);
            anchors = capTemporalAnchors(anchors, 5); // hard guarantee: never exceed 5 periods
            candidates = parseTemporalCandidates(response);

            try {
                let cleaned = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
                const data = JSON.parse(cleaned);
                selectionReasoning = data.coverageJustification || 'Temporal anchors provide complete chronological coverage of the parent topic.';
            } catch (e) {
                selectionReasoning = 'Temporal anchors provide complete chronological coverage of the parent topic.';
            }
        }

        // Safety: if parsing yielded no anchors, return cleanly rather than building
        // an empty INSERT.
        if (!Array.isArray(anchors) || anchors.length === 0) {
            return res.status(200).json({
                success: true, parentId, parentTitle, breadth,
                anchorsGenerated: 0, anchors: [],
                note: 'No anchors were generated for this place.'
            });
        }

        // Store generation metadata in database
        let metadataId = null;
        try {
            const finalSelection = anchors.map(a => ({
                title: a.title,
                scope: a.scope,
                causalSignificance: a.causalSignificance,
                humanImpact: a.humanImpact,
                finalScore: a.finalScore
            }));

            const metadataResult = await query(`
                INSERT INTO anchor_generation_metadata
                (parent_anchor_id, breadth, candidates, final_selection, selection_reasoning, raw_response)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (parent_anchor_id, breadth)
                DO UPDATE SET
                    candidates = $3,
                    final_selection = $4,
                    selection_reasoning = $5,
                    raw_response = $6,
                    generated_at = NOW()
                RETURNING id
            `, [parentId, breadth, JSON.stringify(candidates), JSON.stringify(finalSelection), selectionReasoning, response]);
            metadataId = metadataResult[0].id;
            console.log(`Stored generation metadata with ID: ${metadataId}`);
        } catch (metaError) {
            console.error('Error storing generation metadata:', metaError);
            // Don't fail the whole request if metadata storage fails
        }

        // Fetch parent level and position once (not per anchor)
        const parentPosResult = await query(
            'SELECT position_id, level FROM tree_positions WHERE anchor_id = $1 LIMIT 1',
            [parentId]
        );
        const parentPosId = parentPosResult.length > 0 ? parentPosResult[0].position_id : null;
        const childLevel = parentPosResult.length > 0 ? parentPosResult[0].level + 1 : 1;

        // Prepare anchor data with generated IDs
        const anchorRows = anchors.map(anchor => {
            const anchorId = generateAnchorId(parentId, anchor.position);
            const positionId = `${childLevel}${breadth}-${anchorId.split('-')[1]}`;
            return { anchorId, positionId, anchor };
        });

        // Batch insert anchors (single query). region_codes is only populated for
        // geographic (breadth C) anchors; null otherwise.
        const anchorValues = anchorRows.map((r, i) => {
            const off = i * 5;
            return `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5})`;
        }).join(', ');
        const anchorParams = anchorRows.flatMap(r => [
            r.anchorId, r.anchor.title, r.anchor.scope, 'pending',
            r.anchor.region_codes ? JSON.stringify(r.anchor.region_codes) : null
        ]);
        const insertedRows = await query(
            `INSERT INTO anchors (id, title, scope, generation_status, region_codes) VALUES ${anchorValues} RETURNING id, title, scope, generation_status, region_codes`,
            anchorParams
        );

        // Batch insert tree positions (single query)
        const posValues = anchorRows.map((r, i) => {
            const off = i * 6;
            return `($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6})`;
        }).join(', ');
        const posParams = anchorRows.flatMap(r => [
            r.positionId, r.anchorId, parentPosId, childLevel, breadth, r.anchor.position
        ]);
        await query(
            `INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position) VALUES ${posValues}`,
            posParams
        );

        // Build response
        const insertedAnchors = insertedRows.map((row, i) => ({
            ...row,
            level: childLevel,
            breadth,
            position: anchorRows[i].anchor.position,
            causalSignificance: anchorRows[i].anchor.causalSignificance,
            humanImpact: anchorRows[i].anchor.humanImpact,
            finalScore: anchorRows[i].anchor.finalScore,
        }));

        return res.status(200).json({
            success: true,
            parentId,
            parentTitle,
            breadth,
            anchorsGenerated: insertedAnchors.length,
            anchors: insertedAnchors,
            ancestorPathUsed: ancestorPath.map(a => a.title), // For debugging
            rawResponse: response,
            generationMetadataId: metadataId,
            candidates: candidates, // Include candidates in response for immediate display
            selectionReasoning: selectionReasoning,
        });

    } catch (error) {
        console.error('Error generating anchors:', error);
        return res.status(500).json({
            error: 'Failed to generate anchors',
            details: error.message
        });
    }
}

// Build Breadth-A prompt using external template
function buildBreadthAPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings) {
    // Format ancestor context
    const ancestorContext = formatAncestorContext(ancestorPath);

    // Format sibling context
    const siblingContext = formatSiblingContext(existingSiblings);

    // Build sibling warning (only shown if siblings exist)
    const siblingWarning = existingSiblings.length > 0
        ? '**Important:** Ensure your new anchors do not duplicate or significantly overlap with these existing siblings.'
        : '';

    // Format forbidden titles for anti-circularity
    const forbiddenTitles = formatForbiddenTitles(ancestorPath);

    // Load and populate the template
    return loadPrompt('breadth-a-selection.md', {
        parentId,
        parentTitle,
        parentScope,
        ancestorContext,
        siblingContext,
        siblingWarning,
        forbiddenTitles,
        analyticalFrame: renderAnalyticalFrame(ancestorPath),
        parentSignpost: renderParentSignpost(ancestorPath)
    });
}

// Map a model-provided member reference (a place code, a place name, or a
// "Name [CODE]" string) back to a known candidate code. Returns null on no match.
function normalizeMemberToCode(ref, candidates) {
    if (ref === null || ref === undefined) return null;
    const raw = String(ref).trim();
    const lower = raw.toLowerCase();
    const byCode = candidates.find(c => c.code.toLowerCase() === lower);
    if (byCode) return byCode.code;
    const byName = candidates.find(c => c.name.toLowerCase() === lower);
    if (byName) return byName.code;
    const bracket = raw.match(/\[([^\]]+)\]\s*$/);
    if (bracket) {
        const inner = bracket[1].trim().toLowerCase();
        const byInner = candidates.find(c => c.code.toLowerCase() === inner);
        if (byInner) return byInner.code;
    }
    return null;
}

// Build the free-text cosmic geographic prompt (used for the Cosmic & Planetary
// branch, where there is no place dataset). The model proposes the place's main
// geographic regions directly, with an optional catch-all.
function buildCosmicCPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings) {
    const ancestorContext = formatAncestorContext(ancestorPath);
    const siblingNote = existingSiblings && existingSiblings.length > 0
        ? `\n**These regions already exist here — do not duplicate them:**\n${existingSiblings.map(s => `- ${s.title}`).join('\n')}\n`
        : '';
    return `# Geographic division of a cosmic place

Divide this place into its main geographic regions for a history learning tree.

**Place ID:** ${parentId}
**Place:** ${parentTitle}
**Scope:** ${parentScope}

**How we got here:**
${ancestorContext}
${siblingNote}
## What to do

Give the 2 to 5 most significant geographic regions of this place — the real divisions a learner would want. For a moon or planet that means hemispheres, major surface features, or polar regions; for a galaxy or a region of space, its major structures. For each region:
- a short title, 5 words maximum;
- a 2-3 sentence scope describing it and its role in this object's history;
- if the region is defined by a time period (an ancient terrain, an era of the body), put that period in brackets in the title, e.g. "Late Heavy Bombardment (~4.1–3.8 BYA)"; otherwise no brackets.

Then decide on a catch-all: include one ONLY if meaningful area would otherwise be left out. If the named regions already cover the place well (for example, near side plus far side cover a whole moon), set "catchAll" to null.

## Output: JSON only, no other text

\`\`\`json
{
  "regions": [
    { "title": "The Near Side", "scope": "The hemisphere permanently facing Earth, dominated by the dark basaltic maria; the face mapped and watched throughout human history." },
    { "title": "The Far Side", "scope": "The hemisphere facing away from Earth, heavily cratered with few maria, unseen until the space age." }
  ],
  "catchAll": null,
  "reasoning": "One sentence on why these are the right divisions."
}
\`\`\`

**Rules:**
- 2 to 5 named regions, titles 5 words maximum.
- "catchAll" is either an object { "title": ..., "scope": ... } or null — null when the named regions already cover the place.
- Output ONLY the JSON object.`;
}

// Build the geographic (Breadth-C) prompt. The model is handed the fixed list of
// places that make up this topic's area and groups them into a few named regions
// by strength of CONNECTION to the topic. The program forms the leftover from
// whatever is not claimed, so coverage is guaranteed regardless of the model.
function buildBreadthCPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings, candidates) {
    const ancestorContext = formatAncestorContext(ancestorPath);
    const candidateList = candidates.map(c => `- ${c.name} [${c.code}]`).join('\n');
    const siblingNote = existingSiblings && existingSiblings.length > 0
        ? `\n**These regions already exist for this topic — do not duplicate them:**\n${existingSiblings.map(s => `- ${s.title}`).join('\n')}\n`
        : '';

    return `# Geographic (place-based) division

You are dividing a topic into geographic regions for a history learning tree.

**Topic ID:** ${parentId}
**Topic:** ${parentTitle}
**Topic scope:** ${parentScope}

**Analytical frame (what "connection to this topic" means below):** ${renderAnalyticalFrame(ancestorPath)}

${renderParentSignpost(ancestorPath)}

**How we got here:**
${ancestorContext}
${siblingNote}
## What a region means here

Here "this topic" means the analytical frame above; if the frame is "None", judge places by their importance to this area's history overall, not by the parent's label.

A region is a place's CONNECTION to that frame — including its people, forces, money, and decisions WHEREVER they acted, not only events that physically happened on its soil. Example: under "World War I", the region "Australia" covers Australia's whole part in the war, including the Australians who fought at Gallipoli and in France, even though that fighting was far from Australia.

So judge a place by the STRENGTH OF ITS CONNECTION to that frame, never by how much physically happened on its ground. A place where little physically happened can still have a strong connection through the people and forces it sent elsewhere.

## Your material: the places that make up this topic's area

You may ONLY group the places listed below. Each line is "Name [CODE]". Refer to a place by its CODE.

${candidateList}

## What to do

1. Pick the 2 to 4 places (or groups of places) with the STRONGEST connection to this topic and make each one a named region. A region may bundle several places from the list if they belong together for this topic. Give each a short title (5 words max) that names a place or place-grouping.
2. List each region's members as CODES drawn ONLY from the list above. Never invent a code. Never put the same place in two regions. (The example codes below are illustrative — use the codes from your own list.)
3. Leave the remaining places UNLISTED. The program gathers everything you do not name into a single leftover region automatically — you do not list its members. You only give the leftover a title and a one-line scope, and say whether any place still inside it has a significant connection to the topic.
4. Score each named region's connection strength from 1 to 10.

## Output: JSON only, no other text

\`\`\`json
{
  "namedRegions": [
    {
      "title": "Australia and New Zealand",
      "scope": "These nations' part in the war: the ANZAC forces at Gallipoli and on the Western Front, home-front mobilisation, the conscription debates, and casualties.",
      "members": ["AU", "NZ"],
      "connectionStrength": 8
    }
  ],
  "leftover": {
    "title": "Rest of the World",
    "scope": "Places with a lesser connection to the war, kept reachable for deeper exploration.",
    "significant": true
  },
  "coverageJustification": "One or two sentences on why these regions capture the topic's strongest geographic connections."
}
\`\`\`

**Rules:**
- 2 to 4 named regions. Members must be codes from the list above. No place in two regions.
- A title may use a recognisable name for the grouping (e.g. "The Western Front"), 5 words maximum. But the title must NOT imply places the region leaves out, and the scope MUST name the actual places the region covers. If the members do not fit a tidy name, use a plainer geographic title. (Example: a region whose members are Northern Africa, the Middle East and Central Africa must not be titled just "Middle East and North Africa" — name Central Africa in the scope, or retitle so nothing is hidden.)
- Set "significant" to true if any place left in the leftover still has a meaningful connection to the topic (so it should be explored further); false if everything remaining is minor.
- If a region is a time-bounded entity (an ancient landmass, a celestial body, an extinct polity), put its period in brackets in the title, e.g. "Gondwana (~550–180 MYA)".
- Output ONLY the JSON object.`;
}

function buildBreadthBPrompt(parentId, parentTitle, parentScope, ancestorPath, existingSiblings) {
    // Format ancestor path with emphasis on temporal and scope constraints
    const ancestorContext = ancestorPath.length > 0
        ? ancestorPath.map((a, i) => {
            let constraintType = '';
            if (a.breadth === 'A') constraintType = '(Analytical/Thematic constraint)';
            else if (a.breadth === 'B') constraintType = '(Temporal constraint)';
            else if (a.breadth === 'C') constraintType = '(Geographic constraint)';

            return `Level ${a.level}: **${a.title}** ${constraintType}\n   Scope: ${a.scope}`;
        }).join('\n\n')
        : 'No ancestor path (this is a top-level anchor)';

    // Format existing siblings
    const siblingContext = existingSiblings.length > 0
        ? existingSiblings.map((s, i) =>
            `${i + 1}. ${s.title}\n   Scope: ${s.scope || 'No scope'}`
        ).join('\n\n')
        : 'None yet - you are generating the first temporal divisions';

    // Identify inherited constraints from ancestors
    const constraints = {
        topic: [],
        geographic: [],
        temporal: [],
        analytical: []
    };

    ancestorPath.forEach(a => {
        if (a.breadth === 'A') constraints.analytical.push(a.title);
        else if (a.breadth === 'B') constraints.temporal.push(a.title);
        else if (a.breadth === 'C') constraints.geographic.push(a.title);
        else constraints.topic.push(a.title);
    });

    const constraintSummary = `
**Inherited Scope Constraints:**
${constraints.topic.length > 0 ? `- Topic: ${constraints.topic.join(' → ')}` : ''}
${constraints.geographic.length > 0 ? `- Geography: Limited to ${constraints.geographic[constraints.geographic.length - 1]}` : '- Geography: No geographic limitations'}
${constraints.temporal.length > 0 ? `- Time: Subdividing ${constraints.temporal[constraints.temporal.length - 1]}` : '- Time: Full historical timespan available'}
${constraints.analytical.length > 0 ? `- Thematic focus: ${constraints.analytical.join(', ')}` : ''}

Your temporal anchors must respect ALL these constraints.
    `.trim();

    return `# Breadth-B Temporal Anchor Selection Task

## Your Task

You are selecting **Breadth-B anchors** (temporal - chronological divisions) for the parent anchor:

**Parent ID:** ${parentId}
**Parent Title:** ${parentTitle}
**Parent Scope:** ${parentScope}

**Analytical frame (what the sub-periods are ABOUT):** ${renderAnalyticalFrame(ancestorPath)}

${renderParentSignpost(ancestorPath)}

Your goal is to find the BEST way to divide this period into sub-periods by:
1. First considering 3 different subdivision schemes
2. Rating each scheme on 3 criteria
3. Selecting the highest-scoring scheme
4. Generating the actual anchors for that scheme

---

## CRITICAL CONTEXT: Learning Path That Led Here

**Full ancestor path (how we reached this anchor):**

${ancestorContext}

${constraintSummary}

---

## Sibling Context: What Already Exists at This Level

${existingSiblings.length > 0 ? '**Existing B-anchors already generated:**\n\n' + siblingContext : siblingContext}

${existingSiblings.length > 0 ? '**Important:** Ensure your new temporal periods do not duplicate these existing siblings.\n' : ''}

---

## What are B-Anchors (Temporal)?

B-anchors represent **chronological divisions** of a topic. They answer: "How does this topic unfold over time?"

**Key principles:**
1. **Complete Coverage**: Your periods must cover the entire timespan of the parent topic
2. **No Gaps**: Every moment in the parent's timespan should fall within at least one period
3. **Natural Breakpoints**: Periods should reflect meaningful historical transitions
4. **Comprehensive Scope**: Each period contains EVERYTHING happening during that time
5. **Bounded Count**: Divide into **3 to 5 periods — never more than 5**. If natural breakpoints suggest more, merge the finest-grained adjacent periods until at most 5 remain. A few well-chosen periods beat many narrow ones.

---

## Selection Process: Three Candidate Schemes

You must consider **exactly 3 different ways** to subdivide this topic chronologically. Each scheme must use **3 to 5 sub-periods — never more than 5.**

**Important:** All 3 schemes must be TEMPORAL (chronological) subdivisions. Do NOT include geographic or thematic organization schemes - those belong in C-anchors and A-anchors respectively.

**Examples of valid temporal subdivision approaches:**
- By military phases (for wars)
- By political eras (for nations/empires)
- By technological stages (for technological topics)
- By generational/demographic shifts
- By economic cycles
- By cultural movements
- By leadership periods (reigns, administrations)

### Rating Criteria (1-3 for each)

For each candidate scheme, rate on these three criteria:

**1. Natural Breakpoints (1-3)**
- Are the period boundaries clear and meaningful transitions?
- Do they represent genuine turning points, not arbitrary divisions?
- 3 = Crystal clear, universally recognized breakpoints
- 2 = Reasonable breakpoints, some debate possible
- 1 = Arbitrary or unclear boundaries

**2. Comparable Depth (1-3)**
- Does each subdivision have similar learning load/complexity?
- Are the periods roughly balanced in importance and content?
- 3 = Very balanced, each period has similar depth
- 2 = Mostly balanced, one period slightly heavier
- 1 = Significantly unbalanced periods

**3. Historical Convention (1-3)**
- Does this match how historians typically divide this topic?
- Is this periodization recognized in academic literature?
- 3 = Standard academic periodization
- 2 = One common approach among several
- 1 = Unusual or idiosyncratic approach

**Total Score = Sum of all three (max 9)**

---

## Output Format

Provide your response as valid JSON:

\`\`\`json
{
  "temporalBoundariesInferred": {
    "start": "YEAR/DATE",
    "end": "YEAR/DATE",
    "rationale": "How you determined these boundaries"
  },
  "candidateSchemes": [
    {
      "name": "Scheme Name (e.g., By Military Phases)",
      "anchors": [
        "Period 1 Name: START - END",
        "Period 2 Name: START - END",
        "Period 3 Name: START - END"
      ],
      "ratings": {
        "naturalBreakpoints": {
          "score": 3,
          "justification": "One sentence explaining this score"
        },
        "comparableDepth": {
          "score": 2,
          "justification": "One sentence explaining this score"
        },
        "historicalConvention": {
          "score": 3,
          "justification": "One sentence explaining this score"
        }
      },
      "totalScore": 8,
      "selected": true
    },
    {
      "name": "Second Scheme Name",
      "anchors": ["..."],
      "ratings": { "..." },
      "totalScore": 6,
      "selected": false
    },
    {
      "name": "Third Scheme Name",
      "anchors": ["..."],
      "ratings": { "..." },
      "totalScore": 5,
      "selected": false
    }
  ],
  "selectedScheme": "Name of the selected scheme",
  "anchors": [
    {
      "position": 1,
      "title": "Period Name: START - END",
      "timeBoundaries": {
        "start": "YEAR/DATE",
        "end": "YEAR/DATE"
      },
      "scope": "2-3 sentences describing this period"
    },
    {
      "position": 2,
      "title": "Period Name: START - END",
      "timeBoundaries": {
        "start": "YEAR/DATE",
        "end": "YEAR/DATE"
      },
      "scope": "2-3 sentences describing this period"
    }
  ],
  "coverageJustification": "Why the selected scheme provides the best coverage"
}
\`\`\`

**CRITICAL:**
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanatory text
- Just the raw JSON object
- Ensure all property names are in quotes
- Ensure all string values are in quotes
- Include exactly 3 candidate schemes
- Each candidate scheme's "anchors" array must contain 3 to 5 periods (NEVER more than 5)
- The final top-level "anchors" array must contain AT MOST 5 periods
- Mark exactly one scheme as selected (the highest scoring)

**CRITICAL:** Use human-readable date formats, NOT raw numbers.

**For billions of years ago:**
- Correct: "4 BYA", "3.5 BYA", "2.4 BYA"

**For millions of years ago:**
- Correct: "3 MYA", "200,000 years ago", "1.8 MYA"

**For thousands of years BCE:**
- Correct: "10,000 BCE", "3,000 BCE", "8,000 BCE"

**For recent history:**
- Correct: "1939", "1945", "1941 CE"

---

## Example

**Parent: World War I (1914-1918)**

\`\`\`json
{
  "temporalBoundariesInferred": {
    "start": "1914",
    "end": "1918",
    "rationale": "Standard dates for WWI from assassination of Franz Ferdinand to Armistice"
  },
  "candidateSchemes": [
    {
      "name": "By Military Phases",
      "anchors": [
        "Opening Campaigns: Aug-Dec 1914",
        "Stalemate & Attrition: 1915-1916",
        "Total War & Resolution: 1917-1918"
      ],
      "ratings": {
        "naturalBreakpoints": {
          "score": 3,
          "justification": "Battle of the Marne, Verdun/Somme, US entry and Russian exit mark universally recognized turning points."
        },
        "comparableDepth": {
          "score": 2,
          "justification": "Each phase has similar complexity, though 1917-18 is shorter but more intense."
        },
        "historicalConvention": {
          "score": 3,
          "justification": "Military historians universally use this three-phase framework."
        }
      },
      "totalScore": 8,
      "selected": true
    },
    {
      "name": "By Fronts Activated",
      "anchors": [
        "Western Front War: 1914-1918",
        "Eastern Front Opens: 1914-1917",
        "Global Expansion: 1915-1918",
        "Final Collapse: 1918"
      ],
      "ratings": {
        "naturalBreakpoints": {
          "score": 2,
          "justification": "Front openings are clear but overlapping timelines blur phase transitions."
        },
        "comparableDepth": {
          "score": 1,
          "justification": "Western Front dominates learning weight disproportionately."
        },
        "historicalConvention": {
          "score": 3,
          "justification": "Common in comprehensive military histories focusing on geographic scope."
        }
      },
      "totalScore": 6,
      "selected": false
    },
    {
      "name": "By Political Turning Points",
      "anchors": [
        "Outbreak & Mobilization: 1914",
        "War of Attrition: 1915-1916",
        "Revolution & US Entry: 1917",
        "Collapse & Armistice: 1918"
      ],
      "ratings": {
        "naturalBreakpoints": {
          "score": 1,
          "justification": "Political events are clear but less intuitive pedagogically than military phases."
        },
        "comparableDepth": {
          "score": 3,
          "justification": "Each phase has comparable political complexity and learning requirements."
        },
        "historicalConvention": {
          "score": 1,
          "justification": "Less standard than military phase approach in historical literature."
        }
      },
      "totalScore": 5,
      "selected": false
    }
  ],
  "selectedScheme": "By Military Phases",
  "anchors": [
    {
      "position": 1,
      "title": "Opening Campaigns: Aug-Dec 1914",
      "timeBoundaries": {"start": "August 1914", "end": "December 1914"},
      "scope": "Assassination of Franz Ferdinand triggers war declarations. Initial German advance through Belgium. Battle of the Marne halts German offensive. Race to the Sea establishes trench lines. Eastern Front opens with German victory at Tannenberg."
    },
    {
      "position": 2,
      "title": "Stalemate & Attrition: 1915-1916",
      "timeBoundaries": {"start": "1915", "end": "1916"},
      "scope": "Trench warfare dominates Western Front. Battles of Verdun and Somme cause massive casualties. Gallipoli campaign fails. Naval blockades and submarine warfare intensify. War of attrition grinds down all participants."
    },
    {
      "position": 3,
      "title": "Total War & Resolution: 1917-1918",
      "timeBoundaries": {"start": "1917", "end": "November 1918"},
      "scope": "US enters war. Russian Revolution leads to Eastern Front collapse. German Spring Offensive fails. Allied Hundred Days Offensive. Central Powers collapse. Armistice signed November 11, 1918."
    }
  ],
  "coverageJustification": "The military phases scheme provides the clearest narrative arc from opening movement through static warfare to final resolution, matching how most historians teach WWI."
}
\`\`\`

---

## Remember

1. Generate exactly 3 candidate subdivision schemes (all TEMPORAL, no geographic schemes)
2. Rate each honestly on the 3 criteria BEFORE selecting
3. Select the highest-scoring scheme
4. Generate full anchor details only for the selected scheme
5. Output ONLY valid JSON
`;
}

// Parse a time period string and return a sortable numeric value (years before present, negative for CE dates)
function parseTimePeriodToSortValue(timePeriod) {
    if (!timePeriod) return 0;

    const str = timePeriod.toLowerCase().trim();

    // Handle billions of years ago (e.g., "4.6 BYA", "~2.4 billion years ago")
    const byaMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:bya|billion\s*years?\s*ago)/i);
    if (byaMatch) {
        return parseFloat(byaMatch[1]) * 1_000_000_000;
    }

    // Handle millions of years ago (e.g., "65 MYA", "3 million years ago")
    const myaMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:mya|million\s*years?\s*ago)/i);
    if (myaMatch) {
        return parseFloat(myaMatch[1]) * 1_000_000;
    }

    // Handle thousands of years ago (e.g., "10,000 years ago")
    const kyaMatch = str.match(/(\d+(?:,\d+)?)\s*(?:kya|thousand\s*years?\s*ago|years?\s*ago)/i);
    if (kyaMatch) {
        return parseFloat(kyaMatch[1].replace(/,/g, ''));
    }

    // Handle BCE/BC dates (e.g., "3000 BCE", "500 BC")
    const bceMatch = str.match(/(\d+(?:,\d+)?)\s*(?:bce|bc)/i);
    if (bceMatch) {
        return parseFloat(bceMatch[1].replace(/,/g, '')) + 2025; // Convert to years before 2025
    }

    // Handle CE/AD dates or plain years (e.g., "1914", "1939-1945", "1900s")
    // Look for the first/start year
    const ceMatch = str.match(/(\d{3,4})(?:\s*(?:ce|ad))?/i);
    if (ceMatch) {
        const year = parseInt(ceMatch[1]);
        // Return negative value so CE dates sort after BCE (smaller = earlier)
        return -(year);
    }

    // Handle decades (e.g., "1970s-present")
    const decadeMatch = str.match(/(\d{4})s/i);
    if (decadeMatch) {
        return -(parseInt(decadeMatch[1]));
    }

    // Default: can't parse, return 0 (will maintain original order)
    console.warn(`Could not parse time period: "${timePeriod}"`);
    return 0;
}

// Parse the LLM response to extract anchor data (updated)
function parseAnchorResponse(response, parentId) {
    const anchors = [];

    try {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```\n?/g, '');  // Remove triple backticks

        // Debug: check for FINAL SELECTION
        console.log('Looking for FINAL SELECTION in response...');
        console.log('Response contains "FINAL SELECTION":', cleaned.includes('FINAL SELECTION'));
        console.log('Response contains "STEP 3":', cleaned.includes('STEP 3'));
        console.log('Response contains "STEP 4":', cleaned.includes('STEP 4'));

        // Look for FINAL SELECTION section (may be STEP 3 or STEP 4 depending on LLM)
        let step3Content = null;

        const finalSelectionMatch = cleaned.match(/STEP \d+:.*?FINAL SELECTION([\s\S]*?)(?=STEP \d+:|$)/i);
        if (finalSelectionMatch) {
            step3Content = finalSelectionMatch[1];
        } else {
            // Try alternative: just find "FINAL SELECTION" and capture until next STEP or end
            const altMatch = cleaned.match(/FINAL SELECTION[:\s]*([\s\S]*?)(?=STEP \d+:|$)/i);
            if (altMatch) {
                console.log('Found FINAL SELECTION using alternative regex');
                step3Content = altMatch[1];
            } else {
                console.log('First 500 chars of response:', cleaned.substring(0, 500));
                throw new Error('Could not find FINAL SELECTION section in response');
            }
        }

        // Split by numbered anchors - handles both "1. **Title**" and "1. Title"
        const anchorSections = step3Content.split(/\n\s*\d+\.\s*(?=\*\*|[A-Z])/);

        // Skip first element (it's the text before the first anchor)
        for (let i = 1; i < anchorSections.length; i++) {
            const section = anchorSections[i];

            // Extract title - handles both **Title** and plain Title (up to newline)
            const titleMatch = section.match(/^\*\*([^*]+)\*\*/) || section.match(/^([^\n]+)/);
            if (!titleMatch) continue;
            const title = titleMatch[1].trim();

            // Extract time period (for chronological sorting)
            const timePeriodMatch = section.match(/- Time Period:\s*([^\n]+)/i);
            const timePeriod = timePeriodMatch ? timePeriodMatch[1].trim() : '';

            // Extract scope (after "- Scope:" until next "- " field)
            // Try with quotes first, then without
            let scopeMatch = section.match(/- Scope:\s*"([^"]+)"/);
            if (!scopeMatch) {
                // Try without quotes - match until the next "- " field
                scopeMatch = section.match(/- Scope:\s*([^\n]+(?:\n(?!\s*-)[^\n]+)*)/);
            }
            if (!scopeMatch) continue;
            const scope = scopeMatch[1].trim();

            // Extract position (we'll override this after sorting)
            const positionMatch = section.match(/- Position:\s*(\d+)/);
            const position = positionMatch ? parseInt(positionMatch[1]) : i;

            // Extract causal significance
            const causalMatch = section.match(/- Causal Significance:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
            if (!causalMatch) continue;
            const causalSig = parseFloat(causalMatch[1]);

            // Extract human impact
            const humanMatch = section.match(/- Human Impact:\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
            if (!humanMatch) continue;
            const humanImpact = parseFloat(humanMatch[1]);

            // Extract final score
            const scoreMatch = section.match(/- Final Score:\s*(\d+(?:\.\d+)?)/);
            if (!scoreMatch) continue;
            const finalScore = parseFloat(scoreMatch[1]);

            anchors.push({
                title: title,
                scope: scope,
                timePeriod: timePeriod,
                sortValue: parseTimePeriodToSortValue(timePeriod),
                position: position,
                causalSignificance: causalSig,
                humanImpact: humanImpact,
                finalScore: finalScore
            });
        }

        if (anchors.length === 0) {
            throw new Error('No anchors could be parsed from response');
        }

        // Sort anchors chronologically (earliest first)
        // Higher sortValue = further in the past, so sort descending
        // Negative sortValue = CE dates, so they come after positive (BCE/ancient)
        anchors.sort((a, b) => b.sortValue - a.sortValue);

        // Reassign positions based on chronological order
        anchors.forEach((anchor, index) => {
            anchor.position = index + 1;
        });

        console.log(`Successfully parsed ${anchors.length} anchors (sorted chronologically):`);
        anchors.forEach(a => console.log(`  Position ${a.position}: ${a.title} (${a.timePeriod})`));

        return anchors;

    } catch (error) {
        console.error('Error parsing response:', error);
        console.error('Response was:', response);
        throw new Error(`Failed to parse LLM response: ${error.message}`);
    }
}

// Parse LLM response for Breadth-B (Temporal) anchors
// Hard cap on temporal (B) anchors: a parent must NEVER divide into more than `max`
// sub-periods. The prompt also asks for this, but a prompt is a soft constraint, so this
// is the guarantee. We cannot simply drop extra periods the way analytical (A) anchors can
// — each B period covers a contiguous slice of time, so dropping one would leave a gap in
// coverage. Instead we MERGE the finest-grained adjacent pair (the most over-divided slice)
// repeatedly until `max` remain, which preserves complete, gap-free coverage.
function capTemporalAnchors(anchors, max = 5) {
    if (!Array.isArray(anchors) || anchors.length <= max) return anchors;

    console.warn(`Breadth B: model returned ${anchors.length} periods; merging down to ${max}.`);

    const startVal = (a) => parseTimePeriodToSortValue(a.timeBoundaries?.start || a.title);
    const spanOf = (a) => {
        const span = Math.abs(startVal(a) - parseTimePeriodToSortValue(a.timeBoundaries?.end || a.title));
        return Number.isFinite(span) ? span : Infinity; // unparseable: don't merge it preferentially
    };
    const nameOf = (a) => ((a.title || '').split(':')[0].trim() || a.title || 'Period');

    // Oldest-first so "adjacent" means chronologically adjacent (older = larger sort value).
    const work = [...anchors].sort((a, b) => startVal(b) - startVal(a));

    while (work.length > max) {
        let bestIdx = 0;
        let bestSpan = Infinity;
        for (let i = 0; i < work.length - 1; i++) {
            const combined = spanOf(work[i]) + spanOf(work[i + 1]);
            if (combined < bestSpan) { bestSpan = combined; bestIdx = i; }
        }
        const a = work[bestIdx];
        const b = work[bestIdx + 1];
        work.splice(bestIdx, 2, {
            position: 0,
            title: `${nameOf(a)} – ${nameOf(b)}`,
            scope: [a.scope, b.scope].filter(Boolean).join(' '),
            timeBoundaries: {
                start: a.timeBoundaries?.start ?? b.timeBoundaries?.start,
                end: b.timeBoundaries?.end ?? a.timeBoundaries?.end,
            },
            causalSignificance: 0, humanImpact: 0, finalScore: 0,
        });
    }

    work.forEach((a, i) => { a.position = i + 1; });
    return work;
}

function parseTemporalAnchorResponse(response, parentId) {
    try {
        // Remove markdown code blocks if present
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        // Parse JSON
        const data = JSON.parse(cleaned);

        // Validate structure
        if (!data.anchors || !Array.isArray(data.anchors)) {
            throw new Error('Response missing anchors array');
        }

        // Transform to expected format
        return data.anchors.map(anchor => ({
            position: anchor.position,
            title: anchor.title,
            scope: anchor.scope,
            timeBoundaries: anchor.timeBoundaries,
            // For consistency with Breadth-A display
            causalSignificance: 0,
            humanImpact: 0,
            finalScore: 0
        }));

    } catch (error) {
        console.error('Error parsing temporal anchor response:', error);
        console.error('Raw response:', response);
        throw new Error(`Failed to parse temporal anchor response: ${error.message}`);
    }
}

// Parse candidate subdivision schemes from B-anchor response
function parseTemporalCandidates(response) {
    try {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const data = JSON.parse(cleaned);

        if (!data.candidateSchemes || !Array.isArray(data.candidateSchemes)) {
            console.log('No candidateSchemes found in response');
            return [];
        }

        // Transform to the format expected by WhyTheseAnchors
        return data.candidateSchemes.map(scheme => ({
            name: scheme.name,
            anchors: scheme.anchors,
            ratings: scheme.ratings,
            totalScore: scheme.totalScore,
            selected: scheme.selected
        }));

    } catch (error) {
        console.error('Error parsing temporal candidates:', error);
        return [];
    }
}

// Parse ALL candidate anchors from the LLM response (for "Why these Anchors?" feature)
// Note: LLM may use different section names (CANDIDATE ANCHORS vs BRAINSTORM CANDIDATES)
// Justifications with scores are typically in STEP 2 (EVALUATION section)
function parseCandidatesFromResponse(response) {
    const candidates = [];

    try {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```\n?/g, '');

        // Find STEP 2 section (where evaluations with justifications are)
        // This handles variations like "STEP 2: SYSTEMATIC EVALUATION", "STEP 2: RANKING", etc.
        const step2Match = cleaned.match(/STEP 2:[^\n]*([\s\S]*?)STEP 3:/i);
        if (!step2Match) {
            console.log('Could not find STEP 2 section, trying STEP 1...');
            // Fallback to STEP 1 if STEP 2 not found
            const step1Match = cleaned.match(/STEP 1:[^\n]*([\s\S]*?)STEP 2:/i);
            if (!step1Match) {
                console.log('Could not find candidate sections, returning empty candidates');
                return candidates;
            }
        }

        const evalContent = step2Match ? step2Match[1] : '';

        // Split by numbered candidates (1. Title:, 2. Title:, etc.)
        const candidateSections = evalContent.split(/\n\s*\d+\.\s*Title:/i);

        // Skip first element (text before first candidate)
        for (let i = 1; i < candidateSections.length; i++) {
            const section = 'Title:' + candidateSections[i];

            // Extract title
            const titleMatch = section.match(/Title:\s*([^\n]+)/i);
            if (!titleMatch) continue;
            const title = titleMatch[1].trim().replace(/^["']|["']$/g, '');

            // Extract type (may not be present in STEP 2)
            const typeMatch = section.match(/Type:\s*([^\n]+)/i);
            const type = typeMatch ? typeMatch[1].trim() : 'Unknown';

            // Extract scope (may not be present in STEP 2)
            const scopeMatch = section.match(/Scope:\s*["']?([^"'\n]+(?:\n(?!\s*(?:Causal|Human|Final|Type|Anti))[^\n]+)*)["']?/i);
            const scope = scopeMatch ? scopeMatch[1].trim().replace(/^["']|["']$/g, '') : '';

            // Extract causal significance
            const causalMatch = section.match(/Causal Significance:\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
            const causalSignificance = causalMatch ? parseFloat(causalMatch[1]) : 0;

            // Extract causal justification - handles both "Justification: ..." on next line and "9/10 - ..." inline
            const causalJustMatch = section.match(/Causal Significance:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*\n\s*Justification:\s*([^\n]+)/i)
                || section.match(/Causal Significance:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*[-–]\s*([^\n]+)/i);
            const causalJustification = causalJustMatch ? causalJustMatch[1].trim() : '';

            // Extract human impact
            const humanMatch = section.match(/Human Impact:\s*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
            const humanImpact = humanMatch ? parseFloat(humanMatch[1]) : 0;

            // Extract human justification - handles both formats
            const humanJustMatch = section.match(/Human Impact:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*\n\s*Justification:\s*([^\n]+)/i)
                || section.match(/Human Impact:\s*\d+(?:\.\d+)?\s*(?:\/\s*10)?\s*[-–]\s*([^\n]+)/i);
            const humanJustification = humanJustMatch ? humanJustMatch[1].trim() : '';

            // Extract final score
            const scoreMatch = section.match(/Final Score:\s*(\d+(?:\.\d+)?)/i);
            const finalScore = scoreMatch ? parseFloat(scoreMatch[1]) : (causalSignificance * 0.6) + (humanImpact * 0.4);

            candidates.push({
                title,
                type,
                scope,
                causalSignificance,
                causalJustification,
                humanImpact,
                humanJustification,
                finalScore
            });
        }

        console.log(`Parsed ${candidates.length} candidates from evaluation section`);
        return candidates;

    } catch (error) {
        console.error('Error parsing candidates:', error);
        return candidates;
    }
}

// Extract selection reasoning from STEP 3
function parseSelectionReasoning(response) {
    try {
        let cleaned = response.trim();
        cleaned = cleaned.replace(/```\n?/g, '');

        // Look for reasoning after "Number of anchors selected" or "Reasoning:"
        const reasoningMatch = cleaned.match(/(?:Number of anchors selected:\s*\d+\s*\n\s*Reasoning:\s*|I'm selecting \d+ anchors because\s*)([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/i);
        if (reasoningMatch) {
            return reasoningMatch[1].trim();
        }

        // Alternative: look for text after STEP 3 header before first anchor
        const step3Match = cleaned.match(/STEP 3:.*?FINAL SELECTION\s*\n([\s\S]*?)(?=\n\s*1\.\s*\*\*)/i);
        if (step3Match) {
            return step3Match[1].trim();
        }

        return '';
    } catch (error) {
        console.error('Error parsing selection reasoning:', error);
        return '';
    }
}