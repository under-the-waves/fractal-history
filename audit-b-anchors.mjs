// Read-only audit of every B-anchor sibling group in the tree for the same defects seen on the Mongol
// node: duplicate schemes (over-count / duplicate positions / near-duplicate coverage) and non-contiguous
// coverage (gaps / overlaps between consecutive periods). B-anchor dates live only in the title, so we
// parse the date range from the title.
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { config } from 'dotenv';
config({ path: '.env.local' });
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (t, p = []) => pool.query(t, p).then(r => r.rows);

// Parse a signed calendar-year value from a date token. CE positive, BCE negative; MYA/BYA/KYA scaled;
// "N years ago" / "N K years ago" converted from present.
function tokenToYear(tok) {
  if (tok == null) return NaN;
  let s = String(tok).trim();
  if (/present|now|today/i.test(s)) return 2026;
  let m;
  if ((m = s.match(/([\d,.]+)\s*K\s*(?:years?\s*ago|ya)\b/i))) return 2026 - parseFloat(m[1].replace(/,/g, '')) * 1000;
  if ((m = s.match(/([\d,.]+)\s*years?\s*ago\b/i))) return 2026 - parseFloat(m[1].replace(/,/g, ''));
  // Trailing K as thousands (e.g. "40K BCE", "300K"): expand before the main parse.
  s = s.replace(/([\d,.]+)\s*K\b/i, (_, n) => String(parseFloat(n.replace(/,/g, '')) * 1000));
  m = s.match(/(-?[\d,]+(?:\.\d+)?)\s*(BYA|MYA|KYA|BCE|BC|CE|AD)?/i);
  if (!m) return NaN;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toUpperCase();
  if (u === 'BYA') return -(n * 1e9);
  if (u === 'MYA') return -(n * 1e6);
  if (u === 'KYA') return -(n * 1e3);
  if (u === 'BCE' || u === 'BC') return -n;
  return n; // CE/AD/none
}

// Extract [start, end] years from a B-anchor title. Range lives after the last colon, or anywhere.
function parseRange(title) {
  if (!title) return null;
  let seg = title.includes(':') ? title.slice(title.lastIndexOf(':') + 1) : title;
  seg = seg.replace(/c\.\s*/gi, '').trim();
  const m = seg.match(/(.+?)\s*(?:[-–—]|\bto\b)\s*(.+)/i);
  if (!m) return null;
  let t1 = m[1].trim(), t2 = m[2].trim();
  const scaleUnit = /\b(BYA|MYA|KYA|BCE|BC)\b/i;
  const u1 = (t1.match(scaleUnit) || [])[0];
  const u2 = (t2.match(scaleUnit) || [])[0];
  // Inherit a shared unit written once. Backward (end→start) is always safe: the start is older, so it
  // shares the end's era or an older one (BYA/MYA/KYA/BCE). Forward (start→end) is safe ONLY for deep-time
  // units (BYA/MYA/KYA), never BCE — a "800 BCE – 1066" range crosses into CE, so the bare end is CE.
  if (!u1 && u2 && !/years?\s*ago/i.test(t1)) t1 = `${t1} ${u2}`;
  else if (!u1 && /years?\s*ago/i.test(t2) && !/years?\s*ago/i.test(t1)) t1 = `${t1} years ago`;
  if (!u2 && u1 && /BYA|MYA|KYA/i.test(u1)) t2 = `${t2} ${u1}`;
  const a = tokenToYear(t1), b = tokenToYear(t2);
  if (isNaN(a) || isNaN(b)) return null;
  return [Math.min(a, b), Math.max(a, b)]; // [older(smaller), younger(larger)]
}

const groups = await q(`
  SELECT tp.parent_position_id AS parent, count(*)::int AS n
  FROM tree_positions tp WHERE tp.breadth = 'B' AND tp.parent_position_id IS NOT NULL
  GROUP BY tp.parent_position_id`);

