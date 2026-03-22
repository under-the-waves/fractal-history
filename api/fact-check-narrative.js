import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

let anthropic = null;
let sql = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return anthropic;
}

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL);
    }
    return sql;
}

function loadPrompt() {
    const promptPath = path.join(process.cwd(), 'api', 'prompts', 'fact-check-prompt.md');
    return fs.readFileSync(promptPath, 'utf-8');
}

async function webSearch(query) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        throw new Error('SERPER_API_KEY not configured');
    }

    const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 5 }),
    });

    if (!response.ok) {
        throw new Error(`Serper search failed: ${response.status}`);
    }

    const data = await response.json();
    const results = (data.organic || []).map(r => ({
        title: r.title,
        url: r.link,
        description: r.snippet,
    }));

    return results;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { anchorId, breadth } = req.body;

    if (!anchorId || !breadth) {
        return res.status(400).json({ error: 'anchorId and breadth are required' });
    }

    try {
        const db = getSql();

        // Load the existing narrative
        const narratives = await db`
            SELECT id, narrative, anchor_id, breadth
            FROM narratives
            WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
        `;

        if (narratives.length === 0) {
            return res.status(404).json({ error: 'Narrative not found' });
        }

        const narrative = narratives[0];

        // Load anchor context
        const anchors = await db`
            SELECT id, title, scope FROM anchors WHERE id = ${anchorId}
        `;
        const anchor = anchors[0];

        const systemPrompt = loadPrompt();
        const client = getAnthropicClient();

        const tools = [{
            name: 'web_search',
            description: 'Search the web for information to verify historical claims. Returns a list of results with titles, URLs, and descriptions.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query'
                    }
                },
                required: ['query']
            }
        }];

        const userMessage = `Here is the narrative to fact-check:\n\nTopic: ${anchor.title}\nScope: ${anchor.scope || 'N/A'}\nBreadth: ${breadth}\n\n${narrative.narrative}`;

        let messages = [{ role: 'user', content: userMessage }];
        let finalResult = null;

        // Tool-use loop
        for (let i = 0; i < 15; i++) {
            const response = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 8192,
                system: systemPrompt,
                tools,
                messages,
            });

            // Check if we got a final text response
            if (response.stop_reason === 'end_turn') {
                const textBlock = response.content.find(b => b.type === 'text');
                if (textBlock) {
                    // Parse the JSON from the response
                    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        finalResult = JSON.parse(jsonMatch[0]);
                    }
                }
                break;
            }

            // Handle tool use
            if (response.stop_reason === 'tool_use') {
                const assistantContent = response.content;
                messages.push({ role: 'assistant', content: assistantContent });

                const toolResults = [];
                for (const block of assistantContent) {
                    if (block.type === 'tool_use' && block.name === 'web_search') {
                        try {
                            const results = await webSearch(block.input.query);
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: JSON.stringify(results),
                            });
                        } catch (err) {
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: `Search failed: ${err.message}`,
                                is_error: true,
                            });
                        }
                    }
                }

                messages.push({ role: 'user', content: toolResults });
            } else {
                break;
            }
        }

        if (!finalResult) {
            return res.status(500).json({ error: 'Failed to parse fact-check results' });
        }

        // Store the fact-checked narrative
        await db`
            UPDATE narratives
            SET fact_checked_narrative = ${finalResult.narrative},
                sources = ${JSON.stringify(finalResult.sources)},
                fact_checked_at = NOW()
            WHERE anchor_id = ${anchorId} AND breadth = ${breadth}
        `;

        return res.status(200).json({
            success: true,
            narrative: finalResult.narrative,
            sources: finalResult.sources,
            corrections: finalResult.corrections,
        });

    } catch (error) {
        console.error('Error fact-checking narrative:', error);
        return res.status(500).json({ error: 'Failed to fact-check narrative' });
    }
}
