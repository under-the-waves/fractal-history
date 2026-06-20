import { orientationAxes } from '../../shared/ancestry.js';

// "You Are Here" orientation panel. Decomposes the current tree position into the three
// axes the tree is built on — Frame (analytical lens), When (temporal scope), Where
// (geographic scope) — so that going deep, you can see WHICH dimension each ancestor is.
//
// Each axis links to its node in the TREE (never a narrative page). An axis that has no
// ancestor of its type degrades to a neutral dash; an axis that resolves to the current
// node renders as a non-clickable current-position state.

const AXES = [
    { key: 'frame', label: 'Frame', hint: 'analytical lens', color: '#3498db' },
    { key: 'when', label: 'When', hint: 'temporal scope', color: '#27ae60' },
    { key: 'where', label: 'Where', hint: 'geographic scope', color: '#e67e22' },
];

export default function OrientationPanel({ chain, currentId, onNavigate }) {
    if (!chain || chain.length === 0) return null;

    const axes = orientationAxes(chain);
    // Nothing to orient by (e.g. only the root is open): render nothing.
    if (!axes.frame && !axes.when && !axes.where) return null;

    return (
        <div className="orientation-panel" aria-label="You are here">
            <span className="orientation-title">You are here</span>
            <div className="orientation-axes">
                {AXES.map(ax => {
                    const node = axes[ax.key];
                    const isCurrent = node && node.id === currentId;
                    return (
                        <div key={ax.key} className="orientation-axis" style={{ '--axis-color': ax.color }}>
                            <span className="orientation-axis-label">{ax.label}</span>
                            {!node ? (
                                <span className="orientation-axis-value is-empty" title={`No ${ax.hint} yet`}>—</span>
                            ) : isCurrent ? (
                                <span className="orientation-axis-value is-current" title={`Current position (${ax.hint})`}>
                                    {node.title}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="orientation-axis-value"
                                    onClick={() => onNavigate(node.id)}
                                    title={`Go to ${ax.hint} in the tree`}
                                >
                                    {node.title}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
