// Level system for mastery XP. Frontend + backend safe (pure functions, no imports).
//
// Design (agreed in-thread):
//   - Level 0 = nothing completed. Each level costs 20% more XP than the last, so early levels come
//     quickly and high levels become a long grind that never really caps.
//   - XP to REACH level L:  250 * (1.2^L - 1)   ->  L1=50, L2=110, L3=182, L5=372, L10=1298, L25≈23600.
//   - Level from a score S:  floor( ln(S/250 + 1) / ln(1.2) ).
//   - Named bands group level ranges; level 0 is unranked.
//
// Levels are meant to be fed a node's PEAK score (best ever), so forgetting lowers the live number but
// never drops the level.

const BASE = 250;   // scale: XP for level 1 is BASE * (RATE - 1) = 50
const RATE = 1.2;   // each level's gap is 20% larger than the previous

// Bands by minimum level, highest first. Level 0 (below Initiate) is unranked (null).
const BANDS = [
    { min: 25, name: 'Legend' },
    { min: 19, name: 'Grandmaster' },
    { min: 14, name: 'Master' },
    { min: 10, name: 'Sage' },
    { min: 6, name: 'Scholar' },
    { min: 3, name: 'Apprentice' },
    { min: 1, name: 'Initiate' },
];

/** Cumulative XP needed to reach level L (L >= 0). */
export function xpForLevel(L) {
    return Math.round(BASE * (Math.pow(RATE, L) - 1));
}

/** The level a score sits at. The epsilon absorbs float error exactly on a threshold (e.g. 50 -> 1). */
export function levelForScore(score) {
    const s = Math.max(0, score || 0);
    return Math.floor(Math.log(s / BASE + 1) / Math.log(RATE) + 1e-9);
}

/** Band name for a level, or null when unranked (level 0). */
export function bandForLevel(level) {
    for (const b of BANDS) if (level >= b.min) return b.name;
    return null;
}

/** Everything the UI needs: level, band, and progress through the current level toward the next. */
export function levelInfo(score) {
    const s = Math.max(0, score || 0);
    const level = levelForScore(s);
    const floor = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const span = next - floor;
    return {
        level,
        band: bandForLevel(level),
        nextBand: bandForLevel(level + 1),
        into: s - floor,                              // XP earned into the current level
        span,                                         // XP width of the current level
        toNext: Math.max(0, Math.round(next - s)),    // XP remaining to the next level
        progress: span > 0 ? Math.min(1, (s - floor) / span) : 0,
    };
}
