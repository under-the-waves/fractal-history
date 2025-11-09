import { neon } from '@neondatabase/serverless';
import OpenAI from 'openai';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get request body
        const { parentPositionId, breadth } = req.body;

        // Validate required parameters
        if (!parentPositionId || !breadth) {
            return res.status(400).json({
                error: 'Missing required parameters: parentPositionId and breadth'
            });
        }

        // Initialize database and OpenAI
        const sql = neon(process.env.DATABASE_URL);
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Get parent anchor details
        const [parentPosition] = await sql`
      SELECT tp.*, a.title, a.scope
      FROM tree_positions tp
      JOIN anchors a ON tp.anchor_id = a.id
      WHERE tp.position_id = ${parentPositionId}
    `;

        if (!parentPosition) {
            return res.status(404).json({ error: 'Parent anchor not found' });
        }

        // Build the prompt for GPT-4o-mini
        const prompt = `You are generating child anchors for a Fractal History learning system.

PARENT ANCHOR:
Position ID: ${parentPositionId}
Title: ${parentPosition.title}
Scope: ${parentPosition.scope}
Level: ${parentPosition.level}
Breadth: ${breadth}

TASK: Generate 3-5 child anchors at breadth level "${breadth}" (Level ${parentPosition.level + 1}${breadth}).

For breadth A: Generate the 3-5 MOST ESSENTIAL analytical aspects/topics.
For breadth B: Generate 3-5 temporal periods that cover the parent's timespan.
For breadth C: Generate 3-5 geographic regions relevant to the parent topic.

OUTPUT FORMAT (JSON):
{
  "anchors": [
    {
      "title": "Short descriptive title",
      "scope": "2-3 sentence description of what this anchor covers, time period if applicable, what's included/excluded"
    }
  ]
}

Generate 3-5 anchors based on what's most appropriate for this topic. Return ONLY valid JSON, no other text.`;

        // Call OpenAI API
        console.log('Calling OpenAI API...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a historical education expert. You generate precise, well-scoped anchor topics for a fractal learning system. Always return valid JSON only."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        // Parse the response
        const responseText = completion.choices[0].message.content.trim();
        console.log('OpenAI response:', responseText);

        let generatedAnchors;
        try {
            generatedAnchors = JSON.parse(responseText);
        } catch (parseError) {
            return res.status(500).json({
                error: 'Failed to parse OpenAI response as JSON',
                rawResponse: responseText
            });
        }

        if (!generatedAnchors.anchors || !Array.isArray(generatedAnchors.anchors)) {
            return res.status(500).json({
                error: 'Invalid response format from OpenAI',
                response: generatedAnchors
            });
        }

        // Generate unique IDs for each anchor (5-character hash)
        const generateId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = '';
            for (let i = 0; i < 5; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        };

        // Insert anchors and positions into database
        const insertedAnchors = [];
        const childLevel = parentPosition.level + 1;

        for (let i = 0; i < generatedAnchors.anchors.length; i++) {
            const anchor = generatedAnchors.anchors[i];
            const anchorId = generateId();
            const positionId = `${childLevel}${breadth}-${anchorId}`;

            // Insert into anchors table
            await sql`
        INSERT INTO anchors (id, title, scope, generation_status)
        VALUES (${anchorId}, ${anchor.title}, ${anchor.scope}, 'placeholder')
      `;

            // Insert into tree_positions table
            await sql`
        INSERT INTO tree_positions (position_id, anchor_id, parent_position_id, level, breadth, position)
        VALUES (${positionId}, ${anchorId}, ${parentPositionId}, ${childLevel}, ${breadth}, ${i + 1})
      `;

            insertedAnchors.push({
                position_id: positionId,
                anchor_id: anchorId,
                title: anchor.title,
                scope: anchor.scope,
                position: i + 1
            });
        }

        // Return success response
        return res.status(200).json({
            success: true,
            count: insertedAnchors.length,
            anchors: insertedAnchors
        });

    } catch (error) {
        console.error('Error generating anchors:', error);
        return res.status(500).json({
            error: 'Failed to generate anchors',
            details: error.message
        });
    }
}