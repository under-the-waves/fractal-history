import { CATEGORIES } from '../../shared/achievements';

const COLOUR = Object.fromEntries(CATEGORIES.map(c => [c.key, c.colour]));

// A circular achievement badge: category colour + a star, greyed when locked. SVG, no emoji.
export default function AchievementBadge({ category, unlocked = true, size = 48 }) {
    const colour = unlocked ? (COLOUR[category] || '#7f8c8d') : '#cbd2d9';
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="24" cy="24" r="22" fill={colour} opacity={unlocked ? 1 : 0.45} />
            <circle cx="24" cy="24" r="22" fill="none" stroke={unlocked ? 'rgba(255,255,255,0.55)' : '#b3bac2'} strokeWidth="2" />
            <path
                d="M24 11.5 l3.6 7.6 8.4 1.05 -6.2 5.75 1.6 8.3 -7.4-4.05 -7.4 4.05 1.6-8.3 -6.2-5.75 8.4-1.05 z"
                fill="white" opacity={unlocked ? 0.95 : 0.7}
            />
        </svg>
    );
}
