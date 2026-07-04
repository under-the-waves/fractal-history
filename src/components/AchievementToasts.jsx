import { createContext, useContext, useState, useCallback } from 'react';
import { bandForLevel } from '../../shared/levels';
import AchievementBadge from './AchievementBadge';
import './achievements.css';

const ToastCtx = createContext(null);

/** Fire achievement / level-up toasts from anywhere inside the provider. May be null if unmounted. */
export function useToasts() {
    return useContext(ToastCtx);
}

let seq = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const remove = useCallback((id) => setToasts(list => list.filter(t => t.id !== id)), []);
    const push = useCallback((toast) => {
        const id = ++seq;
        setToasts(list => [...list, { ...toast, id }]);
        setTimeout(() => remove(id), toast.duration || 6500);
    }, [remove]);

    const api = {
        achievements: (list) => (list || []).forEach(a => push({ kind: 'achievement', ...a })),
        levelUps: (list) => (list || []).forEach(i => push({ kind: 'level', ...i })),
    };

    return (
        <ToastCtx.Provider value={api}>
            {children}
            <div className="achv-toast-host" aria-live="polite">
                {toasts.map(t => <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />)}
            </div>
        </ToastCtx.Provider>
    );
}

function ToastCard({ toast, onClose }) {
    if (toast.kind === 'level') {
        const isGlobal = toast.scope === 'global';
        const band = bandForLevel(toast.level);
        return (
            <div className="achv-toast achv-toast-level" role="status">
                <div className="achv-level-medal">Lv {toast.level}</div>
                <div className="achv-toast-body">
                    <div className="achv-toast-kicker">{isGlobal ? 'Rank up' : 'Topic level up'}</div>
                    <div className="achv-toast-title">
                        {isGlobal ? `Level ${toast.level}${band ? ` · ${band}` : ''}` : `${toast.title} → Lv ${toast.level}`}
                    </div>
                </div>
                <button className="achv-toast-close" onClick={onClose} aria-label="Dismiss">×</button>
            </div>
        );
    }
    return (
        <div className="achv-toast achv-toast-achievement" role="status">
            <AchievementBadge category={toast.category} size={44} />
            <div className="achv-toast-body">
                <div className="achv-toast-kicker">Achievement unlocked</div>
                <div className="achv-toast-title">{toast.name}</div>
                <div className="achv-toast-desc">{toast.description}</div>
            </div>
            <button className="achv-toast-close" onClick={onClose} aria-label="Dismiss">×</button>
        </div>
    );
}
