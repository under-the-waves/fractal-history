// Regenerate narratives through the REAL production handler (zero drift), then clear
// stale fact-check columns so the new text shows and re-fact-checks on next view.
//
// Usage: node scripts/regenerate-narratives.mjs 1A-E8F2G:A 1A-Q7R2S:A
import handler from '../api/generate-narrative.js';
import { query } from '../lib/db.js';

const specs = process.argv.slice(2);
if (!specs.length) { console.error('Pass anchor specs, e.g. 1A-E8F2G:A'); process.exit(1); }

const toPlain = h => (h || '').replace(/<\/p>\s*<p>/g, '\n\n').replace(/<[^>]+>/g, '').trim();

for (const spec of specs) {
  const [id, breadth = 'A'] = spec.split(':');
  console.log(`\n\n######## Regenerating ${id} (${breadth}) ########`);
  const req = { method: 'GET', query: { id, breadth, regenerate: 'true' }, body: {} };
  let captured = null;
  const res = { status: (code) => ({ json: (obj) => { captured = { code, obj }; return obj; } }) };
  try {
    await handler(req, res);
  } catch (e) {
    console.error('Handler threw:', e.message);
    continue;
  }
  if (!captured || captured.code !== 200 || !captured.obj?.success) {
    console.error('Generation failed:', JSON.stringify(captured?.obj || captured, null, 2));
    continue;
  }
  // Clear stale fact-check so the freshly generated narrative is what readers see.
  await query(
    `UPDATE narratives SET fact_checked_narrative = NULL, sources = NULL, fact_checked_at = NULL
     WHERE anchor_id = $1 AND breadth = $2`,
    [id, breadth]
  );
  const n = captured.obj.anchor;
  console.log(`title: ${n.title}\n`);
  console.log(toPlain(n.narrative));
  console.log(`\n[words: ${toPlain(n.narrative).split(/\s+/).filter(Boolean).length}]`);
}
process.exit(0);
