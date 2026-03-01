import { useState } from 'react';

function WhyTheseAnchors({ data, isOpen, onToggle }) {
    const [expandedRows, setExpandedRows] = useState({});

    if (!data) return null;

    const { parentTitle, breadth, candidates } = data;

    const getBreadthColor = (b) => {
        switch (b) {
            case 'A': return '#3498db';
            case 'B': return '#27ae60';
            case 'C': return '#e67e22';
            default: return '#999';
        }
    };

    const getBreadthDescription = (b) => {
        switch (b) {
            case 'A':
                return (
                    <>
                        <strong>Analytical anchors</strong> are the 3-5 most significant events, processes,
                        institutions, people, or phenomena which explain the parent anchor. They are selected
                        based on their <strong>causal significance</strong> (how much they shaped subsequent
                        history) and <strong>human impact</strong> (effect on wellbeing and suffering).
                    </>
                );
            case 'B':
                return (
                    <>
                        <strong>Temporal anchors</strong> divide the parent topic into chronological periods
                        that provide complete time coverage. They are selected based on{' '}
                        <strong>natural breakpoints</strong> (clear and meaningful transitions),{' '}
                        <strong>comparable depth</strong> (balanced learning load across periods), and{' '}
                        <strong>historical convention</strong> (alignment with how historians typically organize this topic).
                    </>
                );
            case 'C':
                return (
                    <>
                        <strong>Geographic anchors</strong> provide complete spatial coverage of the parent
                        topic across all major regions and civilizations. They ensure no significant
                        geographic perspective is omitted.
                    </>
                );
            default:
                return null;
        }
    };

    const toggleRow = (index) => {
        setExpandedRows(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const breadthColor = getBreadthColor(breadth);

    // Check if this is B-anchor format (has subdivision schemes with ratings)
    const isBreadthB = breadth === 'B' && candidates?.[0]?.ratings;

    // For A-anchors: sort by finalScore
    // For B-anchors: sort by totalScore
    const sortedCandidates = isBreadthB
        ? [...(candidates || [])].sort((a, b) => b.totalScore - a.totalScore)
        : [...(candidates || [])].sort((a, b) => b.finalScore - a.finalScore);

    return (
        <>
            {/* Overlay - blocks tree interaction when panel is open */}
            <div
                className={`why-panel-overlay ${isOpen ? 'visible' : ''}`}
                onClick={() => onToggle(false)}
            />

            {/* Slide-in Panel */}
            <div className={`why-panel ${isOpen ? 'open' : ''}`}>
                {/* Minimize button (only visible when panel is open) */}
                {isOpen && (
                    <button
                        className="why-panel-minimize"
                        onClick={() => onToggle(false)}
                        style={{ backgroundColor: breadthColor }}
                    >
                        <span className="minimize-icon">▶</span>
                        <span className="minimize-text">Minimize</span>
                    </button>
                )}

                {/* Panel content */}
                <div className="why-panel-content">
                    {/* Header */}
                    <div className="why-panel-header" style={{ borderBottomColor: breadthColor }}>
                        <div className="why-panel-title">
                            <span className="why-label">Why these Anchors?</span>
                            <h2>{parentTitle}</h2>
                        </div>
                        <div
                            className="why-breadth-badge"
                            style={{ backgroundColor: breadthColor }}
                        >
                            Breadth {breadth}
                        </div>
                    </div>

                    {/* Breadth-specific explanation */}
                    <div className="why-panel-explanation">
                        {getBreadthDescription(breadth)}
                        {!isBreadthB && (
                            <div className="why-formula">
                                Final Score = (Causal × 0.6) + (Human × 0.4)
                            </div>
                        )}
                        {isBreadthB && (
                            <div className="why-formula">
                                Total Score = Natural Breakpoints + Comparable Depth + Historical Convention (max 9)
                            </div>
                        )}
                    </div>

                    {/* Content differs based on breadth type */}
                    {isBreadthB ? (
                        // B-anchor: Show subdivision schemes
                        <div className="why-panel-candidates">
                            <div className="why-schemes-intro">
                                <strong>{sortedCandidates.length} Ways to Subdivide {parentTitle}:</strong>
                            </div>
                            {sortedCandidates.map((scheme, index) => (
                                <div key={index} className="why-scheme-wrapper">
                                    <div
                                        className={`why-scheme-row ${scheme.selected ? 'selected' : ''} ${expandedRows[index] ? 'expanded' : ''}`}
                                        style={scheme.selected ? { borderLeftColor: breadthColor } : {}}
                                        onClick={() => toggleRow(index)}
                                    >
                                        <div className="why-scheme-header">
                                            <span className="why-scheme-rank">{index + 1}.</span>
                                            <span className="why-scheme-name">
                                                {scheme.name}
                                                {scheme.selected && <span className="why-selected-badge">SELECTED</span>}
                                            </span>
                                            <span className="why-scheme-score">{scheme.totalScore}/9</span>
                                            <span className="why-expand-icon">{expandedRows[index] ? '▲' : '▼'}</span>
                                        </div>
                                        <div className="why-scheme-anchors">
                                            {scheme.anchors?.map((anchor, i) => (
                                                <span key={i} className="why-scheme-anchor">{anchor}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {expandedRows[index] && scheme.ratings && (
                                        <div className="why-scheme-details" style={{ borderLeftColor: breadthColor }}>
                                            <div className="why-rating">
                                                <strong>Natural Breakpoints ({scheme.ratings.naturalBreakpoints?.score}/3):</strong>{' '}
                                                {scheme.ratings.naturalBreakpoints?.justification}
                                            </div>
                                            <div className="why-rating">
                                                <strong>Comparable Depth ({scheme.ratings.comparableDepth?.score}/3):</strong>{' '}
                                                {scheme.ratings.comparableDepth?.justification}
                                            </div>
                                            <div className="why-rating">
                                                <strong>Historical Convention ({scheme.ratings.historicalConvention?.score}/3):</strong>{' '}
                                                {scheme.ratings.historicalConvention?.justification}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        // A-anchor: Show candidates list
                        <div className="why-panel-candidates">
                            <div className="why-candidates-header">
                                <span className="why-col-rank">#</span>
                                <span className="why-col-title">Candidate</span>
                                <span className="why-col-score">Causal</span>
                                <span className="why-col-score">Human</span>
                                <span className="why-col-score">Total</span>
                            </div>
                            {sortedCandidates.map((candidate, index) => (
                                <div key={index} className="why-candidate-wrapper">
                                    <div
                                        className={`why-candidate-row ${candidate.selected ? 'selected' : ''} ${expandedRows[index] ? 'expanded' : ''}`}
                                        style={candidate.selected ? { borderLeftColor: breadthColor } : {}}
                                        onClick={() => toggleRow(index)}
                                    >
                                        <span className="why-col-rank">{index + 1}</span>
                                        <span className="why-col-title">
                                            {candidate.title}
                                            <span className="why-expand-icon">{expandedRows[index] ? '▲' : '▼'}</span>
                                        </span>
                                        <span className="why-col-score">{candidate.causalSignificance}</span>
                                        <span className="why-col-score">{candidate.humanImpact}</span>
                                        <span className="why-col-score why-total">{candidate.finalScore?.toFixed(1)}</span>
                                    </div>
                                    {expandedRows[index] && (
                                        <div className="why-candidate-details" style={{ borderLeftColor: breadthColor }}>
                                            {candidate.causalJustification && (
                                                <div className="why-justification">
                                                    <strong>Causal Significance ({candidate.causalSignificance}/10):</strong>{' '}
                                                    {candidate.causalJustification}
                                                </div>
                                            )}
                                            {candidate.humanJustification && (
                                                <div className="why-justification">
                                                    <strong>Human Impact ({candidate.humanImpact}/10):</strong>{' '}
                                                    {candidate.humanJustification}
                                                </div>
                                            )}
                                            {!candidate.causalJustification && !candidate.humanJustification && (
                                                <div className="why-justification why-no-data">
                                                    Detailed justifications not available for this anchor.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="why-panel-footer">
                        {isBreadthB ? (
                            <>
                                <span style={{ color: breadthColor }}>
                                    {sortedCandidates.find(s => s.selected)?.name || 'Selected scheme'}
                                </span>
                                <span className="why-footer-note">
                                    chosen from {sortedCandidates.length} approaches
                                </span>
                            </>
                        ) : (
                            <>
                                <span style={{ color: breadthColor }}>
                                    {sortedCandidates.filter(c => c.selected).length} anchors selected
                                </span>
                                <span className="why-footer-note">
                                    from {sortedCandidates.length} candidates
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default WhyTheseAnchors;
