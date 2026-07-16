import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useClerkEnabled } from '../hooks/useClerkAuth';
import { ACHIEVEMENTS, CATEGORIES } from '../../shared/achievements';
import AchievementBadge from './AchievementBadge';
import { useToasts } from './AchievementToasts';
import './achievements.css';

export default function AchievementsPage() {
    const clerkEnabled = useClerkEnabled();
    if (!clerkEnabled) {
        return <div className="achv-page"><p className="achv-empty">Sign-in isn't configured, so achievements aren't available.</p></div>;
    }
    return <AchievementsInner />;
}

function AchievementsInner() {
    const auth = useAuth();
    const toasts = useToasts();
    const [state, setState] = useState({ loading: true });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!auth.isSignedIn) { setState({ signedOut: true }); return; }
            try {
                const token = await auth.getToken();
                const res = await fetch('/api/scores', { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (!cancelled && data.success) {
                    const ach = data.achievements || { unlocked: [], stats: null };
                    setState({ unlocked: ach.unlocked || [], stats: ach.stats });
                    // Anything the load-time evaluation just unlocked gets a toast as well as
                    // appearing in the grid below (see MasteryScoreLoader for the same pattern).
                    if (ach.newlyUnlocked?.length) toasts?.achievements(ach.newlyUnlocked);
                } else if (!cancelled) {
                    setState({ error: true });
                }
            } catch {
                if (!cancelled) setState({ error: true });
            }
        })();
        return () => { cancelled = true; };
    }, [auth.isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    if (state.signedOut) return <div className="achv-page"><p className="achv-empty">Sign in to track achievements.</p></div>;
    if (state.loading) return <div className="achv-page"><p className="achv-empty">Loading achievements…</p></div>;
    if (state.error) return <div className="achv-page"><p className="achv-empty">Couldn't load achievements. Try again.</p></div>;

    const unlockedMap = new Map((state.unlocked || []).map(u => [u.key, u.at]));
    const stats = state.stats;
    const totalUnlocked = unlockedMap.size;

    return (
        <div className="achv-page">
            <header className="achv-page-head">
                <h1>Achievements</h1>
                <span className="achv-count">{totalUnlocked} of {ACHIEVEMENTS.length} unlocked</span>
            </header>

            {CATEGORIES.map(cat => {
                const items = ACHIEVEMENTS.filter(a => a.category === cat.key);
                if (items.length === 0) return null;
                return (
                    <section key={cat.key} className="achv-group">
                        <h2 className="achv-group-title" style={{ color: cat.colour }}>{cat.label}</h2>
                        <div className="achv-grid">
                            {items.map(a => {
                                const at = unlockedMap.get(a.key);
                                const unlocked = at != null;
                                const prog = !unlocked && stats && a.progress ? a.progress(stats) : null;
                                return (
                                    <div key={a.key} className={`achv-card${unlocked ? ' unlocked' : ' locked'}`}>
                                        <AchievementBadge category={a.category} unlocked={unlocked} size={48} />
                                        <div className="achv-card-body">
                                            <div className="achv-card-name">{a.name}</div>
                                            <div className="achv-card-desc">{a.description}</div>
                                            {unlocked ? (
                                                <div className="achv-card-meta unlocked-meta">
                                                    Unlocked{at ? ` · ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                                                </div>
                                            ) : prog ? (
                                                <div className="achv-card-meta">
                                                    <div className="achv-progress-bar">
                                                        <div className="achv-progress-fill"
                                                            style={{ width: `${Math.min(100, Math.round((prog.current / prog.target) * 100))}%`, background: cat.colour }} />
                                                    </div>
                                                    <span className="achv-progress-text">{Math.min(prog.current, prog.target)} / {prog.target}</span>
                                                </div>
                                            ) : (
                                                <div className="achv-card-meta">Locked</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
