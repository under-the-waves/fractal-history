import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

let anthropic = null;

function getAnthropicClient() {
    if (!anthropic) {
        anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return anthropic;
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
    return (data.organic || []).map(r => ({
        title: r.title,
        url: r.link,
        description: r.snippet,
    }));
}

/**
 * Fact-check a narrative using Claude with web search tool use.
 * Returns { narrative, sources, corrections } or null on failure.
 */
export async function factCheckNarrative(narrativeHtml, anchorTitle, anchorScope, breadth) {
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

    const userMessage = `Here is the narrative to fact-check:\n\nTopic: ${anchorTitle}\nScope: ${anchorScope || 'N/A'}\nBreadth: ${breadth}\n\n${narrativeHtml}`;

    let messages = [{ role: 'user', content: userMessage }];

    for (let i = 0; i < 15; i++) {
        const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            system: systemPrompt,
            tools,
            messages,
        });

        if (response.stop_reason === 'end_turn') {
            const textBlock = response.content.find(b => b.type === 'text');
            if (textBlock) {
                const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
            break;
        }

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

    return null;
}
