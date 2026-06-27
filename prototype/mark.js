// Prototype marking endpoint, served LOCALLY by dev-api-server.mjs (which falls back to
// prototype/<name>.js). It is deliberately NOT under api/, so it does not count toward the
// Vercel 12-function cap and never ships to production as-is. POST { narrative } -> mark report.

import { markNarrative } from '../lib/marking.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const narrative = (req.body && req.body.narrative) || '';
  const anchorId = (req.body && req.body.anchorId) || '1A-E8F2G';
  const breadth = (req.body && req.body.breadth) || 'A';
  if (!narrative || narrative.trim().split(/\s+/).filter(Boolean).length < 20) {
    return res.status(400).json({ error: 'Please write a bit more before submitting (at least ~20 words).' });
  }
  try {
    const result = await markNarrative(narrative, { anchorId, breadth });
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('Marking error:', e);
    return res.status(500).json({ error: 'Marking failed. Check the API server log and try again.' });
  }
}
