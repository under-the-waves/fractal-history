// Achievement definitions. Frontend + backend safe (pure data + predicates, no imports).
//
// Each achievement has a `predicate(stats)` that returns true when it is earned, and an optional
// `progress(stats)` returning { current, target } so the Achievements page can show a progress hint on
// locked ones. `stats` is built by lib/achievements.js:computeStats(). Unlocks are permanent once
// recorded, so a stat later decaying never re-locks an achievement.
//
// Categories drive the badge colour/grouping in the UI. No emoji (icons are drawn as SVG).

export const CATEGORIES = [
    { key: 'firsts', label: 'Getting started', colour: '#3498db' },
    { key: 'axis', label: 'The three lenses', colour: '#16a085' },
    { key: 'coverage', label: 'Coverage', colour: '#8e44ad' },
    { key: 'volume', label: 'Volume', colour: '#2c3e50' },
    { key: 'rank', label: 'Rank', colour: '#b8860b' },
    { key: 'writing', label: 'Writing', colour: '#c0392b' },
    { key: 'mastery', label: 'Mastery', colour: '#2e9e5b' },
    { key: 'streak', label: 'Consistency', colour: '#e67e22' },
];

export const ACHIEVEMENTS = [
    // --- Getting started ---
    { key: 'first-light', name: 'First Light', category: 'firsts', description: 'Master your first narrative.',
        predicate: s => s.narrativesMastered >= 1, progress: s => ({ current: Math.min(s.narrativesMastered, 1), target: 1 }) },
    { key: 'three-sides', name: 'Three Sides', category: 'firsts', description: 'Master all three lenses (A, B and C) of a single anchor.',
        predicate: s => s.anchorsFullyMastered >= 1, progress: s => ({ current: Math.min(s.anchorsFullyMastered, 1), target: 1 }) },
    { key: 'into-the-deep', name: 'Into the Deep', category: 'firsts', description: 'Study an anchor four levels deep in the tree.',
        predicate: s => s.maxDepth >= 4, progress: s => ({ current: Math.min(s.maxDepth, 4), target: 4 }) },

    // --- The three lenses (one per axis) ---
    { key: 'theorist', name: 'Theorist', category: 'axis', description: 'Complete your first analytical (A) narrative.',
        predicate: s => s.axisMastered.A >= 1, progress: s => ({ current: Math.min(s.axisMastered.A, 1), target: 1 }) },
    { key: 'chronologist', name: 'Chronologist', category: 'axis', description: 'Complete your first temporal (B) narrative.',
        predicate: s => s.axisMastered.B >= 1, progress: s => ({ current: Math.min(s.axisMastered.B, 1), target: 1 }) },
    { key: 'cartographer', name: 'Cartographer', category: 'axis', description: 'Complete your first geographic (C) narrative.',
        predicate: s => s.axisMastered.C >= 1, progress: s => ({ current: Math.min(s.axisMastered.C, 1), target: 1 }) },

    // --- Coverage ---
    { key: 'globetrotter', name: 'Globetrotter', category: 'coverage', description: 'Master geographic narratives across 5 different world regions.',
        predicate: s => s.regionsC >= 5, progress: s => ({ current: s.regionsC, target: 5 }) },
    { key: 'across-the-ages', name: 'Across the Ages', category: 'coverage', description: 'Master 5 temporal (B) narratives.',
        predicate: s => s.axisMastered.B >= 5, progress: s => ({ current: s.axisMastered.B, target: 5 }) },

    // --- Volume ---
    { key: 'scholars-shelf', name: "Scholar's Shelf", category: 'volume', description: 'Master 10 narratives.',
        predicate: s => s.narrativesMastered >= 10, progress: s => ({ current: s.narrativesMastered, target: 10 }) },
    { key: 'great-library', name: 'The Great Library', category: 'volume', description: 'Master 50 narratives.',
        predicate: s => s.narrativesMastered >= 50, progress: s => ({ current: s.narrativesMastered, target: 50 }) },

    // --- Rank (global level bands) ---
    { key: 'rank-scholar', name: 'Scholar', category: 'rank', description: 'Reach the Scholar band (global level 6).',
        predicate: s => s.globalLevel >= 6, progress: s => ({ current: Math.min(s.globalLevel, 6), target: 6 }) },
    { key: 'rank-sage', name: 'Sage', category: 'rank', description: 'Reach the Sage band (global level 10).',
        predicate: s => s.globalLevel >= 10, progress: s => ({ current: Math.min(s.globalLevel, 10), target: 10 }) },
    { key: 'rank-master', name: 'Master', category: 'rank', description: 'Reach the Master band (global level 14).',
        predicate: s => s.globalLevel >= 14, progress: s => ({ current: Math.min(s.globalLevel, 14), target: 14 }) },
    { key: 'rank-grandmaster', name: 'Grandmaster', category: 'rank', description: 'Reach the Grandmaster band (global level 19).',
        predicate: s => s.globalLevel >= 19, progress: s => ({ current: Math.min(s.globalLevel, 19), target: 19 }) },
    { key: 'rank-legend', name: 'Legend', category: 'rank', description: 'Reach the Legend band (global level 25).',
        predicate: s => s.globalLevel >= 25, progress: s => ({ current: Math.min(s.globalLevel, 25), target: 25 }) },
    { key: 'summit', name: 'Summit', category: 'rank', description: 'Take any single anchor to level 10.',
        predicate: s => s.maxNodeLevel >= 10, progress: s => ({ current: Math.min(s.maxNodeLevel, 10), target: 10 }) },

    // --- Writing (write-your-own) ---
    { key: 'in-your-own-words', name: 'In Your Own Words', category: 'writing', description: 'Submit your first written narrative.',
        predicate: s => s.writeCount >= 1, progress: s => ({ current: Math.min(s.writeCount, 1), target: 1 }) },
    { key: 'word-perfect', name: 'Word Perfect', category: 'writing', description: 'Score 90 or more on a written narrative.',
        predicate: s => s.bestWrite >= 90, progress: s => ({ current: Math.min(s.bestWrite, 90), target: 90 }) },
    { key: 'historians-pen', name: "The Historian's Pen", category: 'writing', description: 'Write all three lenses of a single anchor.',
        predicate: s => s.writeAllBreadthsNode, progress: s => ({ current: s.writeAllBreadthsNode ? 1 : 0, target: 1 }) },

    // --- Mastery quality ---
    { key: 'total-recall', name: 'Total Recall', category: 'mastery', description: 'Hold 10 narratives at full retention at once.',
        predicate: s => s.currentFresh >= 10, progress: s => ({ current: s.currentFresh, target: 10 }) },

    // --- Consistency (streak) ---
    { key: 'daily-devotion', name: 'Daily Devotion', category: 'streak', description: 'Study on 7 consecutive days.',
        predicate: s => s.streak >= 7, progress: s => ({ current: s.streak, target: 7 }) },
];

/** Keys currently satisfied by `stats`. */
export function earnedKeys(stats) {
    return ACHIEVEMENTS.filter(a => {
        try { return a.predicate(stats); } catch { return false; }
    }).map(a => a.key);
}

/** Look up a definition by key. */
export function achievementByKey(key) {
    return ACHIEVEMENTS.find(a => a.key === key) || null;
}