const findings = [];
for (const g of groups) {
  const kids = await q(`
    SELECT tp.position, tp.anchor_id, a.title FROM tree_positions tp JOIN anchors a ON a.id = tp.anchor_id
    WHERE tp.parent_position_id = $1 AND tp.breadth = 'B' ORDER BY tp.position, a.title`, [g.parent]);
  const parentTitleRow = await q(`SELECT a.title FROM tree_positions tp JOIN anchors a ON a.id = tp.anchor_id WHERE tp.position_id = $1`, [g.parent]);
  const parentTitle = parentTitleRow[0]?.title || g.parent;

  const issues = [];
  if (kids.length > 5) issues.push(`over-count: ${kids.length} periods (max 5)`);
  const posCounts = {};
  kids.forEach(k => { posCounts[k.position] = (posCounts[k.position] || 0) + 1; });
  const dupPos = Object.entries(posCounts).filter(([, c]) => c > 1);
  if (dupPos.length) issues.push(`duplicate position numbers: ${dupPos.map(([p, c]) => `pos${p}×${c}`).join(', ')}`);

  const parsed = kids.map(k => ({ ...k, range: parseRange(k.title) }));
  const unparsed = parsed.filter(k => !k.range);
  if (unparsed.length) issues.push(`unparseable date range: ${unparsed.length}/${kids.length}`);

  const ok = parsed.filter(k => k.range).sort((a, b) => a.range[0] - b.range[0]);
  for (let i = 1; i < ok.length; i++) {
    const s = ok[i].range[0];
    const prevE = ok[i - 1].range[1];
    const mismatch = s - prevE; // >0 gap, <0 overlap
    // Ignore the consecutive-year convention (period ends Y, next starts Y+1 => 1-year "gap").
    if (mismatch > 1) issues.push(`GAP ${fmt(prevE)}→${fmt(s)} (${fmtSpan(mismatch)}) between "${short(ok[i-1].title)}" and "${short(ok[i].title)}"`);
    else if (mismatch < -1) issues.push(`OVERLAP ${fmt(s)}..${fmt(prevE)} (${fmtSpan(-mismatch)}) between "${short(ok[i-1].title)}" and "${short(ok[i].title)}"`);
  }
  // Near-duplicate coverage: two periods overlapping >50% of the smaller (signals a second scheme).
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const A = ok[i].range, B = ok[j].range;
    const inter = Math.max(0, Math.min(A[1], B[1]) - Math.max(A[0], B[0]));
    const minSpan = Math.max(1, Math.min(A[1] - A[0], B[1] - B[0]));
    if (inter / minSpan > 0.5) issues.push(`near-duplicate coverage: "${short(ok[i].title)}" ~ "${short(ok[j].title)}"`);
  }

  if (issues.length) findings.push({ parent: g.parent, parentTitle, n: kids.length, issues, kids });
}

function fmt(y){ if (y <= -1e6) return `${(-y/1e6).toFixed(1)}Mya`; if (y <= -1e4) return `${Math.round(-y/1e3)}kya`; if (y < 0) return `${Math.round(-y)}BCE`; return `${Math.round(y)}CE`; }
function fmtSpan(d){ d=Math.abs(d); if (d>=1e6) return `${(d/1e6).toFixed(1)}My`; if (d>=1e3) return `${(d/1e3).toFixed(0)}ky`; return `${Math.round(d)}y`; }
function short(t){ return (t||'').length > 46 ? t.slice(0,44)+'…' : t; }

console.log(`Scanned ${groups.length} B-anchor sibling groups. Flagged: ${findings.length}\n`);
findings.sort((a,b) => b.issues.length - a.issues.length);
for (const f of findings) {
  console.log(`■ ${f.parent} — ${f.parentTitle}  (${f.n} B-children)`);
  f.issues.forEach(i => console.log(`    · ${i}`));
  console.log('');
}
await pool.end();
