import { useState, useEffect, useLayoutEffect, useRef, Suspense, lazy } from 'react';

// The map itself carries the heavy TopoJSON/d3-geo dependencies, so it's lazy-loaded here
// rather than imported directly (see RegionMiniMap.jsx for why).
const RegionMiniMap = lazy(() => import('./RegionMiniMap'));

const PREVIEW_COUNT = 8;

// Floating desktop hover card for a C-breadth (geographic) tree node: shows a mini map of the
// region plus the list of member countries. The parent (TreeVisualization) owns the open/close
// timing (hover delay to open, grace delay to close, Escape) and passes onMouseEnter/onMouseLeave
// so the card can keep itself open while the pointer is over the card rather than the node.
function RegionHoverCard({ anchor, contextCodes, anchorRect, onClose, onMouseEnter, onMouseLeave }) {
    const cardRef = useRef(null);
    const [expanded, setExpanded] = useState(false);
    // Start hidden and reposition once we know the card's real size, so it never renders
    // off-screen for a frame before being clamped back into the viewport.
    const [style, setStyle] = useState({ left: anchorRect.right + 10, top: anchorRect.top, visibility: 'hidden' });

    useLayoutEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const margin = 10;
        const gap = 10;
        const rect = el.getBoundingClientRect();
        // Prefer the node's right side; if the card would spill past the viewport there, flip to
        // its left side rather than sliding back over the node it belongs to.
        let left = anchorRect.right + gap;
        if (left + rect.width > window.innerWidth - margin) left = anchorRect.left - rect.width - gap;
        if (left < margin) left = margin;
        let top = anchorRect.top;
        if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
        if (top < margin) top = margin;
        setStyle({ left, top, visibility: 'visible' });
    }, [anchorRect.left, anchorRect.right, anchorRect.top, expanded]);

    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const members = anchor.members || [];
    const preview = members.slice(0, PREVIEW_COUNT);
    const remaining = members.length - preview.length;

    return (
        <div
            ref={cardRef}
            className="region-hover-card"
            style={{ left: style.left, top: style.top, visibility: style.visibility }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="region-hover-card-title">{anchor.title}</div>

            <Suspense fallback={<div className="region-mini-map-loading" style={{ width: 260, height: 150 }}>Loading map…</div>}>
                <RegionMiniMap memberCodes={members.map(m => m.code)} contextCodes={contextCodes} />
            </Suspense>

            <div className="region-hover-card-members">
                <div className="region-hover-card-heading">Countries in this region ({members.length})</div>
                {!expanded ? (
                    <p className="region-hover-card-preview">
                        {preview.map(m => m.name).join(', ')}
                        {remaining > 0 && (
                            <button
                                type="button"
                                className="region-hover-card-more"
                                onClick={() => setExpanded(true)}
                            >
                                {` +${remaining} more`}
                            </button>
                        )}
                    </p>
                ) : (
                    <p className="region-hover-card-full">
                        {members.map(m => m.name).join(', ')}
                    </p>
                )}
            </div>
        </div>
    );
}

export default RegionHoverCard;
