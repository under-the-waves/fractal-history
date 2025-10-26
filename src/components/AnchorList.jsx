import { anchors } from '../data/anchors'

function AnchorList({ onSelectAnchor }) {
    return (
        <div className="anchor-list">
            <h2>Your Learning Path</h2>
            <p>Complete anchors in sequence to build your understanding</p>

            <div className="anchors">
                {anchors.map((anchor) => (
                    <div key={anchor.id} className="anchor-card">
                        <span className="anchor-status">
                            {anchor.completed ? '✓' : '○'}
                        </span>
                        <h3>{anchor.title}</h3>
                        <button
                            className="start-anchor-button"
                            onClick={() => onSelectAnchor(anchor)}
                        >
                            {anchor.completed ? 'Review' : 'Start'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default AnchorList