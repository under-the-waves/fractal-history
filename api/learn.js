// Consolidated "Learn" pipeline endpoint. One Vercel function dispatching on ?action= keeps the
// project under the 12-serverless-function cap (cron-decay-scores was moved to a GitHub Action to
// free this slot). See: project knowledge/Learn_Build_Plan.md.
//
//   GET  /api/learn?action=get&id=<anchor>&breadth=<A|B|C>
//        -> the study fact-cards for the choice/study screen ({ exists, title, scope, prelude,
//           subAnchors }). Never returns the marking fact base. exists:false means "not generated yet".
//   POST /api/learn?action=generate  body { id, breadth }
//        -> generate (research -> cards) and cache, then return the cards. Synchronous (~55s); the
//           frontend shows a loading screen. Returns the cached row instantly if already generated.
//   POST /api/learn?action=mark      body { anchorId, breadth, narrative }   (auth required)
//        -> grade the learner's narrative, persist the best mark, fold it into the score (XP), and
//           return the mark report plus xpEarned / nodeScore.

import dotenv from 'dotenv';
import { getAuthenticatedUser } from '../lib/auth.js';
import { getLearnContent, generateLearnContent } from '../lib/learnContent.js';
import { markNarrative } from '../lib/marking.js';
import { recordWriteMark } from '../lib/scoring.js';

dotenv.config({ path: '.env.local' });

export default async function handler(req, res) {
    const action = req.query.action || req.body?.action;

    try {
        if (action === 'get') {
            if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
            return handleGet(req, res);
        }
        if (action === 'generate') {
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
            return handleGenerate(req, res);
        }
        if (action === 'mark') {
            if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
            return handleMark(req, res);
        }
        return res.status(400).json({ error: 'Unknown action. Use action=get|generate|mark.' });
    } catch (error) {
        console.error(`Learn API error (action=${action}):`, error);
        return res.status(500).json({ error: 'Learn request failed', details: error.message });
    }
}

// Strip the server-only fields (fact base, rubric) before sending cards to the client.
function publicContent(content) {
    return {
        exists: true,
        anchorId: content.anchorId,
        breadth: content.breadth,
        title: content.title,
        scope: content.scope,
        prelude: content.prelude,
        subAnchors: content.subAnchors,
        sources: content.sources,
    };
}

async function handleGet(req, res) {
    const anchorId = req.query.id;
    const breadth = req.query.breadth || 'A';
    if (!anchorId) return res.status(400).json({ error: 'Anchor ID is required' });

    const content = await getLearnContent(anchorId, breadth);
    if (!content) return res.status(200).json({ success: true, exists: false });
    return res.status(200).json({ success: true, ...publicContent(content) });
}

async function handleGenerate(req, res) {
    const anchorId = req.body?.id || req.query.id;
    const breadth = req.body?.breadth || req.query.breadth || 'A';
    if (!anchorId) return res.status(400).json({ error: 'Anchor ID is required' });
    if (!['A', 'B', 'C'].includes(breadth)) return res.status(400).json({ error: 'Breadth must be A, B, or C' });

    try {
        const content = await generateLearnContent(anchorId, breadth);
        return res.status(200).json({ success: true, ...publicContent(content) });
    } catch (e) {
        if (e.message === 'ANCHOR_NOT_FOUND') return res.status(404).json({ error: 'Anchor not found' });
        if (e.message === 'NO_CHILDREN') {
            return res.status(400).json({ error: 'No child anchors exist. Generate child anchors first.' });
        }
        throw e;
    }
}

async function handleMark(req, res) {
    const userId = await getAuthenticatedUser(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const anchorId = req.body?.anchorId;
    const breadth = req.body?.breadth || 'A';
    const narrative = req.body?.narrative || '';

    if (!anchorId) return res.status(400).json({ error: 'anchorId is required' });
    if (!narrative || narrative.trim().split(/\s+/).filter(Boolean).length < 20) {
        return res.status(400).json({ error: 'Please write a bit more before submitting (at least ~20 words).' });
    }

    let result;
    try {
        result = await markNarrative(narrative, { anchorId, breadth });
    } catch (e) {
        if (/No study content/.test(e.message)) {
            return res.status(404).json({ error: 'No study content for this topic yet. Open it to generate it first.' });
        }
        throw e;
    }

    // Fold the mark into the score (best-of, propagated up the tree). XP scales with the mark score.
    const score = Number(result?.mark?.score) || 0;
    const covered = Number(result?.coverage?.covered) || 0;
    const total = Number(result?.coverage?.total) || 0;
    const { writeXp, nodeScore } = await recordWriteMark(userId, anchorId, breadth, score, covered, total);

    return res.status(200).json({ success: true, ...result, xpEarned: writeXp, nodeScore });
}
